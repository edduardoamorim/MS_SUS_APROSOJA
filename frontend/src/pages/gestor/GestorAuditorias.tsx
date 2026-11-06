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
  Building2,
  LayoutGrid,
  Table,
  Eye,
  Award
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { resolveFarmEtapa, persistFarmEtapa } from '../../lib/etapaUtils';
import { TableRowSkeleton } from '../../components/ui/Skeleton';
import RevisaoAuditoria from '../../components/auditoria/RevisaoAuditoria';
import AuditDetailModal from '../../components/auditoria/AuditDetailModal';
import Modal from '../../components/ui/Modal';
import ConfirmDelete from '../../components/ui/ConfirmDelete';
import ModalErrorBoundary from '../../components/ui/ModalErrorBoundary';
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
  const [viewMode, setViewMode] = useState<'auto' | 'cards' | 'table'>('auto');

  const [revisaoAuditoria, setRevisaoAuditoria] = useState<{
    id: string;
    nome: string;
    etapa?: 'Prospecção' | 'Auditoria Prévia' | 'Auditoria Oficial' | string;
    status?: string;
    propId?: string;
  } | null>(null);
  const [selectedAuditForModal, setSelectedAuditForModal] = useState<any | null>(null);

  const isPendingApproval = (status?: string) =>
    status === 'Aguardando Aprovação' || status === 'Em Análise';

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
    const handleRecheck = () => {
      if (document.visibilityState === 'visible') {
        fetchInitialData();
      }
    };
    window.addEventListener('focus', handleRecheck);
    document.addEventListener('visibilitychange', handleRecheck);
    window.addEventListener('ms:sync-complete', handleRecheck);
    window.addEventListener('ms:audit-updated', handleRecheck);
    return () => {
      window.removeEventListener('focus', handleRecheck);
      document.removeEventListener('visibilitychange', handleRecheck);
      window.removeEventListener('ms:sync-complete', handleRecheck);
      window.removeEventListener('ms:audit-updated', handleRecheck);
    };
  }, []);

  async function fetchInitialData() {
    setLoading(true);
    try {
      // 2. Buscar propriedades
      const { data: propsData } = await supabase
        .from('propriedades')
        .select('id, nome_fazenda, nome_produtor, tecnico_id, municipio, etapa, created_at');
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
        const propFound = propRel || (propsData || []).find((p: any) => p.id === a.propriedade_id);
        const propId = a.propriedade_id || propFound?.id;
        const e = resolveFarmEtapa(propId, propFound?.etapa, a.etapa);

        return {
          ...a,
          etapa: e,
          propriedades: propFound || { nome_fazenda: 'Fazenda Registrada', nome_produtor: 'Produtor' }
        };
      });

      // Garantir que TODAS as propriedades cadastradas no sistema estejam presentes em GestorAuditorias (fase inicial Prospecção)
      const existingPropIds = new Set(processedAudits.map((a: any) => a.propriedade_id).filter(Boolean));
      (propsData || []).forEach((p: any) => {
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

      let targetAuditId = editingAudit?.id;
      if (!targetAuditId && formData.propriedade_id) {
        const { data: existing } = await supabase
          .from('auditorias')
          .select('id')
          .eq('propriedade_id', formData.propriedade_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existing?.id) {
          targetAuditId = existing.id;
        }
      }

      if (targetAuditId) {
        const { error } = await supabase
          .from('auditorias')
          .update(payload)
          .eq('id', targetAuditId);
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

  const clearOldRejectionPendencias = async (propId?: string) => {
    if (!propId) return;
    try {
      await supabase
        .from('pendencias')
        .delete()
        .eq('propriedade_id', propId)
        .or('titulo.ilike.%[REPROVAÇÃO GESTOR]%,titulo.ilike.%[AJUSTE GESTOR]%');
    } catch (e) {
      console.warn('Aviso ao limpar pendências antigas de reprovação:', e);
    }
  };

  const handleApproveNextStage = async (
    nextEtapa: 'Auditoria Prévia' | 'Auditoria Oficial',
    nextStatus: string
  ) => {
    if (!revisaoAuditoria) return;
    try {
      const target = auditorias.find(a => a.id === revisaoAuditoria.id);
      const propId = revisaoAuditoria.propId || target?.propriedade_id;

      if (propId) {
        await persistFarmEtapa(propId, revisaoAuditoria.id, nextEtapa);
        await clearOldRejectionPendencias(propId);
      }

      if (!revisaoAuditoria.id.startsWith('v-audit-')) {
        const { error: err } = await supabase
          .from('auditorias')
          .update({ etapa: nextEtapa, status: nextStatus })
          .eq('id', revisaoAuditoria.id);
        if (err) throw err;
      }

      setAuditorias(prev =>
        prev.map(a =>
          a.id === revisaoAuditoria.id ? { ...a, etapa: nextEtapa, status: nextStatus } : a
        )
      );
      setActiveEtapaTab(nextEtapa);
      success(`Fazenda aprovada e avançada para ${nextEtapa}!`);
    } catch (err: any) {
      console.error(err);
      error('Erro ao aprovar avanço de etapa: ' + err.message);
    }
    setRevisaoAuditoria(null);
  };

  const handleApproveCertify = async () => {
    if (!revisaoAuditoria) return;
    try {
      const target = auditorias.find(a => a.id === revisaoAuditoria.id);
      const propId = revisaoAuditoria.propId || target?.propriedade_id;
      if (propId) {
        await persistFarmEtapa(propId, revisaoAuditoria.id, 'Auditoria Oficial');
        await clearOldRejectionPendencias(propId);
      }

      if (!revisaoAuditoria.id.startsWith('v-audit-')) {
        const { error: err } = await supabase
          .from('auditorias')
          .update({ etapa: 'Auditoria Oficial', status: 'Certificada' })
          .eq('id', revisaoAuditoria.id);
        if (err) throw err;
      }

      setAuditorias(prev =>
        prev.map(a =>
          a.id === revisaoAuditoria.id
            ? { ...a, status: 'Certificada', etapa: 'Auditoria Oficial' }
            : a
        )
      );
      setActiveEtapaTab('Auditoria Oficial');
      success('Auditoria homologada e fazenda Certificada RTRS!');
    } catch (err: any) {
      console.error(err);
      error('Erro ao aprovar auditoria: ' + err.message);
    }
    setRevisaoAuditoria(null);
  };

  const handleReject = async (motivoReprovacao: string) => {
    if (!revisaoAuditoria) return;
    try {
      const target = auditorias.find(a => a.id === revisaoAuditoria.id);
      const propId = revisaoAuditoria.propId || target?.propriedade_id;
      const etapaRef = revisaoAuditoria.etapa || target?.etapa || 'atual';

      if (!revisaoAuditoria.id.startsWith('v-audit-')) {
        const { error: err } = await supabase
          .from('auditorias')
          .update({ status: 'Visita de Campo' })
          .eq('id', revisaoAuditoria.id);
        if (err) throw err;
      }

      if (propId) {
        try {
          await supabase.from('pendencias').insert([{
            propriedade_id: propId,
            titulo: `[AJUSTE GESTOR] Revisão solicitada na etapa ${etapaRef}: ${motivoReprovacao}`,
            severidade: 'Alta',
            status: 'Pendente'
          }]);
        } catch (pendErr) {
          console.warn('Aviso ao inserir pendência de ajuste do gestor:', pendErr);
        }
      }

      setAuditorias(prev =>
        prev.map(a =>
          a.id === revisaoAuditoria.id ? { ...a, status: 'Visita de Campo' } : a
        )
      );
      success('Vistoria devolvida ao Técnico com solicitação de ajustes.');
    } catch (err: any) {
      console.error(err);
      error('Erro ao devolver vistoria: ' + err.message);
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

  const pendingAudits = auditorias.filter(a => isPendingApproval(a.status));
  const pendingProspeccao = pendingAudits.filter(a => a.etapa === 'Prospecção').length;
  const pendingPrevia = pendingAudits.filter(a => a.etapa === 'Auditoria Prévia').length;
  const pendingOficial = pendingAudits.filter(a => a.etapa === 'Auditoria Oficial').length;

  const handleOpenDeliberacao = (auditoria: any) => {
    if (auditoria.etapa === 'Prospecção' || auditoria.etapa === 'Auditoria Prévia' || auditoria.etapa === 'Auditoria Oficial') {
      setActiveEtapaTab(auditoria.etapa);
    }
    setRevisaoAuditoria({
      id: auditoria.id,
      nome: getFazendaName(auditoria),
      etapa: auditoria.etapa || 'Prospecção',
      status: auditoria.status || 'Aguardando Aprovação',
      propId: auditoria.propriedade_id || auditoria.propriedades?.id
    });
  };

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

      {/* BANNER DE DELIBERAÇÕES PENDENTES DO GESTOR */}
      {pendingAudits.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 via-amber-50/70 to-white border-2 border-amber-300/90 rounded-3xl p-5 shadow-md space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-500/15 text-amber-700 rounded-2xl border border-amber-300 shrink-0 relative">
                <AlertTriangle className="w-6 h-6" />
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-500 animate-ping" />
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-500" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-black text-amber-950 uppercase tracking-wide">
                    Deliberações Pendentes do Gestor
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-500 text-white shadow-2xs">
                    {pendingAudits.length} {pendingAudits.length === 1 ? 'vistoria aguardando' : 'vistorias aguardando'}
                  </span>
                </div>
                <p className="text-xs text-amber-900/80 font-medium mt-0.5">
                  Os técnicos concluíram e submeteram as vistorias abaixo. Analise as evidências para aprovar o avanço de etapa, homologar a certificação ou solicitar ajustes.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pendingAudits.map((pendAudit) => {
              const farmName = getFazendaName(pendAudit);
              const techName = getTecnicoName(
                pendAudit.tecnico_responsavel_id || pendAudit.propriedades?.tecnico_id,
                pendAudit.propriedades
              );
              const etapaLabel =
                pendAudit.etapa === 'Prospecção'
                  ? '1. Prospecção'
                  : pendAudit.etapa === 'Auditoria Prévia'
                  ? '2. Auditoria Prévia'
                  : '3. Auditoria Oficial';

              return (
                <div
                  key={pendAudit.id}
                  className="bg-white/95 border border-amber-200 rounded-2xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs hover:shadow-md transition-all"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-slate-900 text-xs sm:text-sm truncate">
                        {farmName}
                      </span>
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase bg-amber-100 text-amber-900 border border-amber-300">
                        {etapaLabel}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 font-medium truncate">
                      Técnico responsável: <strong className="text-slate-800">{techName}</strong>
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenDeliberacao(pendAudit)}
                    className="w-full sm:w-auto shrink-0 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#C59B27] to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white rounded-xl font-extrabold text-xs shadow-sm transition-all hover:scale-102 active:scale-95 cursor-pointer"
                  >
                    <FileSearch className="w-3.5 h-3.5" />
                    <span>Analisar & Deliberar Vistoria</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
          <div className="flex items-center gap-2">
            {pendingProspeccao > 0 && (
              <span
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-extrabold bg-amber-500 text-white shadow-xs animate-pulse"
                title={`${pendingProspeccao} aguardando aprovação`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                <span>{pendingProspeccao} pendente{pendingProspeccao > 1 ? 's' : ''}</span>
              </span>
            )}
            <span className="text-base font-extrabold text-[#C59B27] bg-[#C59B27]/10 px-3 py-1.5 rounded-2xl border border-[#C59B27]/20 shadow-2xs">
              {countProspeccao}
            </span>
          </div>
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
          <div className="flex items-center gap-2">
            {pendingPrevia > 0 && (
              <span
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-extrabold bg-amber-500 text-white shadow-xs animate-pulse"
                title={`${pendingPrevia} aguardando aprovação`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                <span>{pendingPrevia} pendente{pendingPrevia > 1 ? 's' : ''}</span>
              </span>
            )}
            <span className="text-base font-extrabold text-blue-700 bg-blue-100/80 px-3 py-1.5 rounded-2xl border border-blue-200 shadow-2xs">
              {countPrevia}
            </span>
          </div>
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
          <div className="flex items-center gap-2">
            {pendingOficial > 0 && (
              <span
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-extrabold bg-amber-500 text-white shadow-xs animate-pulse"
                title={`${pendingOficial} aguardando aprovação`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                <span>{pendingOficial} pendente{pendingOficial > 1 ? 's' : ''}</span>
              </span>
            )}
            <span className="text-base font-extrabold text-[#1B7547] bg-[#1B7547]/10 px-3 py-1.5 rounded-2xl border border-[#1B7547]/20 shadow-2xs">
              {countOficial}
            </span>
          </div>
        </button>
      </div>

      {/* Barra de Filtro Textual e Seletor de Modo */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
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

        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
          <span className="text-xs font-bold text-slate-500 hidden md:inline">
            Etapa: <strong className="text-slate-800">{activeEtapaTab}</strong>
          </span>

          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 ml-auto sm:ml-0">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'cards' || (viewMode === 'auto' && typeof window !== 'undefined' && window.innerWidth < 768)
                  ? 'bg-white text-[#1B7547] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Exibir em Cards"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Cards</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'table' || (viewMode === 'auto' && typeof window !== 'undefined' && window.innerWidth >= 768)
                  ? 'bg-white text-[#1B7547] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Exibir em Tabela"
            >
              <Table className="w-3.5 h-3.5" />
              <span>Tabela</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabela de Auditorias */}
      {loading ? (
        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden p-6">
          <TableRowSkeleton />
          <TableRowSkeleton />
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {filteredAudits.length === 0 ? (
            <div className="px-6 py-12 text-center text-slate-400 font-medium">
              Nenhuma auditoria ou fazenda cadastrada nesta etapa ({activeEtapaTab}).
            </div>
          ) : (
            <>
              {/* Modo Cards (Mobile por padrão, ou quando selecionado) */}
              <div className={viewMode === 'cards' ? 'block' : viewMode === 'table' ? 'hidden' : 'block md:hidden'}>
                <div className="divide-y divide-slate-100">
                  {filteredAudits.map((auditoria: any) => {
                    const farmName = getFazendaName(auditoria);
                    const techName = getTecnicoName(auditoria.tecnico_responsavel_id || auditoria.propriedades?.tecnico_id, auditoria.propriedades);
                    const displayId = auditoria.id?.startsWith('v-audit-') ? 'Cadastro Inicial' : `#${auditoria.id?.substring(0, 8)}`;
                    const dataFormatada = auditoria.data_agendamento ? new Date(auditoria.data_agendamento).toLocaleDateString('pt-BR') : 'A definir';

                    return (
                      <div key={auditoria.id} className="p-4 bg-white space-y-3">
                        {/* Topo: ID, Fazenda e Status */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-0.5 flex-1 min-w-0">
                            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">{displayId}</span>
                            <h3 className="font-extrabold text-slate-900 text-sm leading-snug truncate">
                              {farmName}
                            </h3>
                            <p className="text-xs text-slate-600 font-medium truncate flex items-center gap-1">
                              <span className="text-slate-400">Técnico:</span> {techName}
                            </p>
                          </div>

                          <span className={`shrink-0 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            auditoria.status === 'Certificada' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                            isPendingApproval(auditoria.status) ? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs animate-pulse' :
                            auditoria.status === 'Visita de Campo' ? 'bg-blue-100 text-blue-800 border border-blue-300' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {isPendingApproval(auditoria.status) ? 'Aguardando Aprovação' : auditoria.status}
                          </span>
                        </div>

                        {/* Detalhes: Data e Seletor de Etapa */}
                        <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                          <div>
                            <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">Data Alvo/Visita</span>
                            <span className="text-slate-700 font-semibold flex items-center gap-1 mt-0.5">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              {dataFormatada}
                            </span>
                          </div>

                          <div>
                            <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">Etapa Atual</span>
                            <select
                              value={auditoria.etapa}
                              onChange={(e) => handleUpdateEtapa(auditoria.id, e.target.value as any)}
                              className="mt-0.5 w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none cursor-pointer"
                            >
                              <option value="Prospecção">1. Prospecção</option>
                              <option value="Auditoria Prévia">2. Auditoria Prévia</option>
                              <option value="Auditoria Oficial">3. Auditoria Oficial</option>
                            </select>
                          </div>
                        </div>

                        {/* Botões de Ação */}
                        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
                          {auditoria.etapa === 'Prospecção' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateEtapa(auditoria.id, 'Auditoria Prévia')}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-xl font-extrabold text-xs border border-blue-200 transition-all active:scale-95 cursor-pointer shadow-2xs"
                              title="Promover para Auditoria Prévia"
                            >
                              <span>Avançar para Prévia</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {auditoria.etapa === 'Auditoria Prévia' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateEtapa(auditoria.id, 'Auditoria Oficial')}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl font-extrabold text-xs border border-emerald-200 transition-all active:scale-95 cursor-pointer shadow-2xs"
                              title="Promover para Auditoria Oficial"
                            >
                              <span>Promover p/ Oficial</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                              type="button"
                              onClick={() => setSelectedAuditForModal(auditoria)}
                              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 text-[#1B7547] rounded-xl font-extrabold text-xs border border-slate-200 transition-all active:scale-95 cursor-pointer shadow-2xs"
                              title="Visualizar Ficha e Panorama RTRS"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Panorama</span>
                            </button>

                          {isPendingApproval(auditoria.status) && (
                            <button 
                              type="button"
                              onClick={() => handleOpenDeliberacao(auditoria)}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-[#1B7547] to-[#15613a] hover:from-[#15613a] hover:to-[#0B3B23] text-white rounded-xl font-extrabold text-xs shadow-md transition-all active:scale-95 cursor-pointer"
                            >
                              <FileSearch className="w-3.5 h-3.5" />
                              <span>Deliberar Vistoria</span>
                            </button>
                          )}

                          <div className="flex items-center gap-1 ml-auto">
                            <button 
                              type="button"
                              onClick={() => handleOpenEdit(auditoria)}
                              className="p-2 text-slate-500 hover:text-[#1B7547] hover:bg-slate-100 rounded-xl border border-slate-200 transition-all active:scale-90 cursor-pointer"
                              title="Editar"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button 
                              type="button"
                              onClick={() => handleOpenDelete(auditoria)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl border border-slate-200 transition-all active:scale-90 cursor-pointer"
                              title="Excluir"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Modo Tabela (Desktop por padrão, ou quando selecionado) */}
              <div className={viewMode === 'table' ? 'block overflow-x-auto' : viewMode === 'cards' ? 'hidden' : 'hidden md:block overflow-x-auto'}>
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
                          isPendingApproval(auditoria.status) ? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs animate-pulse' :
                          auditoria.status === 'Visita de Campo' ? 'bg-blue-100 text-blue-800 border border-blue-300' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {isPendingApproval(auditoria.status) ? 'Aguardando Aprovação' : auditoria.status}
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

                          <button
                              type="button"
                              onClick={() => setSelectedAuditForModal(auditoria)}
                              className="group/btn inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-[#1B7547] rounded-xl font-extrabold text-[11px] border border-slate-200 transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer shadow-2xs"
                              title="Visualizar Ficha e Panorama RTRS"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Panorama</span>
                            </button>

                          {isPendingApproval(auditoria.status) && (
                            <button 
                              type="button"
                              onClick={() => handleOpenDeliberacao(auditoria)}
                              className="group/btn relative inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-[#1B7547] to-[#15613a] hover:from-[#15613a] hover:to-[#0B3B23] text-white rounded-xl font-extrabold text-xs shadow-md shadow-[#1B7547]/20 transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer overflow-hidden"
                            >
                              <span className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover/btn:translate-x-full transition-transform duration-1000 ease-out pointer-events-none" />
                              <FileSearch className="w-3.5 h-3.5 transition-transform group-hover/btn:scale-110 duration-300" />
                              <span>Deliberar Vistoria</span>
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
            </>
          )}
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
        <ModalErrorBoundary onClose={() => setRevisaoAuditoria(null)}>
          <RevisaoAuditoria 
            propriedadeNome={revisaoAuditoria.nome}
            etapaAtual={revisaoAuditoria.etapa}
            statusAtual={revisaoAuditoria.status}
            onClose={() => setRevisaoAuditoria(null)}
            onApproveNextStage={handleApproveNextStage}
            onApproveCertify={handleApproveCertify}
            onApprove={handleApproveCertify}
            onReject={handleReject}
            auditoriaId={revisaoAuditoria.id}
            propriedadeId={revisaoAuditoria.propId}
          />
        </ModalErrorBoundary>
      )}

      {selectedAuditForModal && (
        <AuditDetailModal
          isOpen={!!selectedAuditForModal}
          onClose={() => setSelectedAuditForModal(null)}
          auditoria={selectedAuditForModal}
          onStartVisita={() => {
            setSelectedAuditForModal(null);
          }}
          onOpenPendencias={() => {
            setSelectedAuditForModal(null);
            window.location.href = '/app/gestor/propriedades';
          }}
        />
      )}
    </div>
  );
}
