import React, { useState, useMemo } from 'react';
import { 
  CheckCircle2, 
  AlertCircle, 
  MinusCircle, 
  ShieldCheck, 
  Sparkles, 
  Award, 
  TrendingUp, 
  ArrowRight, 
  ChevronRight, 
  AlertTriangle, 
  Eye, 
  RotateCcw, 
  FileCheck2, 
  Download,
  Building2,
  Calendar,
  Layers,
  CheckCircle,
  HelpCircle,
  X
} from 'lucide-react';

export interface PanoramaCriterioItem {
  id: string;
  secao: string;
  criterio: string;
  enunciado: string;
  conforme?: boolean | null;
  nao_se_aplica?: boolean | null;
  observacao?: string | null;
  evidencia?: string | null;
  ponderacao?: 'Imediata' | 'Curto Prazo' | 'Médio Prazo' | string;
}

export interface PanoramaScoreRTRSProps {
  propriedadeNome: string;
  municipio?: string | null;
  produtorNome?: string | null;
  criterios: PanoramaCriterioItem[];
  onBackToQuestions?: () => void;
  onSubmitAuditoria?: () => void;
  isSubmitting?: boolean;
  readOnly?: boolean;
  embedded?: boolean;
  etapa?: string;
  onClose?: () => void;
}

export default function PanoramaScoreRTRS({
  propriedadeNome,
  municipio,
  produtorNome,
  criterios,
  onBackToQuestions,
  onSubmitAuditoria,
  isSubmitting = false,
  readOnly = false,
  embedded = false,
  etapa = 'Auditoria Oficial',
  onClose
}: PanoramaScoreRTRSProps) {
  const [activeTab, setActiveTab] = useState<'resumo' | 'principios' | 'pontos_atencao'>('resumo');
  const [filterPrincipio, setFilterPrincipio] = useState<string>('todos');

  // Cálculos Consolidados de Conformidade
  const {
    total,
    respondidos,
    conformes,
    naoConformes,
    naoSeAplica,
    aplicaveis,
    scorePercent,
    tier,
    naoConformesList,
    secoesStats
  } = useMemo(() => {
    const total = criterios.length;
    const respondidos = criterios.filter(c => 
      c.nao_se_aplica === true || (c.conforme !== null && c.conforme !== undefined)
    ).length;

    const conformes = criterios.filter(c => c.conforme === true && !c.nao_se_aplica).length;
    const naoConformes = criterios.filter(c => c.conforme === false && !c.nao_se_aplica).length;
    const naoSeAplica = criterios.filter(c => !!c.nao_se_aplica).length;
    const aplicaveis = conformes + naoConformes;

    const scorePercent = aplicaveis === 0 ? (total > 0 && naoSeAplica === total ? 100 : 0) : Math.round((conformes / aplicaveis) * 100);

    let tier = {
      label: 'Excelente — Alta Conformidade RTRS',
      sub: 'Propriedade atende aos padrões de sustentabilidade e certificação socioambiental.',
      color: 'emerald',
      bgBadge: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      ringColor: '#10b981',
      strokeColor: '#059669',
      gradient: 'from-emerald-600 to-teal-700'
    };

    if (scorePercent < 60) {
      tier = {
        label: 'Atenção Crítica — Não Conformidades Prioritárias',
        sub: 'Existem pontos impeditivos que requerem plano de adequação urgente antes da certificação.',
        color: 'rose',
        bgBadge: 'bg-rose-100 text-rose-900 border-rose-300',
        ringColor: '#f43f5e',
        strokeColor: '#e11d48',
        gradient: 'from-rose-600 to-red-700'
      };
    } else if (scorePercent < 85) {
      tier = {
        label: 'Em Adequação — Requer Atenção em Indicadores',
        sub: 'Boas práticas identificadas com pendências pontuais de curto e médio prazo.',
        color: 'amber',
        bgBadge: 'bg-amber-100 text-amber-900 border-amber-300',
        ringColor: '#f59e0b',
        strokeColor: '#d97706',
        gradient: 'from-amber-600 to-yellow-600'
      };
    }

    const naoConformesList = criterios.filter(c => c.conforme === false && !c.nao_se_aplica);

    // Agrupamento por Princípio RTRS
    const secoesMap = new Map<string, { total: number; conf: number; nconf: number; na: number }>();
    criterios.forEach(c => {
      const sec = c.secao || 'Geral';
      if (!secoesMap.has(sec)) {
        secoesMap.set(sec, { total: 0, conf: 0, nconf: 0, na: 0 });
      }
      const item = secoesMap.get(sec)!;
      item.total += 1;
      if (c.nao_se_aplica) item.na += 1;
      else if (c.conforme === true) item.conf += 1;
      else if (c.conforme === false) item.nconf += 1;
    });

    const secoesStats = Array.from(secoesMap.entries()).map(([secao, stats]) => {
      const aplicSec = stats.conf + stats.nconf;
      const pct = aplicSec === 0 ? 100 : Math.round((stats.conf / aplicSec) * 100);
      return {
        secao,
        ...stats,
        aplicaveis: aplicSec,
        percent: pct
      };
    });

    return {
      total,
      respondidos,
      conformes,
      naoConformes,
      naoSeAplica,
      aplicaveis,
      scorePercent,
      tier,
      naoConformesList,
      secoesStats
    };
  }, [criterios]);

  // SVG Gauge calculations
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (scorePercent / 100) * circumference;

  const pctConf = aplicaveis > 0 ? Math.round((conformes / aplicaveis) * 100) : 0;
  const pctNconf = aplicaveis > 0 ? Math.round((naoConformes / aplicaveis) * 100) : 0;
  const pctNa = total > 0 ? Math.round((naoSeAplica / total) * 100) : 0;

  return (
    <div className={embedded ? "bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden animate-fade-in-up duration-300" : "bg-slate-50 rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-xl overflow-hidden animate-fade-in-up duration-300"}>
      {/* Top Banner de Apresentação Executiva */}
      {!embedded && (
      <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-900 p-4 sm:p-6 text-white relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-white/5 skew-x-12 transform origin-top-right pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/15 text-emerald-100 border border-white/20 backdrop-blur-sm">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                Panorama Executivo RTRS
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-700/80 text-white border border-emerald-600 shadow-2xs">
                {etapa}
              </span>
              {respondidos === total && total > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-400 text-emerald-950 shadow-sm animate-pulse">
                  <CheckCircle className="w-3 h-3" />
                  100% Preenchido
                </span>
              )}
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight truncate" title={propriedadeNome}>
              {propriedadeNome}
            </h2>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-emerald-100/90 font-medium">
              {municipio && <span>{municipio}</span>}
              {municipio && produtorNome && <span>•</span>}
              {produtorNome && (
                <span>Produtor: <strong className="text-white font-extrabold">{produtorNome}</strong></span>
              )}
            </div>
          </div>

          {/* Botões do Topo */}
          <div className="flex items-center gap-2 shrink-0">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

            )}

      {/* Navegação Interna das Abas do Panorama */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 pt-3 flex gap-2 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab('resumo')}
          className={`pb-3 px-3 text-xs sm:text-sm font-extrabold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'resumo'
              ? 'border-[#1B7547] text-[#1B7547]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>Pontuação & Síntese</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('principios')}
          className={`pb-3 px-3 text-xs sm:text-sm font-extrabold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'principios'
              ? 'border-[#1B7547] text-[#1B7547]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Raio-X dos 5 Princípios</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-slate-100 text-slate-600">
            5
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('pontos_atencao')}
          className={`pb-3 px-3 text-xs sm:text-sm font-extrabold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'pontos_atencao'
              ? 'border-[#1B7547] text-[#1B7547]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span>Pontos de Atenção</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
            naoConformes > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800'
          }`}>
            {naoConformes}
          </span>
        </button>
      </div>

      {/* Conteúdo Dinâmico por Aba */}
      <div className="p-4 sm:p-6 space-y-6">
        {activeTab === 'resumo' && (
          <div className="space-y-6 animate-fade-in">
            {/* Bloco Central: Gauge de Pontuação Circular + Selo de Classificação + Barra de Distribuição (Sem Cortes) */}
            <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-sm flex flex-col md:flex-row items-center gap-5 sm:gap-7">
              
              {/* Circular Gauge com Motion Design à Esquerda */}
              <div className="relative w-32 h-32 sm:w-36 sm:h-36 flex items-center justify-center shrink-0">
                <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 130 130">
                  {/* Background circle track */}
                  <circle
                    cx="65"
                    cy="65"
                    r={radius}
                    stroke="#e2e8f0"
                    strokeWidth="11"
                    fill="transparent"
                  />
                  {/* Animated Progress Circle */}
                  <circle
                    cx="65"
                    cy="65"
                    r={radius}
                    stroke={tier.strokeColor}
                    strokeWidth="11"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    fill="transparent"
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>

                {/* Texto Central */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center select-none">
                  <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-none font-mono">
                    {scorePercent}%
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 mt-1">
                    Conformidade
                  </span>
                </div>
              </div>

              {/* Coluna Direita: Informações & Barra de Distribuição (100% de largura da coluna, sem cortes) */}
              <div className="flex-1 min-w-0 w-full space-y-3.5">
                {/* Badge e Descrição do Tier */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${tier.bgBadge}`}>
                      <Sparkles className="w-3.5 h-3.5" />
                      {tier.label}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Base: {aplicaveis} critérios aplicáveis
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
                    {tier.sub}
                  </p>
                </div>

                {/* Barra Empilhada de Distribuição Proporcional */}
                <div className="w-full bg-slate-50 p-3 sm:p-3.5 rounded-xl border border-slate-200/80 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span className="uppercase tracking-wider text-[10px] text-slate-500 font-black">Distribuição dos 115 Indicadores</span>
                    <span className="text-[11px] font-mono text-slate-600">{respondidos} de {total} avaliados</span>
                  </div>

                  {/* Stacked Bar */}
                  <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden flex shadow-inner">
                    <div
                      style={{ width: `${(conformes / Math.max(1, total)) * 100}%` }}
                      className="bg-emerald-600 transition-all duration-700 hover:brightness-110"
                      title={`Conformes: ${conformes} (${pctConf}%)`}
                    />
                    <div
                      style={{ width: `${(naoConformes / Math.max(1, total)) * 100}%` }}
                      className="bg-rose-500 transition-all duration-700 hover:brightness-110"
                      title={`Não Conformes: ${naoConformes} (${pctNconf}%)`}
                    />
                    <div
                      style={{ width: `${(naoSeAplica / Math.max(1, total)) * 100}%` }}
                      className="bg-slate-400 transition-all duration-700 hover:brightness-110"
                      title={`Não se Aplica: ${naoSeAplica} (${pctNa}%)`}
                    />
                  </div>

                  {/* Legenda com percentuais */}
                  <div className="grid grid-cols-3 gap-1 pt-0.5 text-center text-[10px] sm:text-xs font-black">
                    <div className="text-emerald-700 flex items-center justify-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />
                      <span>{pctConf}% Conf. ({conformes})</span>
                    </div>
                    <div className="text-rose-700 flex items-center justify-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                      <span>{pctNconf}% Não Conf. ({naoConformes})</span>
                    </div>
                    <div className="text-slate-600 flex items-center justify-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                      <span>{pctNa}% N/A ({naoSeAplica})</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Grid dos 3 Cards Executivos: Conforme / Não Conforme / Não se Aplica */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4">
              {/* Card 1: Conformes */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border-2 border-emerald-200 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between group">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      Conformes
                    </span>
                    <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl group-hover:scale-110 transition-transform">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl sm:text-4xl font-black text-emerald-700 tracking-tight font-mono">
                      {conformes}
                    </span>
                    <span className="text-xs font-bold text-slate-500">
                      critérios ({pctConf}%)
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 font-medium">
                    Atendem plenamente às exigências RTRS in-loco.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-emerald-100 flex items-center justify-between text-[11px] font-bold text-emerald-800">
                  <span>Conformidade Atestada</span>
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                </div>
              </div>

              {/* Card 2: Não Conformes */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border-2 border-rose-200 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between group">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-rose-800 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                      Não Conformes
                    </span>
                    <div className="p-2 bg-rose-100 text-rose-700 rounded-xl group-hover:scale-110 transition-transform">
                      <AlertCircle className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl sm:text-4xl font-black text-rose-600 tracking-tight font-mono">
                      {naoConformes}
                    </span>
                    <span className="text-xs font-bold text-slate-500">
                      critérios ({pctNconf}%)
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 font-medium">
                    Itens que exigem plano de adequação e regularização.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-rose-100 flex items-center justify-between text-[11px] font-bold text-rose-800">
                  <span>Requer Atenção Técnica</span>
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                </div>
              </div>

              {/* Card 3: Não se Aplica */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border-2 border-slate-200 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between group">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                      Não se Aplica
                    </span>
                    <div className="p-2 bg-slate-100 text-slate-700 rounded-xl group-hover:scale-110 transition-transform">
                      <MinusCircle className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl sm:text-4xl font-black text-slate-700 tracking-tight font-mono">
                      {naoSeAplica}
                    </span>
                    <span className="text-xs font-bold text-slate-500">
                      critérios ({pctNa}%)
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 font-medium">
                    Condições não incidentes nesta propriedade rural.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-600">
                  <span>Fora do Denominador</span>
                  <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Aba 2: Raio-X dos 5 Princípios RTRS */}
        {activeTab === 'principios' && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide">
                Desempenho por Princípio RTRS
              </h3>
              <span className="text-xs text-slate-500 font-medium">
                5 Princípios Oficiais
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3.5">
              {secoesStats.map((sec, idx) => {
                const isHigh = sec.percent >= 85;
                const isMed = sec.percent >= 60 && sec.percent < 85;
                const barColor = isHigh ? 'bg-emerald-600' : isMed ? 'bg-amber-500' : 'bg-rose-500';
                const badgeColor = isHigh ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : isMed ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-rose-50 text-rose-800 border-rose-200';

                return (
                  <div key={sec.secao} className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-sm transition-all space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-900 text-xs font-black flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div>
                          <h4 className="font-extrabold text-sm text-slate-900 leading-snug">
                            {sec.secao}
                          </h4>
                          <span className="text-[11px] text-slate-500 font-medium">
                            {sec.total} critérios avaliados
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-center">
                        <span className={`text-xs font-black px-2.5 py-1 rounded-xl border ${badgeColor}`}>
                          {sec.percent}% de Conformidade
                        </span>
                      </div>
                    </div>

                    {/* Barra de Progresso */}
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border border-slate-200/60 p-0.5">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                        style={{ width: `${sec.percent}%` }}
                      />
                    </div>

                    {/* Badges de Contagem do Princípio */}
                    <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 font-bold border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>{sec.conf} Conformes</span>
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-800 font-bold border border-rose-200">
                        <AlertCircle className="w-3 h-3 text-rose-600" />
                        <span>{sec.nconf} Não Conformes</span>
                      </span>
                      {sec.na > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold border border-slate-200">
                          <MinusCircle className="w-3 h-3 text-slate-500" />
                          <span>{sec.na} Não se Aplica</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Aba 3: Pontos de Atenção (Não Conformidades) */}
        {activeTab === 'pontos_atencao' && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <span>Pontos de Atenção e Não Conformidades ({naoConformesList.length})</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">
                  Itens apontados pelo técnico para apresentação e alinhamento com o produtor rural.
                </p>
              </div>

              {/* Filtro por Princípio */}
              <div className="shrink-0">
                <select
                  value={filterPrincipio}
                  onChange={(e) => setFilterPrincipio(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="todos">Todos os Princípios</option>
                  {secoesStats.map(s => (
                    <option key={s.secao} value={s.secao}>{s.secao}</option>
                  ))}
                </select>
              </div>
            </div>

            {naoConformesList.length === 0 ? (
              <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-8 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="font-extrabold text-sm text-emerald-950">Nenhuma Não Conformidade Registrada</h4>
                <p className="text-xs text-emerald-800 max-w-md mx-auto font-medium">
                  A propriedade rural atendeu a todos os critérios aplicáveis avaliados até o momento.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {naoConformesList
                  .filter(c => filterPrincipio === 'todos' || c.secao === filterPrincipio)
                  .map((item) => (
                    <div
                      key={item.id}
                      className="bg-white p-4 sm:p-5 rounded-2xl border border-rose-200/90 shadow-2xs hover:shadow-sm transition-all space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                            {item.secao}
                          </span>
                          <span className="text-xs font-mono font-bold text-slate-600">
                            Critério {item.criterio}
                          </span>
                          {item.ponderacao && (
                            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded ${
                              item.ponderacao === 'Imediata' ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}>
                              Prazo: {item.ponderacao}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 text-rose-600" />
                          Não Conforme
                        </span>
                      </div>

                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-snug">
                        {item.enunciado}
                      </h4>

                      {item.observacao ? (
                        <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200/80 text-xs text-amber-950 space-y-1">
                          <span className="font-extrabold text-[11px] text-amber-900 block">
                            Apontamento do Técnico:
                          </span>
                          <p className="italic font-medium leading-relaxed">
                            "{item.observacao}"
                          </p>
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-400 italic">
                          Nenhuma observação textual registrada.
                        </p>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Barra Inferior de Ações para o Técnico / Produtor (ocultada se embedded) */}
      {!embedded && (
      <div className="bg-slate-100 px-4 sm:px-6 py-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
          <ShieldCheck className="w-4 h-4 text-emerald-700" />
          <span>Visão gerencial completa para alinhamento com o produtor</span>
        </div>

        <div className="flex flex-col-reverse sm:flex-row items-center gap-2.5 w-full sm:w-auto">
          {onBackToQuestions && (
            <button
              type="button"
              onClick={onBackToQuestions}
              className="w-full sm:w-auto px-5 py-2.5 bg-white hover:bg-slate-200 text-slate-700 rounded-xl font-extrabold text-xs border border-slate-300 transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Voltar aos Critérios</span>
            </button>
          )}

          {onSubmitAuditoria && (
            <button
              type="button"
              onClick={onSubmitAuditoria}
              disabled={isSubmitting}
              className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-[#1B7547] to-[#15613a] hover:from-[#15613a] hover:to-[#0B3B23] text-white rounded-xl font-extrabold text-xs shadow-md shadow-[#1B7547]/20 hover:shadow-xl hover:scale-102 active:scale-95 transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? (
                <span>Submetendo Vistoria...</span>
              ) : (
                <>
                  <FileCheck2 className="w-4 h-4 text-emerald-300" />
                  <span>Concluir & Submeter Vistoria</span>
                </>
              )}
            </button>
          )}

          {readOnly && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-extrabold text-xs transition-all cursor-pointer"
            >
              Fechar Panorama
            </button>
          )}
        </div>
      </div>
          )}
</div>
  );
}

