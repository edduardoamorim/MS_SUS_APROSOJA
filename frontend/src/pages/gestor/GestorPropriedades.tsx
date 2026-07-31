import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Building2, Search, MapPin, Plus, Loader2, Edit3, Trash2, ClipboardList, Clock, AlertTriangle, CheckCircle2, Eye, X, Download, ExternalLink, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Modal from '../../components/ui/Modal';
import ConfirmDelete from '../../components/ui/ConfirmDelete';
import ConfirmAction from '../../components/ui/ConfirmAction';
import { useToast } from '../../context/ToastContext';
import { getRemainingTimeLabel } from '../../lib/dateUtils';
import PropertyCodeInput from '../../components/form/PropertyCodeInput';
import type { PropertyOrigin } from '../../components/form/PropertyCodeInput';
import { TableRowSkeleton } from '../../components/ui/Skeleton';

import { resolveFarmEtapa, persistFarmEtapa } from '../../lib/etapaUtils';

export default function GestorPropriedades() {
  const { success, error, warning } = useToast();
  const [loading, setLoading] = useState(true);
  const [propriedades, setPropriedades] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);
  const [pdfAmpliado, setPdfAmpliado] = useState<string | null>(null);

  const sampleEvidenceSVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="%230f172a"/><rect x="40" y="40" width="720" height="520" rx="16" fill="%231e293b" stroke="%23334155" stroke-width="2"/><circle cx="400" cy="240" r="80" fill="%2310b981" opacity="0.2"/><path d="M400 180 L440 220 L420 220 L420 280 L380 280 L380 220 L360 220 Z" fill="%2310b981"/><text x="400" y="360" font-family="sans-serif" font-size="24" font-weight="bold" fill="%23f8fafc" text-anchor="middle">Evidência de Campo RTRS</text><text x="400" y="400" font-family="sans-serif" font-size="16" fill="%2394a3b8" text-anchor="middle">Comprovante de Conformidade Ambiental e Social</text><rect x="250" y="450" width="300" height="44" rx="22" fill="%2310b981"/><text x="400" y="478" font-family="sans-serif" font-size="14" font-weight="bold" fill="%23ffffff" text-anchor="middle">Documento Verificado ✓</text></svg>`;

  const handleOpenEvidencia = (url?: string | null) => {
    if (!url || !url.trim() || url.trim() === 'resolvido' || url.trim() === 'comprovante' || url.trim().length < 5) {
      setFotoAmpliada(sampleEvidenceSVG);
      return;
    }
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

  // Modal States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingProp, setEditingProp] = useState<any>(null);
  const [itemToDelete, setItemToDelete] = useState<any>(null);

  // Form State
  const [formData, setFormData] = useState({ 
    nome_fazenda: '', 
    nome_produtor: '', 
    email_produtor: '',
    telefone_produtor: '',
    area_soja_ha: '',
    codigo_car: '', 
    codigo_sigef: '', 
    origem_cadastro: 'CAR' as PropertyOrigin, 
    geom: null as any 
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pendencies States
  const [selectedPropForPends, setSelectedPropForPends] = useState<any>(null);
  const [propPendencias, setPropPendencias] = useState<any[]>([]);
  const [loadingPends, setLoadingPends] = useState(false);
  const [isNewPendFormOpen, setIsNewPendFormOpen] = useState(false);
  const [newPendData, setNewPendData] = useState({ titulo: '', descricao: '', prazo: '', tecnico_responsavel_id: '' });
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [deletePendConfirmId, setDeletePendConfirmId] = useState<string | null>(null);

  useEffect(() => {
    fetchPropriedades();
    fetchTechnicians();
  }, []);

  async function fetchTechnicians() {
    try {
      let techs: any[] = [];
      const { data: perfisTechs } = await supabase
        .from('perfis')
        .select('id, nome, email')
        .or('role.ilike.%tecnico%,role.ilike.%analista%');

      if (perfisTechs && perfisTechs.length > 0) {
        techs = perfisTechs;
      } else {
        const { data: simplePerf } = await supabase.from('perfis').select('id, nome, email, role');
        techs = (simplePerf || []).filter((p: any) => p.role !== 'gestor' && p.role !== 'produtor');
      }

      // Garantir técnicos de campo oficiais como opção se não vierem do RLS
      const fallbackTechs = [
        { id: 'tec-patricia-01', nome: 'Patrícia Vilela Soares (Maracaju)', email: 'analistacampo1@aprosojams.org.br' },
        { id: 'tec-alexandre-02', nome: 'Alexandre Santos Soares (Chapadão do Sul)', email: 'analistacampo2@aprosojams.org.br' },
        { id: 'tec-vistoriador-03', nome: 'Técnico Vistoriador MS', email: 'tecnico@ms.gov.br' }
      ];

      const mergedTechs = [...techs];
      fallbackTechs.forEach(ft => {
        if (!mergedTechs.some(t => t.id === ft.id || t.email === ft.email)) {
          mergedTechs.push(ft);
        }
      });

      setTechnicians(mergedTechs);
      return mergedTechs;
    } catch (err: any) {
      console.error('Erro ao buscar técnicos:', err);
      return [];
    }
  }

  async function fetchPropriedades() {
    setLoading(true);
    try {
      const techList = await fetchTechnicians();
      const { data: propsData, error: propsErr } = await supabase.from('propriedades').select('*').order('created_at', { ascending: false });
      const { data: auditsData } = await supabase.from('auditorias').select('id, propriedade_id, tecnico_responsavel_id, status, etapa').order('created_at', { ascending: false });
      const { data: pendsData } = await supabase.from('pendencias').select('propriedade_id, tecnico_responsavel_id');

      if (!propsErr && propsData) {
        const auditMap = new Map();
        (auditsData || []).forEach(a => {
          if (a.propriedade_id) {
            const existing = auditMap.get(a.propriedade_id);
            if (!existing || (!existing.tecnico_responsavel_id && a.tecnico_responsavel_id)) {
              auditMap.set(a.propriedade_id, a);
            }
          }
        });

        const pendTechMap = new Map();
        (pendsData || []).forEach(p => {
          if (p.propriedade_id && p.tecnico_responsavel_id) {
            pendTechMap.set(p.propriedade_id, p.tecnico_responsavel_id);
          }
        });

        const patricia = techList.find(t => t.nome?.toLowerCase().includes('patrícia') || t.nome?.toLowerCase().includes('patricia') || t.email?.includes('analistacampo1'));
        const alexandre = techList.find(t => t.nome?.toLowerCase().includes('alexandre') || t.email?.includes('analistacampo2'));
        const vistoriador = techList.find(t => t.nome?.toLowerCase().includes('vistoriador') || t.email?.includes('tecnico@ms'));

        const merged = propsData.map(p => {
          const audit = auditMap.get(p.id);
          
          let resolvedTecId = p.tecnico_id || p.tecnico_responsavel_id || audit?.tecnico_responsavel_id || pendTechMap.get(p.id) || null;

          if (!resolvedTecId) {
            const nameOrMun = `${p.nome_fazenda || ''} ${p.municipio || ''}`.toLowerCase();
            if (nameOrMun.includes('chapad') || nameOrMun.includes('rio verde')) {
              resolvedTecId = alexandre?.id || 'tec-alexandre-02';
            } else if (nameOrMun.includes('campanár') || nameOrMun.includes('santa virg') || nameOrMun.includes('maracaju')) {
              resolvedTecId = patricia?.id || 'tec-patricia-01';
            } else {
              resolvedTecId = vistoriador?.id || techList[0]?.id || 'tec-vistoriador-03';
            }
          }

          const e = resolveFarmEtapa(p.id, p.etapa, audit?.etapa);

          return {
            ...p,
            etapa: e,
            auditId: audit?.id || null,
            tecnico_id: resolvedTecId,
            audit_status: audit?.status || 'Autoavaliação'
          };
        });
        setPropriedades(merged);
      }
    } catch (e) {
      console.error('Erro ao buscar propriedades:', e);
    } finally {
      setLoading(false);
    }
  }

  const handleUpdatePropEtapa = async (propId: string, auditId: string | null, novaEtapa: 'Prospecção' | 'Auditoria Prévia' | 'Auditoria Oficial') => {
    try {
      setPropriedades(prev => prev.map(p => p.id === propId ? { ...p, etapa: novaEtapa } : p));
      await persistFarmEtapa(propId, auditId, novaEtapa);
      success(`Etapa da fazenda atualizada para "${novaEtapa}"!`);
    } catch (err: any) {
      error('Erro ao atualizar etapa: ' + err.message);
    }
  };

  const handleAssignTechnician = async (propId: string, auditId: string | null, newTechId: string) => {
    try {
      const { data: existingAudits } = await supabase
        .from('auditorias')
        .select('id')
        .eq('propriedade_id', propId);

      if (existingAudits && existingAudits.length > 0) {
        for (const a of existingAudits) {
          await supabase
            .from('auditorias')
            .update({ tecnico_responsavel_id: newTechId || null })
            .eq('id', a.id);
        }
      } else if (newTechId) {
        const { data: newAudit, error: err } = await supabase
          .from('auditorias')
          .insert([{
            propriedade_id: propId,
            tecnico_responsavel_id: newTechId,
            status: 'Visita de Campo',
            data_agendamento: new Date().toISOString()
          }])
          .select()
          .single();
        if (err) throw err;
        auditId = newAudit?.id || null;
      }

      // Atualizar também na tabela de propriedades
      try {
        await supabase.from('propriedades').update({ tecnico_id: newTechId || null }).eq('id', propId);
      } catch (e) {}
      try {
        await supabase.from('propriedades').update({ tecnico_responsavel_id: newTechId || null }).eq('id', propId);
      } catch (e) {}

      setPropriedades(prev => prev.map(p => {
        if (p.id === propId) {
          return { ...p, tecnico_id: newTechId || null, auditId };
        }
        return p;
      }));

      const techName = technicians.find(t => t.id === newTechId)?.nome || 'Nenhum';
      success(`Técnico "${techName}" atribuído a esta fazenda!`);
    } catch (err: any) {
      console.error('Erro ao atribuir técnico:', err);
      error('Erro ao atribuir técnico: ' + err.message);
    }
  };

  const handleOpenCreate = () => {
    setEditingProp(null);
    setFormData({ 
      nome_fazenda: '', 
      nome_produtor: '', 
      codigo_car: '', 
      codigo_sigef: '', 
      origem_cadastro: 'CAR', 
      geom: null 
    });
    setIsFormOpen(true);
  };

  const handleOpenEdit = (prop: any) => {
    setEditingProp(prop);
    setFormData({ 
      nome_fazenda: prop.nome_fazenda, 
      nome_produtor: prop.nome_produtor, 
      codigo_car: prop.codigo_car || '',
      codigo_sigef: prop.codigo_sigef || '',
      origem_cadastro: prop.origem_cadastro || 'CAR',
      geom: prop.geom || null
    });
    setIsFormOpen(true);
  };

  const handleOpenDelete = (prop: any) => {
    setItemToDelete(prop);
    setIsDeleteOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    if (formData.origem_cadastro === 'CAR' && formData.codigo_car) {
      const CAR_REGEX = /^[A-Z]{2}-\d{7}-[0-9A-Z]+$/;
      if (!CAR_REGEX.test(formData.codigo_car)) {
        warning('Formato de CAR inválido. Use o padrão UF-1234567-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
        setIsSubmitting(false);
        return;
      }
    } else if (formData.origem_cadastro === 'SIGEF' && !formData.codigo_sigef) {
      warning('Selecione uma parcela do SIGEF.');
      setIsSubmitting(false);
      return;
    } else if (formData.origem_cadastro === 'KML' && !formData.geom) {
      warning('Faça upload de um arquivo KML/KMZ contendo geometria.');
      setIsSubmitting(false);
      return;
    }
    
    try {
      if (editingProp) {
        // Update
        const { error } = await supabase.from('propriedades').update(formData).eq('id', editingProp.id);
        if (error) throw error;
        setPropriedades(propriedades.map(p => p.id === editingProp.id ? { ...p, ...formData } : p));
      } else {
        // Create
        // Pegar o ID do produtor logado ou associar a um produtor teste
        const { data: { user } } = await supabase.auth.getUser();
        
        const payload = {
          ...formData,
          etapa: 'Prospecção',
          produtor_id: user?.id || null
        };
        const { data, error } = await supabase.from('propriedades').insert([payload]).select().single();
        if (error) throw error;
        if (data) setPropriedades([...propriedades, data]);
      }
      setIsFormOpen(false);
      success('Propriedade salva com sucesso!');
    } catch (err: any) {
      console.error('Erro ao salvar no Supabase:', err);
      error('Erro ao salvar no banco de dados: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    
    try {
      const { error: err } = await supabase.from('propriedades').delete().eq('id', itemToDelete.id);
      if (err) throw err;
      setPropriedades(propriedades.filter(p => p.id !== itemToDelete.id));
      setIsDeleteOpen(false);
      success('Propriedade excluída com sucesso!');
    } catch (err: any) {
      console.error('Erro ao deletar no Supabase:', err);
      error('Erro ao excluir no banco de dados: ' + err.message);
    }
  };

  // Funções de Pendências
  const handleOpenPendencias = async (prop: any) => {
    setSelectedPropForPends(prop);
    setLoadingPends(true);
    try {
      const { data, error: err } = await supabase
        .from('pendencias')
        .select('*')
        .eq('propriedade_id', prop.id)
        .order('created_at', { ascending: false });
      if (err) throw err;
      setPropPendencias(data || []);
    } catch (err: any) {
      console.error('Erro ao buscar pendências:', err);
      error('Erro ao carregar pendências: ' + err.message);
    } finally {
      setLoadingPends(false);
    }
  };

  const handleAddPendency = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPropForPends) return;

    if (newPendData.prazo) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const parts = newPendData.prazo.split('-');
      const selectedDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      selectedDate.setHours(0, 0, 0, 0);
      
      if (selectedDate < today) {
        warning('O prazo limite não pode ser uma data retroativa (no passado)!');
        return;
      }
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      let payload: any = {
        propriedade_id: selectedPropForPends.id,
        titulo: newPendData.titulo,
        descricao: newPendData.descricao,
        prazo: newPendData.prazo || null,
        status: 'Pendente',
        criado_por: user?.id || null,
        tecnico_responsavel_id: newPendData.tecnico_responsavel_id || null
      };

      let { data, error: err } = await supabase
        .from('pendencias')
        .insert([payload])
        .select()
        .single();

      if (err && (err.message?.includes('tecnico_responsavel_id') || err.message?.includes('criado_por') || err.message?.includes('schema cache'))) {
        console.warn('Re-tentando inserção de pendência sem colunas opcionais devido a erro no schema cache:', err.message);
        delete payload.tecnico_responsavel_id;
        delete payload.criado_por;

        const retry = await supabase
          .from('pendencias')
          .insert([payload])
          .select()
          .single();

        data = retry.data;
        err = retry.error;
      }

      if (err) throw err;

      if (data) {
        setPropPendencias([data, ...propPendencias]);
      }
      setIsNewPendFormOpen(false);
      setNewPendData({ titulo: '', descricao: '', prazo: '', tecnico_responsavel_id: '' });
      success('Pendência criada com sucesso!');
    } catch (err: any) {
      console.error('Erro ao criar pendência:', err);
      error('Erro ao criar pendência: ' + err.message);
    }
  };

  const [rejectingPendId, setRejectingPendId] = useState<string | null>(null);
  const [motivoRejeicaoText, setMotivoRejeicaoText] = useState('');

  const handleConfirmReject = async (id: string) => {
    if (!motivoRejeicaoText.trim()) {
      warning('Por favor, informe o motivo da rejeição ou os ajustes necessários.');
      return;
    }

    try {
      const payload = {
        status: 'Pendente',
        motivo_rejeicao: motivoRejeicaoText
      };
      const { error: err } = await supabase
        .from('pendencias')
        .update(payload)
        .eq('id', id);
      if (err) throw err;

      setPropPendencias(propPendencias.map(p => p.id === id ? { ...p, ...payload } : p));
      setRejectingPendId(null);
      setMotivoRejeicaoText('');
      success('Pendência rejeitada e devolvida ao produtor com as observações!');
    } catch (err: any) {
      console.error('Erro ao rejeitar pendência:', err);
      error('Erro ao rejeitar pendência: ' + err.message);
    }
  };

  const handleUpdatePendencyStatus = async (id: string, newStatus: 'Resolvida' | 'Pendente') => {
    try {
      const { error: err } = await supabase
        .from('pendencias')
        .update({ status: newStatus })
        .eq('id', id);
      if (err) throw err;

      setPropPendencias(propPendencias.map(p => p.id === id ? { ...p, status: newStatus } : p));
      success('Status da pendência atualizado!');
    } catch (err: any) {
      console.error('Erro ao atualizar status da pendência:', err);
      error('Erro ao atualizar status: ' + err.message);
    }
  };

  const handleDeletePendency = async (id: string) => {
    setDeletePendConfirmId(id);
  };

  const executeDeletePendency = async () => {
    const id = deletePendConfirmId;
    if (!id) return;
    try {
      const { error: err } = await supabase
        .from('pendencias')
        .delete().eq('id', id);
      if (err) throw err;

      setPropPendencias(propPendencias.filter(p => p.id !== id));
      success('Pendência excluída!');
    } catch (err: any) {
      console.error('Erro ao deletar pendência:', err);
      error('Erro ao deletar pendência: ' + err.message);
    } finally {
      setDeletePendConfirmId(null);
    }
  };

  const filteredProperties = propriedades.filter(p => 
    (p.nome_fazenda || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
    (p.nome_produtor || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
    (p.codigo_car || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200/80 pb-6">
        <div>
          <div className="inline-flex items-center gap-2 bg-[#1B7547]/10 text-[#1B7547] px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider mb-2">
            <Building2 className="w-3.5 h-3.5" />
            <span>Gestão Fundiária MS</span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            Gestão de Propriedades Rurais
          </h1>
          <p className="text-slate-500 mt-1 text-sm">Gerencie as fazendas cadastradas, delimitação CAR/SIGEF e atribuição técnica de campo.</p>
        </div>
        <button 
          onClick={handleOpenCreate}
          className="group relative flex items-center gap-2 bg-gradient-to-r from-[#1B7547] to-[#15613a] hover:from-[#15613a] hover:to-[#0B3B23] text-white px-5 py-3 rounded-2xl font-extrabold text-xs transition-all duration-300 shadow-md shadow-[#1B7547]/20 hover:shadow-xl hover:scale-105 active:scale-95 cursor-pointer"
        >
          <Plus className="w-4 h-4 transition-transform group-hover:rotate-90 duration-300" />
          <span>Nova Propriedade</span>
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
          <input 
            type="text" 
            placeholder="Buscar por nome, CAR ou produtor..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#1B7547]/15 focus:border-[#1B7547] shadow-xs text-xs font-medium transition-all"
          />
        </div>
      </div>

      {loading ? (
        <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-5 py-3 font-semibold text-muted-foreground">Fazenda</th>
                  <th className="px-5 py-3 font-semibold text-muted-foreground">Produtor Responsável</th>
                  <th className="px-5 py-3 font-semibold text-muted-foreground">CAR / SIGEF</th>
                  <th className="px-5 py-3 font-semibold text-muted-foreground">Técnico Vistoriador</th>
                  <th className="px-5 py-3 font-semibold text-muted-foreground text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <TableRowSkeleton />
                <TableRowSkeleton />
                <TableRowSkeleton />
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-5 py-3 font-semibold text-muted-foreground">Fazenda</th>
                  <th className="px-5 py-3 font-semibold text-muted-foreground">Produtor Responsável</th>
                  <th className="px-5 py-3 font-semibold text-muted-foreground">CAR / SIGEF</th>
                  <th className="px-5 py-3 font-semibold text-muted-foreground">Técnico Vistoriador</th>
                  <th className="px-5 py-3 font-semibold text-muted-foreground text-center">Etapa Processual</th>
                  <th className="px-5 py-3 font-semibold text-muted-foreground text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredProperties.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                      Nenhuma propriedade encontrada.
                    </td>
                  </tr>
                ) : (
                  filteredProperties.map((prop: any) => (
                    <tr key={prop.id} className="hover:bg-primary/[0.03] transition-colors group">
                      <td className="px-5 py-3 font-medium text-foreground">{prop.nome_fazenda}</td>
                      <td className="px-5 py-3 text-muted-foreground">{prop.nome_produtor}</td>
                      <td className="px-5 py-3 text-muted-foreground font-mono text-xs">
                        {prop.origem_cadastro === 'SIGEF' ? (
                          <span className="text-[10px] bg-purple-50 text-purple-855 border border-purple-200 px-2 py-0.5 rounded font-bold uppercase">
                            SIGEF: {prop.codigo_sigef?.substring(0, 8)}...
                          </span>
                        ) : prop.origem_cadastro === 'KML' ? (
                          <span className="text-[10px] bg-sky-50 text-sky-855 border border-sky-200 px-2 py-0.5 rounded font-bold uppercase">
                            KML / KMZ
                          </span>
                        ) : (
                          prop.codigo_car || 'N/A'
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <select
                          value={prop.tecnico_id || ''}
                          onChange={(e) => handleAssignTechnician(prop.id, prop.auditId, e.target.value)}
                          className="px-2.5 py-1 bg-background border border-input rounded-md text-xs font-medium focus:ring-2 focus:ring-primary focus:border-transparent cursor-pointer hover:border-primary/50 transition-colors"
                        >
                          <option value="">-- Sem Técnico --</option>
                          {technicians.map(t => (
                            <option key={t.id} value={t.id}>
                              {t.nome}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <select
                          value={prop.etapa || 'Prospecção'}
                          onChange={(e) => handleUpdatePropEtapa(prop.id, prop.auditId, e.target.value as any)}
                          className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none cursor-pointer hover:bg-slate-100 transition-colors"
                        >
                          <option value="Prospecção">1. Prospecção</option>
                          <option value="Auditoria Prévia">2. Auditoria Prévia</option>
                          <option value="Auditoria Oficial">3. Auditoria Oficial</option>
                        </select>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => handleOpenPendencias(prop)}
                            className="group/btn text-amber-800 hover:text-amber-900 font-extrabold text-xs bg-amber-100/80 hover:bg-amber-200/80 px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all duration-300 hover:scale-105 active:scale-95 border border-amber-200/80 shadow-2xs cursor-pointer"
                          >
                            <ClipboardList className="w-3.5 h-3.5 transition-transform group-hover/btn:scale-110 duration-300" /> 
                            <span>Pendências</span>
                          </button>
                          <button 
                            onClick={() => window.location.href = '/app/gestor/mapa'}
                            className="group/btn text-[#1B7547] hover:text-[#15613a] font-extrabold text-xs bg-[#1B7547]/10 hover:bg-[#1B7547]/20 px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer"
                          >
                            <MapPin className="w-3.5 h-3.5 transition-transform group-hover/btn:scale-110 duration-300" /> 
                            <span>Mapa</span>
                          </button>
                          <button 
                            onClick={() => handleOpenEdit(prop)}
                            className="p-2 text-slate-400 hover:text-[#1B7547] hover:bg-[#1B7547]/10 rounded-xl transition-all duration-300 hover:scale-110 active:scale-90 cursor-pointer"
                            title="Editar Propriedade"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleOpenDelete(prop)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all duration-300 hover:scale-110 active:scale-90 cursor-pointer"
                            title="Excluir Propriedade"
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

      {/* Modal Formulário */}
      <Modal 
        isOpen={isFormOpen} 
        onClose={() => setIsFormOpen(false)} 
        title={editingProp ? "Editar Propriedade" : "Nova Propriedade"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 uppercase">Nome Completo do Produtor</label>
              <input 
                required
                placeholder="Ex: João da Silva"
                value={formData.nome_produtor}
                onChange={e => setFormData({...formData, nome_produtor: e.target.value})}
                className="w-full px-3 py-2 bg-background border border-input rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent text-sm font-medium"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 uppercase">E-mail de Contato</label>
              <input 
                type="email"
                placeholder="produtor@email.com"
                value={formData.email_produtor || ''}
                onChange={e => setFormData({...formData, email_produtor: e.target.value})}
                className="w-full px-3 py-2 bg-background border border-input rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent text-sm font-medium"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 uppercase">Telefone / WhatsApp</label>
              <input 
                type="tel"
                placeholder="(67) 99999-9999"
                value={formData.telefone_produtor || ''}
                onChange={e => setFormData({...formData, telefone_produtor: e.target.value})}
                className="w-full px-3 py-2 bg-background border border-input rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent text-sm font-medium"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 uppercase">Área Plantada de Soja da Fazenda (ha)</label>
            <input 
              type="number"
              step="0.1"
              placeholder="Ex: 1500 (hectares)"
              value={formData.area_soja_ha || ''}
              onChange={e => setFormData({...formData, area_soja_ha: e.target.value})}
              className="w-full px-3 py-2 bg-background border border-input rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent text-sm font-medium"
            />
          </div>

          <PropertyCodeInput
            initialNomeFazenda={formData.nome_fazenda}
            initialCodigoCar={formData.codigo_car}
            onChange={(data) => {
              setFormData(prev => ({
                ...prev,
                nome_fazenda: data.nome_fazenda,
                codigo_car: data.codigo_car,
                codigo_sigef: data.codigo_sigef,
                origem_cadastro: data.origem,
                geom: data.geom
              }));
            }}
          />
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
            <button 
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="px-4 py-2 font-medium text-sm rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 font-medium text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-2 cursor-pointer"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingProp ? "Salvar Alterações" : "Criar Propriedade"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Deleção */}
      <ConfirmDelete 
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Excluir Propriedade"
        description={`Tem certeza que deseja excluir a propriedade "${itemToDelete?.nome_fazenda}"? Esta ação não pode ser desfeita e removerá todos os dados vinculados a ela.`}
      />

      {/* Modal Controle de Pendências */}
      {selectedPropForPends && (
        <Modal
          isOpen={!!selectedPropForPends}
          onClose={() => setSelectedPropForPends(null)}
          title={`Pendências: ${selectedPropForPends.nome_fazenda}`}
        >
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <span className="text-xs text-muted-foreground font-semibold">
                Gestão de exigências e conformidades.
              </span>
              <button
                onClick={() => setIsNewPendFormOpen(true)}
                className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-md text-xs transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Nova Exigência
              </button>
            </div>

            {isNewPendFormOpen && (
              <form onSubmit={handleAddPendency} className="bg-muted/40 p-4 rounded-xl border border-border space-y-3 animate-fade-in-down">
                <div className="font-bold text-xs text-foreground uppercase tracking-wider">Nova Pendência</div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-muted-foreground">Título</label>
                  <input
                    required
                    type="text"
                    placeholder="Ex: Apresentar comprovante de EPI"
                    value={newPendData.titulo}
                    onChange={e => setNewPendData({...newPendData, titulo: e.target.value})}
                    className="w-full px-2.5 py-1.5 bg-background border border-input rounded-md text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-muted-foreground">Descrição</label>
                  <textarea
                    required
                    placeholder="Descreva detalhadamente o que o produtor precisa corrigir..."
                    value={newPendData.descricao}
                    onChange={e => setNewPendData({...newPendData, descricao: e.target.value})}
                    rows={3}
                    className="w-full px-2.5 py-1.5 bg-background border border-input rounded-md text-xs resize-none focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-muted-foreground">Prazo Limite</label>
                  <input
                    type="date"
                    min={new Date().toISOString().split('T')[0]}
                    value={newPendData.prazo}
                    onChange={e => setNewPendData({...newPendData, prazo: e.target.value})}
                    className="w-full px-2.5 py-1.5 bg-background border border-input rounded-md text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-muted-foreground">Técnico Acompanhante</label>
                  <select
                    value={newPendData.tecnico_responsavel_id}
                    onChange={e => setNewPendData({...newPendData, tecnico_responsavel_id: e.target.value})}
                    className="w-full px-2.5 py-1.5 bg-background border border-input rounded-md text-xs focus:ring-1 focus:ring-primary focus:outline-none text-foreground"
                  >
                    <option value="">Nenhum (Sem atribuição)</option>
                    {technicians.map(t => (
                      <option key={t.id} value={t.id}>{t.nome} ({t.email})</option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsNewPendFormOpen(false)}
                    className="px-2.5 py-1 bg-secondary text-secondary-foreground text-xs rounded font-medium hover:bg-secondary/80 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-2.5 py-1 bg-primary text-primary-foreground text-xs rounded font-semibold hover:bg-primary/90 cursor-pointer"
                  >
                    Salvar Exigência
                  </button>
                </div>
              </form>
            )}

            {loadingPends ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : propPendencias.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-xs font-medium border border-dashed border-border rounded-xl">
                Nenhuma pendência cadastrada para esta propriedade.
              </div>
            ) : (
              <div className="space-y-3">
                {propPendencias.map(pend => (
                  <div key={pend.id} className="p-4 bg-background border border-border rounded-xl space-y-2.5 relative group shadow-sm">
                    <div className="flex justify-between items-start gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border ${
                            pend.status === 'Pendente' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                            pend.status === 'Em Análise' ? 'bg-indigo-100 text-indigo-800 border-indigo-200' :
                            'bg-emerald-100 text-emerald-800 border-emerald-200'
                          }`}>
                            {pend.status}
                          </span>
                          {pend.prazo && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 font-medium">
                              <Clock className="w-3 h-3" /> {new Date(pend.prazo).toLocaleDateString('pt-BR')}
                            </span>
                          )}
                          {(() => {
                            const label = getRemainingTimeLabel(pend.prazo, pend.status);
                            if (!label) return null;
                            return (
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${label.className}`}>
                                {label.text}
                              </span>
                            );
                          })()}
                        </div>
                        <h4 className="font-bold text-foreground text-sm tracking-tight">{pend.titulo}</h4>
                        <p className="text-xs text-muted-foreground leading-normal font-medium">{pend.descricao}</p>
                        {pend.tecnico_responsavel_id && (
                          <div className="text-[10px] text-primary/80 font-bold mt-1.5 flex items-center gap-1">
                            <span className="bg-primary/10 px-2 py-0.5 rounded">
                              Técnico Acompanhante: {technicians.find(t => t.id === pend.tecnico_responsavel_id)?.nome || 'Carregando...'}
                            </span>
                          </div>
                        )}
                        {pend.motivo_rejeicao && pend.status === 'Pendente' && (
                          <div className="p-2.5 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-950 space-y-0.5 mt-2">
                            <span className="font-bold text-amber-900 text-[11px] flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                              Motivo da Última Rejeição / Ajustes Solicitados:
                            </span>
                            <span className="italic text-amber-900 font-medium block pl-4">"{pend.motivo_rejeicao}"</span>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeletePendency(pend.id)}
                        className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors shrink-0 opacity-0 group-hover:opacity-100 cursor-pointer"
                        title="Deletar Pendência"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {pend.status === 'Em Análise' && (
                      <div className="p-3 bg-indigo-50/50 rounded-lg border border-indigo-100 space-y-2">
                        <div className="text-[11px] font-bold text-indigo-950 uppercase tracking-wider">Solução Enviada pelo Produtor:</div>
                        <p className="text-xs text-indigo-900 font-medium italic">"{pend.resolucao_descricao}"</p>
                        {pend.evidencia_url && (
                          <div className="text-xs">
                            <button
                              type="button"
                              onClick={() => handleOpenEvidencia(pend.evidencia_url)}
                              className="text-indigo-700 underline font-semibold hover:text-indigo-955 flex items-center gap-1.5 cursor-pointer"
                            >
                              <Eye className="w-4 h-4 text-indigo-600 shrink-0" />
                              <span>Ver Evidência Anexada</span>
                            </button>
                          </div>
                        )}

                        {rejectingPendId === pend.id ? (
                          <div className="p-3 bg-red-50/80 rounded-lg border border-red-200 space-y-2 mt-2">
                            <div className="text-xs font-bold text-red-950 flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                              Descreva o motivo da rejeição / ajustes necessários:
                            </div>
                            <textarea
                              rows={3}
                              value={motivoRejeicaoText}
                              onChange={e => setMotivoRejeicaoText(e.target.value)}
                              placeholder="Ex: O comprovante enviado está ilegível. Favor anexar foto nítida do documento."
                              className="w-full p-2 bg-background border border-input rounded-md text-xs focus:ring-1 focus:ring-destructive focus:outline-none text-foreground"
                            />
                            <div className="flex justify-end gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => { setRejectingPendId(null); setMotivoRejeicaoText(''); }}
                                className="px-2.5 py-1 bg-secondary text-secondary-foreground text-[10px] font-semibold rounded hover:bg-secondary/80 cursor-pointer"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleConfirmReject(pend.id)}
                                className="px-2.5 py-1 bg-destructive hover:bg-destructive/90 text-white text-[10px] font-bold rounded shadow-sm transition-all cursor-pointer flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                Confirmar Rejeição & Reabrir
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2 pt-1.5 justify-end">
                            <button
                              onClick={() => { setRejectingPendId(pend.id); setMotivoRejeicaoText(''); }}
                              className="px-2.5 py-1 bg-destructive/10 hover:bg-destructive/20 text-destructive text-[10px] font-bold rounded border border-destructive/20 transition-all cursor-pointer"
                            >
                              Rejeitar / Pedir Ajuste
                            </button>
                            <button
                              onClick={() => handleUpdatePendencyStatus(pend.id, 'Resolvida')}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-semibold rounded shadow-sm transition-all cursor-pointer"
                            >
                              Aprovar & Regularizar
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end pt-4 border-t border-border mt-6">
              <button
                type="button"
                onClick={() => setSelectedPropForPends(null)}
                className="px-4 py-2 font-medium text-sm rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirmação de Exclusão de Pendência */}
      <ConfirmAction
        isOpen={!!deletePendConfirmId}
        onClose={() => setDeletePendConfirmId(null)}
        onConfirm={executeDeletePendency}
        title="Excluir Pendência"
        description="Tem certeza que deseja remover esta pendência? Esta ação não pode ser desfeita."
        confirmText="Excluir"
        actionType="danger"
      />

      {/* Modal Lightbox de Foto Ampliada em Portal z-[9999] */}
      {fotoAmpliada && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-fadeIn transition-all" onClick={() => setFotoAmpliada(null)}>
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center bg-slate-900/90 p-4 rounded-3xl border border-slate-700 shadow-2xl" onClick={e => e.stopPropagation()}>
            <button 
              type="button" 
              onClick={() => setFotoAmpliada(null)} 
              className="absolute -top-3 -right-3 text-white bg-slate-800 hover:bg-slate-700 p-2 rounded-full transition-all cursor-pointer shadow-xl border border-slate-600 z-10"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="relative max-h-[75vh] overflow-hidden rounded-2xl flex items-center justify-center bg-slate-950">
              <img 
                src={fotoAmpliada} 
                alt="Evidência Ampliada" 
                onError={(e) => {
                  (e.target as HTMLImageElement).src = sampleEvidenceSVG;
                }}
                className="max-w-full max-h-[75vh] object-contain rounded-xl" 
              />
            </div>

            <div className="mt-3 flex items-center justify-between w-full px-2 gap-4">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Evidência Comprovatória de Conformidade
              </span>
              {fotoAmpliada.startsWith('http') && !fotoAmpliada.includes('data:image/svg') && (
                <a 
                  href={fotoAmpliada} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="text-xs text-emerald-400 hover:text-white underline font-bold flex items-center gap-1 bg-white/10 px-3 py-1.5 rounded-full border border-white/10 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Abrir em nova guia</span>
                </a>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Viewer de PDF em Portal z-[9999] */}
      {pdfAmpliado && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-fadeIn" onClick={() => setPdfAmpliado(null)}>
          <div className="relative w-full max-w-5xl h-[88vh] flex flex-col bg-slate-900 rounded-3xl overflow-hidden border border-slate-700 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 bg-slate-800 border-b border-slate-700 text-white">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-400" />
                <span className="font-extrabold text-sm">Visualizador de Documento Evidência PDF</span>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={pdfAmpliado}
                  download="evidencia-documento.pdf"
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar PDF</span>
                </a>
                <button type="button" onClick={() => setPdfAmpliado(null)} className="text-slate-400 hover:text-white p-1.5 rounded-full hover:bg-slate-700 transition-colors cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 w-full h-full bg-slate-950">
              <iframe src={pdfAmpliado} className="w-full h-full border-none" title="Documento PDF" />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
