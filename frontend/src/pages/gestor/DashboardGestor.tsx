import { useState, useEffect } from 'react';
import { 
  Building2, FileCheck2, AlertTriangle, 
  Map as MapIcon, Search, CheckCircle2, FileSearch, ShieldAlert,
  Clock, MapPin, Sparkles, ArrowRight, ShieldCheck, LayoutGrid, Table, Eye, Award
} from 'lucide-react';
import RevisaoAuditoria from '../../components/auditoria/RevisaoAuditoria';
import AuditDetailModal from '../../components/auditoria/AuditDetailModal';
import { supabase } from '../../lib/supabase';
import AIInsightsPanel from '../../components/ui/AIInsightsPanel';
import { aiService } from '../../services/aiService';
import siteContent from '../../config/site_content.json';
import { useToast } from '../../context/ToastContext';
import { CardSkeleton } from '../../components/ui/Skeleton';
import ModalErrorBoundary from '../../components/ui/ModalErrorBoundary';
import { persistFarmEtapa, resolveFarmEtapa } from '../../lib/etapaUtils';

export default function DashboardGestor() {
  const { success, error } = useToast();
  const content = siteContent.dashboard_gestor;
  
  const [revisaoAuditoria, setRevisaoAuditoria] = useState<{
    id: string;
    nome: string;
    propId?: string;
    etapa?: 'Prospecção' | 'Auditoria Prévia' | 'Auditoria Oficial' | string;
    status?: string;
  } | null>(null);
  const [selectedAuditForModal, setSelectedAuditForModal] = useState<any | null>(null);
  const [totalPropriedades, setTotalPropriedades] = useState<number>(0);
  const [totalCertificadas, setTotalCertificadas] = useState<number>(0);
  const [totalEmAvaliacao, setTotalEmAvaliacao] = useState<number>(0);
  const [totalPendencias, setTotalPendencias] = useState<number>(0);
  const [loadingDados, setLoadingDados] = useState(true);
  
  // AI States
  const [aiInsights, setAiInsights] = useState("");
  const [aiLoading, setAiLoading] = useState(true);
  
  // Lista de Auditorias vinda do Banco
  const [auditorias, setAuditorias] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'auto' | 'cards' | 'table'>('auto');

  useEffect(() => {
    fetchDashboardData();
    const handleRecheck = () => {
      if (document.visibilityState === 'visible') {
        fetchDashboardData();
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

  async function fetchDashboardData() {
    setLoadingDados(true);
    try {
      // 1. Busca Total Propriedades
      const { count: propsCount } = await supabase
        .from('propriedades')
        .select('*', { count: 'exact', head: true });

      const totalProps = propsCount ?? 0;
      setTotalPropriedades(totalProps);

      // 2. Busca Auditorias completas do Supabase
      const { data: audits, error: auditsError } = await supabase
        .from('auditorias')
        .select(`
          id,
          data_agendamento,
          status,
          etapa,
          propriedade_id,
          tecnico_responsavel_id,
          created_at,
          updated_at,
          propriedades (
            id,
            nome_fazenda,
            nome_produtor,
            municipio,
            etapa
          )
        `)
        .order('created_at', { ascending: false });

      // 3. Busca respostas para cálculo de Score RTRS real por auditoria
      const { data: respData } = await supabase
        .from('respostas_auditoria')
        .select('auditoria_id, conforme, nao_se_aplica');

      // 4. Busca total de pendências ativas no estado
      const { count: pendsCount } = await supabase
        .from('pendencias')
        .select('*', { count: 'exact', head: true })
        .in('status', ['Pendente', 'Em Análise']);

      setTotalPendencias(pendsCount ?? 0);

      // Mapear respostas por auditoria_id
      const scoreMap = new Map<string, { total: number; conformes: number; score: number }>();
      if (respData) {
        respData.forEach((r: any) => {
          if (!r.auditoria_id) return;
          const current = scoreMap.get(r.auditoria_id) || { total: 0, conformes: 0, score: 0 };
          if (!r.nao_se_aplica) {
            current.total += 1;
            if (r.conforme) {
              current.conformes += 1;
            }
          }
          current.score = current.total > 0 ? Math.round((current.conformes / current.total) * 100) : 0;
          scoreMap.set(r.auditoria_id, current);
        });
      }

      let mappedAudits: any[] = [];
      if (!auditsError && audits) {
        mappedAudits = audits.map((a: any) => {
          const propRel = Array.isArray(a.propriedades) ? a.propriedades[0] : a.propriedades;
          const scoreInfo = scoreMap.get(a.id);
          
          let calculatedScore = scoreInfo?.score ?? 0;
          if (calculatedScore === 0 && a.status === 'Certificada') {
            calculatedScore = 100;
          }

          const propId = a.propriedade_id || propRel?.id;
          const resolvedEtapa = propId
            ? resolveFarmEtapa(propId, propRel?.etapa, a.etapa)
            : (a.etapa || propRel?.etapa || 'Prospecção');

          return {
            id: a.id,
            propriedade_id: propId,
            fazenda: propRel?.nome_fazenda || 'Sem nome',
            produtor: propRel?.nome_produtor || 'N/A',
            municipio: propRel?.municipio || 'Mato Grosso do Sul',
            status: a.status || 'Visita de Campo',
            etapa: resolvedEtapa,
            data: a.data_agendamento || a.created_at || new Date().toISOString(),
            score: calculatedScore,
            totalRespondidos: scoreInfo?.total ?? 0,
            conformesCount: scoreInfo?.conformes ?? 0,
            rawAudit: a
          };
        });
        setAuditorias(mappedAudits);
      }

      // Métricas de BI Reais
      const certCount = mappedAudits.filter(a => a.status === 'Certificada').length;
      const avaliacaoCount = mappedAudits.filter(a => 
        a.status === 'Aguardando Aprovação' || a.status === 'Em Análise' || a.status === 'Autoavaliação'
      ).length;

      setTotalCertificadas(certCount);
      setTotalEmAvaliacao(avaliacaoCount);

      // Prepara contexto para o briefing de IA
      const stats = {
        totalPropriedades: totalProps,
        auditoriasPendentes: avaliacaoCount,
        auditoriasCertificadas: certCount,
        alertasIbama: pendsCount ?? 0
      };

      setLoadingDados(false);

      // Conecta com a IA em background
      const insights = await aiService.generateGestorBriefing(stats);
      setAiInsights(insights);
      setAiLoading(false);
    } catch (err: any) {
      console.error('Erro ao buscar dados do dashboard gestor:', err);
      setLoadingDados(false);
      setAiLoading(false);
    }
  }

  const handleApproveNextStage = async (
    nextEtapa: 'Auditoria Prévia' | 'Auditoria Oficial',
    nextStatus: string
  ) => {
    if (revisaoAuditoria) {
      try {
        if (revisaoAuditoria.propId) {
          await persistFarmEtapa(revisaoAuditoria.propId, revisaoAuditoria.id, nextEtapa);
          try {
            await supabase
              .from('pendencias')
              .delete()
              .eq('propriedade_id', revisaoAuditoria.propId)
              .or('titulo.ilike.%[REPROVAÇÃO GESTOR]%,titulo.ilike.%[AJUSTE GESTOR]%');
          } catch (e) {}
        }

        const { error: err } = await supabase
          .from('auditorias')
          .update({ etapa: nextEtapa, status: nextStatus })
          .eq('id', revisaoAuditoria.id);
        if (err) throw err;

        setAuditorias(prev =>
          prev.map(a =>
            a.id === revisaoAuditoria.id ? { ...a, etapa: nextEtapa, status: nextStatus } : a
          )
        );
        setTotalEmAvaliacao(prev => Math.max(0, prev - 1));
        success(`Fazenda aprovada e avançada para ${nextEtapa}!`);
      } catch (err: any) {
        console.error('Erro ao avançar etapa da auditoria:', err);
        error('Erro ao avançar etapa: ' + err.message);
      }
    }
    setRevisaoAuditoria(null);
  };

  const handleApproveCertify = async () => {
    if (revisaoAuditoria) {
      try {
        if (revisaoAuditoria.propId) {
          await persistFarmEtapa(revisaoAuditoria.propId, revisaoAuditoria.id, 'Auditoria Oficial');
          try {
            await supabase
              .from('pendencias')
              .delete()
              .eq('propriedade_id', revisaoAuditoria.propId)
              .or('titulo.ilike.%[REPROVAÇÃO GESTOR]%,titulo.ilike.%[AJUSTE GESTOR]%');
          } catch (e) {}
        }

        const { error: err } = await supabase
          .from('auditorias')
          .update({ status: 'Certificada', etapa: 'Auditoria Oficial' })
          .eq('id', revisaoAuditoria.id);
        if (err) throw err;

        setAuditorias(auditorias.map(a => 
          a.id === revisaoAuditoria.id ? { ...a, status: 'Certificada', etapa: 'Auditoria Oficial', score: 100 } : a
        ));
        setTotalCertificadas(prev => prev + 1);
        setTotalEmAvaliacao(prev => Math.max(0, prev - 1));

        success('Auditoria homologada e fazenda Certificada RTRS!');
      } catch (err: any) {
        console.error('Erro ao aprovar auditoria:', err);
        error('Erro ao homologar certificação: ' + err.message);
      }
    }
    setRevisaoAuditoria(null);
  };

  const handleReject = async (motivoReprovacao: string) => {
    if (revisaoAuditoria) {
      try {
        const { error: err } = await supabase
          .from('auditorias')
          .update({ status: 'Visita de Campo' })
          .eq('id', revisaoAuditoria.id);
        if (err) throw err;

        if (revisaoAuditoria.propId) {
          try {
            await supabase.from('pendencias').insert([{
              propriedade_id: revisaoAuditoria.propId,
              titulo: `[AJUSTE GESTOR] Revisão solicitada na etapa ${revisaoAuditoria.etapa || 'atual'}: ${motivoReprovacao}`,
              severidade: 'Alta',
              status: 'Pendente'
            }]);
            setTotalPendencias(prev => prev + 1);
          } catch (pendErr) {
            console.warn('Aviso ao registrar pendência de ajuste:', pendErr);
          }
        }

        setAuditorias(auditorias.map(a => 
          a.id === revisaoAuditoria.id ? { ...a, status: 'Visita de Campo' } : a
        ));
        setTotalEmAvaliacao(prev => Math.max(0, prev - 1));
        success('Vistoria devolvida ao Técnico com solicitação de ajustes.');
      } catch (err: any) {
        console.error('Erro ao solicitar ajustes na auditoria:', err);
        error('Erro ao solicitar ajustes: ' + err.message);
      }
    }
    setRevisaoAuditoria(null);
  };

  const filteredAudits = auditorias.filter(a => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (a.fazenda || '').toLowerCase().includes(q) || 
      (a.produtor || '').toLowerCase().includes(q) || 
      (a.status || '').toLowerCase().includes(q) ||
      (a.municipio || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-8 animate-fade-in-up">
      
      {/* Cabeçalho da Aba com Motion */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-slate-200/80 pb-6 gap-4">
        <div>
          <div className="inline-flex items-center gap-2 bg-[#1B7547]/10 text-[#1B7547] px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Visão Geral Executiva</span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">{content.titulo}</h1>
          <p className="text-slate-500 mt-1 text-sm">{content.subtitulo}</p>
        </div>

        <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600">
          <span className="h-2 w-2 rounded-full bg-[#7CB324] animate-ping" />
          <span>Monitoramento em Tempo Real MS</span>
        </div>
      </div>

      {/* AI Insights Panel (Topo) */}
      <AIInsightsPanel 
        title={content.painel_ia_titulo} 
        insights={aiInsights} 
        isLoading={aiLoading} 
      />

      {/* KPIs Gerais (Métricas Reais de BI) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {loadingDados ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : (
          <>
            {/* Card 1: Total Propriedades */}
            <div className="group relative bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-xl hover:border-[#1B7547]/40 hover:-translate-y-1.5 transition-all duration-300 overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#1B7547]/5 rounded-bl-full pointer-events-none transition-transform group-hover:scale-125" />
              <div className="flex items-start justify-between relative z-10">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-2">{content.card_propriedades}</p>
                  <h3 className="text-4xl font-extrabold text-slate-900 tracking-tight">
                    {totalPropriedades}
                  </h3>
                  <span className="inline-block mt-3 text-[11px] font-bold text-[#1B7547] bg-[#1B7547]/10 px-2.5 py-0.5 rounded-full">
                    Base Cadastral MS
                  </span>
                </div>
                <div className="p-3.5 bg-[#1B7547]/10 text-[#1B7547] rounded-2xl group-hover:bg-[#1B7547] group-hover:text-white transition-colors duration-300">
                  <Building2 className="w-6 h-6 transition-transform group-hover:scale-110" />
                </div>
              </div>
            </div>

            {/* Card 2: Certificadas */}
            <div className="group relative bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-xl hover:border-[#7CB324]/40 hover:-translate-y-1.5 transition-all duration-300 overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#7CB324]/10 rounded-bl-full pointer-events-none transition-transform group-hover:scale-125" />
              <div className="flex items-start justify-between relative z-10">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-2">{content.card_certificadas}</p>
                  <h3 className="text-4xl font-extrabold text-slate-900 tracking-tight">{totalCertificadas}</h3>
                  <p className="text-xs text-[#5c8a18] font-bold mt-2 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>
                      {totalPropriedades > 0 ? Math.round((totalCertificadas / totalPropriedades) * 100) : 0}% {content.card_certificadas_sub}
                    </span>
                  </p>
                </div>
                <div className="p-3.5 bg-[#7CB324]/15 text-[#5c8a18] rounded-2xl group-hover:bg-[#7CB324] group-hover:text-white transition-colors duration-300">
                  <FileCheck2 className="w-6 h-6 transition-transform group-hover:scale-110" />
                </div>
              </div>
            </div>

            {/* Card 3: Em Avaliação / Aguardando Aprovação */}
            <div className="group relative bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-xl hover:border-[#C59B27]/40 hover:-translate-y-1.5 transition-all duration-300 overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#C59B27]/10 rounded-bl-full pointer-events-none transition-transform group-hover:scale-125" />
              <div className="flex items-start justify-between relative z-10">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-2">{content.card_avaliacao}</p>
                  <h3 className="text-4xl font-extrabold text-slate-900 tracking-tight">{totalEmAvaliacao}</h3>
                  <p className="text-xs text-[#C59B27] font-bold mt-2 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 animate-pulse" />
                    <span>Requerem deliberação executiva</span>
                  </p>
                </div>
                <div className="p-3.5 bg-[#C59B27]/15 text-[#C59B27] rounded-2xl group-hover:bg-[#C59B27] group-hover:text-white transition-colors duration-300">
                  <AlertTriangle className="w-6 h-6 transition-transform group-hover:scale-110" />
                </div>
              </div>
            </div>

            {/* Card 4: Pendências / Não Conformidades */}
            <div className="group relative bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-xl hover:border-red-300 hover:-translate-y-1.5 transition-all duration-300 overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-red-50 rounded-bl-full pointer-events-none transition-transform group-hover:scale-125" />
              <div className="flex items-start justify-between relative z-10">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-2">Exigências Ativas</p>
                  <h3 className="text-4xl font-extrabold text-slate-900 tracking-tight">{totalPendencias}</h3>
                  <p className="text-xs text-red-600 font-bold mt-2">Adequações socioambientais</p>
                </div>
                <div className="p-3.5 bg-red-100 text-red-600 rounded-2xl group-hover:bg-red-600 group-hover:text-white transition-colors duration-300">
                  <MapIcon className="w-6 h-6 transition-transform group-hover:scale-110" />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Alerta Executivo Banner */}
      <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-[#0B3B23] border border-emerald-800/60 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center gap-4 relative z-10">
          <div className="p-3.5 bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/30 shrink-0">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <h4 className="font-extrabold text-white text-sm uppercase tracking-wider flex items-center gap-2">
              <span>{content.painel_lateral_titulo}</span>
              <span className="text-[10px] bg-emerald-500/30 text-emerald-300 px-2.5 py-0.5 rounded-full border border-emerald-500/40">Oficial RTRS</span>
            </h4>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed max-w-2xl font-medium">
              Acompanhamento integrado de vistorias técnicas e deliberações de certificação de soja responsável no Mato Grosso do Sul.
            </p>
          </div>
        </div>

        <button 
          onClick={() => window.location.href = '/app/gestor/auditorias'}
          className="group relative z-10 text-xs font-extrabold uppercase tracking-wider bg-gradient-to-r from-[#1B7547] to-[#15613a] hover:from-[#15613a] hover:to-[#0B3B23] text-white px-6 py-3.5 rounded-2xl shadow-lg hover:shadow-emerald-900/50 hover:scale-105 active:scale-95 transition-all duration-300 shrink-0 cursor-pointer overflow-hidden flex items-center gap-2"
        >
          <span className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out pointer-events-none" />
          <FileCheck2 className="w-4 h-4 transition-transform group-hover:scale-110 duration-300" />
          <span>Fluxo de Homologação</span>
        </button>
      </div>

      {/* Tabela de Auditorias */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs flex flex-col overflow-hidden">
        
        {/* Header Tabela */}
        <div className="p-6 border-b border-slate-200/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50/50">
          <div>
            <h2 className="font-extrabold text-slate-900 text-lg tracking-tight">{content.tabela_titulo}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{content.tabela_subtitulo}</p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={content.busca_placeholder}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 bg-white rounded-2xl text-xs font-medium focus:outline-none focus:ring-4 focus:ring-[#1B7547]/15 focus:border-[#1B7547] transition-all shadow-xs"
              />
            </div>

            {/* Seletor de Modo: Cards | Tabela */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 self-end sm:self-auto">
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

        {filteredAudits.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs font-medium">
            Nenhuma auditoria encontrada para a busca realizada.
          </div>
        ) : (
          <>
            {/* Modo Cards (Mobile por padrão, ou quando selecionado) */}
            <div className={viewMode === 'cards' ? 'block' : viewMode === 'table' ? 'hidden' : 'block md:hidden'}>
              <div className="divide-y divide-slate-100">
                {filteredAudits.map((auditoria) => {
                  const isDeliberavel = auditoria.status === 'Aguardando Aprovação' || auditoria.status === 'Em Análise';
                  return (
                    <div key={auditoria.id} className="p-4 bg-white space-y-3">
                      {/* Topo: Fazenda e Status */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5 flex-1 min-w-0">
                          <h3 className="font-extrabold text-slate-900 text-sm truncate flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[#1B7547] shrink-0" />
                            <span className="truncate">{auditoria.fazenda}</span>
                          </h3>
                          <p className="text-xs text-slate-500 font-medium flex items-center gap-1">
                            <span>Produtor: {auditoria.produtor}</span>
                            <span>•</span>
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>{new Date(auditoria.data).toLocaleDateString('pt-BR')}</span>
                          </p>
                        </div>

                        <div className="shrink-0">
                          {auditoria.status === 'Certificada' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100/80 border border-emerald-200 px-2.5 py-1 rounded-xl shadow-2xs">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Aprovada
                            </span>
                          )}
                          {auditoria.status === 'Aguardando Aprovação' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100/80 border border-amber-300 px-2.5 py-1 rounded-xl shadow-2xs">
                              <Clock className="w-3 h-3 text-amber-600 animate-pulse" /> Aguardando Deliberação
                            </span>
                          )}
                          {auditoria.status === 'Em Análise' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-purple-800 bg-purple-100/80 border border-purple-200 px-2.5 py-1 rounded-xl shadow-2xs">
                              <Clock className="w-3 h-3 text-purple-600 animate-pulse" /> Em Análise
                            </span>
                          )}
                          {auditoria.status === 'Visita de Campo' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-800 bg-blue-100/80 border border-blue-200 px-2.5 py-1 rounded-xl shadow-2xs">
                              <MapPin className="w-3 h-3 text-blue-600" /> Visita de Campo
                            </span>
                          )}
                          {auditoria.status === 'Em Andamento' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-800 bg-slate-100 border border-slate-300 px-2.5 py-1 rounded-xl shadow-2xs">
                              <Clock className="w-3 h-3 text-slate-600" /> Em Andamento
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Conformidade e Ação */}
                      <div className="flex items-center justify-between gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Índice Conformidade</span>
                          <span className="text-base font-extrabold text-[#1B7547]">{auditoria.score}%</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedAuditForModal(auditoria.rawAudit)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-[#1B7547] bg-white border border-slate-200 hover:bg-slate-100 px-3 py-2 rounded-xl transition-all shadow-2xs cursor-pointer"
                            title="Ver Panorama e Score RTRS"
                          >
                            <Eye className="w-3.5 h-3.5 text-[#1B7547]" />
                            <span>Panorama</span>
                          </button>

                          {isDeliberavel ? (
                            <button 
                              onClick={() => setRevisaoAuditoria({
                                id: auditoria.id,
                                nome: auditoria.fazenda,
                                propId: auditoria.propriedade_id,
                                etapa: auditoria.etapa,
                                status: auditoria.status
                              })}
                              className="inline-flex items-center justify-center gap-1.5 text-xs font-extrabold text-white bg-gradient-to-r from-[#1B7547] to-[#15613a] hover:from-[#15613a] hover:to-[#0B3B23] px-4 py-2 rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
                            >
                              <ShieldAlert className="w-3.5 h-3.5" />
                              <span>Deliberar Vistoria</span>
                            </button>
                          ) : (
                            <span className="text-slate-400 text-xs font-semibold flex items-center gap-1 opacity-80">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Processado
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modo Tabela (Desktop por padrão, ou quando selecionado) */}
            <div className={viewMode === 'table' ? 'block overflow-x-auto p-2' : viewMode === 'cards' ? 'hidden' : 'hidden md:block overflow-x-auto p-2'}>
              <table className="w-full text-left text-xs">
                <thead className="text-slate-500 uppercase text-[10px] font-extrabold tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="px-5 py-4 whitespace-nowrap">Propriedade</th>
                    <th className="px-5 py-4 whitespace-nowrap">Produtor</th>
                    <th className="px-5 py-4 whitespace-nowrap">Data Visita</th>
                    <th className="px-5 py-4 whitespace-nowrap font-extrabold">Índice Conformidade</th>
                    <th className="px-5 py-4 whitespace-nowrap">Status Atual</th>
                    <th className="px-5 py-4 text-right min-w-[200px] whitespace-nowrap">Ação Estratégica</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAudits.map((auditoria) => {
                    const isDeliberavel = auditoria.status === 'Aguardando Aprovação' || auditoria.status === 'Em Análise';
                    return (
                      <tr key={auditoria.id} className="hover:bg-slate-50/80 transition-colors duration-200 group">
                        <td className="px-5 py-4.5 font-bold text-slate-900 whitespace-nowrap flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-[#1B7547] opacity-0 group-hover:opacity-100 transition-opacity" />
                          <span>{auditoria.fazenda}</span>
                        </td>
                        <td className="px-5 py-4.5 text-slate-600 font-medium whitespace-nowrap">
                          {auditoria.produtor}
                        </td>
                        <td className="px-5 py-4.5 text-slate-500 font-medium whitespace-nowrap">
                          {new Date(auditoria.data).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-5 py-4.5 font-extrabold text-[#1B7547] whitespace-nowrap text-sm">
                          {auditoria.score}%
                        </td>
                        <td className="px-5 py-4.5 whitespace-nowrap">
                          {auditoria.status === 'Certificada' && (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100/80 border border-emerald-200 px-3 py-1 rounded-xl shadow-2xs">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Aprovada
                            </span>
                          )}
                          {auditoria.status === 'Aguardando Aprovação' && (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100/80 border border-amber-300 px-3 py-1 rounded-xl shadow-2xs">
                              <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" /> Aguardando Deliberação
                            </span>
                          )}
                          {auditoria.status === 'Em Análise' && (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-purple-800 bg-purple-100/80 border border-purple-200 px-3 py-1 rounded-xl shadow-2xs">
                              <Clock className="w-3.5 h-3.5 text-purple-600 animate-pulse" /> Em Análise
                            </span>
                          )}
                          {auditoria.status === 'Visita de Campo' && (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-blue-800 bg-blue-100/80 border border-blue-200 px-3 py-1 rounded-xl shadow-2xs">
                              <MapPin className="w-3.5 h-3.5 text-blue-600" /> Visita de Campo
                            </span>
                          )}
                          {auditoria.status === 'Em Andamento' && (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-700 bg-slate-100 border border-slate-300 px-3 py-1 rounded-xl shadow-2xs">
                              <Clock className="w-3.5 h-3.5 text-slate-500" /> Em Andamento
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4.5 text-right min-w-[200px] whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedAuditForModal(auditoria.rawAudit)}
                              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1B7547] bg-white border border-slate-200 hover:bg-slate-100 px-3 py-2 rounded-xl transition-all shadow-2xs cursor-pointer hover:border-[#1B7547]/50"
                              title="Visualizar Ficha e Panorama RTRS"
                            >
                              <Eye className="w-3.5 h-3.5 text-[#1B7547]" />
                              <span>Panorama</span>
                            </button>

                            {isDeliberavel ? (
                              <button 
                                onClick={() => setRevisaoAuditoria({
                                  id: auditoria.id,
                                  nome: auditoria.fazenda,
                                  propId: auditoria.propriedade_id,
                                  etapa: auditoria.etapa,
                                  status: auditoria.status
                                })}
                                className="group/btn relative inline-flex items-center justify-center gap-2 text-xs font-extrabold text-white bg-gradient-to-r from-[#1B7547] to-[#15613a] hover:from-[#15613a] hover:to-[#0B3B23] px-4 py-2 rounded-2xl transition-all duration-300 shadow-md shadow-[#1B7547]/20 hover:shadow-xl hover:scale-105 active:scale-95 cursor-pointer overflow-hidden"
                              >
                                <span className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover/btn:translate-x-full transition-transform duration-1000 ease-out pointer-events-none" />
                                <ShieldAlert className="w-4 h-4 transition-transform group-hover/btn:scale-110 duration-300" />
                                <span>Deliberar Vistoria</span>
                              </button>
                            ) : (
                              <span className="text-slate-400 text-xs font-semibold flex items-center justify-end gap-1.5 opacity-80">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Processado
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Modal de Revisão e Deliberação Executiva */}
      {revisaoAuditoria && (
        <ModalErrorBoundary onClose={() => setRevisaoAuditoria(null)}>
          <RevisaoAuditoria 
            propriedadeNome={revisaoAuditoria.nome}
            auditoriaId={revisaoAuditoria.id}
            propriedadeId={revisaoAuditoria.propId}
            etapaAtual={revisaoAuditoria.etapa}
            statusAtual={revisaoAuditoria.status}
            onClose={() => setRevisaoAuditoria(null)}
            onApproveNextStage={handleApproveNextStage}
            onApproveCertify={handleApproveCertify}
            onApprove={handleApproveCertify}
            onReject={handleReject}
          />
        </ModalErrorBoundary>
      )}

      {/* Modal Ficha Técnica & Panorama Completo */}
      {selectedAuditForModal && (
        <AuditDetailModal
          isOpen={!!selectedAuditForModal}
          onClose={() => setSelectedAuditForModal(null)}
          auditoria={selectedAuditForModal}
          onStartVisita={() => {
            setSelectedAuditForModal(null);
            window.location.href = '/app/gestor/auditorias';
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