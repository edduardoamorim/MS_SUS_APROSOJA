import { useState, useEffect } from 'react';
import { 
  Building2, FileCheck2, AlertTriangle, 
  Map as MapIcon, Search, CheckCircle2, FileSearch, ShieldAlert,
  Clock, MapPin, Sparkles, ArrowRight, ShieldCheck
} from 'lucide-react';
import RevisaoAuditoria from '../../components/auditoria/RevisaoAuditoria';
import { supabase } from '../../lib/supabase';
import AIInsightsPanel from '../../components/ui/AIInsightsPanel';
import { aiService } from '../../services/aiService';
import siteContent from '../../config/site_content.json';
import { useToast } from '../../context/ToastContext';
import { CardSkeleton } from '../../components/ui/Skeleton';

export default function DashboardGestor() {
  const { success, error } = useToast();
  const content = siteContent.dashboard_gestor;
  const [revisaoAuditoria, setRevisaoAuditoria] = useState<{ id: any, nome: string } | null>(null);
  const [totalPropriedades, setTotalPropriedades] = useState<number | null>(null);
  const [loadingDados, setLoadingDados] = useState(true);
  
  // AI States
  const [aiInsights, setAiInsights] = useState("");
  const [aiLoading, setAiLoading] = useState(true);
  
  // Lista de Auditorias vinda do Banco
  const [auditorias, setAuditorias] = useState<any[]>([]);

  useEffect(() => {
    async function fetchDashboardData() {
      // 1. Busca Total Propriedades
      const { count, error } = await supabase
        .from('propriedades')
        .select('*', { count: 'exact', head: true });

      const total = (!error && count !== null) ? count : 0;
      setTotalPropriedades(total);

      // 2. Busca Auditorias do Supabase
      const { data: audits, error: auditsError } = await supabase
        .from('auditorias')
        .select(`
          id,
          data_agendamento,
          status,
          propriedades (
            nome_fazenda,
            nome_produtor
          )
        `)
        .order('created_at', { ascending: false });

      let mappedAudits: any[] = [];
      if (!auditsError && audits) {
        mappedAudits = audits.map((a: any) => ({
          id: a.id,
          fazenda: a.propriedades?.nome_fazenda || 'Sem nome',
          produtor: a.propriedades?.nome_produtor || 'N/A',
          municipio: 'Geral, MS',
          status: a.status,
          data: a.data_agendamento || new Date().toISOString(),
          score: a.status === 'Certificada' ? 100 : a.status === 'Em Análise' ? 85 : 0
        }));
        setAuditorias(mappedAudits);
      }

      setLoadingDados(false);

      // Prepara contexto para o Gemini
      const stats = {
        totalPropriedades: total,
        auditoriasPendentes: mappedAudits.filter(a => a.status === 'Em Análise').length,
        auditoriasCertificadas: mappedAudits.filter(a => a.status === 'Certificada').length,
        alertasIbama: 14 // Fictício
      };

      // Conecta com a IA
      const insights = await aiService.generateGestorBriefing(stats);
      setAiInsights(insights);
      setAiLoading(false);
    }
    
    fetchDashboardData();
  }, []);

  const handleApprove = async () => {
    if (revisaoAuditoria) {
      try {
        const { error: err } = await supabase
          .from('auditorias')
          .update({ status: 'Certificada' })
          .eq('id', revisaoAuditoria.id);
        if (err) throw err;
        
        setAuditorias(auditorias.map(a => 
          a.id === revisaoAuditoria.id ? { ...a, status: 'Certificada' } : a
        ));
        success('Auditoria aprovada e certificada com sucesso!');
      } catch (err: any) {
        console.error('Erro ao aprovar auditoria:', err);
        error('Erro ao aprovar: ' + err.message);
      }
    }
    setRevisaoAuditoria(null);
  };

  const handleReject = async () => {
    if (revisaoAuditoria) {
      try {
        const { error } = await supabase
          .from('auditorias')
          .update({ status: 'Visita de Campo' }) // retorna para Visita de Campo
          .eq('id', revisaoAuditoria.id);
        if (error) throw error;

        setAuditorias(auditorias.map(a => 
          a.id === revisaoAuditoria.id ? { ...a, status: 'Visita de Campo' } : a
        ));
      } catch (err: any) {
        console.error('Erro ao rejeitar auditoria:', err);
      }
    }
    setRevisaoAuditoria(null);
  };

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

      {/* KPIs Gerais (Métricas de BI) com 3D Cards & Hover Motion */}
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
                  <h3 className="text-4xl font-extrabold text-slate-900 tracking-tight">856</h3>
                  <p className="text-xs text-[#5c8a18] font-bold mt-2 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>68.5% {content.card_certificadas_sub}</span>
                  </p>
                </div>
                <div className="p-3.5 bg-[#7CB324]/15 text-[#5c8a18] rounded-2xl group-hover:bg-[#7CB324] group-hover:text-white transition-colors duration-300">
                  <FileCheck2 className="w-6 h-6 transition-transform group-hover:scale-110" />
                </div>
              </div>
            </div>

            {/* Card 3: Em Avaliação */}
            <div className="group relative bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-xl hover:border-[#C59B27]/40 hover:-translate-y-1.5 transition-all duration-300 overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#C59B27]/10 rounded-bl-full pointer-events-none transition-transform group-hover:scale-125" />
              <div className="flex items-start justify-between relative z-10">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-2">{content.card_avaliacao}</p>
                  <h3 className="text-4xl font-extrabold text-slate-900 tracking-tight">34</h3>
                  <p className="text-xs text-[#C59B27] font-bold mt-2 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 animate-pulse" />
                    <span>{content.card_avaliacao_sub}</span>
                  </p>
                </div>
                <div className="p-3.5 bg-[#C59B27]/15 text-[#C59B27] rounded-2xl group-hover:bg-[#C59B27] group-hover:text-white transition-colors duration-300">
                  <AlertTriangle className="w-6 h-6 transition-transform group-hover:scale-110" />
                </div>
              </div>
            </div>

            {/* Card 4: Alertas Ibama */}
            <div className="group relative bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-xl hover:border-red-300 hover:-translate-y-1.5 transition-all duration-300 overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-red-50 rounded-bl-full pointer-events-none transition-transform group-hover:scale-125" />
              <div className="flex items-start justify-between relative z-10">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-2">{content.card_alertas}</p>
                  <h3 className="text-4xl font-extrabold text-slate-900 tracking-tight">14</h3>
                  <p className="text-xs text-red-600 font-bold mt-2">{content.card_alertas_sub}</p>
                </div>
                <div className="p-3.5 bg-red-100 text-red-600 rounded-2xl group-hover:bg-red-600 group-hover:text-white transition-colors duration-300">
                  <MapIcon className="w-6 h-6 transition-transform group-hover:scale-110" />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Alerta Crítico Executivo Banner com Motion Padronizado */}
      <div className="bg-gradient-to-r from-red-950 via-slate-900 to-red-950 border border-red-800/60 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center gap-4 relative z-10">
          <div className="p-3.5 bg-red-500/20 text-red-400 rounded-2xl border border-red-500/30 shrink-0">
            <ShieldAlert className="w-7 h-7 animate-pulse" />
          </div>
          <div>
            <h4 className="font-extrabold text-white text-sm uppercase tracking-wider flex items-center gap-2">
              <span>{content.painel_lateral_titulo}</span>
              <span className="text-[10px] bg-red-500/30 text-red-300 px-2.5 py-0.5 rounded-full border border-red-500/40">Urgente</span>
            </h4>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed max-w-2xl font-medium">
              {content.painel_lateral_texto}
            </p>
          </div>
        </div>

        <button className="group relative z-10 text-xs font-extrabold uppercase tracking-wider bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white px-6 py-3.5 rounded-2xl shadow-lg hover:shadow-red-900/50 hover:scale-105 active:scale-95 transition-all duration-300 shrink-0 cursor-pointer overflow-hidden flex items-center gap-2">
          <span className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out pointer-events-none" />
          <ShieldAlert className="w-4 h-4 transition-transform group-hover:scale-110 duration-300" />
          <span>Extrair Relatório de Risco</span>
        </button>
      </div>

      {/* Tabela de Auditorias Premium com Dynamic Hover */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs flex flex-col overflow-hidden">
        
        {/* Header Tabela */}
        <div className="p-6 border-b border-slate-200/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50/50">
          <div>
            <h2 className="font-extrabold text-slate-900 text-lg tracking-tight">{content.tabela_titulo}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{content.tabela_subtitulo}</p>
          </div>

          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input 
              type="text" 
              placeholder={content.busca_placeholder}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 bg-white rounded-2xl text-xs font-medium focus:outline-none focus:ring-4 focus:ring-[#1B7547]/15 focus:border-[#1B7547] transition-all shadow-xs"
            />
          </div>
        </div>

        {/* Tabela de Registros */}
        <div className="overflow-x-auto p-2">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500 uppercase text-[10px] font-extrabold tracking-wider border-b border-slate-100">
              <tr>
                <th className="px-5 py-4 whitespace-nowrap">Propriedade</th>
                <th className="px-5 py-4 whitespace-nowrap">Data Visita</th>
                <th className="px-5 py-4 whitespace-nowrap font-extrabold">Índice Conformidade</th>
                <th className="px-5 py-4 whitespace-nowrap">Status Atual</th>
                <th className="px-5 py-4 text-right min-w-[150px] whitespace-nowrap">Ação Estratégica</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {auditorias.map((auditoria) => (
                <tr key={auditoria.id} className="hover:bg-slate-50/80 transition-colors duration-200 group">
                  <td className="px-5 py-4.5 font-bold text-slate-900 whitespace-nowrap flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#1B7547] opacity-0 group-hover:opacity-100 transition-opacity" />
                    <span>{auditoria.fazenda}</span>
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
                    {auditoria.status === 'Em Análise' && (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100/80 border border-amber-200 px-3 py-1 rounded-xl shadow-2xs">
                        <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" /> Em Análise
                      </span>
                    )}
                    {auditoria.status === 'Visita de Campo' && (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-blue-800 bg-blue-100/80 border border-blue-200 px-3 py-1 rounded-xl shadow-2xs">
                        <MapPin className="w-3.5 h-3.5 text-blue-600" /> Agendada
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4.5 text-right min-w-[150px] whitespace-nowrap">
                    {auditoria.status === 'Em Análise' ? (
                      <button 
                        onClick={() => setRevisaoAuditoria({ id: auditoria.id, nome: auditoria.fazenda })}
                        className="group/btn relative inline-flex items-center justify-center gap-2 text-xs font-extrabold text-white bg-gradient-to-r from-[#1B7547] to-[#15613a] hover:from-[#15613a] hover:to-[#0B3B23] px-4 py-2 rounded-2xl transition-all duration-300 shadow-md shadow-[#1B7547]/20 hover:shadow-xl hover:scale-105 active:scale-95 cursor-pointer overflow-hidden"
                      >
                        <span className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover/btn:translate-x-full transition-transform duration-1000 ease-out pointer-events-none" />
                        <ShieldAlert className="w-4 h-4 transition-transform group-hover/btn:scale-110 duration-300" />
                        <span>Deliberar</span>
                      </button>
                    ) : (
                      <span className="text-slate-400 text-xs font-semibold flex items-center justify-end gap-1.5 opacity-80">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Processado
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {revisaoAuditoria && (
        <RevisaoAuditoria 
          propriedadeNome={revisaoAuditoria.nome}
          onClose={() => setRevisaoAuditoria(null)}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      )}
    </div>
  );
}
