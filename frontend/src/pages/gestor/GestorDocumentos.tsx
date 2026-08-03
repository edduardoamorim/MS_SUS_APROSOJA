import { useState, useEffect } from 'react';
import { 
  FolderOpen, Search, Filter, Plus, FileText, Image as ImageIcon, 
  Trash2, Eye, Building2, CheckCircle2, ShieldCheck, Clock, X, Loader2, Download, ExternalLink 
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Modal from '../../components/ui/Modal';
import ConfirmAction from '../../components/ui/ConfirmAction';
import { useToast } from '../../context/ToastContext';

export default function GestorDocumentos() {
  const { success, error } = useToast();
  const [loading, setLoading] = useState(true);
  const [documentos, setDocumentos] = useState<any[]>([]);
  const [propriedades, setPropriedades] = useState<any[]>([]);
  
  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPropId, setSelectedPropId] = useState('');
  const [selectedCategoria, setSelectedCategoria] = useState('');

  // Modais e Estados
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);
  const [pdfAmpliado, setPdfAmpliado] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [newDocData, setNewDocData] = useState({
    nome: '',
    categoria: 'CAR',
    propriedade_id: '',
    file: null as File | null
  });

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      // 1. Buscar Propriedades
      const { data: propsData } = await supabase
        .from('propriedades')
        .select('id, nome_fazenda, nome_produtor')
        .order('nome_fazenda');

      if (propsData) setPropriedades(propsData);

      // 2. Buscar Documentos Gerais da Tabela documentos_propriedade
      let genDocs: any[] | null = null;
      try {
        const { data } = await supabase
          .from('documentos_propriedade')
          .select(`
            id,
            nome,
            categoria,
            propriedade_id,
            arquivo_url,
            created_at,
            propriedades (
              nome_fazenda,
              nome_produtor
            )
          `)
          .order('created_at', { ascending: false });
        genDocs = data;
      } catch (e) {
        console.warn('Tabela documentos_propriedade inacessível:', e);
      }

      // 3. Buscar Evidências de Respostas de Auditoria RTRS
      const { data: respData } = await supabase
        .from('respostas_auditoria')
        .select(`
          id,
          evidencia_url,
          created_at,
          auditorias (
            propriedade_id,
            status,
            propriedades (
              nome_fazenda,
              nome_produtor
            )
          ),
          perguntas_rtrs (
            numero_criterio,
            secao,
            enunciado
          )
        `)
        .not('evidencia_url', 'is', null)
        .order('created_at', { ascending: false });

      // 4. Buscar Evidências de Pendências Regularizadas
      const { data: pendsData } = await supabase
        .from('pendencias')
        .select(`
          id,
          propriedade_id,
          titulo,
          evidencia_url,
          status,
          created_at,
          propriedades (
            nome_fazenda,
            nome_produtor
          )
        `)
        .not('evidencia_url', 'is', null)
        .order('created_at', { ascending: false });

      const list: any[] = [];

      if (genDocs) {
        genDocs.forEach((d: any) => {
          list.push({
            id: d.id,
            nome: d.nome,
            categoria: d.categoria,
            propriedade_id: d.propriedade_id,
            fazendaNome: d.propriedades?.nome_fazenda || 'Geral',
            produtorNome: d.propriedades?.nome_produtor || 'N/A',
            arquivo_url: d.arquivo_url,
            origem: 'Armazenamento Geral',
            data: d.created_at,
            podeDeletar: true,
            tabelaOrigem: 'documentos_propriedade'
          });
        });
      }

      if (respData) {
        respData.forEach((r: any) => {
          list.push({
            id: `resp-${r.id}`,
            nome: `Princípio ${(r.perguntas_rtrs as any)?.secao || 'RTRS'} - Critério ${(r.perguntas_rtrs as any)?.numero_criterio || 'N/A'}`,
            categoria: 'Checklist RTRS',
            propriedade_id: r.auditorias?.propriedade_id,
            fazendaNome: r.auditorias?.propriedades?.nome_fazenda || 'Fazenda',
            produtorNome: r.auditorias?.propriedades?.nome_produtor || 'N/A',
            arquivo_url: r.evidencia_url,
            origem: r.auditorias?.status === 'Autoavaliação' ? 'Autoavaliação RTRS' : 'Auditoria In Loco',
            data: r.created_at,
            podeDeletar: false,
            tabelaOrigem: 'respostas_auditoria'
          });
        });
      }

      if (pendsData) {
        pendsData.forEach((p: any) => {
          list.push({
            id: `pend-${p.id}`,
            nome: p.titulo,
            categoria: 'Regularização',
            propriedade_id: p.propriedade_id,
            fazendaNome: p.propriedades?.nome_fazenda || 'Fazenda',
            produtorNome: p.propriedades?.nome_produtor || 'N/A',
            arquivo_url: p.evidencia_url,
            origem: `Resolução de Pendência (${p.status})`,
            data: p.created_at,
            podeDeletar: false,
            tabelaOrigem: 'pendencias'
          });
        });
      }

      setDocumentos(list);
    } catch (err: any) {
      console.error('Erro ao carregar documentos do gestor:', err);
      error('Erro ao carregar histórico de documentos.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEvidencia = (url?: string | null) => {
    if (!url || !url.trim()) return;
    let cleanUrl = url.trim();

    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://') && !cleanUrl.startsWith('data:')) {
      try {
        const bucket = cleanUrl.includes('auditoria-evidencias') ? 'auditoria-evidencias' : 'evidencias';
        const filePath = cleanUrl.replace(/^(evidencias|auditoria-evidencias)\//, '');
        const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
        if (data?.publicUrl) cleanUrl = data.publicUrl;
      } catch (e) {
        console.warn('Erro ao obter URL pública do storage:', e);
      }
    }

    const lower = cleanUrl.toLowerCase();
    const isPdf = lower.includes('.pdf') || lower.startsWith('data:application/pdf');

    if (isPdf) {
      setPdfAmpliado(cleanUrl);
    } else {
      setFotoAmpliada(cleanUrl);
    }
  };

  const handleUploadNewDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocData.nome.trim() || !newDocData.propriedade_id || !newDocData.file) {
      error('Preencha o nome do documento, selecione a propriedade e o arquivo.');
      return;
    }

    setUploadingFile(true);
    try {
      const file = newDocData.file;
      const fileExt = file.name.split('.').pop();
      const fileName = `doc_gestor_${newDocData.propriedade_id}_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      let urlToSave = '';
      try {
        const { error: upErr } = await supabase.storage
          .from('evidencias')
          .upload(filePath, file, { cacheControl: '3600', upsert: true });

        if (!upErr) {
          const { data: { publicUrl } } = supabase.storage.from('evidencias').getPublicUrl(filePath);
          urlToSave = publicUrl;
        }
      } catch (stgErr) {
        console.warn('Erro ao enviar para o storage, usando fallback:', stgErr);
      }

      if (!urlToSave) {
        const { data: { publicUrl } } = supabase.storage.from('documentos-e-midias').getPublicUrl(filePath);
        urlToSave = publicUrl || `https://supabase.local/storage/v1/object/public/evidencias/${filePath}`;
      }

      const { data, error: dbErr } = await supabase
        .from('documentos_propriedade')
        .insert([{
          propriedade_id: newDocData.propriedade_id,
          nome: newDocData.nome,
          categoria: newDocData.categoria,
          arquivo_url: urlToSave
        }])
        .select(`
          id,
          nome,
          categoria,
          propriedade_id,
          arquivo_url,
          created_at,
          propriedades (
            nome_fazenda,
            nome_produtor
          )
        `)
        .single();

      if (dbErr) throw dbErr;

      if (data) {
        const newObj = {
          id: data.id,
          nome: data.nome,
          categoria: data.categoria,
          propriedade_id: data.propriedade_id,
          fazendaNome: (data.propriedades as any)?.nome_fazenda || 'Geral',
          produtorNome: (data.propriedades as any)?.nome_produtor || 'N/A',
          arquivo_url: data.arquivo_url,
          origem: 'Armazenamento Geral',
          data: data.created_at,
          podeDeletar: true,
          tabelaOrigem: 'documentos_propriedade'
        };
        setDocumentos([newObj, ...documentos]);
      }

      success('Documento arquivado com sucesso!');
      setShowUploadModal(false);
      setNewDocData({ nome: '', categoria: 'CAR', propriedade_id: '', file: null });
    } catch (err: any) {
      console.error('Erro ao arquivar documento:', err);
      error('Erro ao salvar documento: ' + err.message);
    } finally {
      setUploadingFile(false);
    }
  };

  const executeDeleteDoc = async () => {
    if (!deleteConfirmId) return;
    try {
      const { error: delErr } = await supabase
        .from('documentos_propriedade')
        .delete()
        .eq('id', deleteConfirmId);

      if (delErr) throw delErr;

      setDocumentos(documentos.filter(d => d.id !== deleteConfirmId));
      setDeleteConfirmId(null);
      success('Documento removido com sucesso!');
    } catch (err: any) {
      console.error('Erro ao deletar documento:', err);
      error('Erro ao excluir documento: ' + err.message);
    }
  };

  const docsFiltrados = documentos.filter(doc => {
    const matchSearch = searchQuery === '' || 
      doc.nome.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.fazendaNome.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.produtorNome.toLowerCase().includes(searchQuery.toLowerCase());

    const matchProp = selectedPropId === '' || doc.propriedade_id === selectedPropId;
    const matchCat = selectedCategoria === '' || doc.categoria === selectedCategoria;

    return matchSearch && matchProp && matchCat;
  });

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Cabeçalho da Seção com Motion */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="inline-flex items-center gap-2 bg-[#1B7547]/10 text-[#1B7547] px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider mb-2">
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Repositório Digital MS</span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Histórico de Documentação & Evidências
          </h1>
          <p className="text-sm text-slate-500 mt-1 font-medium">
            Central de controle de laudos, licenças, CAR, fotos e comprovantes de conformidade das propriedades.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowUploadModal(true)}
          className="group relative flex items-center justify-center gap-2 bg-gradient-to-r from-[#1B7547] to-[#15613a] hover:from-[#15613a] hover:to-[#0B3B23] text-white px-6 py-3.5 rounded-2xl font-extrabold text-xs transition-all duration-300 shadow-md shadow-[#1B7547]/20 hover:shadow-xl hover:scale-105 active:scale-95 cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4 transition-transform group-hover:rotate-90 duration-300" />
          <span>Arquivar Novo Documento</span>
        </button>
      </div>

      {/* Cards de Métricas com Motion */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-lg transition-all duration-300 flex items-center gap-4 group">
          <div className="p-3.5 bg-[#1B7547]/10 text-[#1B7547] rounded-2xl group-hover:bg-[#1B7547] group-hover:text-white transition-colors duration-300">
            <FolderOpen className="w-6 h-6 transition-transform group-hover:scale-110" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-900 tracking-tight">{documentos.length}</div>
            <div className="text-xs text-slate-500 font-extrabold uppercase tracking-wider">Total de Arquivos</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-lg transition-all duration-300 flex items-center gap-4 group">
          <div className="p-3.5 bg-blue-50 text-blue-700 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300">
            <ShieldCheck className="w-6 h-6 transition-transform group-hover:scale-110" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {documentos.filter(d => d.categoria === 'Checklist RTRS').length}
            </div>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Evidências RTRS</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-purple-50 text-purple-700 rounded-xl">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">
              {documentos.filter(d => d.categoria === 'Regularização').length}
            </div>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Regularizações</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-700 rounded-xl">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">
              {documentos.filter(d => ['CAR', 'LAU', 'EPI', 'Outros'].includes(d.categoria)).length}
            </div>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Documentos Gerais</div>
          </div>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por documento, critério ou fazenda..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Filtro por Propriedade */}
          <select
            value={selectedPropId}
            onChange={(e) => setSelectedPropId(e.target.value)}
            className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer hover:bg-slate-100 transition-colors"
          >
            <option value="">Todas as Fazendas</option>
            {propriedades.map((p) => (
              <option key={p.id} value={p.id}>{p.nome_fazenda}</option>
            ))}
          </select>

          {/* Filtro por Categoria */}
          <select
            value={selectedCategoria}
            onChange={(e) => setSelectedCategoria(e.target.value)}
            className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer hover:bg-slate-100 transition-colors"
          >
            <option value="">Todas as Categorias</option>
            <option value="CAR">CAR</option>
            <option value="LAU">Licença Ambiental (LAU)</option>
            <option value="EPI">Comprovante de EPI</option>
            <option value="Checklist RTRS">Checklist RTRS</option>
            <option value="Regularização">Regularização</option>
            <option value="Outros">Outros</option>
          </select>
        </div>
      </div>

      {/* Tabela Principal de Documentos */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            <p className="text-xs font-bold">Carregando histórico de arquivos...</p>
          </div>
        ) : docsFiltrados.length === 0 ? (
          <div className="py-16 text-center text-slate-500 font-medium space-y-2">
            <FolderOpen className="w-10 h-10 mx-auto text-slate-300" />
            <p className="text-sm font-bold text-slate-700">Nenhum documento encontrado.</p>
            <p className="text-xs text-slate-400">Ajuste os filtros de busca para localizar arquivos.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                  <th className="px-6 py-4">Documento / Critério</th>
                  <th className="px-6 py-4">Propriedade</th>
                  <th className="px-6 py-4">Categoria</th>
                  <th className="px-6 py-4">Origem / Contexto</th>
                  <th className="px-6 py-4">Data Envio</th>
                  <th className="px-6 py-4 text-center">Arquivo</th>
                  <th className="px-6 py-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium">
                {docsFiltrados.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 text-slate-900 font-bold">{doc.nome}</td>
                    <td className="px-6 py-4 text-slate-700 font-semibold">{doc.fazendaNome}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        doc.categoria === 'CAR' ? 'bg-indigo-50 border border-indigo-200 text-indigo-700' :
                        doc.categoria === 'LAU' ? 'bg-blue-50 border border-blue-200 text-blue-700' :
                        doc.categoria === 'EPI' ? 'bg-amber-50 border border-amber-200 text-amber-700' :
                        doc.categoria === 'Checklist RTRS' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' :
                        doc.categoria === 'Regularização' ? 'bg-purple-50 border border-purple-200 text-purple-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {doc.categoria}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs">{doc.origem}</td>
                    <td className="px-6 py-4 text-slate-500 text-xs">
                      {new Date(doc.data).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleOpenEvidencia(doc.arquivo_url)}
                        className="group/btn inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1B7547]/10 hover:bg-[#1B7547]/20 text-[#1B7547] rounded-xl text-xs font-extrabold transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer"
                      >
                        {doc.arquivo_url?.toLowerCase().includes('.pdf') ? (
                          <>
                            <FileText className="w-3.5 h-3.5 shrink-0 text-[#1B7547] transition-transform group-hover/btn:scale-110 duration-300" />
                            <span>Abrir PDF</span>
                          </>
                        ) : (
                          <>
                            <ImageIcon className="w-3.5 h-3.5 shrink-0 text-[#1B7547] transition-transform group-hover/btn:scale-110 duration-300" />
                            <span>Ver Imagem</span>
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {doc.podeDeletar ? (
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(doc.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all duration-300 hover:scale-110 active:scale-90 cursor-pointer"
                          title="Excluir documento"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider bg-slate-100 px-2.5 py-1 rounded-lg">
                          Vinculado
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal para Arquivar Novo Documento */}
      {showUploadModal && (
        <Modal isOpen={showUploadModal} onClose={() => setShowUploadModal(false)} title="Arquivar Novo Documento">
          <form onSubmit={handleUploadNewDocument} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nome do Documento</label>
              <input
                type="text"
                required
                placeholder="Ex: Ficha de EPI 2026 / Laudo Solo / CAR"
                value={newDocData.nome}
                onChange={(e) => setNewDocData({ ...newDocData, nome: e.target.value })}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Propriedade Vinculada</label>
              <select
                required
                value={newDocData.propriedade_id}
                onChange={(e) => setNewDocData({ ...newDocData, propriedade_id: e.target.value })}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer"
              >
                <option value="">Selecione a Fazenda...</option>
                {propriedades.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome_fazenda} ({p.nome_produtor})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Categoria do Documento</label>
              <select
                value={newDocData.categoria}
                onChange={(e) => setNewDocData({ ...newDocData, categoria: e.target.value })}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer"
              >
                <option value="CAR">CAR (Cadastro Ambiental Rural)</option>
                <option value="LAU">Licença Ambiental (LAU)</option>
                <option value="EPI">Comprovante de EPI</option>
                <option value="Outros">Outros</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Arquivo (Imagem ou PDF)</label>
              <input
                type="file"
                required
                accept="image/*,application/pdf"
                onChange={(e) => setNewDocData({ ...newDocData, file: e.target.files?.[0] || null })}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl font-bold text-xs hover:bg-slate-100 transition-colors"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={uploadingFile}
                className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold text-xs transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {uploadingFile ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                    <span>Salvar e Arquivar</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Confirmação de Exclusão */}
      <ConfirmAction
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={executeDeleteDoc}
        title="Excluir Documento"
        description="Deseja realmente excluir este documento do arquivo permanente? Esta ação não pode ser desfeita."
        confirmText="Excluir"
        actionType="danger"
      />

      {/* Modal Lightbox de Foto Ampliada */}
      {fotoAmpliada && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-fadeIn transition-all" onClick={() => setFotoAmpliada(null)}>
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
            <button type="button" onClick={() => setFotoAmpliada(null)} className="absolute -top-10 right-0 text-white bg-black/50 hover:bg-black/70 p-2 rounded-full transition-all cursor-pointer shadow-md">
              <X className="w-6 h-6" />
            </button>
            <img src={fotoAmpliada} alt="Evidência Ampliada" className="max-w-full max-h-[85vh] rounded-xl shadow-2xl object-contain border border-slate-700/60 bg-slate-900/40" />
            {fotoAmpliada.startsWith('http') && (
              <a href={fotoAmpliada} target="_blank" rel="noreferrer" className="mt-3 text-xs text-emerald-300 underline font-bold hover:text-white flex items-center gap-1 bg-black/40 px-3 py-1 rounded-full border border-white/10">
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Abrir imagem original em nova guia</span>
              </a>
            )}
          </div>
        </div>
      )}

      {/* Modal Viewer de PDF */}
      {pdfAmpliado && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-fadeIn" onClick={() => setPdfAmpliado(null)}>
          <div className="relative w-full max-w-5xl h-[88vh] flex flex-col bg-slate-900 rounded-2xl overflow-hidden border border-slate-700 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-3.5 bg-slate-800 border-b border-slate-700 text-white">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-400" />
                <span className="font-bold text-sm">Visualizador de Documento PDF</span>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={pdfAmpliado}
                  download="documento.pdf"
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar / Abrir PDF</span>
                </a>
                <button type="button" onClick={() => setPdfAmpliado(null)} className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="flex-1 w-full h-full bg-slate-950">
              <iframe src={pdfAmpliado} className="w-full h-full border-none" title="Documento PDF" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
