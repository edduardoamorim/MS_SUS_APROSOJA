import { useState, useEffect } from 'react';
import { 
  Building2, FileCheck2, AlertTriangle, 
  Map as MapIcon, Search, CheckCircle2, XCircle, FileSearch, ShieldAlert,
  Calendar, Clock, MapPin
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
    <div className="space-y-8 animate-fade-in">
      <div className="flex justify-between items-end mb-4 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">{content.titulo}</h1>
          <p className="text-muted-foreground mt-1 text-lg">{content.subtitulo}</p>
        </div>
      </div>

      {/* AI Insights Panel (Topo) */}
      <AIInsightsPanel 
        title={content.painel_ia_titulo} 
        insights={aiInsights} 
        isLoading={aiLoading} 
      />

      {/* KPIs Gerais (Métricas de BI) com 3D Cards */}
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
            <div className="bg-card p-6 rounded-2xl border border-slate-100 shadow-sm hover:-translate-y-1.5 hover:shadow-xl hover:border-primary/20 transition-all duration-300 ease-out group relative overflow-hidden animate-fade-in-up delay-100 opacity-0">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-muted-foreground mb-2">{content.card_propriedades}</p>
                  <h3 className="text-4xl font-bold text-foreground tracking-tight">
                    {totalPropriedades}
                  </h3>
                </div>
                <div className="p-3 bg-primary/10 rounded-xl">
                  <Building2 className="w-6 h-6 text-primary" />
                </div>
              </div>
            </div>

            <div className="bg-card p-6 rounded-2xl border border-slate-100 shadow-sm hover:-translate-y-1.5 hover:shadow-xl hover:border-primary/20 transition-all duration-300 ease-out group relative overflow-hidden animate-fade-in-up delay-150 opacity-0">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-muted-foreground mb-2">{content.card_certificadas}</p>
                  <h3 className="text-4xl font-bold text-foreground tracking-tight">856</h3>
                  <p className="text-sm text-primary font-semibold mt-2">68.5% {content.card_certificadas_sub}</p>
                </div>
                <div className="p-3 bg-emerald-100/50 rounded-xl">
                  <FileCheck2 className="w-6 h-6 text-emerald-700" />
                </div>
              </div>
            </div>

            <div className="bg-card p-6 rounded-2xl border border-slate-100 shadow-sm hover:-translate-y-1.5 hover:shadow-xl hover:border-primary/20 transition-all duration-300 ease-out group relative overflow-hidden animate-fade-in-up delay-200 opacity-0">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-muted-foreground mb-2">{content.card_avaliacao}</p>
                  <h3 className="text-4xl font-bold text-foreground tracking-tight">34</h3>
                  <p className="text-sm text-accent font-semibold mt-2">{content.card_avaliacao_sub}</p>
                </div>
                <div className="p-3 bg-accent/10 rounded-xl">
                  <AlertTriangle className="w-6 h-6 text-accent" />
                </div>
              </div>
            </div>

            <div className="bg-card p-6 rounded-2xl border border-slate-100 shadow-sm hover:-translate-y-1.5 hover:shadow-xl hover:border-primary/20 transition-all duration-300 ease-out group relative overflow-hidden animate-fade-in-up delay-300 opacity-0">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-muted-foreground mb-2">{content.card_alertas}</p>
                  <h3 className="text-4xl font-bold text-foreground tracking-tight">14</h3>
                  <p className="text-sm text-destructive font-semibold mt-2">{content.card_alertas_sub}</p>
                </div>
                <div className="p-3 bg-destructive/10 rounded-xl">
                  <MapIcon className="w-6 h-6 text-destructive" />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Alerta Crítico Executivo (Full-Width Banner) */}
      <div className="bg-gradient-to-r from-red-50 to-red-100/50 border border-red-200 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4 mt-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-red-100 rounded-xl text-destructive shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-extrabold text-red-900 text-sm uppercase tracking-wide">{content.painel_lateral_titulo}</h4>
            <p className="text-sm text-foreground/80 mt-1 leading-relaxed font-semibold">
              {content.painel_lateral_texto}
            </p>
          </div>
        </div>
        <button className="text-xs font-black uppercase tracking-wider bg-white text-destructive border border-red-200 px-5 py-3.5 rounded-xl shadow-sm hover:bg-red-50 transition-colors shrink-0 whitespace-nowrap cursor-pointer">
          Extrair Relatório de Risco
        </button>
      </div>

      {/* Tabela de Auditorias Premium (Full-Width Layout) */}
      <div className="bg-card rounded-2xl border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] flex flex-col overflow-hidden mt-6">
        <div className="p-6 border-b border-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-muted/20">
          <div>
            <h2 className="font-bold text-foreground text-lg tracking-tight">{content.tabela_titulo}</h2>
            <p className="text-sm text-muted-foreground mt-1">{content.tabela_subtitulo}</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
            <input 
              type="text" 
              placeholder={content.busca_placeholder}
              className="w-full pl-10 pr-4 py-2.5 border border-input bg-background rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all shadow-sm text-foreground"
            />
          </div>
        </div>
        <div className="overflow-x-auto p-2">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground uppercase text-[10px] font-bold tracking-wider">
              <tr>
                <th className="px-5 py-4 whitespace-nowrap">Propriedade</th>
                <th className="px-5 py-4 whitespace-nowrap">Data Visita</th>
                <th className="px-5 py-4 whitespace-nowrap font-bold">Índice Conformidade</th>
                <th className="px-5 py-4 whitespace-nowrap">Status Atual</th>
                <th className="px-5 py-4 text-right min-w-[150px] whitespace-nowrap">Ação Estratégica</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {auditorias.map((auditoria) => (
                <tr key={auditoria.id} className="hover:bg-muted/30 transition-colors group">
                  <td className="px-5 py-5 font-bold text-foreground whitespace-nowrap">{auditoria.fazenda}</td>
                  <td className="px-5 py-5 text-muted-foreground font-medium whitespace-nowrap">{new Date(auditoria.data).toLocaleDateString('pt-BR')}</td>
                  <td className="px-5 py-5 font-black text-primary whitespace-nowrap text-sm">{auditoria.score}%</td>
                  <td className="px-5 py-5 whitespace-nowrap">
                    {auditoria.status === 'Certificada' && (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100/80 border border-emerald-200 px-2.5 py-1 rounded-md">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Aprovada
                      </span>
                    )}
                    {auditoria.status === 'Em Análise' && (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100/80 border border-amber-200 px-2.5 py-1 rounded-md">
                        <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" /> Em Análise
                      </span>
                    )}
                    {auditoria.status === 'Visita de Campo' && (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-blue-800 bg-blue-100/80 border border-blue-200 px-2.5 py-1 rounded-md">
                        <MapPin className="w-3.5 h-3.5 text-blue-600" /> Agendada
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-5 text-right min-w-[150px] whitespace-nowrap">
                    {auditoria.status === 'Em Análise' ? (
                      <button 
                        onClick={() => setRevisaoAuditoria({ id: auditoria.id, nome: auditoria.fazenda })}
                        className="inline-flex items-center gap-1.5 text-xs font-black text-white bg-primary hover:bg-primary/90 px-4 py-2 rounded-xl transition-all shadow-sm active:scale-[0.98] cursor-pointer"
                      >
                        <ShieldAlert className="w-4 h-4" /> Deliberar
                      </button>
                    ) : (
                      <span className="text-muted-foreground text-xs font-semibold flex items-center justify-end gap-1.5 opacity-60">
                        <CheckCircle2 className="w-4 h-4" /> Processado
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
