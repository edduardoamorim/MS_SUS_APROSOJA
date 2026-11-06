import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  CheckCircle2, AlertCircle, MinusCircle, X, ShieldCheck, 
  Image as ImageIcon, Search, Loader2, FileText, Award, ClipboardList,
  ArrowRight, RotateCcw, Clock
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { db } from '../../lib/offlineDb';
import { cleanEvidenceUrl, isPdfEvidence } from '../../lib/evidenceService';
import PanoramaScoreRTRS from './PanoramaScoreRTRS';
import ExportarPdfButton from '../ui/ExportarPdfButton';

function compareCriterios(critA: string, critB: string): number {
  const extractParts = (str: string) => {
    if (!str) return [];
    const match = String(str).match(/\d+(?:\.[\da-zA-Z]+)*/);
    const target = match ? match[0] : String(str);
    return target.split('.').map(p => {
      const m = p.match(/^(\d*)([a-zA-Z]*)$/);
      if (m) {
        return { num: m[1] ? parseInt(m[1], 10) : 0, char: m[2] || '' };
      }
      return { num: 0, char: p };
    });
  };

  const partsA = extractParts(critA);
  const partsB = extractParts(critB);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    if (partsA[i] === undefined) return -1;
    if (partsB[i] === undefined) return 1;
    const a = partsA[i];
    const b = partsB[i];
    if (a.num !== b.num) return a.num - b.num;
    if (a.char !== b.char) return a.char.localeCompare(b.char);
  }
  return 0;
}

export interface Props {
  auditoriaId?: string;
  propriedadeId?: string;
  propriedadeNome: string;
  etapaAtual?: 'Prospecção' | 'Auditoria Prévia' | 'Auditoria Oficial' | string;
  statusAtual?: string;
  onClose: () => void;
  onApproveNextStage?: (nextEtapa: 'Auditoria Prévia' | 'Auditoria Oficial', nextStatus: string, parecerGestor?: string) => void;
  onApproveCertify?: (parecerGestor?: string) => void;
  onReject: (motivoReprovacao: string) => void;
  // manter onApprove opcional para retrocompatibilidade se algum outro lugar chamar
  onApprove?: () => void;
}

const SUGESTOES_REPROVACAO = [
  'Faltam evidências fotográficas nos critérios obrigatórios',
  'Necessário plano de adequação detalhado para as Não Conformidades',
  'Revisar enquadramento de critérios marcados como N/A'
];

const MOCK_RESPOSTAS = [
  { id: '1', secao: 'Meio Ambiente', criterio: '1.1', enunciado: 'A propriedade possui reserva legal averbada e protegida?', conforme: true, nao_se_aplica: false, observacao: 'Área devidamente cercada.', evidencia: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=400&h=300&fit=crop' },
  { id: '2', secao: 'Meio Ambiente', criterio: '1.2', enunciado: 'Existe plano de gestão de resíduos sólidos?', conforme: false, nao_se_aplica: false, observacao: 'Falta lixeiras para químicos no galpão norte.', evidencia: null },
  { id: '3', secao: 'Trabalhista', criterio: '2.1', enunciado: 'Trabalhadores utilizam EPI?', conforme: true, nao_se_aplica: false, observacao: 'Verificado na frente de plantio.', evidencia: 'https://images.unsplash.com/photo-1588681664899-f142ff2dc9b1?w=400&h=300&fit=crop' },
];

export default function RevisaoAuditoria({ 
  propriedadeNome, 
  onClose, 
  onApprove, 
  onApproveNextStage,
  onApproveCertify,
  onReject, 
  auditoriaId,
  propriedadeId,
  etapaAtual,
  statusAtual
}: Props) {
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);
  const [respostas, setRespostas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'panorama' | 'detalhes'>('panorama');
  const [showRejectPanel, setShowRejectPanel] = useState(false);
  const [motivoReprovacao, setMotivoReprovacao] = useState('');
  const [rejectError, setRejectError] = useState(false);

  const normalizedEtapa: 'Prospecção' | 'Auditoria Prévia' | 'Auditoria Oficial' =
    etapaAtual === 'Prospecção'
      ? 'Prospecção'
      : etapaAtual === 'Auditoria Prévia'
      ? 'Auditoria Prévia'
      : 'Auditoria Oficial';

  const getEtapaBadgeLabel = (etapa: string) => {
    if (etapa === 'Prospecção') return '1. Prospecção';
    if (etapa === 'Auditoria Prévia') return '2. Auditoria Prévia';
    return '3. Auditoria Oficial';
  };

  const handleConfirmReject = () => {
    const trimmed = motivoReprovacao.trim();
    if (!trimmed) {
      setRejectError(true);
      return;
    }
    setRejectError(false);
    onReject(trimmed);
  };

  const handleApplySuggestion = (sugestao: string) => {
    setRejectError(false);
    setMotivoReprovacao(prev => {
      const clean = prev.trim();
      if (!clean) return sugestao;
      if (clean.includes(sugestao)) return clean;
      return `${clean}; ${sugestao}`;
    });
  };

  useEffect(() => {
    async function fetchRespostas() {
      if (!auditoriaId) {
        setRespostas(MOCK_RESPOSTAS);
        setLoading(false);
        return;
      }
      try {
        let loadedRespostas: any[] = [];
        const isMock = auditoriaId.startsWith('mock-');

        if (!isMock) {
          // Descobre auditorias irmãs pela propriedade_id para consolidação ampla
          let auditIdsToSearch: string[] = [auditoriaId];
          let propId = propriedadeId;

          if (!propId && auditoriaId) {
            try {
              const { data: aRow } = await supabase
                .from('auditorias')
                .select('propriedade_id')
                .eq('id', auditoriaId)
                .maybeSingle();
              if (aRow?.propriedade_id) {
                propId = aRow.propriedade_id;
              }
            } catch {}
          }

          if (propId && !propId.startsWith('mock-')) {
            try {
              const { data: sisterAuds } = await supabase
                .from('auditorias')
                .select('id')
                .eq('propriedade_id', propId);
              if (sisterAuds && sisterAuds.length > 0) {
                auditIdsToSearch = Array.from(new Set([...auditIdsToSearch, ...sisterAuds.map((s: any) => s.id)]));
              }
            } catch {}
          }

          // Tentativa primária no Supabase
          try {
            const { data, error } = await supabase
              .from('respostas_auditoria')
              .select(`
                id,
                auditoria_id,
                conforme,
                nao_se_aplica,
                observacoes,
                evidencia_url,
                updated_at,
                perguntas_rtrs (
                  id,
                  secao,
                  numero_criterio,
                  enunciado,
                  ponderacao
                )
              `)
              .in('auditoria_id', auditIdsToSearch);

            if (!error && data && data.length > 0) {
              const mapByCrit = new Map<string, any>();
              for (const r of data) {
                const critNum = (r.perguntas_rtrs as any)?.numero_criterio || 'N/A';
                const existing = mapByCrit.get(critNum);
                if (!existing) {
                  mapByCrit.set(critNum, r);
                } else {
                  const existingIsDirect = existing.auditoria_id === auditoriaId;
                  const currentIsDirect = r.auditoria_id === auditoriaId;
                  if (!existingIsDirect && currentIsDirect) {
                    mapByCrit.set(critNum, r);
                  } else if (existingIsDirect === currentIsDirect) {
                    const timeEx = new Date(existing.updated_at || 0).getTime();
                    const timeCur = new Date(r.updated_at || 0).getTime();
                    if (timeCur > timeEx) {
                      mapByCrit.set(critNum, r);
                    }
                  }
                }
              }

              loadedRespostas = Array.from(mapByCrit.values()).map((r: any) => ({
                id: r.id,
                secao: (r.perguntas_rtrs as any)?.secao || 'Geral',
                criterio: (r.perguntas_rtrs as any)?.numero_criterio || 'N/A',
                enunciado: (r.perguntas_rtrs as any)?.enunciado || '',
                ponderacao: (r.perguntas_rtrs as any)?.ponderacao || 'Imediata',
                conforme: r.conforme === true || r.conforme === 'true' || r.conforme === 1,
                nao_se_aplica: r.nao_se_aplica === true || r.nao_se_aplica === 'true' || r.nao_se_aplica === 1,
                observacao: (r as any).observacoes || (r as any).observacao || 'Nenhum comentário.',
                evidencia: cleanEvidenceUrl(r.evidencia_url)
              }));
            }
          } catch (supabaseErr) {
            console.warn('Falha de rede ao consultar respostas no Supabase:', supabaseErr);
          }

          // Fallback para Dexie local se Supabase estiver offline ou retornar vazio
          if (loadedRespostas.length === 0) {
            try {
              const local = await db.cached_respostas
                .filter(r => auditIdsToSearch.includes(r.auditoria_id))
                .toArray();

              if (local && local.length > 0) {
                let perguntasMap = new Map();
                try {
                  const cachedPerguntas = await db.cached_perguntas.toArray();
                  cachedPerguntas.forEach(p => perguntasMap.set(p.id, p));
                } catch (dexErr) {
                  console.warn('Erro ao carregar perguntas do Dexie:', dexErr);
                }

                const mapByCrit = new Map<string, any>();
                for (const r of local) {
                  const p = perguntasMap.get(r.pergunta_id);
                  const crit = p?.numero_criterio || r.numero_criterio || 'N/A';
                  const item = {
                    id: r.id || `${r.auditoria_id}_${r.pergunta_id}`,
                    secao: p?.secao || 'Geral',
                    criterio: crit,
                    enunciado: p?.enunciado || '',
                    ponderacao: p?.ponderacao || 'Imediata',
                    conforme: (r.conforme as any) === true || (r.conforme as any) === 'true' || (r.conforme as any) === 1,
                    nao_se_aplica: (r.nao_se_aplica as any) === true || (r.nao_se_aplica as any) === 'true' || (r.nao_se_aplica as any) === 1,
                    observacao: r.observacoes || (r as any).observacao || 'Nenhum comentário.',
                    evidencia: cleanEvidenceUrl(r.evidencia_url),
                    auditoria_id: r.auditoria_id,
                    updated_at: r.updated_at
                  };

                  const existing = mapByCrit.get(crit);
                  if (!existing) {
                    mapByCrit.set(crit, item);
                  } else {
                    const existingIsDirect = existing.auditoria_id === auditoriaId;
                    const currentIsDirect = item.auditoria_id === auditoriaId;
                    if (!existingIsDirect && currentIsDirect) {
                      mapByCrit.set(crit, item);
                    } else if (existingIsDirect === currentIsDirect) {
                      const timeEx = new Date(existing.updated_at || 0).getTime();
                      const timeCur = new Date(item.updated_at || 0).getTime();
                      if (timeCur > timeEx) {
                        mapByCrit.set(crit, item);
                      }
                    }
                  }
                }

                loadedRespostas = Array.from(mapByCrit.values());
              }
            } catch (dexieErr) {
              console.warn('Aviso ao consultar Dexie cached_respostas:', dexieErr);
            }
          }

          if (loadedRespostas.length > 0) {
            loadedRespostas.sort((a, b) => compareCriterios(a.criterio, b.criterio));
            setRespostas(loadedRespostas);
          } else {
            setRespostas([]);
          }
        } else {
          setRespostas(MOCK_RESPOSTAS);
        }
      } catch (err) {
        console.error('Erro ao carregar respostas:', err);
        setRespostas([]);
      } finally {
        setLoading(false);
      }
    }

    fetchRespostas();
    const handleRecheck = () => {
      if (document.visibilityState === 'visible') fetchRespostas();
    };
    window.addEventListener('ms:sync-complete', fetchRespostas);
    window.addEventListener('ms:outbox-changed', fetchRespostas);
    document.addEventListener('visibilitychange', handleRecheck);
    return () => {
      window.removeEventListener('ms:sync-complete', fetchRespostas);
      window.removeEventListener('ms:outbox-changed', fetchRespostas);
      document.removeEventListener('visibilitychange', handleRecheck);
    };
  }, [auditoriaId, propriedadeId]);

  const getScore = () => {
    if (!respostas || respostas.length === 0) return 0;
    const aplicaveis = respostas.filter(r => !r.nao_se_aplica);
    if (aplicaveis.length === 0) return 100;
    const conformes = aplicaveis.filter(r => !!r.conforme).length;
    return Math.round((conformes / aplicaveis.length) * 100);
  };

  const scoreVal = getScore();
  const conformesCount = respostas.filter(r => r.conforme && !r.nao_se_aplica).length;
  const naoConformesCount = respostas.filter(r => !r.conforme && !r.nao_se_aplica).length;
  const naoSeAplicaCount = respostas.filter(r => r.nao_se_aplica).length;

  const getParecerGeral = () => {
    if (respostas.length === 0) {
      return "Aguardando preenchimento dos indicadores técnicos de campo.";
    }
    if (scoreVal >= 80 && naoConformesCount === 0) {
      return `Propriedade com excelência técnica socioambiental (${scoreVal}%). Todos os critérios avaliados atendem plenamente às exigências RTRS, estando apta para homologação e emissão do certificado.`;
    }
    if (scoreVal >= 80) {
      return `Propriedade com alto índice de conformidade (${scoreVal}%). Foram constatadas ${naoConformesCount} não conformidade(s) pontuais que demandam plano de ação corretiva continuado.`;
    }
    if (scoreVal >= 50) {
      return `Propriedade em processo de adequação (${scoreVal}%). Identificados ${naoConformesCount} pontos de atenção que requerem plano de regularização socioambiental antes da auditoria de certificação final.`;
    }
    return `Propriedade com baixo índice de conformidade inicial (${scoreVal}%). Identificadas ${naoConformesCount} não conformidades críticas. Necessário acompanhamento técnico ostensivo.`;
  };

  return createPortal(
    <div className="fixed inset-0 z-50 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      {/* Modal Principal */}
      <div className="bg-white w-full max-w-4xl max-h-[92vh] sm:max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
        
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 bg-gradient-to-r from-[#1B7547] via-[#16633b] to-slate-900 text-white flex justify-between items-center gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <ShieldCheck className="w-7 h-7 sm:w-8 h-8 text-emerald-300 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-xl font-black uppercase tracking-wide truncate">Deliberação Executiva RTRS</h2>
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${
                  normalizedEtapa === 'Prospecção'
                    ? 'bg-amber-400/20 text-amber-200 border-amber-300/40'
                    : normalizedEtapa === 'Auditoria Prévia'
                    ? 'bg-blue-400/20 text-blue-200 border-blue-300/40'
                    : 'bg-emerald-400/20 text-emerald-200 border-emerald-300/40'
                }`}>
                  {getEtapaBadgeLabel(normalizedEtapa)}
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-amber-500/25 text-amber-200 border border-amber-400/40">
                  <Clock className="w-3 h-3 animate-pulse" />
                  <span>{statusAtual || 'Aguardando Aprovação'}</span>
                </span>
              </div>
              <p className="text-emerald-100/80 text-xs sm:text-sm truncate mt-0.5">{propriedadeNome} - Relatório da Vistoria</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ExportarPdfButton
              auditoriaId={auditoriaId}
              propriedadeId={propriedadeId}
              propriedadeNome={propriedadeNome}
              status={statusAtual || 'Aguardando Aprovação'}
              variant="header"
            />
            <button 
              type="button" 
              onClick={onClose} 
              className="p-2 hover:bg-white/10 rounded-full transition-colors text-white shrink-0 cursor-pointer"
              aria-label="Fechar"
            >
              <X className="w-5 h-5 sm:w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Abas Superiores de Visualização */}
        <div className="bg-slate-100 border-b border-slate-200 px-6 pt-3 flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('panorama')}
            className={`px-4 py-2 rounded-t-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'panorama'
                ? 'bg-white text-[#1B7547] shadow-xs border-t-2 border-[#1B7547]'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <Award className="w-4 h-4 text-[#C59B27]" />
            <span>Panorama & Score RTRS</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              {scoreVal}%
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('detalhes')}
            className={`px-4 py-2 rounded-t-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'detalhes'
                ? 'bg-white text-[#1B7547] shadow-xs border-t-2 border-[#1B7547]'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            <span>Evidências por Critério ({respostas.length})</span>
          </button>
        </div>

        {/* Parecer Técnico do Auditor & Síntese Rápida */}
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-emerald-100 text-[#1B7547] shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                Parecer Técnico do Auditor
              </span>
              <p className="text-xs text-slate-800 font-medium italic truncate max-w-xl">
                "{getParecerGeral()}"
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <span className={`px-2.5 py-1 rounded-xl text-xs font-black font-mono border ${
              scoreVal >= 80 ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : scoreVal >= 50 ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}>
              {scoreVal}% Conformidade
            </span>
            <span className="text-[11px] font-bold text-slate-600 bg-white px-2.5 py-1 rounded-xl border border-slate-200 font-mono">
              {conformesCount} Conf / {naoConformesCount} Não Conf
            </span>
          </div>
        </div>

        {/* Conteúdo das Abas (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-white">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-[#1B7547]">
              <Loader2 className="w-8 h-8 animate-spin mb-2" />
              <p className="text-xs font-extrabold text-slate-600">Carregando indicadores do banco de dados...</p>
            </div>
          ) : respostas.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-xs font-medium">
              Nenhuma resposta registrada para esta auditoria.
            </div>
          ) : activeTab === 'panorama' ? (
            <div className="space-y-4">
              <PanoramaScoreRTRS
                propriedadeNome={propriedadeNome}
                criterios={respostas}
                readOnly={true}
                embedded={true}
                etapa={(etapaAtual as any) || 'Auditoria Oficial'}
              />
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-2">
                Checklist dos 115 Critérios Avaliados
              </h3>
              
              {respostas.map((resp) => (
                <div key={resp.id} className="border border-slate-200/90 rounded-2xl overflow-hidden flex flex-col md:flex-row shadow-2xs hover:shadow-xs transition-shadow">
                  {/* Esquerda: Pergunta e Status */}
                  <div className="flex-1 p-4 bg-slate-50/50">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-[10px] font-extrabold uppercase">{resp.secao}</span>
                      <span className="font-bold text-slate-500 text-xs">Critério {resp.criterio}</span>
                      {(() => {
                        const pond = (resp.ponderacao || '').toLowerCase();
                        if (pond.includes('imediat')) {
                          return (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded bg-rose-100 text-rose-900 border border-rose-200 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-rose-600" />
                              <span>Prazo Imediato (15d)</span>
                            </span>
                          );
                        }
                        if (pond.includes('curto')) {
                          return (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-600" />
                              <span>Curto Prazo (60d)</span>
                            </span>
                          );
                        }
                        return (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded bg-blue-100 text-blue-900 border border-blue-200 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-blue-600" />
                            <span>Médio Prazo (120d)</span>
                          </span>
                        );
                      })()}
                    </div>
                    <p className="font-bold text-slate-900 text-xs sm:text-sm mb-3 leading-snug">{resp.enunciado}</p>
                    
                    <div className="flex items-start gap-2 mb-2">
                      {resp.nao_se_aplica ? (
                        <MinusCircle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                      ) : resp.conforme ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <span className={`text-xs font-bold ${resp.nao_se_aplica ? 'text-slate-600' : resp.conforme ? 'text-emerald-700' : 'text-red-700'}`}>
                          {resp.nao_se_aplica ? 'Não se Aplica' : resp.conforme ? 'Conforme' : 'Não Conforme'}
                        </span>
                        <p className="text-xs text-slate-600 mt-0.5 leading-normal">
                          <span className="font-semibold text-slate-800">Obs do Auditor:</span> {resp.observacao}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Direita: Foto/Evidência */}
                  <div className="w-full md:w-64 bg-slate-100 border-t md:border-t-0 md:border-l border-slate-200 flex flex-col items-center justify-center p-3">
                    <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-2">Evidência Anexada</span>
                    {resp.evidencia ? (
                      isPdfEvidence(resp.evidencia) ? (
                        <a
                          href={resp.evidencia}
                          target="_blank"
                          rel="noreferrer"
                          className="w-full h-24 border border-slate-200 rounded-xl flex flex-col items-center justify-center bg-white text-[#1B7547] hover:bg-slate-50 transition-colors shadow-2xs"
                        >
                          <FileText className="w-6 h-6 mb-1" />
                          <span className="text-[11px] font-bold text-center px-2 truncate w-full">Ver PDF Anexado</span>
                        </a>
                      ) : (
                        <div 
                          className="relative w-full h-24 rounded-xl overflow-hidden cursor-pointer group shadow-2xs"
                          onClick={() => setFotoAmpliada(resp.evidencia)}
                        >
                          <img src={resp.evidencia} alt="Evidência" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Search className="text-white w-5 h-5" />
                          </div>
                        </div>
                      )
                    ) : (
                      <div className="w-full h-24 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center text-slate-400">
                        <ImageIcon className="w-5 h-5 mb-1" />
                        <span className="text-[11px] font-medium">Sem Arquivo</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer: Botões de Decisão & Painel Expansível de Reprovação */}
        <div className="px-5 sm:px-6 py-4 bg-slate-50 border-t border-slate-200 shrink-0 space-y-3">
          {showRejectPanel && (
            <div className="bg-red-50/90 border border-red-200 rounded-2xl p-4 space-y-3 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-red-800">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <h4 className="text-xs font-extrabold uppercase tracking-wider">
                    Reprovação / Solicitação de Ajustes ao Técnico ({getEtapaBadgeLabel(normalizedEtapa)})
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowRejectPanel(false);
                    setRejectError(false);
                  }}
                  className="text-xs font-bold text-red-700 hover:text-red-900 px-2 py-0.5 rounded-lg hover:bg-red-100 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
              </div>

              {/* Sugestões Rápidas Clicáveis */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-red-700/80 block">
                  Sugestões rápidas de ajustes (clique para inserir):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {SUGESTOES_REPROVACAO.map((sugestao) => (
                    <button
                      key={sugestao}
                      type="button"
                      onClick={() => handleApplySuggestion(sugestao)}
                      className="text-[11px] font-bold bg-white hover:bg-red-100 text-red-800 border border-red-200 px-2.5 py-1 rounded-xl transition-all active:scale-95 cursor-pointer text-left shadow-2xs"
                    >
                      + {sugestao}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <textarea
                  rows={2}
                  value={motivoReprovacao}
                  onChange={(e) => {
                    setMotivoReprovacao(e.target.value);
                    if (e.target.value.trim()) setRejectError(false);
                  }}
                  placeholder="Informe o motivo da reprovação ou os ajustes que o Técnico deve realizar nesta etapa..."
                  className={`w-full p-3 bg-white border rounded-xl text-xs font-medium text-slate-800 outline-none focus:ring-2 transition-all ${
                    rejectError
                      ? 'border-red-500 focus:ring-red-400'
                      : 'border-red-200 focus:ring-red-300'
                  }`}
                />
                {rejectError && (
                  <p className="text-[11px] font-bold text-red-600 mt-1">
                    É obrigatório informar o motivo da reprovação ou os ajustes solicitados antes de devolver ao técnico.
                  </p>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleConfirmReject}
                  className="w-full sm:w-auto min-h-[42px] inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-extrabold text-xs shadow-md shadow-red-600/20 transition-all active:scale-95 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Confirmar Reprovação e Devolver ao Técnico</span>
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row justify-between items-stretch sm:items-center gap-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-2xl font-extrabold text-xs transition-all duration-300 active:scale-95 cursor-pointer flex items-center justify-center"
              >
                <span>Fechar</span>
              </button>
              <button
                type="button"
                onClick={() => setShowRejectPanel((prev) => !prev)}
                className={`group relative w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 px-5 py-2.5 border rounded-2xl font-extrabold text-xs transition-all duration-300 active:scale-95 shadow-2xs cursor-pointer overflow-hidden ${
                  showRejectPanel
                    ? 'bg-red-100 border-red-300 text-red-800'
                    : 'bg-white border-red-200 text-red-700 hover:bg-red-50 hover:border-red-300'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reprovar / Solicitar Ajustes</span>
              </button>
            </div>

            {/* Botões de Aprovação Inteligentes conforme a Etapa Atual */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              {normalizedEtapa === 'Prospecção' && (
                <>
                  <button
                    type="button"
                    onClick={() => (onApproveCertify ? onApproveCertify() : onApprove?.())}
                    className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-50/80 hover:bg-amber-100 text-[#9A7414] border border-[#C59B27]/50 rounded-2xl font-extrabold text-xs transition-all duration-300 active:scale-95 cursor-pointer shadow-2xs"
                  >
                    <Award className="w-4 h-4 text-[#C59B27]" />
                    <span>Homologar Certificação Direto</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onApproveNextStage
                        ? onApproveNextStage('Auditoria Prévia', 'Visita de Campo')
                        : onApprove?.()
                    }
                    className="group relative w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-[#1B7547] to-[#15613a] hover:from-[#15613a] hover:to-[#0B3B23] text-white shadow-md shadow-[#1B7547]/20 hover:shadow-xl rounded-2xl font-extrabold text-xs transition-all duration-300 active:scale-95 cursor-pointer overflow-hidden"
                  >
                    <span className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out pointer-events-none" />
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Aprovar para 2ª Etapa (Auditoria Prévia)</span>
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1 duration-300" />
                  </button>
                </>
              )}

              {normalizedEtapa === 'Auditoria Prévia' && (
                <>
                  <button
                    type="button"
                    onClick={() => (onApproveCertify ? onApproveCertify() : onApprove?.())}
                    className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-50/80 hover:bg-amber-100 text-[#9A7414] border border-[#C59B27]/50 rounded-2xl font-extrabold text-xs transition-all duration-300 active:scale-95 cursor-pointer shadow-2xs"
                  >
                    <Award className="w-4 h-4 text-[#C59B27]" />
                    <span>Homologar Certificação Direto</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onApproveNextStage
                        ? onApproveNextStage('Auditoria Oficial', 'Visita de Campo')
                        : onApprove?.()
                    }
                    className="group relative w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-[#1B7547] to-[#15613a] hover:from-[#15613a] hover:to-[#0B3B23] text-white shadow-md shadow-[#1B7547]/20 hover:shadow-xl rounded-2xl font-extrabold text-xs transition-all duration-300 active:scale-95 cursor-pointer overflow-hidden"
                  >
                    <span className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out pointer-events-none" />
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Aprovar para 3ª Etapa (Auditoria Oficial)</span>
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1 duration-300" />
                  </button>
                </>
              )}

              {normalizedEtapa === 'Auditoria Oficial' && (
                <button
                  type="button"
                  onClick={() => (onApproveCertify ? onApproveCertify() : onApprove?.())}
                  className="group relative w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 px-7 py-2.5 bg-gradient-to-r from-[#1B7547] to-[#15613a] hover:from-[#15613a] hover:to-[#0B3B23] text-white shadow-md shadow-[#1B7547]/20 hover:shadow-xl rounded-2xl font-extrabold text-xs transition-all duration-300 active:scale-95 cursor-pointer overflow-hidden"
                >
                  <span className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out pointer-events-none" />
                  <ShieldCheck className="w-4 h-4 transition-transform group-hover:scale-110 duration-300" />
                  <span>Homologar & Certificar RTRS</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox para ampliar a foto */}
      {fotoAmpliada && (
        <div 
          className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out animate-fadeIn transition-all"
          onClick={() => setFotoAmpliada(null)}
        >
          <img src={fotoAmpliada} alt="Evidência Ampliada" className="max-w-full max-h-[90vh] rounded-2xl shadow-2xl border border-slate-700/60 bg-slate-900/40" />
        </div>
      )}
    </div>,
    document.body
  );
}