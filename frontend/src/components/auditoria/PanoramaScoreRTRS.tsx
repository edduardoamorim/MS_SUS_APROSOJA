import React, { useState, useMemo } from 'react';
import { 
  CheckCircle2, 
  AlertCircle, 
  MinusCircle, 
  ShieldCheck, 
  Sparkles, 
  Award, 
  AlertTriangle, 
  ChevronRight, 
  ChevronDown,
  ChevronUp,
  CheckCircle, 
  HelpCircle, 
  X,
  Clock,
  Calendar,
  Layers,
  Filter,
  FileText,
  Image as ImageIcon,
  RotateCcw,
  FileCheck2,
  Search
} from 'lucide-react';
import rtrsQuestionsJson from '../../data/rtrs_questions.json';

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

// Mapa de contingência para garantir ponderação de todos os 115 critérios RTRS
const PONDERACAO_LOOKUP = new Map<string, string>();
(rtrsQuestionsJson as any[]).forEach(q => {
  if (q.numero_criterio && q.ponderacao) {
    PONDERACAO_LOOKUP.set(q.numero_criterio.trim(), q.ponderacao.trim());
  }
});

export type TipoPrazo = 'imediato' | 'curto' | 'medio';

export function resolvePonderacao(criterioNum?: string, currentPonderacao?: string): 'Imediato' | 'Curto Prazo' | 'Médio Prazo' {
  const raw = currentPonderacao || (criterioNum ? PONDERACAO_LOOKUP.get(criterioNum.trim()) : null) || 'Imediata';
  const low = String(raw).toLowerCase().trim();
  if (low.includes('curto')) return 'Curto Prazo';
  if (low.includes('médio') || low.includes('medio')) return 'Médio Prazo';
  return 'Imediato';
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
  // Filtros interativos para a lista de Não Conformidades
  const [filterPrazo, setFilterPrazo] = useState<'todos' | 'imediato' | 'curto' | 'medio'>('todos');
  const [filterPrincipio, setFilterPrincipio] = useState<string>('todos');
  const [showPrincipiosList, setShowPrincipiosList] = useState<boolean>(true);
  const [searchNaoConf, setSearchNaoConf] = useState<string>('');

  // Cálculos Consolidados de Conformidade e Prazos
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
    secoesStats,
    statsByPrazo
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

    // Lista de Não Conformidades enriquecida com prazo normalizado
    const naoConformesList = criterios
      .filter(c => c.conforme === false && !c.nao_se_aplica)
      .map(c => ({
        ...c,
        prazoNormalizado: resolvePonderacao(c.criterio, c.ponderacao)
      }));

    // Agrupamento por Princípio RTRS
    const secoesMap = new Map<string, { total: number; conf: number; nconf: number; na: number; imediatoNconf: number }>();
    criterios.forEach(c => {
      const sec = c.secao || 'Geral';
      if (!secoesMap.has(sec)) {
        secoesMap.set(sec, { total: 0, conf: 0, nconf: 0, na: 0, imediatoNconf: 0 });
      }
      const item = secoesMap.get(sec)!;
      item.total += 1;
      const prazo = resolvePonderacao(c.criterio, c.ponderacao);

      if (c.nao_se_aplica) {
        item.na += 1;
      } else if (c.conforme === true) {
        item.conf += 1;
      } else if (c.conforme === false) {
        item.nconf += 1;
        if (prazo === 'Imediato') item.imediatoNconf += 1;
      }
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

    // Prazos: Imediato (15d), Curto Prazo (60d), Médio Prazo (120d)
    const statsByPrazo = {
      imediato: {
        total: 0,
        conf: 0,
        nconf: 0,
        na: 0,
        dias: 15,
        titulo: 'Prazo Imediato',
        prazoLabel: 'Até 15 dias',
        tag: 'Urgente / Impeditivo',
        tagColor: 'bg-rose-100 text-rose-800 border-rose-200'
      },
      curto: {
        total: 0,
        conf: 0,
        nconf: 0,
        na: 0,
        dias: 60,
        titulo: 'Curto Prazo',
        prazoLabel: 'Até 60 dias',
        tag: 'Adequação Técnica',
        tagColor: 'bg-amber-100 text-amber-800 border-amber-200'
      },
      medio: {
        total: 0,
        conf: 0,
        nconf: 0,
        na: 0,
        dias: 120,
        titulo: 'Médio Prazo',
        prazoLabel: 'Até 120 dias',
        tag: 'Melhoria Contínua',
        tagColor: 'bg-blue-100 text-blue-800 border-blue-200'
      }
    };

    criterios.forEach(c => {
      const prazo = resolvePonderacao(c.criterio, c.ponderacao);
      const bucket = prazo === 'Curto Prazo' ? statsByPrazo.curto : prazo === 'Médio Prazo' ? statsByPrazo.medio : statsByPrazo.imediato;
      bucket.total += 1;
      if (c.nao_se_aplica) bucket.na += 1;
      else if (c.conforme === true) bucket.conf += 1;
      else if (c.conforme === false) bucket.nconf += 1;
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
      secoesStats,
      statsByPrazo
    };
  }, [criterios]);

  // Cálculos do medidor circular
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (scorePercent / 100) * circumference;

  const pctConf = aplicaveis > 0 ? Math.round((conformes / aplicaveis) * 100) : 0;
  const pctNconf = aplicaveis > 0 ? Math.round((naoConformes / aplicaveis) * 100) : 0;
  const pctNa = total > 0 ? Math.round((naoSeAplica / total) * 100) : 0;

  // Filtragem dinâmica de Não Conformidades
  const filteredNaoConformes = useMemo(() => {
    return naoConformesList.filter(item => {
      // Filtro por prazo
      if (filterPrazo === 'imediato' && item.prazoNormalizado !== 'Imediato') return false;
      if (filterPrazo === 'curto' && item.prazoNormalizado !== 'Curto Prazo') return false;
      if (filterPrazo === 'medio' && item.prazoNormalizado !== 'Médio Prazo') return false;

      // Filtro por princípio
      if (filterPrincipio !== 'todos' && item.secao !== filterPrincipio) return false;

      // Busca textual
      if (searchNaoConf.trim()) {
        const query = searchNaoConf.toLowerCase().trim();
        const text = `${item.criterio} ${item.enunciado} ${item.observacao || ''}`.toLowerCase();
        if (!text.includes(query)) return false;
      }

      return true;
    });
  }, [naoConformesList, filterPrazo, filterPrincipio, searchNaoConf]);

  const handlePrazoCardClick = (tipo: 'imediato' | 'curto' | 'medio') => {
    if (filterPrazo === tipo) {
      setFilterPrazo('todos');
    } else {
      setFilterPrazo(tipo);
      // Rola suavemente até a seção de Não Conformidades
      const el = document.getElementById('secao-nao-conformidades');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  return (
    <div className={embedded ? "bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden animate-fade-in duration-300" : "bg-slate-50 rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-xl overflow-hidden animate-fade-in duration-300"}>
      {/* Top Banner de Apresentação Executiva (quando não embedded) */}
      {!embedded && (
        <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-900 p-4 sm:p-5 text-white relative overflow-hidden">
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/15 text-emerald-100 border border-white/20 backdrop-blur-sm">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                  Panorama Executivo RTRS
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-700/80 text-white border border-emerald-600">
                  {etapa}
                </span>
              </div>

              <h2 className="text-lg sm:text-xl font-black text-white tracking-tight truncate" title={propriedadeNome}>
                {propriedadeNome}
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-emerald-100/90 font-medium">
                {municipio && <span>{municipio}</span>}
                {municipio && produtorNome && <span>•</span>}
                {produtorNome && (
                  <span>Produtor: <strong className="text-white font-extrabold">{produtorNome}</strong></span>
                )}
              </div>
            </div>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer self-start sm:self-center"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ÁREA PRINCIPAL UNIFICADA (Sem Sub-Abas e Sem Repetições) */}
      <div className="p-3.5 sm:p-6 space-y-5">
        
        {/* BLOCO 1: SCORE DE CONFORMIDADE & DISTRIBUIÇÃO CONSOLIDADA */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col md:flex-row items-center gap-5 sm:gap-6">
          
          {/* Circular Gauge */}
          <div className="relative w-28 h-28 sm:w-32 sm:h-32 flex items-center justify-center shrink-0">
            <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 126 126">
              <circle
                cx="63"
                cy="63"
                r={radius}
                stroke="#e2e8f0"
                strokeWidth="10"
                fill="transparent"
              />
              <circle
                cx="63"
                cy="63"
                r={radius}
                stroke={tier.strokeColor}
                strokeWidth="10"
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
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 mt-1">
                Conformidade
              </span>
            </div>
          </div>

          {/* Coluna Direita: Status do Tier e Barra Proporcional */}
          <div className="flex-1 min-w-0 w-full space-y-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${tier.bgBadge}`}>
                  <Sparkles className="w-3.5 h-3.5" />
                  {tier.label}
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  Base: {aplicaveis} aplicáveis ({total} totais)
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
                {tier.sub}
              </p>
            </div>

            {/* Barra Empilhada Consolidada com Totais e Percentuais Claros */}
            <div className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="uppercase tracking-wider text-[10px] text-slate-500 font-black">
                  Distribuição dos 115 Indicadores RTRS
                </span>
                <span className="text-[11px] font-mono text-slate-600 font-bold">
                  {respondidos} de {total} avaliados
                </span>
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

              {/* Legenda com percentuais e números totais */}
              <div className="grid grid-cols-3 gap-1 pt-0.5 text-center text-[10px] sm:text-xs font-black">
                <div className="text-emerald-700 flex items-center justify-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />
                  <span>{pctConf}% Conformes ({conformes})</span>
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

        {/* BLOCO 2: QUANTIDADE E PRAZOS DE ADEQUAÇÃO (IMEDIATO, CURTO PRAZO, MÉDIO PRAZO) */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-emerald-700" />
              <span>Matriz de Prazos & Exigências de Adequação</span>
            </h3>
            <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">
              Clique no prazo para filtrar as não conformidades
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Card 1: Prazo Imediato (15 dias) */}
            <div 
              onClick={() => handlePrazoCardClick('imediato')}
              className={`p-3.5 sm:p-4 rounded-2xl border-2 transition-all cursor-pointer relative group ${
                filterPrazo === 'imediato'
                  ? 'border-rose-500 bg-rose-50/70 shadow-md ring-2 ring-rose-400/30'
                  : 'border-rose-200/90 bg-white hover:border-rose-300 hover:shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-rose-100 text-rose-900 border border-rose-200">
                  {statsByPrazo.imediato.titulo} • 15 dias
                </span>
                <span className="text-[10px] font-bold text-rose-700">
                  {statsByPrazo.imediato.tag}
                </span>
              </div>

              <div className="flex items-baseline justify-between mt-1">
                <div>
                  <span className="text-2xl sm:text-3xl font-black text-rose-600 font-mono">
                    {statsByPrazo.imediato.nconf}
                  </span>
                  <span className="text-xs font-bold text-slate-600 ml-1.5">
                    não conformes
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-extrabold text-emerald-700 font-mono">
                    {statsByPrazo.imediato.conf} conf.
                  </span>
                  <span className="text-[10px] text-slate-400 block font-medium">
                    de {statsByPrazo.imediato.total} critérios
                  </span>
                </div>
              </div>

              <div className="mt-2.5 pt-2 border-t border-rose-100 flex items-center justify-between text-[10px] font-extrabold text-rose-800">
                <span>{filterPrazo === 'imediato' ? 'Filtro Ativo ✓' : 'Ver não conformidades'}</span>
                <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
              </div>
            </div>

            {/* Card 2: Curto Prazo (60 dias) */}
            <div 
              onClick={() => handlePrazoCardClick('curto')}
              className={`p-3.5 sm:p-4 rounded-2xl border-2 transition-all cursor-pointer relative group ${
                filterPrazo === 'curto'
                  ? 'border-amber-500 bg-amber-50/70 shadow-md ring-2 ring-amber-400/30'
                  : 'border-amber-200/90 bg-white hover:border-amber-300 hover:shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-200">
                  {statsByPrazo.curto.titulo} • 60 dias
                </span>
                <span className="text-[10px] font-bold text-amber-800">
                  {statsByPrazo.curto.tag}
                </span>
              </div>

              <div className="flex items-baseline justify-between mt-1">
                <div>
                  <span className="text-2xl sm:text-3xl font-black text-amber-600 font-mono">
                    {statsByPrazo.curto.nconf}
                  </span>
                  <span className="text-xs font-bold text-slate-600 ml-1.5">
                    não conformes
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-extrabold text-emerald-700 font-mono">
                    {statsByPrazo.curto.conf} conf.
                  </span>
                  <span className="text-[10px] text-slate-400 block font-medium">
                    de {statsByPrazo.curto.total} critérios
                  </span>
                </div>
              </div>

              <div className="mt-2.5 pt-2 border-t border-amber-100 flex items-center justify-between text-[10px] font-extrabold text-amber-900">
                <span>{filterPrazo === 'curto' ? 'Filtro Ativo ✓' : 'Ver não conformidades'}</span>
                <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
              </div>
            </div>

            {/* Card 3: Médio Prazo (120 dias) */}
            <div 
              onClick={() => handlePrazoCardClick('medio')}
              className={`p-3.5 sm:p-4 rounded-2xl border-2 transition-all cursor-pointer relative group ${
                filterPrazo === 'medio'
                  ? 'border-blue-500 bg-blue-50/70 shadow-md ring-2 ring-blue-400/30'
                  : 'border-blue-200/90 bg-white hover:border-blue-300 hover:shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-100 text-blue-900 border border-blue-200">
                  {statsByPrazo.medio.titulo} • 120 dias
                </span>
                <span className="text-[10px] font-bold text-blue-800">
                  {statsByPrazo.medio.tag}
                </span>
              </div>

              <div className="flex items-baseline justify-between mt-1">
                <div>
                  <span className="text-2xl sm:text-3xl font-black text-blue-600 font-mono">
                    {statsByPrazo.medio.nconf}
                  </span>
                  <span className="text-xs font-bold text-slate-600 ml-1.5">
                    não conformes
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-extrabold text-emerald-700 font-mono">
                    {statsByPrazo.medio.conf} conf.
                  </span>
                  <span className="text-[10px] text-slate-400 block font-medium">
                    de {statsByPrazo.medio.total} critérios
                  </span>
                </div>
              </div>

              <div className="mt-2.5 pt-2 border-t border-blue-100 flex items-center justify-between text-[10px] font-extrabold text-blue-900">
                <span>{filterPrazo === 'medio' ? 'Filtro Ativo ✓' : 'Ver não conformidades'}</span>
                <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
              </div>
            </div>
          </div>
        </div>

        {/* BLOCO 3: RAIO-X DOS 5 PRINCÍPIOS RTRS (COMPACTO E INTEGRADO) */}
        <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-2xs">
          <div 
            onClick={() => setShowPrincipiosList(prev => !prev)}
            className="p-3.5 sm:p-4 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between cursor-pointer hover:bg-slate-100/80 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-700" />
              <h3 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wider">
                Raio-X dos 5 Princípios RTRS
              </h3>
              <span className="text-[10px] font-extrabold text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                5 Pilares Oficiais
              </span>
            </div>

            <button type="button" className="text-slate-500 hover:text-slate-800 p-1">
              {showPrincipiosList ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {showPrincipiosList && (
            <div className="p-3.5 sm:p-4 space-y-2.5">
              {secoesStats.map((sec, idx) => {
                const isHigh = sec.percent >= 85;
                const isMed = sec.percent >= 60 && sec.percent < 85;
                const barColor = isHigh ? 'bg-emerald-600' : isMed ? 'bg-amber-500' : 'bg-rose-500';
                const badgeColor = isHigh ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : isMed ? 'text-amber-800 bg-amber-50 border-amber-200' : 'text-rose-700 bg-rose-50 border-rose-200';

                return (
                  <div key={sec.secao} className="p-2.5 rounded-xl border border-slate-200/70 hover:bg-slate-50/60 transition-colors space-y-1.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-900 text-[10px] font-black flex items-center justify-center shrink-0">
                          P{idx + 1}
                        </span>
                        <span className="font-extrabold text-slate-900 truncate">
                          {sec.secao}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <span className="text-[11px] font-bold text-slate-500 font-mono">
                          {sec.conf} conf / {sec.nconf} não conf
                        </span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border font-mono ${badgeColor}`}>
                          {sec.percent}%
                        </span>
                      </div>
                    </div>

                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200/50 p-0.5">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                        style={{ width: `${sec.percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* BLOCO 4: PONTOS DE ATENÇÃO E NÃO CONFORMIDADES (DIRETO E SEM SUB-ABAS) */}
        <div id="secao-nao-conformidades" className="space-y-3 pt-1">
          <div className="bg-slate-50 p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div>
              <h3 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>Pontos de Atenção & Não Conformidades ({naoConformesList.length})</span>
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5">
                Itens que exigem plano de adequação com prazos imediatos, curto ou médio prazo.
              </p>
            </div>

            {/* Chips de Filtro por Prazo */}
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setFilterPrazo('todos')}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-extrabold transition-all cursor-pointer border ${
                  filterPrazo === 'todos'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Todos ({naoConformesList.length})
              </button>

              <button
                type="button"
                onClick={() => setFilterPrazo('imediato')}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-extrabold transition-all cursor-pointer border flex items-center gap-1 ${
                  filterPrazo === 'imediato'
                    ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                    : 'bg-white text-rose-800 border-rose-200 hover:bg-rose-50'
                }`}
              >
                <span>🚨 Imediato ({statsByPrazo.imediato.nconf})</span>
              </button>

              <button
                type="button"
                onClick={() => setFilterPrazo('curto')}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-extrabold transition-all cursor-pointer border flex items-center gap-1 ${
                  filterPrazo === 'curto'
                    ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                    : 'bg-white text-amber-800 border-amber-200 hover:bg-amber-50'
                }`}
              >
                <span>⚠️ Curto Prazo ({statsByPrazo.curto.nconf})</span>
              </button>

              <button
                type="button"
                onClick={() => setFilterPrazo('medio')}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-extrabold transition-all cursor-pointer border flex items-center gap-1 ${
                  filterPrazo === 'medio'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                    : 'bg-white text-blue-800 border-blue-200 hover:bg-blue-50'
                }`}
              >
                <span>ℹ️ Médio Prazo ({statsByPrazo.medio.nconf})</span>
              </button>
            </div>
          </div>

          {/* Busca e Filtro por Princípio */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                value={searchNaoConf}
                onChange={e => setSearchNaoConf(e.target.value)}
                placeholder="Buscar por critério ou texto da não conformidade..."
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <select
              value={filterPrincipio}
              onChange={e => setFilterPrincipio(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer focus:ring-2 focus:ring-emerald-500 shrink-0"
            >
              <option value="todos">Todos os Princípios (P1 a P5)</option>
              {secoesStats.map(s => (
                <option key={s.secao} value={s.secao}>{s.secao}</option>
              ))}
            </select>
          </div>

          {/* Lista de Não Conformidades Filtradas */}
          {filteredNaoConformes.length === 0 ? (
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-6 text-center space-y-1.5 animate-fadeIn">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <h4 className="font-extrabold text-xs sm:text-sm text-emerald-950">
                Nenhuma Não Conformidade neste filtro
              </h4>
              <p className="text-[11px] sm:text-xs text-emerald-800 max-w-md mx-auto font-medium">
                {naoConformesList.length === 0 
                  ? 'Parabéns! A propriedade atendeu a todos os critérios aplicáveis avaliados até o momento.'
                  : 'Nenhum apontamento com os filtros selecionados. Altere os chips acima para visualizar outros itens.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
              {filteredNaoConformes.map(item => {
                const isImediato = item.prazoNormalizado === 'Imediato';
                const isCurto = item.prazoNormalizado === 'Curto Prazo';
                const badgePrazo = isImediato
                  ? { label: 'Prazo Imediato (até 15 dias)', cls: 'bg-rose-100 text-rose-900 border-rose-200' }
                  : isCurto
                  ? { label: 'Curto Prazo (até 60 dias)', cls: 'bg-amber-100 text-amber-900 border-amber-200' }
                  : { label: 'Médio Prazo (até 120 dias)', cls: 'bg-blue-100 text-blue-900 border-blue-200' };

                return (
                  <div
                    key={item.id}
                    className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition-shadow space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                          Critério {item.criterio}
                        </span>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${badgePrazo.cls}`}>
                          {badgePrazo.label}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium truncate max-w-[200px] sm:max-w-none">
                          {item.secao}
                        </span>
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
                      <div className="p-2.5 bg-amber-50/70 rounded-xl border border-amber-200/80 text-xs text-amber-950 space-y-0.5">
                        <span className="font-extrabold text-[10px] text-amber-900 block uppercase tracking-wider">
                          Observação Técnica do Auditor:
                        </span>
                        <p className="italic font-medium leading-relaxed text-[11px] sm:text-xs">
                          "{item.observacao}"
                        </p>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-400 italic">
                        Sem observação textual complementar registrada.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* BARRA INFERIOR DE AÇÕES (quando não embedded) */}
      {!embedded && (
        <div className="bg-slate-100 px-4 sm:px-6 py-3.5 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-700" />
            <span>Visão executiva com prazos e indicadores de adequação RTRS</span>
          </div>

          <div className="flex flex-col-reverse sm:flex-row items-center gap-2.5 w-full sm:w-auto">
            {onBackToQuestions && (
              <button
                type="button"
                onClick={onBackToQuestions}
                className="w-full sm:w-auto px-4 py-2 bg-white hover:bg-slate-200 text-slate-700 rounded-xl font-extrabold text-xs border border-slate-300 transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
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
                className="w-full sm:w-auto px-5 py-2 bg-gradient-to-r from-[#1B7547] to-[#15613a] hover:from-[#15613a] hover:to-[#0B3B23] text-white rounded-xl font-extrabold text-xs shadow-md shadow-[#1B7547]/20 hover:shadow-xl hover:scale-102 active:scale-95 transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
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
                className="w-full sm:w-auto px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-extrabold text-xs transition-all cursor-pointer"
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
