import { useState, useEffect } from 'react';
import { 
  X, 
  MapPin, 
  Calendar, 
  User, 
  Phone, 
  Mail, 
  CheckCircle2, 
  Clock, 
  ClipboardList, 
  AlertTriangle, 
  FileText, 
  Building2, 
  ShieldCheck,
  Sparkles,
  Eye,
  Download,
  Image as ImageIcon,
  ExternalLink,
  MinusCircle,
  AlertCircle,
  Award
} from 'lucide-react';
import PanoramaScoreRTRS from './PanoramaScoreRTRS';
import { resolveFarmEtapa } from '../../lib/etapaUtils';
import { supabase } from '../../lib/supabase';
import { db } from '../../lib/offlineDb';
import Modal from '../ui/Modal';
import { resolveMunicipioFromCarOrName } from '../../lib/geoUtils';
import { formatUltimaAlteracao } from '../../lib/dateUtils';
import { cleanEvidenceUrl, isPdfEvidence } from '../../lib/evidenceService';

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

interface Props {
  isOpen: boolean;
  onClose: () => void;
  auditoria: any;
  onStartVisita: (auditoria: any) => void;
  onOpenPendencias: (propriedade: any) => void;
}

export default function AuditDetailModal({ isOpen, onClose, auditoria, onStartVisita, onOpenPendencias }: Props) {
  const [loading, setLoading] = useState(true);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [pendenciasCount, setPendenciasCount] = useState(0);
  const [producerInfo, setProducerInfo] = useState<any>(null);
  const [farmDetails, setFarmDetails] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'panorama' | 'geral' | 'criterios'>('panorama');
  const [criteriosList, setCriteriosList] = useState<any[]>([]);
  const [previewMedia, setPreviewMedia] = useState<string | null>(null);

  const totalQuestions = 115;
  const prop = Array.isArray(auditoria?.propriedades) ? auditoria.propriedades[0] : auditoria?.propriedades;
  const propId = auditoria?.propriedade_id || prop?.id;
  const isMockAudit = typeof auditoria?.id === 'string' && auditoria.id.startsWith('mock-');

  useEffect(() => {
    if (isOpen && auditoria) {
      fetchAuditDetails();
    }
  }, [isOpen, auditoria]);

  async function fetchAuditDetails() {
    setLoading(true);
    try {
      // 1. Contar respostas e carregar critérios avaliados
      let loadedCriterios: any[] = [];
      const currentAuditId = auditoria?.id;

      if (currentAuditId && !isMockAudit) {
        // Tentativa primária: buscar respostas desta auditoria no Supabase
        try {
          const { count, data: respData, error: ansErr } = await supabase
            .from('respostas_auditoria')
            .select(`
              id,
              conforme,
              nao_se_aplica,
              observacoes,
              evidencia_url,
              perguntas_rtrs (
                secao,
                numero_criterio,
                enunciado
              )
            `, { count: 'exact' })
            .eq('auditoria_id', currentAuditId);
          
          if (!ansErr && respData && respData.length > 0) {
            loadedCriterios = respData.map(r => ({
              id: r.id,
              secao: (r.perguntas_rtrs as any)?.secao || 'Geral',
              criterio: (r.perguntas_rtrs as any)?.numero_criterio || '1.1',
              enunciado: (r.perguntas_rtrs as any)?.enunciado || 'Critério de Conformidade RTRS',
              conforme: !!r.conforme,
              nao_se_aplica: !!r.nao_se_aplica,
              observacao: (r as any).observacoes || (r as any).observacao || '',
              evidencia: cleanEvidenceUrl(r.evidencia_url)
            }));
          }
        } catch (supabaseErr) {
          console.warn('Aviso de rede ao buscar respostas no Supabase:', supabaseErr);
        }

        // Consolidação ampla com auditorias irmãs da mesma propriedade no Supabase
        if (propId && typeof propId === 'string' && !propId.startsWith('mock-')) {
          try {
            const { data: propAuds } = await supabase
              .from('auditorias')
              .select('id')
              .eq('propriedade_id', propId);

            const otherAuditIds = (propAuds || [])
              .map(a => a.id)
              .filter(id => id && id !== currentAuditId);

            if (otherAuditIds.length > 0) {
              const { data: propRespData } = await supabase
                .from('respostas_auditoria')
                .select(`
                  id,
                  conforme,
                  nao_se_aplica,
                  observacoes,
                  evidencia_url,
                  perguntas_rtrs (
                    secao,
                    numero_criterio,
                    enunciado
                  )
                `)
                .in('auditoria_id', otherAuditIds);

              if (propRespData && propRespData.length > 0) {
                const sisterCriterios = propRespData.map(r => ({
                  id: r.id,
                  secao: (r.perguntas_rtrs as any)?.secao || 'Geral',
                  criterio: (r.perguntas_rtrs as any)?.numero_criterio || '1.1',
                  enunciado: (r.perguntas_rtrs as any)?.enunciado || 'Critério de Conformidade RTRS',
                  conforme: !!r.conforme,
                  nao_se_aplica: !!r.nao_se_aplica,
                  observacao: (r as any).observacoes || (r as any).observacao || '',
                  evidencia: cleanEvidenceUrl(r.evidencia_url)
                }));
                loadedCriterios = [...loadedCriterios, ...sisterCriterios];
              }
            }
          } catch (propErr) {
            console.warn('Aviso ao buscar auditorias vinculadas à propriedade no Supabase:', propErr);
          }
        }

        // Suporte Offline / Mesclagem com Dexie local (db.cached_respostas)
        try {
          let localResps: any[] = [];
          if (currentAuditId) {
            const curResps = await db.cached_respostas
              .where('auditoria_id')
              .equals(currentAuditId)
              .toArray();
            if (curResps) localResps.push(...curResps);
          }

          if (propId) {
            const localAuds = await db.cached_auditorias
              .where('propriedade_id')
              .equals(propId)
              .toArray();

            const otherLocalAudIds = localAuds
              .map(a => a.id)
              .filter(id => id && id !== currentAuditId);

            for (const otherAudId of otherLocalAudIds) {
              const audResps = await db.cached_respostas
                .where('auditoria_id')
                .equals(otherAudId)
                .toArray();
              if (audResps && audResps.length > 0) {
                localResps.push(...audResps);
              }
            }
          }

          if (localResps.length > 0) {
            let perguntasMap = new Map();
            try {
              const allPergs = await db.cached_perguntas.toArray();
              allPergs.forEach(p => perguntasMap.set(p.id, p));
            } catch (dexErr) {
              console.warn('Erro ao carregar perguntas do cache:', dexErr);
            }

            const localCriterios = localResps.map(r => {
              const p = perguntasMap.get(r.pergunta_id);
              return {
                id: r.id || `${r.auditoria_id}_${r.pergunta_id}`,
                secao: p?.secao || 'Geral',
                criterio: p?.numero_criterio || r.numero_criterio || '1.1',
                enunciado: p?.enunciado || 'Critério de Conformidade RTRS',
                conforme: !!r.conforme,
                nao_se_aplica: !!r.nao_se_aplica,
                observacao: r.observacoes || (r as any).observacao || '',
                evidencia: cleanEvidenceUrl(r.evidencia_url)
              };
            });
            loadedCriterios = [...loadedCriterios, ...localCriterios];
          }
        } catch (dexieErr) {
          console.warn('Aviso ao consultar respostas locais no Dexie:', dexieErr);
        }

        // Deduplicação inteligente por número de critério priorizando evidência e dados preenchidos
        const uniqueMap = new Map<string, any>();
        for (const crit of loadedCriterios) {
          const key = crit.criterio || crit.id;
          if (!uniqueMap.has(key)) {
            uniqueMap.set(key, crit);
          } else {
            const existing = uniqueMap.get(key);
            const preferNew = (!existing.evidencia && !!crit.evidencia) || (!existing.observacao && !!crit.observacao);
            if (preferNew) {
              uniqueMap.set(key, { ...existing, ...crit });
            } else if (crit.evidencia && !existing.evidencia) {
              existing.evidencia = crit.evidencia;
            }
          }
        }
        const uniqueList: any[] = Array.from(uniqueMap.values());

        // Ordenação garantida por critério (ex: 1.1, 1.1.1, etc.)
        uniqueList.sort((a, b) => compareCriterios(a.criterio, b.criterio));
        setCriteriosList(uniqueList);
        setAnsweredCount(uniqueList.length);
      } else if (isMockAudit) {
        setCriteriosList(mockCriteriosFallback);
        setAnsweredCount(mockCriteriosFallback.length);
      } else {
        setCriteriosList([]);
        setAnsweredCount(0);
      }

      // 2. Contar pendências ativas da propriedade
      if (propId && typeof propId === 'string' && !propId.startsWith('mock-')) {
        const { count: pCount } = await supabase
          .from('pendencias')
          .select('id', { count: 'exact', head: true })
          .eq('propriedade_id', propId);
        
        setPendenciasCount(pCount || 0);

        // 3. Buscar informações completas da propriedade
        const { data: propData } = await supabase
          .from('propriedades')
          .select('*')
          .eq('id', propId)
          .single();

        if (propData) {
          setFarmDetails(propData);
        }

        // 4. Buscar dados do produtor responsável com segurança
        if (propData?.produtor_id) {
          const { data: prodData } = await supabase
            .from('perfis')
            .select('nome, email, telefone, regiao')
            .eq('id', propData.produtor_id)
            .maybeSingle();

          if (prodData) {
            setProducerInfo(prodData);
          }
        } else if (propData?.nome_produtor) {
          const { data: prodData } = await supabase
            .from('perfis')
            .select('nome, email, telefone, regiao')
            .eq('nome', propData.nome_produtor)
            .maybeSingle();

          if (prodData) {
            setProducerInfo(prodData);
          }
        }
      }
    } catch (err) {
      console.warn('Aviso ao buscar detalhes da auditoria:', err);
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen || !auditoria) return null;

  const farmName = prop?.nome_fazenda || farmDetails?.nome_fazenda || 'Fazenda MS';
  const rawProducerName = producerInfo?.nome || prop?.nome_produtor || farmDetails?.nome_produtor;
  const producerName = typeof rawProducerName === 'string' && rawProducerName.trim() ? rawProducerName : 'Produtor Rural';
  
  const rawEmail = producerInfo?.email || farmDetails?.email_produtor || prop?.email;
  const producerEmail = rawEmail && typeof rawEmail === 'string' && rawEmail.trim().length > 0 && !rawEmail.includes('edward.produtor@aprosojams.org.br') 
    ? rawEmail.trim() 
    : 'Não informado';

  const rawPhone = producerInfo?.telefone || producerInfo?.whatsapp || farmDetails?.telefone_produtor || prop?.telefone;
  const producerPhone = rawPhone && typeof rawPhone === 'string' && rawPhone.trim().length > 0 
    ? rawPhone.trim() 
    : 'Não informado';
  const hasValidPhone = producerPhone !== 'Não informado';

  const carCode = prop?.codigo_car || farmDetails?.codigo_car || null;
  const sigefCode = prop?.codigo_sigef || farmDetails?.codigo_sigef || null;
  const origemCadastro = prop?.origem_cadastro || farmDetails?.origem_cadastro || (sigefCode ? 'SIGEF' : carCode ? 'CAR' : 'Manual');

  const municipioName = resolveMunicipioFromCarOrName(carCode, farmName, prop?.municipio || farmDetails?.municipio);
  const effectivePropId = propId || farmDetails?.id || auditoria?.id;
  const isCompletedOrReview = auditoria.status === 'Aguardando Aprovação' || auditoria.status === 'Certificada' || (criteriosList.length >= totalQuestions && totalQuestions > 0);
  const etapaName = resolveFarmEtapa(
    effectivePropId,
    prop?.etapa || farmDetails?.etapa,
    auditoria.etapa || (isCompletedOrReview ? 'Auditoria Oficial' : undefined)
  );
  
  const formattedDate = auditoria.data_agendamento
    ? new Date(auditoria.data_agendamento).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  const mockCriteriosFallback = [
    { id: 'm1', secao: 'Princípio 1: Legislação & Negócios', criterio: '1.1', enunciado: 'A propriedade possui reserva legal averbada e protegida?', conforme: true, nao_se_aplica: false, observacao: 'Área devidamente delimitada e preservada.', evidencia: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=400&h=300&fit=crop' },
    { id: 'm2', secao: 'Princípio 2: Condições Trabalhistas', criterio: '2.1', enunciado: 'Todos os colaboradores possuem EPI completo e registro?', conforme: true, nao_se_aplica: false, observacao: 'Treinamentos e fichas de entrega conferidas.', evidencia: 'https://images.unsplash.com/photo-1588681664899-f142ff2dc9b1?w=400&h=300&fit=crop' },
    { id: 'm3', secao: 'Princípio 4: Gestão Ambiental', criterio: '4.2', enunciado: 'Existe sistema de descarte correto para embalagens de defensivos?', conforme: false, nao_se_aplica: false, observacao: 'Necessita ampliação do depósito de descarte tríplice lavagem.', evidencia: null }
  ];

  // Apenas auditorias mock usam fallback simulado; auditorias reais exibem estritamente as respostas encontradas
  const displayCriterios = criteriosList.length > 0 
    ? criteriosList 
    : (isMockAudit ? mockCriteriosFallback : []);

  const conformesCount = displayCriterios.filter(c => c.conforme && !c.nao_se_aplica).length;
  const naoConformesCount = displayCriterios.filter(c => !c.conforme && !c.nao_se_aplica).length;
  const naoSeAplicaCount = displayCriterios.filter(c => c.nao_se_aplica).length;
  const effectiveAnsweredCount = displayCriterios.length;
  const effectivePendenciasCount = Math.max(pendenciasCount, naoConformesCount);

  const progressPercent = Math.min(100, Math.round((effectiveAnsweredCount / totalQuestions) * 100));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      maxWidth="max-w-3xl"
    >
      <div className="space-y-5">
        {/* Header do Card com gradiente corporativo APROSOJA e Título Responsivo */}
        <div className="relative -mx-6 -mt-6 p-4 sm:p-6 bg-gradient-to-r from-[#1B7547] via-[#16633b] to-[#0f4d2c] text-white rounded-t-xl overflow-hidden shadow-sm">
          <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-white/5 skew-x-12 transform origin-top-right pointer-events-none" />
          
          <div className="flex justify-between items-start gap-3 relative z-10">
            <div className="min-w-0 flex-1 pr-2">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 text-white px-2.5 py-0.5 rounded-full backdrop-blur-sm border border-white/20">
                  Ficha Técnica da Auditoria RTRS
                </span>
                <span className="text-[10px] font-semibold bg-[#C59B27] text-white px-2.5 py-0.5 rounded-full shadow-sm">
                  {auditoria.status || 'Visita de Campo'}
                </span>
              </div>
              <h2 className="text-lg sm:text-2xl font-extrabold text-white tracking-tight mt-1 truncate" title={farmName}>
                {farmName}
              </h2>
              <p className="text-xs text-emerald-100 flex flex-wrap items-center gap-1.5 mt-1 font-medium">
                <MapPin className="w-3.5 h-3.5 text-[#C59B27] shrink-0" />
                <span className="truncate max-w-[120px] sm:max-w-none">{municipioName}</span>
                <span>•</span>
                <span className="truncate max-w-[160px] sm:max-w-none">Produtor: <strong>{producerName}</strong></span>
              </p>

              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/10 text-[11px] text-emerald-100 font-medium">
                <Clock className="w-3.5 h-3.5 text-[#C59B27] shrink-0" />
                <span>Última alteração:</span>
                <strong className="text-white font-extrabold">{formatUltimaAlteracao(auditoria.ultima_alteracao_at || auditoria.updated_at || auditoria.created_at).badgeText}</strong>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer shrink-0 z-20"
              aria-label="Fechar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Abas Internas com Rolagem Horizontal Suave */}
        <div className="border-b border-slate-200 -mx-6 px-4 sm:px-6">
          <div className="flex whitespace-nowrap overflow-x-auto no-scrollbar gap-2 pb-2">
            <button
              type="button"
              onClick={() => setActiveTab('panorama')}
              className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'panorama'
                  ? 'bg-[#1B7547] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Award className="w-3.5 h-3.5 text-[#C59B27]" />
              <span>Panorama & Pontuação RTRS</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                activeTab === 'panorama' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
              }`}>
                {displayCriterios.length > 0 && (conformesCount + naoConformesCount) > 0
                  ? `${Math.round((conformesCount / (conformesCount + naoConformesCount)) * 100)}%`
                  : `${progressPercent}%`}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('geral')}
              className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'geral'
                  ? 'bg-[#1B7547] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Dados da Fazenda & Produtor</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('criterios')}
              className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'criterios'
                  ? 'bg-[#1B7547] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Lista de Critérios ({displayCriterios.length})</span>
            </button>
          </div>
        </div>

        {/* Conteúdo da Aba 0: Panorama & Pontuação RTRS com Motion Design */}
        {activeTab === 'panorama' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <PanoramaScoreRTRS
              propriedadeNome={farmName}
              municipio={municipioName}
              produtorNome={producerName}
              criterios={displayCriterios}
              readOnly={true}
              embedded={true}
              etapa={etapaName}
              onBackToQuestions={() => {
                onClose();
                onStartVisita(auditoria);
              }}
            />
          </div>
        )}

        {/* Conteúdo da Aba 1: Visão Geral & Dados */}
        {activeTab === 'geral' && (
          <div className="space-y-5 animate-in fade-in duration-200">
            {/* Grid de Métricas Principais */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
              {/* Card 1: Progresso RTRS com Contadores Detalhados */}
              <div className="bg-gradient-to-br from-emerald-50/70 to-emerald-100/30 p-4 rounded-xl border border-emerald-200/60 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs font-bold text-emerald-800 mb-2">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-[#1B7547]" />
                      Questionário RTRS
                    </span>
                    <span className="font-mono text-sm text-[#1B7547]">{progressPercent}%</span>
                  </div>
                  <div className="w-full bg-emerald-200/60 h-2.5 rounded-full overflow-hidden mb-2">
                    <div 
                      className="bg-[#1B7547] h-full rounded-full transition-all duration-500" 
                      style={{ width: `${Math.max(effectiveAnsweredCount > 0 ? 5 : 0, progressPercent)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-emerald-700 font-medium flex justify-between mb-2">
                    <span>Respondidos:</span>
                    <strong className="font-mono">{effectiveAnsweredCount} / {totalQuestions} critérios</strong>
                  </p>
                </div>

                {/* Badges de Contadores Conforme / Não Conforme / Não se Aplica */}
                <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-emerald-200/60">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100/90 text-emerald-800 border border-emerald-300/80 shadow-2xs" title="Critérios Conformes">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                    <span>{conformesCount} Conformes</span>
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-100/90 text-red-800 border border-red-300/80 shadow-2xs" title="Critérios Não Conformes">
                    <AlertCircle className="w-3 h-3 text-red-600 shrink-0" />
                    <span>{naoConformesCount} Não Conf.</span>
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300/80 shadow-2xs" title="Não se Aplica">
                    <MinusCircle className="w-3 h-3 text-slate-500 shrink-0" />
                    <span>{naoSeAplicaCount} N/A</span>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('panorama')}
                  className="mt-3 w-full py-1.5 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                >
                  <Award className="w-3 h-3 text-[#C59B27]" />
                  <span>Ver Panorama & Score Detalhado</span>
                </button>
              </div>

              {/* Card 2: Agendamento */}
              <div className="bg-gradient-to-br from-amber-50/70 to-amber-100/30 p-4 rounded-xl border border-amber-200/60 shadow-xs">
                <div className="flex items-center justify-between text-xs font-bold text-amber-900 mb-2">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-[#C59B27]" />
                    Agendamento
                  </span>
                  <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold shadow-xs text-white ${
                    etapaName === 'Prospecção' ? 'bg-amber-600' :
                    etapaName === 'Auditoria Prévia' ? 'bg-blue-600' :
                    'bg-emerald-600'
                  }`}>
                    {etapaName}
                  </span>
                </div>
                <p className="text-sm font-extrabold text-amber-950 mt-1">{formattedDate}</p>
                <p className="text-[11px] text-amber-800/80 mt-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-[#C59B27]" />
                  Status: <strong>{auditoria.status || 'Agendado'}</strong>
                </p>
              </div>

              {/* Card 3: Pendências Abertas */}
              <div className="bg-gradient-to-br from-slate-50 to-slate-100/80 p-4 rounded-xl border border-slate-200/80 shadow-xs">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800 mb-2">
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    Pendências
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    effectivePendenciasCount > 0 ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  }`}>
                    {effectivePendenciasCount} ativas
                  </span>
                </div>
                <p className="text-sm font-extrabold text-slate-900 mt-1">
                  {effectivePendenciasCount === 0 ? 'Nenhuma pendência' : `${effectivePendenciasCount} pendência(s)`}
                </p>
                <p className="text-[11px] text-slate-600 mt-1">
                  {effectivePendenciasCount === 0 ? 'Imóvel em conformidade' : 'Requer atenção técnica'}
                </p>
              </div>
            </div>

            {/* Seções de Detalhamento */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              {/* Seção 1: Dados do Imóvel Rural */}
              <div className="bg-card p-4 sm:p-5 rounded-xl border border-border space-y-3 shadow-xs">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2 border-b border-border pb-2">
                  <Building2 className="w-4 h-4 text-[#1B7547]" />
                  Dados do Imóvel Rural
                </h4>
                
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-border/40 gap-2">
                    <span className="text-muted-foreground font-medium shrink-0">Nome da Fazenda:</span>
                    <span className="font-bold text-foreground text-right truncate">{farmName}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/40 gap-2">
                    <span className="text-muted-foreground font-medium shrink-0">Município / Estado:</span>
                    <span className="font-bold text-foreground text-right">{municipioName}</span>
                  </div>

                  {origemCadastro === 'SIGEF' || sigefCode ? (
                    <div className="flex justify-between py-1 border-b border-border/40 gap-2">
                      <span className="text-muted-foreground font-medium shrink-0">Parcela SIGEF:</span>
                      <span className="font-mono font-bold text-purple-700 text-[11px] truncate max-w-[180px] sm:max-w-[220px]" title={sigefCode || ''}>
                        {sigefCode || 'Cadastrado via SIGEF'}
                      </span>
                    </div>
                  ) : origemCadastro === 'KML' ? (
                    <div className="flex justify-between py-1 border-b border-border/40 gap-2">
                      <span className="text-muted-foreground font-medium shrink-0">Polígono KML / Desenho:</span>
                      <span className="font-mono font-bold text-emerald-700 text-[11px]">Geometria KML Vistoriada</span>
                    </div>
                  ) : (
                    <div className="flex justify-between py-1 border-b border-border/40 gap-2">
                      <span className="text-muted-foreground font-medium shrink-0">Código CAR (SICAR):</span>
                      <span className="font-mono font-bold text-[#1B7547] text-[11px] truncate max-w-[180px] sm:max-w-[220px]" title={carCode || ''}>
                        {carCode || 'Não informado'}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground font-medium">Fonte dos Dados:</span>
                    <span className="font-extrabold text-emerald-900 uppercase bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 rounded text-[10px]">
                      {origemCadastro === 'SIGEF' || sigefCode ? 'SIGEF (INCRA)' : origemCadastro === 'KML' ? 'KML / Desenho' : 'CAR (SICAR)'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Seção 2: Contato do Produtor Rural */}
              <div className="bg-card p-4 sm:p-5 rounded-xl border border-border space-y-3 shadow-xs">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2 border-b border-border pb-2">
                  <User className="w-4 h-4 text-[#C59B27]" />
                  Contato do Produtor Responsável
                </h4>

                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center gap-2.5 py-1">
                    <User className="w-4 h-4 text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground">Nome Completo</p>
                      <p className="font-bold text-foreground text-sm truncate">{producerName}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 py-1 border-t border-border/40">
                    <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground">E-mail de Contato</p>
                      <p className="font-semibold text-foreground truncate">{producerEmail}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-1 border-t border-border/40 gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-muted-foreground">Telefone / WhatsApp</p>
                        <p className="font-bold text-foreground truncate">{producerPhone}</p>
                      </div>
                    </div>
                    {hasValidPhone && (
                      <a
                        href={`https://wa.me/55${producerPhone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-[#1B7547] border border-emerald-200 rounded-lg text-[10px] font-bold transition-all shrink-0"
                      >
                        WhatsApp
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Conteúdo da Aba 2: Critérios RTRS & Evidências com Cards Flexíveis */}
        {activeTab === 'criterios' && (
          <div className="space-y-3.5 max-h-[55vh] overflow-y-auto pr-1 animate-in fade-in duration-200">
            {displayCriterios.length === 0 ? (
              <div className="text-center py-12 px-4 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-500 text-xs font-medium space-y-2">
                <ClipboardList className="w-8 h-8 text-slate-400 mx-auto mb-1 opacity-60" />
                <p className="font-bold text-slate-700 text-sm">Nenhum critério avaliado ainda</p>
                <p className="text-slate-500 max-w-sm mx-auto">
                  Inicie ou continue a vistoria RTRS desta fazenda para preencher as respostas do questionário e anexar as evidências técnicas.
                </p>
              </div>
            ) : (
              displayCriterios.map((crit) => (
                <div 
                  key={crit.id} 
                  className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition-shadow flex flex-col md:flex-row md:items-center justify-between gap-3"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                        {crit.secao}
                      </span>
                      <span className="text-xs font-bold text-slate-500 font-mono">
                        Critério {crit.criterio}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                        crit.nao_se_aplica ? 'bg-slate-100 text-slate-700 border border-slate-300' :
                        crit.conforme ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                        'bg-red-100 text-red-800 border border-red-200'
                      }`}>
                        {crit.nao_se_aplica ? 'Não se Aplica' : crit.conforme ? 'Conforme' : 'Não Conforme'}
                      </span>
                    </div>

                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-snug">
                      {crit.enunciado}
                    </h4>

                    {crit.observacao && (
                      <p className="text-xs text-slate-600 italic">
                        <span className="font-semibold text-slate-700 not-italic">Obs: </span>
                        {crit.observacao}
                      </p>
                    )}
                  </div>

                  {/* Ações e Evidências Flexíveis (botões nunca escondidos) */}
                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 shrink-0">
                    {crit.evidencia ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setPreviewMedia(crit.evidencia)}
                          className="flex-1 sm:flex-initial min-h-[38px] px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                          <span>Visualizar Arquivo</span>
                        </button>
                        <a
                          href={crit.evidencia}
                          target="_blank"
                          rel="noreferrer"
                          download
                          className="flex-1 sm:flex-initial min-h-[38px] px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          title="Baixar arquivo ou abrir em nova guia"
                        >
                          <Download className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                          <span>Download</span>
                        </a>
                      </>
                    ) : (
                      <span className="text-[11px] text-slate-400 italic py-1.5 px-3 bg-slate-50 rounded-lg border border-dashed border-slate-200 flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5" />
                        Sem anexo registrado
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Rodapé com Botões de Ação Direta e Altura Confortável */}
        <div className="flex flex-col-reverse sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-4 border-t border-slate-200/80 mt-4 pb-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenPendencias(prop || farmDetails);
            }}
            className="group/btn w-full sm:w-auto min-h-[44px] px-4.5 py-2.5 bg-amber-100/80 hover:bg-amber-200/80 text-amber-950 border border-amber-300/80 rounded-2xl font-extrabold text-xs flex items-center justify-center gap-2 transition-all duration-300 hover:scale-102 active:scale-95 cursor-pointer shadow-2xs"
          >
            <ClipboardList className="w-4 h-4 text-[#C59B27] transition-transform group-hover/btn:scale-110 duration-300" />
            <span>Gerenciar Pendências ({effectivePendenciasCount})</span>
          </button>

          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-extrabold text-xs transition-all duration-300 hover:scale-102 active:scale-95 cursor-pointer flex items-center justify-center"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onStartVisita(auditoria);
              }}
              className="group relative w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-[#1B7547] to-[#15613a] hover:from-[#15613a] hover:to-[#0B3B23] text-white rounded-2xl font-extrabold text-xs shadow-md shadow-[#1B7547]/20 hover:shadow-xl hover:scale-102 active:scale-95 transition-all duration-300 cursor-pointer overflow-hidden"
            >
              <span className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out pointer-events-none" />
              <Sparkles className="w-4 h-4 transition-transform group-hover:rotate-12 duration-300" />
              <span>
                {effectiveAnsweredCount >= totalQuestions && totalQuestions > 0
                  ? 'Revisar Questionário RTRS'
                  : effectiveAnsweredCount > 0
                  ? 'Continuar Questionário RTRS'
                  : 'Iniciar Vistoria RTRS'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal Lightbox para visualização de anexo / PDF */}
      {previewMedia && (
        <div 
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in transition-all"
          onClick={() => setPreviewMedia(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center w-full" onClick={e => e.stopPropagation()}>
            <button 
              type="button" 
              onClick={() => setPreviewMedia(null)} 
              className="absolute -top-10 right-0 text-white bg-black/50 hover:bg-black/70 p-2 rounded-full transition-all cursor-pointer shadow-md"
              aria-label="Fechar pré-visualização"
            >
              <X className="w-6 h-6" />
            </button>

            {isPdfEvidence(previewMedia) ? (
              <div className="w-full h-[80vh] bg-slate-900 rounded-xl overflow-hidden border border-slate-700 shadow-2xl flex flex-col">
                <div className="flex items-center justify-between px-4 py-2 bg-slate-800 text-white border-b border-slate-700">
                  <span className="text-xs font-bold">Documento PDF Anexado</span>
                  <a
                    href={previewMedia}
                    download="evidencia.pdf"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-bold underline"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Baixar PDF</span>
                  </a>
                </div>
                <iframe src={previewMedia} className="w-full h-full border-none" title="Pré-visualização do PDF" />
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <img 
                  src={previewMedia} 
                  alt="Evidência Ampliada" 
                  className="max-w-full max-h-[80vh] rounded-xl shadow-2xl object-contain border border-slate-700/60 bg-slate-900/40" 
                />
                {previewMedia.startsWith('http') && (
                  <a 
                    href={previewMedia} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="mt-3 text-xs text-emerald-300 underline font-bold hover:text-white flex items-center gap-1 bg-black/40 px-3 py-1 rounded-full border border-white/10"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Abrir imagem original em nova guia</span>
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
