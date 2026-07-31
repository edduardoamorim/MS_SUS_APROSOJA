import { useState, useEffect } from 'react';
import { 
  FileCheck2, 
  Search, 
  Calendar, 
  FileSearch, 
  CheckCircle2, 
  AlertTriangle, 
  Edit3, 
  Trash2, 
  ChevronRight, 
  ArrowRight,
  Filter,
  Sparkles,
  ClipboardList,
  Building2
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { resolveFarmEtapa, persistFarmEtapa } from '../../lib/etapaUtils';
import { TableRowSkeleton } from '../../components/ui/Skeleton';
import RevisaoAuditoria from '../../components/auditoria/RevisaoAuditoria';
import Modal from '../../components/ui/Modal';
import ConfirmDelete from '../../components/ui/ConfirmDelete';
import { useToast } from '../../context/ToastContext';

export default function GestorAuditorias() {
  const { success, error } = useToast();
  const [loading, setLoading] = useState(true);
  const [auditorias, setAuditorias] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Abas de Etapa: Prospecção | Auditoria Prévia | Auditoria Oficial
  const [activeEtapaTab, setActiveEtapaTab] = useState<'Prospecção' | 'Auditoria Prévia' | 'Auditoria Oficial'>('Prospecção');

  const [revisaoAuditoria, setRevisaoAuditoria] = useState<{ id: string, nome: string } | null>(null);

  // Modal States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingAudit, setEditingAudit] = useState<any>(null);
  const [auditToDelete, setAuditToDelete] = useState<any>(null);

  // Form State
  const [formData, setFormData] = useState({ 
    propriedade_id: '', 
    tecnico_responsavel_id: '', 
    data_agendamento: '',
    etapa: 'Prospecção' as 'Prospecção' | 'Auditoria Prévia' | 'Auditoria Oficial'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  async function fetchInitialData() {
    setLoading(true);
    try {
      // 2. Buscar propriedades
      const { data: propsData } = await supabase
        .from('propriedades')
        .select('id, nome_fazenda, nome_produtor, tecnico_id, municipio');
      if (propsData) setProperties(propsData);

      // 3. Buscar técnicos
      const { data: techsData } = await supabase
        .from('perfis')
        .select('id, nome')
        .eq('role', 'tecnico');
      if (techsData) setTechnicians(techsData);

      // 1. Buscar auditorias com fallback resiliente
      let rawAudits: any[] = [];
      const { data: auditsData, error: auditsError } = await supabase
        .from('auditorias')
        .select(`
          id,
          data_agendamento,
          status,
          etapa,
          propriedade_id,
          tecnico_responsavel_id,
          propriedades (
            id,
            nome_fazenda,
            nome_produtor
          )
        `)
        .order('created_at', { ascending: false });

      if (!auditsError && auditsData) {
        rawAudits = auditsData;
      } else {
        const { data: simpleAudits } = await supabase
          .from('auditorias')
          .select('id, data_agendamento, status, etapa, propriedade_id, tecnico_responsavel_id')
          .order('created_at', { ascending: false });
        if (simpleAudits) rawAudits = simpleAudits;
      }

      // Resolver etapa nula por padrão (Sempre Prospecção se não definida)
      const processedAudits = rawAudits.map((a: any) => {
        const propRel = Array.isArray(a.propriedades) ? a.propriedades[0] : a.propriedades;
        const propFound = propRel || (propsData || []).find(p => p.id === a.propriedade_id);
        const propId = a.propriedade_id || propFound?.id;
        const e = resolveFarmEtapa(propId, propFound?.etapa, a.etapa);

        return {
          ...a,
          etapa: e,
          propriedades: propFound || { nome_fazenda: 'Fazenda Registrada', nome_produtor: 'Produtor' }
        };
      });

      // Garantir que TODAS as propriedades cadastradas no sistema estejam presentes em GestorAuditorias (fase inicial Prospecção)
      const existingPropIds = new Set(processedAudits.map(a => a.propriedade_id).filter(Boolean));
      (propsData || []).forEach(p => {
        if (!existingPropIds.has(p.id)) {
          const e = resolveFarmEtapa(p.id, p.etapa, null);
          processedAudits.push({
            id: `v-audit-${p.id}`,
            propriedade_id: p.id,
            tecnico_responsavel_id: p.tecnico_id || p.tecnico_responsavel_id || null,
            data_agendamento: p.created_at || new Date().toISOString(),
            status: 'Autoavaliação',
            etapa: e,
            propriedades: p
          });
        }
      });

      setAuditorias(processedAudits);
    } catch (err: any) {
      console.error('Erro ao carregar dados em GestorAuditorias:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleUpdateEtapa = async (auditoriaId: string, novaEtapa: 'Prospecção' | 'Auditoria Prévia' | 'Auditoria Oficial') => {
    try {
      const target = auditorias.find(a => a.id === auditoriaId);
      const propId = target?.propriedade_id;

      if (propId) {
        await persistFarmEtapa(propId, auditoriaId, novaEtapa);
      }

      if (auditoriaId.startsWith('v-audit-')) {
        const { data: newAudit } = await supabase
          .from('auditorias')
          .insert([{
            propriedade_id: propId,
            tecnico_responsavel_id: target?.tecnico_responsavel_id || null,
            etapa: novaEtapa,
            status: 'Visita de Campo',
            data_agendamento: new Date().toISOString()
          }])
          .select()
          .single();

        setAuditorias(auditorias.map(a => a.id === auditoriaId ? { ...a, id: newAudit?.id || auditoriaId, etapa: novaEtapa } : a));
      } else {
        setAuditorias(auditorias.map(a => a.id === auditoriaId ? { ...a, etapa: novaEtapa } : a));
      }

      success(`Etapa alterada para "${novaEtapa}" com sucesso!`);
    } catch (err: any) {
      console.error('Erro ao alterar etapa:', err);
      error('Erro ao alterar etapa: ' + err.message);
    }
  };

  const handleOpenCreate = () => {
    setEditingAudit(null);
    setFormData({ 
      propriedade_id: properties[0]?.id || '', 
      tecnico_responsavel_id: technicians[0]?.id || '', 
      data_agendamento: new Date().toISOString().split('T')[0],
      etapa: activeEtapaTab
    });
    setIsFormOpen(true);
  };

  const handleOpenEdit = (audit: any) => {
    setEditingAudit(audit);
    setFormData({ 
      propriedade_id: audit.propriedade_id || '', 
      tecnico_responsavel_id: audit.tecnico_responsavel_id || '', 
      data_agendamento: audit.data_agendamento ? new Date(audit.data_agendamento).toISOString().split('T')[0] : '',
      etapa: audit.etapa || 'Prospecção'
    });
    setIsFormOpen(true);
  };

  const handleOpenDelete = (audit: any) => {
    setAuditToDelete(audit);
    setIsDeleteOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const payload: any = {
        propriedade_id: formData.propriedade_id,
        tecnico_responsavel_id: formData.tecnico_responsavel_id || null,
        data_agendamento: formData.data_agendamento || null,
        etapa: formData.etapa
      };

      if (!editingAudit) {
        payload.status = formData.etapa === 'Auditoria Oficial' ? 'Visita de Campo' : 
                         formData.etapa === 'Auditoria Prévia' ? 'Autoavaliação' : 'Prospecção';
      }

      if (editingAudit) {
        const { error } = await supabase
          .from('auditorias')
          .update(payload)
          .eq('id', editingAudit.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('auditorias')
          .insert([payload]);
        if (error) throw error;
      }

      setIsFormOpen(false);
      await fetchInitialData();
      success('Auditoria registrada com sucesso!');
    } catch (err: any) {
      console.error('Erro ao salvar auditoria:', err);
      error('Erro ao salvar: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!auditToDelete) return;
    try {
      const { error: err } = await supabase
        .from('auditorias')
        .delete()
        .eq('id', auditToDelete.id);
      if (err) throw err;

      setAuditorias(auditorias.filter(a => a.id !== auditToDelete.id));
      setIsDeleteOpen(false);
      success('Registro removido com sucesso!');
    } catch (err: any) {
      console.error('Erro ao deletar:', err);
      error('Erro ao excluir: ' + err.message);
    }
  };

  const handleApprove = async () => {
    if (!revisaoAuditoria) return;
    try {
      const { error: err } = await supabase
        .from('auditorias')
        .update({ status: 'Certificada', etapa: 'Auditoria Oficial' })
        .eq('id', revisaoAuditoria.id);
      if (err) throw err;

      setAuditorias(auditorias.map(a => a.id === revisaoAuditoria.id ? { ...a, status: 'Certificada', etapa: 'Auditoria Oficial' } : a));
      success('Auditoria oficial aprovada e certificada!');
    } catch (err: any) {
      console.error(err);
      error('Erro ao aprovar auditoria: ' + err.message);
    }
    setRevisaoAuditoria(null);
  };

  const handleReject = async () => {
    if (!revisaoAuditoria) return;
    try {
      const { error } = await supabase
        .from('auditorias')
        .update({ status: 'Visita de Campo' })
        .eq('id', revisaoAuditoria.id);
      if (error) throw error;

      setAuditorias(auditorias.map(a => a.id === revisaoAuditoria.id ? { ...a, status: 'Visita de Campo' } : a));
    } catch (err: any) {
      console.error(err);
    }
    setRevisaoAuditoria(null);
  };

  const getTecnicoName = (id?: string | null, prop?: any) => {
    if (id) {
      const tech = technicians.find(t => t.id === id);
      if (tech) return tech.nome;
    }
    const nameOrMun = `${prop?.nome_fazenda || ''} ${prop?.municipio || ''}`.toLowerCase();
    if (nameOrMun.includes('chapad') || nameOrMun.includes('rio verde')) {
      return 'Alexandre Santos Soares';
    } else if (nameOrMun.includes('campanár') || nameOrMun.includes('santa virg') || nameOrMun.includes('maracaju')) {
      return 'Patrícia Vilela Soares';
    }
    return 'Técnico Vistoriador MS';
  };

  const getFazendaName = (audit: any) => {
    return audit.propriedades?.nome_fazenda || 'Sem fazenda';
  };

  // Filtragem por Etapa Ativa e Busca Textual
  const filteredAudits = auditorias.filter(a => {
    const matchEtapa = a.etapa === activeEtapaTab;
    const farmName = getFazendaName(a);
    const techName = getTecnicoName(a.tecnico_responsavel_id || a.propriedades?.tecnico_id, a.propriedades);
    const matchSearch = searchQuery === '' || 
      farmName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      techName.toLowerCase().includes(searchQuery.toLowerCase());

    return matchEtapa && matchSearch;
  });

  const countProspeccao = auditorias.filter(a => a.etapa === 'Prospecção').length;
  const countPrevia = auditorias.filter(a => a.etapa === 'Auditoria Prévia').length;
  const countOficial = auditorias.filter(a => a.etapa === 'Auditoria Oficial').length;

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200/80 pb-6">
        <div>
          <div className="inline-flex items-center gap-2 bg-[#1B7547]/10 text-[#1B7547] px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider mb-2">
            <FileCheck2 className="w-3.5 h-3.5" />
            <span>Fluxo de Homologação RTRS</span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            Gestão de Auditorias & Etapas RTRS
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Gerencie o fluxo de certificação dividido nas 3 etapas oficiais: Prospecção, Auditoria Prévia e Auditoria Oficial.
          </p>
        </div>
        <button 
          onClick={handleOpenCreate}
          className="group relative flex items-center gap-2 bg-gradient-to-r from-[#1B7547] to-[#15613a] hover:from-[#15613a] hover:to-[#0B3B23] text-white px-5 py-3 rounded-2xl font-extrabold text-xs transition-all duration-300 shadow-md shadow-[#1B7547]/20 hover:shadow-xl hover:scale-105 active:scale-95 cursor-pointer overflow-hidden"
        >
          <Calendar className="w-4 h-4 transition-transform group-hover:scale-110 duration-300" />
          <span>Novo Agendamento ({activeEtapaTab})</span>
        </button>
      </div>

      {/* ABAS DAS 3 ETAPAS DA AUDITORIA COM MOTION DESIGN */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={() => setActiveEtapaTab('Prospecção')}
          className={`p-5 rounded-3xl border text-left transition-all duration-300 cursor-pointer flex items-center justify-between group ${
            activeEtapaTab === 'Prospecção'
              ? 'bg-gradient-to-br from-amber-50 to-white border-amber-300 ring-4 ring-amber-400/20 shadow-lg scale-102'
              : 'bg-white border-slate-200 hover:bg-slate-50 hover:shadow-md'
          }`}
        >
          <div>
            <div className="flex items-center gap-2.5">
              <span className={`w-7 h-7 rounded-2xl text-xs font-extrabold flex items-center justify-center transition-transform group-hover:scale-110 ${
                activeEtapaTab === 'Prospecção' ? 'bg-[#C59B27] text-white shadow-md' : 'bg-amber-100 text-amber-900'
              }`}>1</span>
              <h3 className="font-extrabold text-sm text-slate-900">1. Prospecção</h3>
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5 font-medium">Onboarding e cadastro de fazendas</p>
          </div>
          <span className="text-base font-extrabold text-[#C59B27] bg-[#C59B27]/10 px-3 py-1.5 rounded-2xl border border-[#C59B27]/20 shadow-2xs">
            {countProspeccao}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveEtapaTab('Auditoria Prévia')}
          className={`p-5 rounded-3xl border text-left transition-all duration-300 cursor-pointer flex items-center justify-between group ${
            activeEtapaTab === 'Auditoria Prévia'
              ? 'bg-gradient-to-br from-blue-50 to-white border-blue-300 ring-4 ring-blue-400/20 shadow-lg scale-102'
              : 'bg-white border-slate-200 hover:bg-slate-50 hover:shadow-md'
          }`}
        >
          <div>
            <div className="flex items-center gap-2.5">
              <span className={`w-7 h-7 rounded-2xl text-xs font-extrabold flex items-center justify-center transition-transform group-hover:scale-110 ${
                activeEtapaTab === 'Auditoria Prévia' ? 'bg-blue-600 text-white shadow-md' : 'bg-blue-100 text-blue-900'
              }`}>2</span>
              <h3 className="font-extrabold text-sm text-slate-900">2. Auditoria Prévia</h3>
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5 font-medium">Diagnóstico prévio e autoavaliação</p>
          </div>
          <span className="text-base font-extrabold text-blue-700 bg-blue-100/80 px-3 py-1.5 rounded-2xl border border-blue-200 shadow-2xs">
            {countPrevia}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveEtapaTab('Auditoria Oficial')}
          className={`p-5 rounded-3xl border text-left transition-all duration-300 cursor-pointer flex items-center justify-between group ${
            activeEtapaTab === 'Auditoria Oficial'
              ? 'bg-gradient-to-br from-emerald-50 to-white border-emerald-300 ring-4 ring-emerald-400/20 shadow-lg scale-102'
              : 'bg-white border-slate-200 hover:bg-slate-50 hover:shadow-md'
          }`}
        >
          <div>
            <div className="flex items-center gap-2.5">
              <span className={`w-7 h-7 rounded-2xl text-xs font-extrabold flex items-center justify-center transition-transform group-hover:scale-110 ${
                activeEtapaTab === 'Auditoria Oficial' ? 'bg-[#1B7547] text-white shadow-md' : 'bg-emerald-100 text-emerald-900'
              }`}>3</span>
              <h3 className="font-extrabold text-sm text-slate-900">3. Auditoria Oficial</h3>
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5 font-medium">Vistoria técnica final & Certificação</p>
          </div>
          <span className="text-base font-extrabold text-[#1B7547] bg-[#1B7547]/10 px-3 py-1.5 rounded-2xl border border-[#1B7547]/20 shadow-2xs">
            {countOficial}
          </span>
        </button>
      </div>

      {/* Barra de Filtro Textual */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between gap-4">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input 
            type="text" 
            placeholder={`Buscar em ${activeEtapaTab}...`}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>

        <span className="text-xs font-bold text-slate-500 hidden sm:inline">
          Exibindo registros da etapa <strong className="text-slate-800">{activeEtapaTab}</strong>
        </span>
      </div>

      {/* Tabela de Auditorias */}
      {loading ? (
        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden p-6">
          <TableRowSkeleton />
          <TableRowSkeleton />
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-medium border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
                <tr>
                  <th className="px-6 py-4">Propriedade</th>
                  <th className="px-6 py-4">Técnico Atribuído</th>
                  <th className="px-6 py-4">Data Alvo/Visita</th>
                  <th className="px-6 py-4">Status Interno</th>
                  <th className="px-6 py-4 text-center">Etapa Atual</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAudits.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-medium">
                      Nenhuma auditoria ou fazenda cadastrada nesta etapa ({activeEtapaTab}).
                    </td>
                  </tr>
                ) : (
                  filteredAudits.map((auditoria: any) => (
                    <tr key={auditoria.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-900">{getFazendaName(auditoria)}</td>
                      <td className="px-6 py-4 text-slate-600 font-medium">
                        {getTecnicoName(auditoria.tecnico_responsavel_id || auditoria.propriedades?.tecnico_id, auditoria.propriedades)}
                      </td>
                      <td className="px-6 py-4 text-slate-500">
                        {auditoria.data_agendamento ? new Date(auditoria.data_agendamento).toLocaleDateString('pt-BR') : '-'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          auditoria.status === 'Certificada' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                          auditoria.status === 'Em Análise' ? 'bg-purple-100 text-purple-800 border border-purple-300' :
                          auditoria.status === 'Visita de Campo' ? 'bg-blue-100 text-blue-800 border border-blue-300' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {auditoria.status}
                        </span>
                      </td>

                      {/* SELETOR RÁPIDO DE ETAPA */}
                      <td className="px-6 py-4 text-center">
                        <select
                          value={auditoria.etapa}
                          onChange={(e) => handleUpdateEtapa(auditoria.id, e.target.value as any)}
                          className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none cursor-pointer hover:bg-slate-100 transition-colors"
                        >
                          <option value="Prospecção">1. Prospecção</option>
                          <option value="Auditoria Prévia">2. Auditoria Prévia</option>
                          <option value="Auditoria Oficial">3. Auditoria Oficial</option>
                        </select>
                      </td>

                      {/* AÇÕES */}
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {auditoria.etapa === 'Prospecção' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateEtapa(auditoria.id, 'Auditoria Prévia')}
                              className="group/btn inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-xl font-extrabold text-[11px] border border-blue-200/80 transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer shadow-2xs"
                              title="Promover para Auditoria Prévia"
                            >
                              <span>Avançar para Prévia</span>
                              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover/btn:translate-x-1 duration-300" />
                            </button>
                          )}

                          {auditoria.etapa === 'Auditoria Prévia' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateEtapa(auditoria.id, 'Auditoria Oficial')}
                              className="group/btn inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl font-extrabold text-[11px] border border-emerald-200/80 transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer shadow-2xs"
                              title="Promover para Auditoria Oficial"
                            >
                              <span>Promover p/ Oficial</span>
                              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover/btn:translate-x-1 duration-300" />
                            </button>
                          )}

                          {auditoria.status === 'Em Análise' && (
                            <button 
                              type="button"
                              onClick={() => setRevisaoAuditoria({ id: auditoria.id, nome: getFazendaName(auditoria) })}
                              className="group/btn relative inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-[#1B7547] to-[#15613a] hover:from-[#15613a] hover:to-[#0B3B23] text-white rounded-xl font-extrabold text-xs shadow-md shadow-[#1B7547]/20 transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer overflow-hidden"
                            >
                              <span className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover/btn:translate-x-full transition-transform duration-1000 ease-out pointer-events-none" />
                              <FileSearch className="w-3.5 h-3.5 transition-transform group-hover/btn:scale-110 duration-300" />
                              <span>Avaliar Certificação</span>
                            </button>
                          )}

                          <button 
                            type="button"
                            onClick={() => handleOpenEdit(auditoria)}
                            className="p-2 text-slate-400 hover:text-[#1B7547] hover:bg-[#1B7547]/10 rounded-xl transition-all duration-300 hover:scale-110 active:scale-90 cursor-pointer"
                            title="Editar"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button 
                            type="button"
                            onClick={() => handleOpenDelete(auditoria)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all duration-300 hover:scale-110 active:scale-90 cursor-pointer"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Agendamento */}
      <Modal 
        isOpen={isFormOpen} 
        onClose={() => setIsFormOpen(false)} 
        title={editingAudit ? "Editar Auditoria" : "Novo Agendamento de Auditoria"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Etapa do Processo</label>
            <select
              value={formData.etapa}
              onChange={e => setFormData({ ...formData, etapa: e.target.value as any })}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none cursor-pointer"
            >
              <option value="Prospecção">1. Prospecção (Cadastro e Onboarding)</option>
              <option value="Auditoria Prévia">2. Auditoria Prévia (Diagnóstico e Autoavaliação)</option>
              <option value="Auditoria Oficial">3. Auditoria Oficial (Vistoria in-loco RTRS)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Fazenda Alvo</label>
            <select
              required
              value={formData.propriedade_id}
              onChange={e => setFormData({ ...formData, propriedade_id: e.target.value })}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none cursor-pointer"
              disabled={!!editingAudit}
            >
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.nome_fazenda} ({p.nome_produtor || 'Produtor'})</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Técnico Responsável</label>
            <select 
              value={formData.tecnico_responsavel_id}
              onChange={e => setFormData({ ...formData, tecnico_responsavel_id: e.target.value })}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none cursor-pointer"
            >
              <option value="">Aguardar atribuição</option>
              {technicians.map(t => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Data Prevista da Visita</label>
            <input 
              required
              type="date"
              value={formData.data_agendamento}
              onChange={e => setFormData({ ...formData, data_agendamento: e.target.value })}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
            <button 
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="px-4 py-2 font-bold text-xs rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              disabled={isSubmitting || properties.length === 0}
              className="px-5 py-2.5 font-bold text-xs rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white shadow-md transition-all disabled:opacity-50"
            >
              {isSubmitting ? "Gravando..." : editingAudit ? "Salvar Alterações" : "Confirmar Agendamento"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Deleção */}
      <ConfirmDelete 
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Cancelar Auditoria"
        description="Tem certeza que deseja remover esta auditoria do sistema? Esta ação não pode ser desfeita."
      />

      {revisaoAuditoria && (
        <RevisaoAuditoria 
          propriedadeNome={revisaoAuditoria.nome}
          onClose={() => setRevisaoAuditoria(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          auditoriaId={revisaoAuditoria.id}
        />
      )}
    </div>
  );
}
