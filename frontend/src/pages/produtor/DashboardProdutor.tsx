import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  MapPin,
  Plus,
  AlertTriangle,
  Search,
  Loader2,
  Sparkles,
  ClipboardList,
  Clock,
  CheckCircle2,
  Image as ImageIcon,
  FolderOpen,
  FileText,
  Trash2,
  X,
  Eye,
  Download,
  ExternalLink,
  Compass,
  Building2,
  ShieldCheck,
  Award,
  UserCheck,
  Calendar,
  Mail,
  Phone,
  Lock,
  Filter,
  ChevronDown,
  ChevronUp,
  ArrowRight
} from 'lucide-react';
import PanoramaScoreRTRS, { type PanoramaCriterioItem } from '../../components/auditoria/PanoramaScoreRTRS';
import MapView from '../../components/map/MapView';
import type { FeatureCollection } from 'geojson';
import QuestionarioRTRS from '../../components/auditoria/QuestionarioRTRS';
import OnboardingQuestionarioModal, { type OnboardingAnswers } from '../../components/auditoria/OnboardingQuestionarioModal';
import AIInsightsPanel from '../../components/ui/AIInsightsPanel';
import { aiService } from '../../services/aiService';
import siteContent from '../../config/site_content.json';
import { supabase } from '../../lib/supabase';
import { resolveFarmEtapa } from '../../lib/etapaUtils';
import { resolveMunicipioFromCarOrName } from '../../lib/geoUtils';
import { cleanEvidenceUrl, isPdfEvidence } from '../../lib/evidenceService';
import Modal from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { getRemainingTimeLabel } from '../../lib/dateUtils';
import PropertyCodeInput from '../../components/form/PropertyCodeInput';
import type { PropertyCodeResult } from '../../components/form/PropertyCodeInput';
import { ListSkeleton } from '../../components/ui/Skeleton';
import ConfirmAction from '../../components/ui/ConfirmAction';
import LocationFinderModal, { type LocationResult } from '../../components/map/LocationFinderModal';
import ModalErrorBoundary from '../../components/ui/ModalErrorBoundary';

interface FarmAuditMetrics {
  auditoriaId: string | null;
  statusAuditoria: string;
  etapa: string;
  dataVisita: string | null;
  tecnicoNome: string;
  tecnicoEmail: string | null;
  tecnicoTelefone: string | null;
  respondidos: number;
  conformes: number;
  naoConformes: number;
  naoSeAplica: number;
  aplicaveis: number;
  scoreRtrs: number | null;
  isSubmittedByTech: boolean;
}

// Extrai o número do Princípio RTRS (1 a 5) a partir do título ou descrição da pendência
function extractPrincipioFromPendency(titulo?: string, descricao?: string): number | null {
  const combined = `${titulo || ''} ${descricao || ''}`;
  const critMatch = combined.match(/(?:Crit[eé]rio\s*)?([1-5])\.\d+/i);
  if (critMatch) return Number(critMatch[1]);
  const princMatch = combined.match(/Princ[ií]pio\s*([1-5])/i);
  if (princMatch) return Number(princMatch[1]);
  return null;
}

export default function DashboardProdutor() {
  const { success, error, warning } = useToast();
  const { user: authContextUser } = useAuth();
  const content = siteContent.dashboard_produtor;
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  // Redireciona a antiga aba 'ia' diretamente para 'pendencias' onde a IA agora está integrada
  const activeTab: 'mapa' | 'pendencias' | 'documentacao' =
    rawTab === 'pendencias' || rawTab === 'ia'
      ? 'pendencias'
      : rawTab === 'documentacao'
      ? 'documentacao'
      : 'mapa';

  const setActiveTab = (tab: 'mapa' | 'pendencias' | 'documentacao') => {
    setSearchParams({ tab });
  };

  // Modais de Cadastro e Onboarding
  const [showCodeFarmModal, setShowCodeFarmModal] = useState(false);
  const [cadastroMetodo, setCadastroMetodo] = useState<'codigo' | 'gps'>('codigo');
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [isManualOnboardingReview, setIsManualOnboardingReview] = useState(false);
  const [producerName, setProducerName] = useState('Produtor Rural');
  const [onboardingAnswers, setOnboardingAnswers] = useState<OnboardingAnswers | null>(null);
  const [onboardingAlerts, setOnboardingAlerts] = useState<string[]>([]);
  const [codeFarmData, setCodeFarmData] = useState<(PropertyCodeResult & { area_soja_ha?: string }) | null>(null);
  const [newFarmName, setNewFarmName] = useState('');
  const [newFarmAreaHa, setNewFarmAreaHa] = useState('');

  // Estados de Fazenda, Questionário e Panorama
  const [showQuestionario, setShowQuestionario] = useState<string | number | null>(null);
  const [farmsData, setFarmsData] = useState<FeatureCollection>({ type: 'FeatureCollection', features: [] });
  const [selectedFarmId, setSelectedFarmId] = useState<string | null>(null);
  const [panoramaModalFarm, setPanoramaModalFarm] = useState<any>(null);
  const [panoramaCriteriosList, setPanoramaCriteriosList] = useState<PanoramaCriterioItem[]>([]);
  const [loadingPanorama, setLoadingPanorama] = useState(false);
  const [farmMetricsMap, setFarmMetricsMap] = useState<Record<string, FarmAuditMetrics>>({});

  // Estados de IA (Nível 1: Por Pendência | Nível 2: Plano Geral da Fazenda)
  const [aiActionPlan, setAiActionPlan] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showGeneralAiPlan, setShowGeneralAiPlan] = useState(false);
  const [itemAiPlans, setItemAiPlans] = useState<Record<string, { loading: boolean; plan: string; open: boolean }>>({});

  // Estados de Dados do Supabase
  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<any[]>([]);
  const [pendencias, setPendencias] = useState<any[]>([]);
  const [selectedPendency, setSelectedPendency] = useState<any>(null);
  const [resolucaoTexto, setResolucaoTexto] = useState('');
  const [evidenciaUrl, setEvidenciaUrl] = useState('');
  const [isSubmittingResolution, setIsSubmittingResolution] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);

  // Filtros Inteligentes da Aba Pendências & Adequação
  const [pendFilterFarmId, setPendFilterFarmId] = useState<string>('todas');
  const [pendFilterStatus, setPendFilterStatus] = useState<'todas' | 'Pendente' | 'Em Análise' | 'Resolvida'>('todas');
  const [pendFilterPrincipio, setPendFilterPrincipio] = useState<string>('todos');
  const [pendSearchText, setPendSearchText] = useState<string>('');

  // Estados de Documentação e Evidências
  const [documentos, setDocumentos] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [deleteDocConfirmId, setDeleteDocConfirmId] = useState<string | null>(null);
  const [showUploadDocModal, setShowUploadDocModal] = useState(false);
  const [uploadingDocFile, setUploadingDocFile] = useState(false);
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);
  const [pdfAmpliado, setPdfAmpliado] = useState<string | null>(null);
  const [docFormData, setDocFormData] = useState({
    nome: '',
    categoria: 'CAR',
    propriedade_id: '',
    arquivo_url: ''
  });

  const sampleEvidenceSVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="%230f172a"/><rect x="40" y="40" width="720" height="520" rx="16" fill="%231e293b" stroke="%23334155" stroke-width="2"/><circle cx="400" cy="240" r="80" fill="%2310b981" opacity="0.2"/><path d="M400 180 L440 220 L420 220 L420 280 L380 280 L380 220 L360 220 Z" fill="%2310b981"/><text x="400" y="360" font-family="sans-serif" font-size="24" font-weight="bold" fill="%23f8fafc" text-anchor="middle">Evidência de Campo RTRS</text><text x="400" y="400" font-family="sans-serif" font-size="16" fill="%2394a3b8" text-anchor="middle">Comprovante de Conformidade Ambiental e Social</text><rect x="250" y="450" width="300" height="44" rx="22" fill="%2310b981"/><text x="400" y="478" font-family="sans-serif" font-size="14" font-weight="bold" fill="%23ffffff" text-anchor="middle">Documento Verificado ✓</text></svg>`;

  const handleOpenEvidencia = (url?: string | null) => {
    const cleanUrl = cleanEvidenceUrl(url);
    if (!cleanUrl) {
      setFotoAmpliada(sampleEvidenceSVG);
      return;
    }

    if (isPdfEvidence(cleanUrl)) {
      setPdfAmpliado(cleanUrl);
    } else {
      setFotoAmpliada(cleanUrl);
    }
  };

  // Resolve o usuário autenticado combinando Supabase Auth com a sessão resiliente do AuthContext
  const resolveCurrentUser = async (): Promise<any | null> => {
    try {
      const { data: { user: supUser } } = await supabase.auth.getUser();
      if (supUser) return supUser;
    } catch (e) {}
    return authContextUser || null;
  };

  // Helper para garantir integridade do perfil e evitar erro de FK ao criar fazendas
  const ensureProducerProfile = async (user: any): Promise<string> => {
    if (!user) return '';
    try {
      try {
        const { data: recData, error: recErr } = await supabase.rpc('reconciliar_perfil_produtor', {
          p_auth_id: user.id || null,
          p_email: user.email || null,
          p_nome: user.user_metadata?.full_name || null,
          p_role: 'produtor'
        });
        if (!recErr && recData?.id) {
          return recData.id;
        }
      } catch (e) {}

      const { data: existingProfile } = await supabase
        .from('perfis')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      if (existingProfile?.id) {
        return existingProfile.id;
      }

      if (user.email) {
        const { data: profileByEmail } = await supabase
          .from('perfis')
          .select('id')
          .ilike('email', user.email)
          .maybeSingle();

        if (profileByEmail?.id) {
          return profileByEmail.id;
        }
      }

      const { data: newProfile } = await supabase
        .from('perfis')
        .upsert([{
          id: user.id,
          nome: user.user_metadata?.full_name || 'Produtor Rural',
          email: user.email || '',
          role: 'produtor',
          status: 'Ativo'
        }])
        .select('id')
        .single();

      return newProfile?.id || user.id;
    } catch (e) {
      console.warn('Aviso ao sincronizar perfil do produtor:', e);
      return user.id;
    }
  };

  const handleOpenPanorama = async (farmId: string) => {
    const farm = properties.find(p => p.id === farmId);
    if (!farm) return;
    setPanoramaModalFarm(farm);
    setLoadingPanorama(true);

    try {
      const { data: audits } = await supabase
        .from('auditorias')
        .select('id, etapa')
        .eq('propriedade_id', farmId)
        .order('created_at', { ascending: false });

      const { data: questions } = await supabase
        .from('perguntas_rtrs')
        .select('*')
        .eq('ativo', true)
        .order('ordem', { ascending: true });

      let resps: any[] = [];
      if (audits && audits.length > 0) {
        const auditIds = audits.map((a: any) => a.id);
        const { data: respsData } = await supabase
          .from('respostas_auditoria')
          .select('*')
          .in('auditoria_id', auditIds);
        if (respsData) resps = respsData;
      }

      const respsMap = new Map<string, any>();
      resps.forEach((r: any) => respsMap.set(r.pergunta_id, r));

      const items: PanoramaCriterioItem[] = (questions || []).map((q: any) => {
        const r = respsMap.get(q.id);
        return {
          id: q.id,
          secao: q.secao,
          criterio: q.numero_criterio,
          enunciado: q.enunciado || q.criterio,
          conforme: r?.conforme,
          nao_se_aplica: r?.nao_se_aplica,
          observacao: r?.observacoes,
          evidencia: r?.evidencia_url,
          ponderacao: q.ponderacao
        };
      });

      setPanoramaCriteriosList(items);
    } catch (err) {
      console.error('Erro ao carregar panorama da fazenda:', err);
    } finally {
      setLoadingPanorama(false);
    }
  };

  const handleConfirmLocationFromModal = async (loc: LocationResult) => {
    setShowLocationModal(false);
    setLoading(true);
    try {
      const user = await resolveCurrentUser();
      if (!user) throw new Error('Usuário não autenticado');

      const validProducerId = await ensureProducerProfile(user);
      const farmName = newFarmName.trim() || `Fazenda Sede (${loc.municipio})`;
      const nowIso = new Date().toISOString();

      const newProp = {
        produtor_id: validProducerId,
        nome_fazenda: farmName,
        municipio: loc.municipio || null,
        area_soja_ha: newFarmAreaHa ? parseFloat(newFarmAreaHa) : null,
        etapa: 'Prospecção',
        nome_produtor: user.user_metadata?.full_name || producerName || 'Produtor Rural',
        codigo_car: `MS-SEDE-${Math.floor(100000 + Math.random() * 900000)}`,
        origem_cadastro: 'Mapa',
        geom: loc.geom,
        created_at: nowIso,
        updated_at: nowIso
      };

      const { data: insertedProp, error: err } = await supabase
        .from('propriedades')
        .insert([newProp])
        .select()
        .single();
      if (err) throw err;

      if (insertedProp?.id) {
        await supabase.from('auditorias').insert([{
          propriedade_id: insertedProp.id,
          status: 'Autoavaliação',
          etapa: 'Prospecção',
          data_agendamento: nowIso
        }]);
        setSelectedFarmId(insertedProp.id);
      }

      await fetchFarmsAndPendencias();
      setShowCodeFarmModal(false);
      setNewFarmName('');
      setNewFarmAreaHa('');
      success(`Fazenda "${farmName}" cadastrada com sucesso via Geolocalização!`);
    } catch (err: any) {
      console.error('Erro ao cadastrar via mapa:', err);
      error('Erro ao salvar fazenda: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFarmsAndPendencias();
  }, [authContextUser?.id]);

  useEffect(() => {
    if (activeTab === 'documentacao' && properties.length > 0) {
      fetchDocuments(properties.map(p => p.id));
    }
  }, [activeTab]);

  const fetchDocuments = async (overridePropIds?: string[]) => {
    const propIds = overridePropIds || properties.map(p => p.id);
    if (propIds.length === 0) {
      setDocumentos([]);
      return;
    }

    setLoadingDocs(true);
    try {
      const [genRes, respRes, pendsRes] = await Promise.all([
        supabase
          .from('documentos_propriedade')
          .select('*')
          .in('propriedade_id', propIds)
          .order('created_at', { ascending: false }),
        supabase
          .from('respostas_auditoria')
          .select(`
            id,
            evidencia_url,
            created_at,
            auditorias!inner (
              propriedade_id,
              status
            ),
            perguntas_rtrs (
              numero_criterio,
              secao
            )
          `)
          .in('auditorias.propriedade_id', propIds)
          .not('evidencia_url', 'is', null),
        supabase
          .from('pendencias')
          .select('id, propriedade_id, titulo, evidencia_url, status, created_at')
          .in('propriedade_id', propIds)
          .not('evidencia_url', 'is', null)
      ]);

      const mergedList: any[] = [];

      if (genRes.data) {
        genRes.data.forEach((d: any) => {
          mergedList.push({
            id: d.id,
            nome: d.nome,
            categoria: d.categoria,
            propriedade_id: d.propriedade_id,
            arquivo_url: d.arquivo_url,
            origem: 'Armazenamento Geral',
            data: d.created_at,
            podeDeletar: true
          });
        });
      }

      if (respRes.data) {
        respRes.data.forEach((r: any) => {
          mergedList.push({
            id: r.id,
            nome: `${(r.perguntas_rtrs as any)?.secao || 'Geral'} - Critério ${(r.perguntas_rtrs as any)?.numero_criterio || 'N/A'}`,
            categoria: 'Checklist RTRS',
            propriedade_id: r.auditorias?.propriedade_id,
            arquivo_url: r.evidencia_url,
            origem: r.auditorias?.status === 'Autoavaliação' ? 'Autoavaliação RTRS' : 'Auditoria In Loco',
            data: r.created_at,
            podeDeletar: false
          });
        });
      }

      if (pendsRes.data) {
        pendsRes.data.forEach((p: any) => {
          mergedList.push({
            id: p.id,
            nome: p.titulo,
            categoria: 'Regularização',
            propriedade_id: p.propriedade_id,
            arquivo_url: p.evidencia_url,
            origem: `Resolução de Pendência (${p.status})`,
            data: p.created_at,
            podeDeletar: false
          });
        });
      }

      setDocumentos(mergedList);
    } catch (err) {
      console.error('Erro ao buscar documentos:', err);
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleUploadDocFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDocFile(true);
    try {
      const rawExt = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '');
      const fileExt = rawExt === 'jpeg' ? 'jpg' : (rawExt || 'pdf');
      const fileName = `doc-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;
      const mimeType = file.type && file.type !== 'text/plain'
        ? file.type
        : (fileExt === 'png' ? 'image/png' : fileExt === 'pdf' ? 'application/pdf' : fileExt === 'webp' ? 'image/webp' : 'image/jpeg');

      let urlToUse = '';

      const { error: upErr } = await supabase.storage
        .from('evidencias')
        .upload(filePath, file, { cacheControl: '3600', upsert: true, contentType: mimeType });

      if (!upErr) {
        const { data: { publicUrl } } = supabase.storage.from('evidencias').getPublicUrl(filePath);
        urlToUse = publicUrl;
      } else {
        const { error: secErr } = await supabase.storage
          .from('documentos-e-midias')
          .upload(filePath, file, { cacheControl: '3600', upsert: true, contentType: mimeType });
        if (!secErr) {
          const { data: { publicUrl } } = supabase.storage.from('documentos-e-midias').getPublicUrl(filePath);
          urlToUse = publicUrl;
        }
      }

      if (urlToUse) {
        setDocFormData(prev => ({ ...prev, arquivo_url: urlToUse }));
        success('Arquivo carregado com sucesso!');
      } else {
        error('Falha ao carregar arquivo na nuvem. Tente novamente.');
      }
    } catch (err: any) {
      console.error('Erro ao carregar arquivo de documento:', err);
      error('Erro ao processar arquivo.');
    } finally {
      setUploadingDocFile(false);
      e.target.value = '';
    }
  };

  const handleSaveDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docFormData.propriedade_id || !docFormData.nome || !docFormData.arquivo_url) {
      warning('Preencha todos os campos e anexe o arquivo!');
      return;
    }

    try {
      const user = await resolveCurrentUser();
      const payload = {
        propriedade_id: docFormData.propriedade_id,
        nome: docFormData.nome,
        categoria: docFormData.categoria,
        arquivo_url: docFormData.arquivo_url,
        criado_por: user?.id || null
      };

      const { error: err } = await supabase.from('documentos_propriedade').insert([payload]);
      if (err) throw err;

      success('Documento arquivado com sucesso!');
      setShowUploadDocModal(false);
      setDocFormData({ nome: '', categoria: 'CAR', propriedade_id: '', arquivo_url: '' });
      fetchDocuments();
    } catch (err: any) {
      console.error('Erro ao arquivar documento:', err);
      error('Erro ao arquivar: ' + err.message);
    }
  };

  const handleDeleteDoc = async (id: string) => {
    setDeleteDocConfirmId(id);
  };

  const executeDeleteDoc = async () => {
    const id = deleteDocConfirmId;
    if (!id) return;
    try {
      const { error: err } = await supabase.from('documentos_propriedade').delete().eq('id', id);
      if (err) throw err;
      fetchDocuments();
      success('Documento excluído com sucesso!');
    } catch (err: any) {
      console.error('Erro ao deletar documento:', err);
      error('Erro ao deletar: ' + err.message);
    } finally {
      setDeleteDocConfirmId(null);
    }
  };

  async function fetchFarmsAndPendencias() {
    setLoading(true);
    try {
      const user = await resolveCurrentUser();

      if (!user) {
        setProperties([]);
        setPendencias([]);
        setFarmsData({ type: 'FeatureCollection', features: [] });
        setLoading(false);
        return;
      }

      let resolvedName = user?.user_metadata?.full_name || user?.email || 'Produtor Rural';
      setProducerName(resolvedName);

      // Reconciliar perfil e propriedades pré-cadastradas pelo Técnico/Gestor
      let producerProfileId = user.id;
      try {
        const { data: recData, error: recErr } = await supabase.rpc('reconciliar_perfil_produtor', {
          p_auth_id: user.id || null,
          p_email: user.email || null,
          p_nome: user.user_metadata?.full_name || null,
          p_role: 'produtor'
        });
        if (!recErr && recData?.id) {
          producerProfileId = recData.id;
          if (recData.nome) {
            resolvedName = recData.nome;
            setProducerName(recData.nome);
          }
        }
      } catch (e) {}

      // Carregar respostas salvas do diagnóstico inicial se existirem no localStorage
      if (user?.id) {
        try {
          const savedOnb = localStorage.getItem(`ms_onboarding_${user.id}`);
          if (savedOnb) {
            const parsed = JSON.parse(savedOnb);
            if (parsed?.answers) setOnboardingAnswers(parsed.answers);
            if (Array.isArray(parsed?.alerts)) setOnboardingAlerts(parsed.alerts);
          }
        } catch (e) {}
      }

      const isCompletedLocally = localStorage.getItem('ms_onboarding_completed') === 'true' || (user?.id && !!localStorage.getItem(`ms_onboarding_${user.id}`));
      const isCompletedMetadata = !!user?.user_metadata?.onboarding_concluido;

      if (!isCompletedLocally && !isCompletedMetadata) {
        try {
          const { data: profData } = await supabase
            .from('perfis')
            .select('onboarding_concluido, onboarding_respostas, onboarding_alertas')
            .eq('id', producerProfileId)
            .maybeSingle();

          if (profData && (profData as any).onboarding_concluido) {
            localStorage.setItem('ms_onboarding_completed', 'true');
            if ((profData as any).onboarding_respostas) setOnboardingAnswers((profData as any).onboarding_respostas);
            if (Array.isArray((profData as any).onboarding_alertas)) setOnboardingAlerts((profData as any).onboarding_alertas);
            if (user?.id) localStorage.setItem(`ms_onboarding_${user.id}`, JSON.stringify({ answers: (profData as any).onboarding_respostas, alerts: (profData as any).onboarding_alertas, completedAt: new Date().toISOString() }));
            setShowOnboardingModal(false);
          } else {
            setIsManualOnboardingReview(false);
            setShowOnboardingModal(true);
          }
        } catch (e) {
          setShowOnboardingModal(false);
        }
      }

      // Resolver perfil por e-mail caso necessário
      if (user.email) {
        const { data: perf } = await supabase
          .from('perfis')
          .select('id, nome')
          .ilike('email', user.email)
          .maybeSingle();

        if (perf?.id) {
          producerProfileId = perf.id;
          if (perf.nome) {
            resolvedName = perf.nome;
            setProducerName(perf.nome);
          }
        }
      }

      let queryFilter = `produtor_id.eq.${user.id}`;
      if (producerProfileId && producerProfileId !== user.id) {
        queryFilter += `,produtor_id.eq.${producerProfileId}`;
      }
      if (resolvedName && resolvedName !== 'Produtor Rural' && !resolvedName.includes('@')) {
        queryFilter += `,nome_produtor.ilike.${resolvedName.replace(/,/g, '')}`;
      }

      const { data: props, error: propsError } = await supabase
        .from('propriedades')
        .select('*')
        .or(queryFilter)
        .order('created_at', { ascending: false });

      if (propsError) throw propsError;

      const safeProps = props || [];
      // Auto-reconciliar produtor_id caso alguma fazenda tenha sido encontrada apenas pelo nome_produtor
      for (const fp of safeProps) {
        if (!fp.produtor_id && producerProfileId) {
          fp.produtor_id = producerProfileId;
          supabase.from('propriedades').update({ produtor_id: producerProfileId }).eq('id', fp.id).then(() => {});
        }
      }
      setProperties(safeProps);

      // Selecionar automaticamente a primeira fazenda ativa se nenhuma estiver selecionada
      if (safeProps.length > 0) {
        setSelectedFarmId(prev => {
          if (prev && safeProps.some((p: any) => p.id === prev)) return prev;
          return safeProps[0].id;
        });
      }

      const propIds = safeProps.map((p: any) => p.id);

      // Buscar pendências, auditorias, respostas RTRS, técnicos e documentos em paralelo
      let pends: any[] = [];
      const newMetricsMap: Record<string, FarmAuditMetrics> = {};

      if (propIds.length > 0) {
        const [pendsRes, auditsRes, techsRes] = await Promise.all([
          supabase
            .from('pendencias')
            .select('*')
            .in('propriedade_id', propIds)
            .order('created_at', { ascending: false }),
          supabase
            .from('auditorias')
            .select('id, propriedade_id, status, etapa, data_agendamento, tecnico_responsavel_id, created_at')
            .in('propriedade_id', propIds)
            .order('created_at', { ascending: false }),
          supabase
            .from('perfis')
            .select('id, nome, email, telefone, regiao')
            .eq('role', 'tecnico')
        ]);

        if (!pendsRes.error && pendsRes.data) {
          pends = pendsRes.data;
        }

        const allAudits = auditsRes.data || [];
        const techMap = new Map<string, any>();
        (techsRes.data || []).forEach((t: any) => techMap.set(t.id, t));

        // Buscar respostas_auditoria de todas as auditorias dessas propriedades
        const allAuditIds = allAudits.map((a: any) => a.id);
        let allResps: any[] = [];
        if (allAuditIds.length > 0) {
          const { data: respsData } = await supabase
            .from('respostas_auditoria')
            .select('auditoria_id, pergunta_id, conforme, nao_se_aplica')
            .in('auditoria_id', allAuditIds);
          if (respsData) allResps = respsData;
        }

        // Mapear auditoria_id -> propriedade_id
        const auditToProp = new Map<string, string>();
        allAudits.forEach((a: any) => auditToProp.set(a.id, a.propriedade_id));

        // Agrupar respostas únicas por propriedade_id (pergunta_id mais recente)
        const propRespsMap = new Map<string, Map<string, any>>();
        allResps.forEach((r: any) => {
          const pId = auditToProp.get(r.auditoria_id);
          if (!pId) return;
          if (!propRespsMap.has(pId)) propRespsMap.set(pId, new Map());
          propRespsMap.get(pId)!.set(r.pergunta_id, r);
        });

        // Montar métricas por fazenda
        safeProps.forEach((p: any) => {
          const propAudits = allAudits.filter((a: any) => a.propriedade_id === p.id);
          const latestAudit = propAudits[0] || null;
          const tecId = p.tecnico_id || latestAudit?.tecnico_responsavel_id || null;
          const tec = tecId ? techMap.get(tecId) : null;

          const respsForProp = propRespsMap.get(p.id) ? Array.from(propRespsMap.get(p.id)!.values()) : [];
          const respondidos = respsForProp.length;
          const conformes = respsForProp.filter(r => r.conforme === true && !r.nao_se_aplica).length;
          const naoConformes = respsForProp.filter(r => r.conforme === false && !r.nao_se_aplica).length;
          const naoSeAplica = respsForProp.filter(r => r.nao_se_aplica === true).length;
          const aplicaveis = conformes + naoConformes;
          const scoreRtrs = aplicaveis > 0 ? Math.round((conformes / aplicaveis) * 100) : null;

          const statusAuditoria = latestAudit?.status || 'Autoavaliação';
          const isSubmittedByTech =
            statusAuditoria === 'Aguardando Aprovação' ||
            statusAuditoria === 'Certificada' ||
            statusAuditoria === 'Em Análise';

          const etapaResolved = resolveFarmEtapa(
            p.id,
            p.etapa,
            latestAudit?.etapa || (isSubmittedByTech ? 'Auditoria Oficial' : null)
          );

          newMetricsMap[p.id] = {
            auditoriaId: latestAudit?.id || null,
            statusAuditoria,
            etapa: statusAuditoria === 'Certificada' ? 'Certificada' : etapaResolved,
            dataVisita: latestAudit?.data_agendamento || null,
            tecnicoNome: tec?.nome || 'Equipe Técnica Aprosoja-MS',
            tecnicoEmail: tec?.email || null,
            tecnicoTelefone: tec?.telefone || null,
            respondidos,
            conformes,
            naoConformes,
            naoSeAplica,
            aplicaveis,
            scoreRtrs,
            isSubmittedByTech
          };
        });

        // Carregar documentos completos em background para que o KPI Documentação Vigente esteja 100% correto desde o início
        fetchDocuments(propIds);
      }

      setPendencias(pends);
      setFarmMetricsMap(newMetricsMap);

      // Gerar FeatureCollection para o mapa EXCLUSIVAMENTE dos imóveis do produtor logado
      if (safeProps.length > 0) {
        const features = await Promise.all(
          safeProps.map(async (p: any, index: number) => {
            let geom = p.geom;

            if (typeof geom === 'string') {
              try {
                const trimmed = geom.trim();
                if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                  geom = JSON.parse(trimmed);
                } else {
                  geom = null;
                }
              } catch (e) {
                geom = null;
              }
            }

            if (geom && typeof geom === 'object') {
              if (!geom.type || !geom.coordinates) {
                geom = null;
              }
            }

            if (geom && geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
              geom = {
                type: 'Polygon',
                coordinates: geom.coordinates[0] || []
              };
            }

            if (!geom) {
              try {
                if (p.codigo_car) {
                  const { data } = await supabase
                    .from('imoveis_car')
                    .select('geom')
                    .or(`codigosica.ilike.%${p.codigo_car}%,cod_imovel.ilike.%${p.codigo_car}%`)
                    .limit(1)
                    .maybeSingle();
                  if (data?.geom) {
                    geom = typeof data.geom === 'string' && data.geom.trim().startsWith('{') ? JSON.parse(data.geom) : data.geom;
                  }
                }
                if (!geom && p.codigo_sigef) {
                  const { data } = await supabase
                    .from('imoveis_sigef')
                    .select('geom')
                    .or(`parcela_co.ilike.${p.codigo_sigef},codigo_imo.ilike.${p.codigo_sigef}`)
                    .limit(1)
                    .maybeSingle();
                  if (data?.geom) {
                    geom = typeof data.geom === 'string' && data.geom.trim().startsWith('{') ? JSON.parse(data.geom) : data.geom;
                  }
                }
              } catch (e) {}
            }

            if (geom && geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
              geom = {
                type: 'Polygon',
                coordinates: geom.coordinates[0] || []
              };
            }

            if (!geom || typeof geom !== 'object' || !geom.type || !geom.coordinates) {
              const latBase = -20.4 - (index * 0.15);
              const lngBase = -54.6 - (index * 0.15);
              geom = {
                type: 'Polygon',
                coordinates: [[[lngBase, latBase], [lngBase + 0.05, latBase], [lngBase + 0.05, latBase - 0.05], [lngBase, latBase - 0.05], [lngBase, latBase]]]
              };
            }

            const openPendsCount = pends.filter((x: any) => x.propriedade_id === p.id && x.status === 'Pendente').length;
            const resolvedMunicipio = resolveMunicipioFromCarOrName(p.codigo_car, p.nome_fazenda, p.municipio);

            return {
              type: 'Feature' as const,
              properties: {
                id: p.id,
                name: p.nome_fazenda,
                municipio: resolvedMunicipio,
                codigo_car: p.codigo_car || p.codigo_sigef || null,
                area_soja_ha: p.area_soja_ha || null,
                status: openPendsCount > 0 ? `${openPendsCount} Pendência(s)` : 'Regularizada'
              },
              geometry: geom
            };
          })
        );

        setFarmsData({
          type: 'FeatureCollection',
          features
        });
      } else {
        setFarmsData({ type: 'FeatureCollection', features: [] });
      }
    } catch (err) {
      console.error('Erro ao buscar dados do produtor:', err);
      setProperties([]);
      setPendencias([]);
      setFarmsData({ type: 'FeatureCollection', features: [] });
    } finally {
      setLoading(false);
    }
  }

  const handleCreateCodeFarm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeFarmData) return;

    if (codeFarmData.origem === 'CAR') {
      const CAR_REGEX = /^[A-Z]{2}-\d{7}-[0-9A-Z.]+$/;
      if (!CAR_REGEX.test(codeFarmData.codigo_car)) {
        warning('Formato de CAR inválido. Use o padrão UF-1234567-XXXX...');
        return;
      }
    } else if (codeFarmData.origem === 'SIGEF' && !codeFarmData.codigo_sigef) {
      warning('Selecione uma parcela do SIGEF.');
      return;
    } else if (codeFarmData.origem === 'KML' && !codeFarmData.geom) {
      warning('Faça upload de um arquivo KML/KMZ contendo geometria.');
      return;
    }

    setLoading(true);
    try {
      const user = await resolveCurrentUser();
      if (!user) throw new Error('Usuário não autenticado no Supabase.');

      const validProducerId = await ensureProducerProfile(user);
      const nowIso = new Date().toISOString();
      const newProp = {
        produtor_id: validProducerId,
        nome_fazenda: codeFarmData.nome_fazenda,
        etapa: 'Prospecção',
        nome_produtor: user.user_metadata?.full_name || producerName || 'Produtor',
        area_soja_ha: codeFarmData.area_soja_ha ? parseFloat(codeFarmData.area_soja_ha) : null,
        codigo_car: codeFarmData.origem === 'CAR' ? codeFarmData.codigo_car : null,
        codigo_sigef: codeFarmData.origem === 'SIGEF' ? codeFarmData.codigo_sigef : null,
        origem_cadastro: codeFarmData.origem,
        geom: codeFarmData.geom || null,
        created_at: nowIso,
        updated_at: nowIso
      };

      const { data: insertedProp, error: err } = await supabase
        .from('propriedades')
        .insert([newProp])
        .select()
        .single();
      if (err) throw err;

      if (insertedProp?.id) {
        await supabase.from('auditorias').insert([{
          propriedade_id: insertedProp.id,
          status: 'Autoavaliação',
          etapa: 'Prospecção',
          data_agendamento: nowIso
        }]);
        setSelectedFarmId(insertedProp.id);
      }

      await fetchFarmsAndPendencias();
      setShowCodeFarmModal(false);
      setCodeFarmData(null);
      success('Propriedade cadastrada com sucesso!');
    } catch (err: any) {
      console.error('Erro ao salvar propriedade:', err);
      error('Erro ao salvar propriedade: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFinishAutoavaliacao = () => {
    fetchFarmsAndPendencias();
    setShowQuestionario(null);
  };

  // IA Nível 1: Gerar orientação contextual instantânea para UMA pendência específica
  const handleToggleItemAIPlan = async (pend: any) => {
    const existing = itemAiPlans[pend.id];
    if (existing && existing.plan) {
      setItemAiPlans(prev => ({
        ...prev,
        [pend.id]: { ...prev[pend.id], open: !prev[pend.id].open }
      }));
      return;
    }

    const farmName = properties.find(p => p.id === pend.propriedade_id)?.nome_fazenda || 'Propriedade Rural';
    setItemAiPlans(prev => ({
      ...prev,
      [pend.id]: { loading: true, plan: '', open: true }
    }));

    try {
      const prompt = `Fazenda: ${farmName}\nPendência RTRS: ${pend.titulo}\nExigência/Observação Técnica: ${pend.descricao}\nInstrução: Forneça um passo a passo objetivo e prático (em até 4 tópicos curtos) de como o produtor rural deve regularizar esta pendência e qual documento/foto anexar como evidência para aprovação na certificação RTRS.`;
      const plan = await aiService.generateCorrectiveActions(prompt);
      setItemAiPlans(prev => ({
        ...prev,
        [pend.id]: { loading: false, plan, open: true }
      }));
    } catch (e) {
      setItemAiPlans(prev => ({
        ...prev,
        [pend.id]: { loading: false, plan: 'Não foi possível gerar a recomendação neste momento.', open: true }
      }));
    }
  };

  // IA Nível 2: Gerar Plano Geral de Adequação para todas as pendências abertas da fazenda ativa
  const handleGenerateGeneralAIPlan = async () => {
    const targetFarmId = pendFilterFarmId !== 'todas' ? pendFilterFarmId : selectedFarmId;
    const targetFarm = properties.find(p => p.id === targetFarmId);
    const openPends = pendencias.filter(
      p => p.status === 'Pendente' && (!targetFarmId || p.propriedade_id === targetFarmId)
    );

    if (openPends.length === 0) {
      warning('Não há pendências em aberto para gerar o plano de adequação.');
      return;
    }

    setIsAiLoading(true);
    setShowGeneralAiPlan(true);

    const summaryLines = openPends
      .slice(0, 20)
      .map((p, idx) => `${idx + 1}. ${p.titulo}: ${p.descricao}`)
      .join('\n');

    const prompt = `Fazenda: ${targetFarm?.nome_fazenda || 'Propriedades do Produtor'}\nTotal de Pendências Abertas: ${openPends.length}\nPrincipais Não-Conformidades RTRS:\n${summaryLines}\n\nInstrução: Crie um Plano Executivo de Adequação RTRS priorizado por urgência (Curto Prazo / Ação Imediata, Médio Prazo e Documentação Comprobatória) para que o produtor regularize sua fazenda com eficiência.`;

    try {
      const plan = await aiService.generateCorrectiveActions(prompt);
      setAiActionPlan(plan);
    } catch (e) {
      setAiActionPlan('Não foi possível gerar o plano geral no momento.');
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleUploadEvidenceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedPendency) return;
    setUploadingFile(true);
    try {
      const rawExt = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const fileExt = rawExt === 'jpeg' ? 'jpg' : (rawExt || 'jpg');
      const fileName = `pendencia-${selectedPendency.id}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;
      const mimeType = file.type && file.type !== 'text/plain'
        ? file.type
        : (fileExt === 'png' ? 'image/png' : fileExt === 'pdf' ? 'application/pdf' : fileExt === 'webp' ? 'image/webp' : 'image/jpeg');

      let urlToUse = '';

      const { error: upErr } = await supabase.storage
        .from('evidencias')
        .upload(filePath, file, { cacheControl: '3600', upsert: true, contentType: mimeType });

      if (!upErr) {
        const { data: { publicUrl } } = supabase.storage.from('evidencias').getPublicUrl(filePath);
        urlToUse = publicUrl;
      } else {
        const { error: secErr } = await supabase.storage
          .from('documentos-e-midias')
          .upload(filePath, file, { cacheControl: '3600', upsert: true, contentType: mimeType });
        if (!secErr) {
          const { data: { publicUrl } } = supabase.storage.from('documentos-e-midias').getPublicUrl(filePath);
          urlToUse = publicUrl;
        }
      }

      if (urlToUse) {
        setEvidenciaUrl(urlToUse);
        success('Evidência carregada com sucesso!');
      } else {
        error('Falha ao enviar arquivo. Tente novamente.');
      }
    } catch (err: any) {
      console.error('Erro ao carregar arquivo na storage:', err);
      error('Falha ao processar arquivo.');
    } finally {
      setUploadingFile(false);
      e.target.value = '';
    }
  };

  const handleOpenResolutionModal = (pend: any) => {
    setSelectedPendency(pend);
    setResolucaoTexto(pend.resolucao_descricao || '');
    setEvidenciaUrl(pend.evidencia_url || '');
  };

  const handleSubmitResolution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPendency) return;
    setIsSubmittingResolution(true);
    try {
      const { error: upErr } = await supabase
        .from('pendencias')
        .update({
          status: 'Em Análise',
          evidencia_url: evidenciaUrl,
          resolucao_descricao: resolucaoTexto,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedPendency.id);

      if (upErr) throw upErr;

      success('Resolução enviada com sucesso! A pendência agora está sob revisão técnica.');
      setSelectedPendency(null);
      setResolucaoTexto('');
      setEvidenciaUrl('');
      await fetchFarmsAndPendencias();
    } catch (err: any) {
      console.error('Erro ao submeter resolução:', err);
      error('Erro ao submeter resolução: ' + err.message);
    } finally {
      setIsSubmittingResolution(false);
    }
  };

  // Fazenda Ativa e Métricas Consolidadas
  const activeFarm = useMemo(() => {
    return properties.find(p => p.id === selectedFarmId) || properties[0] || null;
  }, [properties, selectedFarmId]);

  const activeFarmMetrics: FarmAuditMetrics | null = useMemo(() => {
    if (!activeFarm) return null;
    return farmMetricsMap[activeFarm.id] || null;
  }, [activeFarm, farmMetricsMap]);

  const activeEtapaName = activeFarmMetrics?.etapa || (activeFarm ? resolveFarmEtapa(activeFarm.id, activeFarm.etapa, null) : 'Prospecção');

  const activeFarmOpenPendenciasCount = useMemo(() => {
    if (!activeFarm) return pendencias.filter(p => p.status === 'Pendente').length;
    return pendencias.filter(p => p.propriedade_id === activeFarm.id && p.status === 'Pendente').length;
  }, [pendencias, activeFarm]);

  const totalOpenPendenciasCount = useMemo(() => {
    return pendencias.filter(p => p.status === 'Pendente').length;
  }, [pendencias]);

  // Filtros aplicados na Aba 2 (Pendências & Adequação)
  const filteredPendencias = useMemo(() => {
    return pendencias.filter(pend => {
      if (pendFilterFarmId !== 'todas' && pend.propriedade_id !== pendFilterFarmId) return false;
      if (pendFilterStatus !== 'todas') {
        if (pendFilterStatus === 'Resolvida') {
          if (pend.status !== 'Resolvida' && pend.status !== 'Resolvido') return false;
        } else if (pend.status !== pendFilterStatus) {
          return false;
        }
      }
      if (pendFilterPrincipio !== 'todos') {
        const pNum = extractPrincipioFromPendency(pend.titulo, pend.descricao);
        if (String(pNum) !== pendFilterPrincipio) return false;
      }
      if (pendSearchText.trim()) {
        const q = pendSearchText.toLowerCase();
        const matchTitle = (pend.titulo || '').toLowerCase().includes(q);
        const matchDesc = (pend.descricao || '').toLowerCase().includes(q);
        if (!matchTitle && !matchDesc) return false;
      }
      return true;
    });
  }, [pendencias, pendFilterFarmId, pendFilterStatus, pendFilterPrincipio, pendSearchText]);

  // Contadores das Pílulas de Status na Aba de Pendências (respeitando filtro de fazenda)
  const pendencyStatusCounts = useMemo(() => {
    const base = pendFilterFarmId === 'todas'
      ? pendencias
      : pendencias.filter(p => p.propriedade_id === pendFilterFarmId);
    return {
      todas: base.length,
      pendentes: base.filter(p => p.status === 'Pendente').length,
      emAnalise: base.filter(p => p.status === 'Em Análise').length,
      resolvidas: base.filter(p => p.status === 'Resolvida' || p.status === 'Resolvido').length
    };
  }, [pendencias, pendFilterFarmId]);

  const filteredFarms = farmsData.features.filter(f =>
    (f.properties?.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Índice da etapa atual na Linha do Tempo RTRS (1 a 4)
  const currentJourneyIndex = useMemo(() => {
    if (activeFarmMetrics?.statusAuditoria === 'Certificada' || activeEtapaName === 'Certificada') return 4;
    if (activeEtapaName === 'Auditoria Oficial') return 3;
    if (activeEtapaName === 'Auditoria Prévia') return 2;
    return 1;
  }, [activeEtapaName, activeFarmMetrics]);

  if (loading && properties.length === 0) {
    return (
      <div className="space-y-8 max-w-7xl mx-auto p-6">
        <div className="flex justify-between items-end border-b border-border pb-6 mb-8">
          <div className="w-1/3 h-10 bg-muted/50 rounded-lg animate-pulse"></div>
          <div className="w-1/4 h-10 bg-muted/50 rounded-lg animate-pulse"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ListSkeleton />
          <ListSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up max-w-7xl mx-auto pb-8">
      {/* Header Executivo do Produtor com Seletor de Fazenda Ativa e 3 Abas Principais */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-xs">
        <div className="space-y-2 w-full lg:w-auto">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 bg-[#1B7547]/10 text-[#1B7547] px-2.5 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs font-extrabold uppercase tracking-wider">
              <MapPin className="w-3.5 h-3.5" />
              <span>Portal do Produtor Rural</span>
            </div>
            <span className="px-2.5 sm:px-3 py-1 bg-emerald-50 border border-emerald-200/80 text-emerald-800 rounded-full text-[11px] sm:text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-[#1B7547] animate-pulse"></span>
              Etapa: {activeEtapaName}
            </span>
            <button
              type="button"
              onClick={() => {
                setIsManualOnboardingReview(true);
                setShowOnboardingModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80 transition-colors cursor-pointer"
              title="Consultar ou atualizar as 7 respostas do Diagnóstico Socioambiental de Primeiro Acesso"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#1B7547]" />
              <span>Rever Diagnóstico Inicial</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
              {content.titulo}
            </h1>

            {/* Seletor Rápido de Fazenda Ativa */}
            {properties.length > 0 && (
              <div className="inline-flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
                <Building2 className="w-4 h-4 text-[#1B7547] shrink-0" />
                <span className="text-[11px] font-bold text-slate-500 uppercase">Fazenda Ativa:</span>
                <select
                  value={activeFarm?.id || ''}
                  onChange={(e) => {
                    const newId = e.target.value;
                    setSelectedFarmId(newId);
                    if (pendFilterFarmId !== 'todas') {
                      setPendFilterFarmId(newId);
                    }
                  }}
                  className="text-xs font-extrabold text-slate-900 bg-transparent focus:outline-none cursor-pointer pr-1"
                >
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.nome_fazenda}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <p className="text-slate-500 text-xs sm:text-sm font-medium">{content.subtitulo}</p>
        </div>

        {/* Navegação Principal em 3 Abas */}
        <div className="w-full lg:w-auto bg-slate-100 p-1.5 rounded-2xl border border-slate-200/80 grid grid-cols-3 sm:inline-flex gap-1.5 shadow-2xs shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('mapa')}
            className={`px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl font-extrabold text-xs transition-all duration-300 flex items-center justify-center gap-1.5 cursor-pointer shrink-0 min-h-[40px] ${
              activeTab === 'mapa'
                ? 'bg-[#1B7547] text-white shadow-md shadow-[#1B7547]/20'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <MapPin className="w-4 h-4 shrink-0" />
            <span className="truncate sm:hidden">Fazendas</span>
            <span className="hidden sm:inline">Minha Fazenda & Mapa</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pendencias')}
            className={`px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl font-extrabold text-xs transition-all duration-300 flex items-center justify-center gap-1.5 cursor-pointer shrink-0 min-h-[40px] ${
              activeTab === 'pendencias'
                ? 'bg-[#1B7547] text-white shadow-md shadow-[#1B7547]/20'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <ClipboardList className="w-4 h-4 shrink-0" />
            <span className="truncate sm:hidden">Pendências</span>
            <span className="hidden sm:inline">Pendências & Adequação</span>
            <Sparkles className={`w-3.5 h-3.5 shrink-0 hidden sm:inline ${activeTab === 'pendencias' ? 'text-[#C59B27]' : 'text-indigo-500'}`} />
            {totalOpenPendenciasCount > 0 && (
              <span className="bg-[#C59B27] text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0 shadow-2xs">
                {totalOpenPendenciasCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('documentacao')}
            className={`px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl font-extrabold text-xs transition-all duration-300 flex items-center justify-center gap-1.5 cursor-pointer shrink-0 min-h-[40px] ${
              activeTab === 'documentacao'
                ? 'bg-[#1B7547] text-white shadow-md shadow-[#1B7547]/20'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <FolderOpen className="w-4 h-4 shrink-0" />
            <span className="truncate sm:hidden">Documentos</span>
            <span className="hidden sm:inline">Documentação & Evidências</span>
          </button>
        </div>
      </div>

      {/* Grid de 4 KPIs Reais baseados na Fazenda Ativa e no Banco */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Fazendas */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-sm transition-all flex items-center justify-between">
          <div className="space-y-1 min-w-0">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Propriedades Ativas</span>
            <p className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {properties.length}
            </p>
            <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-1 truncate">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="truncate">{activeFarm ? `Ativa: ${activeFarm.nome_fazenda}` : 'Cadastradas no Programa'}</span>
            </span>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl shrink-0">
            <Building2 className="w-6 h-6" />
          </div>
        </div>

        {/* Card 2: Score Real de Conformidade RTRS (baseado em respostas_auditoria) */}
        <div
          onClick={() => activeFarm && handleOpenPanorama(activeFarm.id)}
          className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-md hover:border-emerald-300 transition-all flex items-center justify-between cursor-pointer group"
          title="Clique para abrir o Panorama Executivo & Score RTRS detalhado"
        >
          <div className="space-y-1">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              Score RTRS ({activeFarm ? 'Fazenda Ativa' : 'Geral'})
            </span>
            <p className="text-2xl sm:text-3xl font-black text-[#1B7547] tracking-tight">
              {activeFarmMetrics && activeFarmMetrics.scoreRtrs !== null
                ? `${activeFarmMetrics.scoreRtrs}%`
                : 'Em Diagnóstico'}
            </p>
            <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
              {activeFarmMetrics && activeFarmMetrics.respondidos > 0
                ? `${activeFarmMetrics.conformes}/${activeFarmMetrics.aplicaveis} conformes (${activeFarmMetrics.respondidos}/115)`
                : 'Inicie o checklist RTRS'}
            </span>
          </div>
          <div className="p-3 bg-emerald-50 text-[#1B7547] group-hover:bg-[#1B7547] group-hover:text-white transition-colors rounded-xl shrink-0">
            <Award className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3: Pendências em Aberto */}
        <div
          onClick={() => {
            if (activeFarm) setPendFilterFarmId(activeFarm.id);
            setPendFilterStatus('Pendente');
            setActiveTab('pendencias');
          }}
          className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-md hover:border-amber-300 transition-all flex items-center justify-between cursor-pointer"
        >
          <div className="space-y-1">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Pendências da Fazenda</span>
            <p className="text-2xl sm:text-3xl font-black text-amber-600 tracking-tight">
              {activeFarmOpenPendenciasCount}
            </p>
            <span className="text-[11px] text-amber-700 font-medium flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              {totalOpenPendenciasCount > activeFarmOpenPendenciasCount
                ? `${totalOpenPendenciasCount} no total em todas as fazendas`
                : 'Requerem ação do produtor'}
            </span>
          </div>
          <div className="p-3 bg-amber-50 text-amber-700 rounded-xl shrink-0">
            <ClipboardList className="w-6 h-6" />
          </div>
        </div>

        {/* Card 4: Documentos & Evidências */}
        <div
          onClick={() => setActiveTab('documentacao')}
          className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-md transition-all flex items-center justify-between cursor-pointer"
        >
          <div className="space-y-1">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Documentação Vigente</span>
            <p className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {documentos.length}
            </p>
            <span className="text-[11px] text-slate-500 font-medium">Arquivos e evidências RTRS</span>
          </div>
          <div className="p-3 bg-slate-100 text-slate-700 rounded-xl shrink-0">
            <FolderOpen className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Painel Executivo da Fazenda Ativa: Linha do Tempo da Jornada RTRS + Card do Técnico Responsável */}
      {activeFarm && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Linha do Tempo da Jornada RTRS (2/3) */}
          <div className="lg:col-span-2 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-[#1B7547]" />
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900">
                  Jornada de Certificação RTRS — <span className="text-[#1B7547]">{activeFarm.nome_fazenda}</span>
                </h2>
              </div>
              <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                {activeFarmMetrics ? `${activeFarmMetrics.respondidos} de 115 critérios avaliados` : '0 de 115 critérios'}
              </span>
            </div>

            {/* Stepper de 4 Etapas */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[
                { step: 1, title: '1. Prospecção', desc: 'Cadastro & Autoavaliação' },
                { step: 2, title: '2. Auditoria Prévia', desc: 'Diagnóstico & Adequação' },
                { step: 3, title: '3. Auditoria Oficial', desc: 'Vistoria Final & Revisão' },
                { step: 4, title: '4. Certificada RTRS', desc: 'Selo Socioambiental' }
              ].map((item) => {
                const isDone = currentJourneyIndex > item.step || (item.step === 4 && currentJourneyIndex === 4);
                const isCurrent = currentJourneyIndex === item.step;
                return (
                  <div
                    key={item.step}
                    className={`p-3 rounded-xl border transition-all ${
                      isCurrent
                        ? 'bg-emerald-50/80 border-[#1B7547] ring-2 ring-[#1B7547]/15'
                        : isDone
                        ? 'bg-slate-50 border-emerald-200'
                        : 'bg-slate-50/50 border-slate-200/70 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          isCurrent
                            ? 'bg-[#1B7547] text-white'
                            : isDone
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {isDone ? '✓ Concluída' : isCurrent ? 'Etapa Atual' : 'Futura'}
                      </span>
                    </div>
                    <p className="text-xs font-extrabold text-slate-900 mt-1">{item.title}</p>
                    <p className="text-[11px] text-slate-500 font-medium">{item.desc}</p>
                  </div>
                );
              })}
            </div>

            {/* Banner de Próximo Passo Recomendado para a Fazenda Ativa */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start sm:items-center gap-2.5 text-xs text-slate-700 font-medium">
                <Sparkles className="w-4 h-4 text-[#1B7547] shrink-0 mt-0.5 sm:mt-0" />
                <span>
                  {activeFarmMetrics?.statusAuditoria === 'Certificada' ? (
                    <>Parabéns! Sua propriedade está <strong>Certificada no Padrão RTRS</strong>. Mantenha a documentação vigente atualizada.</>
                  ) : activeFarmOpenPendenciasCount > 0 ? (
                    <>Próximo passo: Você possui <strong>{activeFarmOpenPendenciasCount} pendência(s) aberta(s)</strong> nesta fazenda. Envie as evidências com ajuda da IA para aprovação.</>
                  ) : activeFarmMetrics?.statusAuditoria === 'Aguardando Aprovação' ? (
                    <>Vistoria técnica 100% preenchida! Sua auditoria está <strong>Aguardando Deliberação Final do Gestor</strong>.</>
                  ) : (
                    <>Próximo passo: Avance no preenchimento da <strong>Autoavaliação RTRS</strong> ({activeFarmMetrics?.respondidos || 0}/115 critérios) para preparar a vistoria técnica.</>
                  )}
                </span>
              </div>

              {activeFarmOpenPendenciasCount > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setPendFilterFarmId(activeFarm.id);
                    setPendFilterStatus('Pendente');
                    setActiveTab('pendencias');
                  }}
                  className="px-3.5 py-1.5 bg-[#1B7547] hover:bg-[#15613a] text-white text-xs font-extrabold rounded-lg transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <span>Regularizar Pendências</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : !activeFarmMetrics?.isSubmittedByTech ? (
                <button
                  type="button"
                  onClick={() => setShowQuestionario(activeFarm.id)}
                  className="px-3.5 py-1.5 bg-[#1B7547] hover:bg-[#15613a] text-white text-xs font-extrabold rounded-lg transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <span>Abrir Autoavaliação</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleOpenPanorama(activeFarm.id)}
                  className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold rounded-lg transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <span>Ver Panorama RTRS</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Card de Vistoria & Técnico de Campo Responsável (1/3) */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-[#1B7547]" />
                  Técnico & Vistoria de Campo
                </span>
                <span
                  className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                    activeFarmMetrics?.statusAuditoria === 'Certificada'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : activeFarmMetrics?.statusAuditoria === 'Aguardando Aprovação'
                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                      : 'bg-blue-50 text-blue-800 border-blue-200'
                  }`}
                >
                  {activeFarmMetrics?.statusAuditoria || 'Em Andamento'}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 space-y-2">
                <div>
                  <p className="text-[11px] text-slate-500 font-medium">Técnico Responsável Designado:</p>
                  <p className="text-sm font-extrabold text-slate-900">{activeFarmMetrics?.tecnicoNome || 'Equipe Técnica Aprosoja-MS'}</p>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-700 pt-1 border-t border-slate-200/60">
                  <Calendar className="w-3.5 h-3.5 text-[#1B7547] shrink-0" />
                  <span>Visita Técnica:</span>
                  <strong className="text-slate-900">
                    {activeFarmMetrics?.dataVisita
                      ? new Date(activeFarmMetrics.dataVisita).toLocaleDateString('pt-BR')
                      : 'A agendar'}
                  </strong>
                </div>
              </div>
            </div>

            {/* Botões de Contato Rápido com o Técnico e Panorama */}
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                {activeFarmMetrics?.tecnicoTelefone && (
                  <a
                    href={`https://wa.me/55${activeFarmMetrics.tecnicoTelefone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 py-2 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5 text-emerald-600" />
                    <span>WhatsApp</span>
                  </a>
                )}
                {activeFarmMetrics?.tecnicoEmail && (
                  <a
                    href={`mailto:${activeFarmMetrics.tecnicoEmail}?subject=Vistoria RTRS - ${encodeURIComponent(activeFarm.nome_fazenda)}`}
                    className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Mail className="w-3.5 h-3.5 text-slate-600" />
                    <span>Contatar Técnico</span>
                  </a>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleOpenPanorama(activeFarm.id)}
                className="w-full py-2 bg-gradient-to-r from-[#1B7547] to-[#15613a] hover:from-[#15613a] hover:to-[#0B3B23] text-white rounded-xl text-xs font-extrabold transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Award className="w-4 h-4 text-[#C59B27]" />
                <span>Ver Panorama & Score RTRS</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ABA 1: MINHA FAZENDA & MAPA */}
      {activeTab === 'mapa' && (
        <div key={`prod-mapa-${activeTab}`} className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in-up duration-300">
          {/* Painel Esquerdo: Cadastro Único + Lista de Fazendas com Dados Reais */}
          <div className="lg:col-span-1 space-y-4">
            <button
              type="button"
              onClick={() => {
                setCadastroMetodo('codigo');
                setShowCodeFarmModal(true);
              }}
              className="w-full group relative flex items-center justify-center gap-2 bg-gradient-to-r from-[#1B7547] to-[#15613a] hover:from-[#15613a] hover:to-[#0B3B23] text-white px-5 py-3.5 rounded-2xl font-extrabold text-xs shadow-md shadow-[#1B7547]/20 hover:shadow-xl hover:scale-[1.01] active:scale-95 transition-all duration-300 cursor-pointer overflow-hidden"
            >
              <span className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out pointer-events-none" />
              <Plus className="w-4 h-4 transition-transform group-hover:rotate-90 duration-300" />
              <span>+ Cadastrar Nova Fazenda (CAR / SIGEF / KML / GPS)</span>
            </button>

            {/* Alertas do Diagnóstico Inicial de Primeiro Acesso (se houver) */}
            {onboardingAlerts.length > 0 && (
              <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    Alertas do Diagnóstico Inicial
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsManualOnboardingReview(true);
                      setShowOnboardingModal(true);
                    }}
                    className="text-[11px] font-bold text-amber-800 underline hover:text-amber-950 cursor-pointer"
                  >
                    Editar
                  </button>
                </div>
                <ul className="space-y-1 text-xs text-amber-950 font-medium">
                  {onboardingAlerts.map((al, idx) => (
                    <li key={idx} className="leading-snug">{al}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="bg-card p-5 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100">
              <div className="relative mb-4">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder={content.busca_placeholder}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all shadow-sm text-sm"
                />
              </div>

              {filteredFarms.length === 0 ? (
                <div className="text-center py-8 px-4 border border-dashed border-slate-200 rounded-xl space-y-2">
                  <p className="text-xs text-slate-500 font-medium">
                    Nenhuma propriedade encontrada. Clique em "+ Cadastrar Nova Fazenda" acima para iniciar.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredFarms.map((feature, i) => {
                    const farmId = String(feature.properties?.id || '');
                    const isSelected = selectedFarmId === farmId;
                    const metrics = farmMetricsMap[farmId];
                    const openPendsCount = pendencias.filter(p => p.propriedade_id === farmId && p.status === 'Pendente').length;
                    const progressPct = metrics ? Math.min(100, Math.round((metrics.respondidos / 115) * 100)) : 0;

                    return (
                      <div
                        key={farmId || i}
                        onClick={() => setSelectedFarmId(farmId)}
                        className={`group relative overflow-hidden border rounded-xl p-4 transition-all duration-300 ease-out cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-50/40 border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
                            : 'bg-background border-border hover:border-primary/50 hover:shadow-md'
                        }`}
                      >
                        <div className={`absolute top-0 left-0 w-1.5 h-full transition-colors ${isSelected ? 'bg-emerald-600' : 'bg-primary/0 group-hover:bg-primary'}`}></div>

                        <div className="flex justify-between items-start gap-2 mb-2">
                          <h3 className="font-extrabold text-foreground text-sm group-hover:text-primary transition-colors">
                            {feature.properties?.name}
                          </h3>
                          {openPendsCount === 0 ? (
                            <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-md uppercase tracking-wider border border-emerald-200 shrink-0">
                              <CheckCircle2 className="w-3 h-3" /> Regular
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[9px] font-bold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-md uppercase tracking-wider border border-amber-200 shrink-0">
                              <AlertTriangle className="w-3 h-3" /> {openPendsCount} Pendência(s)
                            </span>
                          )}
                        </div>

                        {/* Dados Reais da Propriedade */}
                        <div className="space-y-1 mb-3 text-xs">
                          <p className="text-foreground font-medium flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span className="font-semibold text-slate-600">Município:</span>
                            <span className="text-emerald-950 font-bold">{feature.properties?.municipio || 'Mato Grosso do Sul'}</span>
                          </p>
                          {feature.properties?.codigo_car && (
                            <p className="text-[11px] text-slate-600 pl-5 truncate" title={feature.properties.codigo_car}>
                              <span className="font-semibold">CAR/SIGEF:</span>{' '}
                              <span className="font-mono text-slate-800">{feature.properties.codigo_car}</span>
                            </p>
                          )}
                          {feature.properties?.area_soja_ha && (
                            <p className="text-[11px] text-slate-600 pl-5">
                              <span className="font-semibold">Área de Soja:</span>{' '}
                              <strong className="text-slate-800">{feature.properties.area_soja_ha} ha</strong>
                            </p>
                          )}
                        </div>

                        {/* Barra de Progresso RTRS no Card */}
                        <div className="mb-3 p-2.5 bg-slate-50 rounded-xl border border-slate-200/70 space-y-1.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-bold text-slate-700">
                              Checklist RTRS: {metrics?.respondidos || 0}/115
                            </span>
                            <span className="font-extrabold text-[#1B7547]">
                              {metrics?.scoreRtrs !== null && metrics?.scoreRtrs !== undefined
                                ? `${metrics.scoreRtrs}% Conf.`
                                : `${progressPct}% preenchido`}
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#1B7547] rounded-full transition-all duration-500"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>

                        {/* Botões de Ação com Regra de Negócio: Autoavaliação vs. Vistoria Oficial Submetida */}
                        <div className="flex flex-col gap-2">
                          {metrics?.isSubmittedByTech ? (
                            <>
                              <div className="px-2.5 py-1.5 bg-amber-50/90 border border-amber-200 rounded-lg flex items-center gap-1.5 text-[10px] font-bold text-amber-900">
                                <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                                <span>Vistoria Oficial Submetida ({metrics.statusAuditoria})</span>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPendFilterFarmId(farmId);
                                    setActiveTab('pendencias');
                                  }}
                                  className="flex-1 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold transition-all shadow-xs cursor-pointer text-center"
                                >
                                  Regularizar Pendências ({openPendsCount})
                                </button>
                              </div>
                            </>
                          ) : (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowQuestionario(farmId);
                                }}
                                className="flex-1 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-[11px] font-bold transition-all border border-emerald-200 shadow-2xs cursor-pointer text-center"
                              >
                                Autoavaliação ({metrics?.respondidos || 0}/115)
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPendFilterFarmId(farmId);
                                  setActiveTab('pendencias');
                                }}
                                className="flex-1 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-[11px] font-bold transition-all border border-slate-200 shadow-2xs cursor-pointer text-center"
                              >
                                Pendências ({openPendsCount})
                              </button>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenPanorama(farmId);
                            }}
                            className="w-full py-1.5 bg-gradient-to-r from-[#1B7547] to-[#15613a] hover:from-[#15613a] hover:to-[#0B3B23] text-white rounded-lg text-[11px] font-extrabold transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer text-center"
                          >
                            <Award className="w-3.5 h-3.5 text-[#C59B27]" />
                            <span>Ver Panorama & Score RTRS</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Painel Direito: Mapa Geoespacial Real */}
          <div className="lg:col-span-2 relative">
            <div className="h-[600px] w-full rounded-2xl overflow-hidden border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] relative">
              <MapView
                farms={farmsData}
                selectedFarmId={selectedFarmId}
                interactive={true}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal Unificado: Cadastrar Nova Fazenda (CAR / SIGEF / KML ou GPS no Mapa) */}
      {showCodeFarmModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowCodeFarmModal(false)}
          title="Cadastrar Nova Fazenda"
        >
          <div className="space-y-4">
            {/* Seletor de Método de Cadastro */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setCadastroMetodo('codigo')}
                className={`py-2 px-3 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                  cadastroMetodo === 'codigo'
                    ? 'bg-[#1B7547] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Código CAR / SIGEF / KML
              </button>
              <button
                type="button"
                onClick={() => setCadastroMetodo('gps')}
                className={`py-2 px-3 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  cadastroMetodo === 'gps'
                    ? 'bg-[#1B7547] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                <span>Localizar Sede no Mapa (GPS)</span>
              </button>
            </div>

            {cadastroMetodo === 'codigo' ? (
              <form onSubmit={handleCreateCodeFarm} className="space-y-4">
                <PropertyCodeInput
                  onChange={(data) => setCodeFarmData(prev => ({ ...data, area_soja_ha: prev?.area_soja_ha || '' }))}
                />

                <div className="space-y-1">
                  <label className="text-xs font-extrabold text-slate-700 uppercase">Área Plantada de Soja da Fazenda (ha)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    placeholder="Ex: 1200 (hectares)"
                    value={codeFarmData?.area_soja_ha || ''}
                    onChange={e => setCodeFarmData(prev => prev ? { ...prev, area_soja_ha: e.target.value } : null)}
                    className="w-full px-3 py-2 bg-background border border-input rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-transparent focus:outline-none text-foreground font-medium"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-4 border-t border-border mt-6">
                  <button
                    type="button"
                    onClick={() => setShowCodeFarmModal(false)}
                    className="px-4 py-2 text-sm font-bold rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-5 py-2 text-sm font-black rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    Confirmar Cadastro
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-extrabold text-slate-700 uppercase">Nome da Propriedade Rural</label>
                  <input
                    type="text"
                    placeholder="Ex: Fazenda Santa Maria"
                    value={newFarmName}
                    onChange={(e) => setNewFarmName(e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-input rounded-xl text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-extrabold text-slate-700 uppercase">Área Plantada de Soja (ha - opcional)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Ex: 850"
                    value={newFarmAreaHa}
                    onChange={(e) => setNewFarmAreaHa(e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-input rounded-xl text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Ao clicar no botão abaixo, você poderá buscar seu município ou usar o GPS para posicionar o marcador exatamente sobre a sede da fazenda.
                </p>
                <div className="flex justify-end gap-2 pt-4 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setShowCodeFarmModal(false)}
                    className="px-4 py-2 text-sm font-bold rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLocationModal(true)}
                    className="px-5 py-2 text-sm font-black rounded-xl bg-[#1B7547] text-white hover:bg-[#15613a] cursor-pointer flex items-center gap-2"
                  >
                    <Compass className="w-4 h-4 text-[#C59B27]" />
                    <span>Abrir Mapa GPS da Sede</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ABA 2: PENDÊNCIAS & ADEQUAÇÃO COM IA INTEGRADA EM 2 NÍVEIS */}
      {activeTab === 'pendencias' && (
        <div key={`prod-pends-${activeTab}`} className="space-y-6 animate-fade-in-up duration-300 max-w-5xl mx-auto">
          {/* Card Nível 2 IA: Gerador de Plano Geral Priorizado da Fazenda */}
          <div className="bg-gradient-to-r from-indigo-950 via-indigo-900 to-slate-900 text-white p-5 sm:p-6 rounded-2xl shadow-md border border-indigo-800/60 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-200 border border-indigo-400/30">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Assistente Inteligente de Adequação RTRS</span>
                </div>
                <h3 className="text-lg sm:text-xl font-extrabold text-white">
                  Plano de Ação & Regularização Assistida por IA
                </h3>
                <p className="text-xs text-indigo-200/90 font-medium">
                  Gere um roteiro priorizado para todas as pendências abertas da fazenda ou clique em <strong>"Como Resolver (IA)"</strong> em qualquer item abaixo para orientação imediata.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleGenerateGeneralAIPlan}
                  disabled={isAiLoading || pendencyStatusCounts.pendentes === 0}
                  className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isAiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  <span>
                    {isAiLoading
                      ? 'Analisando Pendências...'
                      : `Gerar Plano Geral da Fazenda (${pendencyStatusCounts.pendentes})`}
                  </span>
                </button>
                {showGeneralAiPlan && (
                  <button
                    type="button"
                    onClick={() => setShowGeneralAiPlan(false)}
                    className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold cursor-pointer"
                    title="Ocultar Plano Geral"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {showGeneralAiPlan && (
              <div className="pt-2">
                <AIInsightsPanel
                  title={content.ia_painel_titulo}
                  insights={aiActionPlan}
                  isLoading={isAiLoading}
                />
              </div>
            )}
          </div>

          {/* Painel de Filtros Rápidos e Listagem de Pendências */}
          <div className="bg-card p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-xl font-extrabold text-foreground flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-[#1B7547]" />
                  <span>Checklist de Pendências & Adequação</span>
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Filtre por status ou Princípio RTRS, consulte o passo a passo da IA e anexe suas evidências para revisão do técnico.
                </p>
              </div>

              {/* Filtro por Fazenda */}
              {properties.length > 0 && (
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-slate-400" />
                  <select
                    value={pendFilterFarmId}
                    onChange={(e) => setPendFilterFarmId(e.target.value)}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-extrabold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1B7547]"
                  >
                    <option value="todas">Todas as Fazendas ({properties.length})</option>
                    {properties.map(p => (
                      <option key={p.id} value={p.id}>{p.nome_fazenda}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Barra de Filtros: Pílulas de Status + Filtro de Princípio RTRS + Busca */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              {/* Pílulas de Status */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'todas', label: `Todas (${pendencyStatusCounts.todas})` },
                  { id: 'Pendente', label: `Pendentes (${pendencyStatusCounts.pendentes})` },
                  { id: 'Em Análise', label: `Em Análise (${pendencyStatusCounts.emAnalise})` },
                  { id: 'Resolvida', label: `Resolvidas (${pendencyStatusCounts.resolvidas})` }
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setPendFilterStatus(tab.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                      pendFilterStatus === tab.id
                        ? 'bg-[#1B7547] text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Filtro por Princípio RTRS e Busca Textual */}
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={pendFilterPrincipio}
                  onChange={(e) => setPendFilterPrincipio(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#1B7547]"
                >
                  <option value="todos">Todos os 5 Princípios RTRS</option>
                  <option value="1">Princípio 1: Legislação & Negócios</option>
                  <option value="2">Princípio 2: Condições Trabalhistas</option>
                  <option value="3">Princípio 3: Relações Comunitárias</option>
                  <option value="4">Princípio 4: Meio Ambiente</option>
                  <option value="5">Princípio 5: Boas Práticas Agrícolas</option>
                </select>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Buscar critério ou termo..."
                    value={pendSearchText}
                    onChange={(e) => setPendSearchText(e.target.value)}
                    className="w-full sm:w-52 pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#1B7547]"
                  />
                </div>
              </div>
            </div>

            {/* Listagem Agrupada por Fazenda */}
            {properties.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-border rounded-xl">
                <p className="text-muted-foreground text-sm">
                  Nenhuma propriedade cadastrada no seu perfil. Cadastre sua fazenda na aba "Minha Fazenda & Mapa".
                </p>
              </div>
            ) : filteredPendencias.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl space-y-2">
                <p className="text-sm font-bold text-slate-700">Nenhuma pendência encontrada para os filtros selecionados.</p>
                <button
                  type="button"
                  onClick={() => {
                    setPendFilterStatus('todas');
                    setPendFilterPrincipio('todos');
                    setPendSearchText('');
                  }}
                  className="text-xs font-extrabold text-[#1B7547] underline cursor-pointer"
                >
                  Limpar filtros
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {properties
                  .filter(prop => pendFilterFarmId === 'todas' || prop.id === pendFilterFarmId)
                  .map(prop => {
                    const propPends = filteredPendencias.filter(p => p.propriedade_id === prop.id);
                    if (propPends.length === 0) return null;

                    return (
                      <div key={prop.id} className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap justify-between items-center gap-2">
                          <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-[#1B7547]" />
                            <span>{prop.nome_fazenda}</span>
                          </h3>
                          <span className="text-xs font-bold text-slate-600 bg-white px-2.5 py-0.5 rounded-full border border-slate-200">
                            {propPends.length} item(ns) exibido(s)
                          </span>
                        </div>

                        <div className="divide-y divide-slate-100">
                          {propPends.map(pend => {
                            const aiItem = itemAiPlans[pend.id];
                            const principioNum = extractPrincipioFromPendency(pend.titulo, pend.descricao);
                            const remaining = getRemainingTimeLabel(pend.prazo, pend.status);

                            return (
                              <div key={pend.id} className="p-4 sm:p-5 hover:bg-slate-50/40 transition-colors space-y-3">
                                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                                  <div className="space-y-1.5 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span
                                        className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider border ${
                                          pend.status === 'Pendente'
                                            ? 'bg-amber-100/70 text-amber-800 border-amber-200'
                                            : pend.status === 'Em Análise'
                                            ? 'bg-indigo-100/70 text-indigo-800 border-indigo-200'
                                            : 'bg-emerald-100/70 text-emerald-800 border-emerald-200'
                                        }`}
                                      >
                                        {pend.status}
                                      </span>

                                      {principioNum && (
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                                          Princípio {principioNum}
                                        </span>
                                      )}

                                      {pend.prazo && (
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1 ${remaining.className}`}>
                                          <Clock className="w-3 h-3" />
                                          <span>Prazo: {new Date(pend.prazo).toLocaleDateString('pt-BR')} ({remaining.text})</span>
                                        </span>
                                      )}
                                    </div>

                                    <h4 className="font-extrabold text-slate-900 text-sm">{pend.titulo}</h4>
                                    <p className="text-xs text-slate-600 leading-relaxed">{pend.descricao}</p>

                                    {pend.motivo_rejeicao && pend.status === 'Pendente' && (
                                      <div className="mt-2 p-3 bg-amber-50/90 rounded-xl border border-amber-200 text-xs text-amber-950">
                                        <span className="font-extrabold text-amber-900">Ajustes Solicitados pelo Técnico: </span>
                                        "{pend.motivo_rejeicao}"
                                      </div>
                                    )}

                                    {(pend.status === 'Em Análise' || pend.status === 'Resolvida' || pend.status === 'Resolvido') && (
                                      <div className="mt-2 p-3 bg-emerald-50/50 rounded-xl border border-emerald-200/70 text-xs text-emerald-950 flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                          <span className="font-bold">Resolução Enviada: </span>
                                          <span className="italic">"{pend.resolucao_descricao || 'Comprovante anexado'}"</span>
                                        </div>
                                        {pend.evidencia_url && (
                                          <button
                                            type="button"
                                            onClick={() => handleOpenEvidencia(pend.evidencia_url)}
                                            className="px-3 py-1 bg-white border border-emerald-300 text-emerald-800 rounded-lg font-bold hover:bg-emerald-50 flex items-center gap-1.5 cursor-pointer"
                                          >
                                            <Eye className="w-3.5 h-3.5 text-emerald-600" />
                                            <span>Ver Evidência</span>
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  {/* Botões de Ação da Pendência */}
                                  <div className="flex sm:flex-row md:flex-col gap-2 shrink-0 md:w-48">
                                    {pend.status === 'Pendente' && (
                                      <button
                                        type="button"
                                        onClick={() => handleOpenResolutionModal(pend)}
                                        className="flex-1 py-2 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                                      >
                                        <CheckCircle2 className="w-4 h-4" />
                                        <span>Resolver Pendência</span>
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => handleToggleItemAIPlan(pend)}
                                      className="flex-1 py-2 px-3.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-extrabold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                                    >
                                      {aiItem?.loading ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                                      ) : (
                                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                                      )}
                                      <span>Como Resolver (IA)</span>
                                      {aiItem?.plan && (
                                        aiItem.open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  </div>
                                </div>

                                {/* Painel Expansível IA Nível 1 (Direto na Pendência) */}
                                {aiItem?.open && (
                                  <div className="mt-2 p-4 bg-indigo-950/5 border border-indigo-200 rounded-xl space-y-2 animate-fade-in">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-800 flex items-center gap-1.5">
                                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                                        Orientação Prática RTRS (IA)
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setItemAiPlans(prev => ({
                                            ...prev,
                                            [pend.id]: { ...prev[pend.id], open: false }
                                          }))
                                        }
                                        className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    </div>
                                    {aiItem.loading ? (
                                      <div className="flex items-center gap-2 text-xs text-indigo-700 py-2">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span>Consultando diretrizes RTRS para este critério...</span>
                                      </div>
                                    ) : (
                                      <div className="text-xs text-slate-800 whitespace-pre-line leading-relaxed font-medium">
                                        {aiItem.plan}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Modal de Envio de Resolução com IA Integrada */}
          {selectedPendency && (
            <Modal
              isOpen={!!selectedPendency}
              onClose={() => setSelectedPendency(null)}
              title={`Resolver Pendência: ${selectedPendency.titulo}`}
            >
              <form onSubmit={handleSubmitResolution} className="space-y-4">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <p className="text-xs text-slate-700 font-medium leading-relaxed">
                    {selectedPendency.descricao}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleToggleItemAIPlan(selectedPendency)}
                    className="inline-flex items-center gap-1.5 text-xs font-extrabold text-indigo-700 hover:text-indigo-900 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    <span>{itemAiPlans[selectedPendency.id]?.open ? 'Ocultar dica da IA' : 'Ver orientação passo a passo (IA)'}</span>
                  </button>
                  {itemAiPlans[selectedPendency.id]?.open && (
                    <div className="p-3 bg-indigo-50/80 border border-indigo-200 rounded-lg text-xs text-slate-800 whitespace-pre-line leading-relaxed">
                      {itemAiPlans[selectedPendency.id]?.loading
                        ? 'Gerando recomendação RTRS...'
                        : itemAiPlans[selectedPendency.id]?.plan}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Descrição da Resolução</label>
                  <textarea
                    required
                    rows={4}
                    value={resolucaoTexto}
                    onChange={e => setResolucaoTexto(e.target.value)}
                    placeholder="Descreva as ações que você tomou para regularizar este item..."
                    className="w-full px-3 py-2 bg-background border border-input rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent text-sm resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground block">Arquivo de Evidência (Foto ou PDF)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      id="evidence-file-upload"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={handleUploadEvidenceFile}
                    />
                    <button
                      type="button"
                      onClick={() => document.getElementById('evidence-file-upload')?.click()}
                      disabled={uploadingFile}
                      className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      {uploadingFile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5 text-primary" />}
                      {uploadingFile ? 'Carregando...' : 'Anexar Foto / PDF'}
                    </button>
                    {evidenciaUrl && (
                      <span className="text-xs text-emerald-700 font-bold truncate max-w-[220px]" title={evidenciaUrl}>
                        ✓ Arquivo Anexado
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setSelectedPendency(null)}
                    className="px-4 py-2 font-bold text-xs rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingResolution}
                    className="px-5 py-2 font-extrabold text-xs rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    {isSubmittingResolution && <Loader2 className="w-4 h-4 animate-spin" />}
                    Enviar para Revisão Técnica
                  </button>
                </div>
              </form>
            </Modal>
          )}
        </div>
      )}

      {/* ABA 3: DOCUMENTAÇÃO & EVIDÊNCIAS */}
      {activeTab === 'documentacao' && (
        <div className="space-y-6 animate-fade-in-up max-w-6xl mx-auto">
          <div className="bg-card p-4 sm:p-6 rounded-2xl border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
                <FolderOpen className="w-6 h-6 text-emerald-600 shrink-0" />
                <span>Documentação Vigente da Propriedade</span>
              </h2>
              <p className="text-muted-foreground text-xs sm:text-sm mt-1">
                Documentos e comprovantes de conformidade organizados por Princípios RTRS e categoria. Exibindo apenas a última versão vigente de cada critério.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (properties.length === 0) {
                  warning('Você precisa ter pelo menos uma propriedade cadastrada para anexar documentos.');
                  return;
                }
                setDocFormData(prev => ({ ...prev, propriedade_id: activeFarm?.id || properties[0].id }));
                setShowUploadDocModal(true);
              }}
              className="w-full md:w-auto min-h-[44px] flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all shadow-sm cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Anexar Novo Documento</span>
            </button>
          </div>

          {loadingDocs ? (
            <div className="flex justify-center items-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* SEÇÃO 1: DOCUMENTOS GERAIS DA FAZENDA */}
              <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-emerald-700 shrink-0" />
                    <span>Documentos Gerais da Fazenda (Últimas Versões)</span>
                  </h3>
                  <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full w-fit">
                    CAR, LAU, EPI e Laudos
                  </span>
                </div>

                {(() => {
                  const genMap = new Map<string, any>();
                  documentos
                    .filter(d => ['CAR', 'LAU', 'EPI', 'Contrato', 'Outros', 'Armazenamento Geral'].includes(d.categoria) || d.origem === 'Armazenamento Geral')
                    .forEach(d => {
                      const key = `${d.propriedade_id}_${d.categoria}_${d.nome}`;
                      const existing = genMap.get(key);
                      if (!existing || new Date(d.data).getTime() > new Date(existing.data).getTime()) {
                        genMap.set(key, d);
                      }
                    });
                  const latestGenDocs = Array.from(genMap.values());

                  if (latestGenDocs.length === 0) {
                    return (
                      <div className="py-6 text-center text-slate-400 text-xs font-medium">
                        Nenhum documento geral anexado ainda. Clique em "Anexar Novo Documento" para registrar CAR, LAU ou EPI.
                      </div>
                    );
                  }

                  return (
                    <>
                      <div className="block md:hidden space-y-3">
                        {latestGenDocs.map((doc) => (
                          <div key={`mob-gen-${doc.id}`} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                                {doc.categoria}
                              </span>
                              <span className="text-[10px] text-slate-400 font-bold">
                                {new Date(doc.data).toLocaleDateString('pt-BR')}
                              </span>
                            </div>

                            <div>
                              <h4 className="text-xs font-bold text-slate-900">{doc.nome}</h4>
                              <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded mt-1 inline-block">✓ Versão Vigente</span>
                            </div>

                            <div className="flex flex-col gap-2 pt-2 border-t border-slate-200/60">
                              <button
                                type="button"
                                onClick={() => handleOpenEvidencia(doc.arquivo_url)}
                                className="w-full min-h-[44px] text-xs text-emerald-700 bg-white border border-emerald-300 hover:bg-emerald-50 rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                              >
                                <Eye className="w-4 h-4 text-emerald-600" />
                                <span>Ver Arquivo / Documento</span>
                              </button>

                              {doc.podeDeletar && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDoc(doc.id)}
                                  className="w-full min-h-[40px] text-xs text-red-600 bg-red-50/50 hover:bg-red-100 border border-red-200 rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Excluir Documento</span>
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-slate-50 border-b border-border text-slate-600 font-extrabold uppercase tracking-wider text-[11px]">
                            <tr>
                              <th className="px-4 py-3">Documento</th>
                              <th className="px-4 py-3">Categoria</th>
                              <th className="px-4 py-3">Data</th>
                              <th className="px-4 py-3">Status</th>
                              <th className="px-4 py-3 text-right">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border bg-white">
                            {latestGenDocs.map((doc) => (
                              <tr key={`desk-gen-${doc.id}`} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-4 py-3 font-bold text-slate-900">{doc.nome}</td>
                                <td className="px-4 py-3">
                                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    {doc.categoria}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-slate-500 font-medium">{new Date(doc.data).toLocaleDateString('pt-BR')}</td>
                                <td className="px-4 py-3">
                                  <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                    ✓ Versão Vigente
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEvidencia(doc.arquivo_url)}
                                      className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
                                    >
                                      <Eye className="w-3.5 h-3.5 text-emerald-600" />
                                      <span>Ver Arquivo</span>
                                    </button>
                                    {doc.podeDeletar && (
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteDoc(doc.id)}
                                        className="p-1.5 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                                        title="Excluir"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* SEÇÃO 2: EVIDÊNCIAS ORGANIZADAS PELOS 5 PRINCÍPIOS RTRS */}
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <h3 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <span>Evidências Organizadas por Princípios RTRS</span>
                  </h3>
                  <span className="text-xs text-slate-500 font-bold">Apenas a última versão de cada critério</span>
                </div>

                {[
                  { num: 1, nome: 'Princípio 1: Cumprimento da Legislação e Boas Práticas Empresariais' },
                  { num: 2, nome: 'Princípio 2: Condições de Trabalho Fisiológicas e Humanas' },
                  { num: 3, nome: 'Princípio 3: Relações Comunitárias e Sociais' },
                  { num: 4, nome: 'Princípio 4: Meio Ambiente e Biodiversidade' },
                  { num: 5, nome: 'Princípio 5: Boas Práticas Agrícolas e Produção' }
                ].map((principio) => {
                  const mapCrit = new Map<string, any>();

                  documentos.forEach(doc => {
                    const pExtracted = extractPrincipioFromPendency(doc.nome, '');
                    const matchesPrincipio =
                      doc.nome.includes(`Princípio ${principio.num}`) ||
                      pExtracted === principio.num ||
                      (principio.num === 1 && doc.categoria === 'Checklist RTRS' && !doc.nome.includes('Princípio') && !pExtracted);

                    if (matchesPrincipio) {
                      const key = doc.nome;
                      const existing = mapCrit.get(key);
                      if (!existing || new Date(doc.data).getTime() > new Date(existing.data).getTime()) {
                        mapCrit.set(key, doc);
                      }
                    }
                  });

                  const principioDocs = Array.from(mapCrit.values());

                  return (
                    <div key={principio.num} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="bg-slate-50 px-4 sm:px-6 py-3.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-emerald-700 text-white flex items-center justify-center text-[10px] shrink-0">
                            {principio.num}
                          </span>
                          <span className="truncate">{principio.nome}</span>
                        </span>
                        <span className="text-xs font-bold text-slate-500 bg-white px-2.5 py-0.5 rounded-full border border-slate-200 w-fit shrink-0">
                          {principioDocs.length} critério(s) com evidência
                        </span>
                      </div>

                      <div className="p-4">
                        {principioDocs.length === 0 ? (
                          <div className="py-4 text-center text-slate-400 text-xs font-medium">
                            Nenhuma evidência anexada para os critérios deste princípio ainda.
                          </div>
                        ) : (
                          <>
                            <div className="block md:hidden space-y-3">
                              {principioDocs.map((doc) => (
                                <div key={`mob-p-${doc.id}`} className="p-3.5 bg-slate-50/70 rounded-xl border border-slate-200 space-y-2.5">
                                  <div className="flex items-center justify-between gap-1.5">
                                    <span className="text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200">
                                      Última Versão
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-medium">
                                      {new Date(doc.data).toLocaleDateString('pt-BR')}
                                    </span>
                                  </div>
                                  <div>
                                    <h4 className="text-xs font-bold text-slate-900">{doc.nome}</h4>
                                    <p className="text-[11px] text-slate-500">{doc.origem}</p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEvidencia(doc.arquivo_url)}
                                    className="w-full min-h-[44px] bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-800 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                                  >
                                    <Eye className="w-4 h-4 text-emerald-600" />
                                    <span>Ver Evidência Anexada</span>
                                  </button>
                                </div>
                              ))}
                            </div>

                            <div className="hidden md:block overflow-x-auto">
                              <table className="w-full text-left text-xs border-collapse">
                                <thead className="bg-slate-50 border-b border-border text-slate-600 font-extrabold uppercase tracking-wider text-[11px]">
                                  <tr>
                                    <th className="px-4 py-3">Critério RTRS</th>
                                    <th className="px-4 py-3">Origem</th>
                                    <th className="px-4 py-3">Data</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3 text-right">Ação</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border bg-white">
                                  {principioDocs.map((doc) => (
                                    <tr key={`desk-p-${doc.id}`} className="hover:bg-slate-50/50 transition-colors">
                                      <td className="px-4 py-3 font-bold text-slate-900">{doc.nome}</td>
                                      <td className="px-4 py-3 text-slate-500 font-medium">{doc.origem}</td>
                                      <td className="px-4 py-3 text-slate-500 font-medium">{new Date(doc.data).toLocaleDateString('pt-BR')}</td>
                                      <td className="px-4 py-3">
                                        <span className="text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200">
                                          Última Versão
                                        </span>
                                      </td>
                                      <td className="px-4 py-3 text-right">
                                        <button
                                          type="button"
                                          onClick={() => handleOpenEvidencia(doc.arquivo_url)}
                                          className="px-3.5 py-1.5 bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-800 rounded-lg text-xs font-bold transition-all shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
                                        >
                                          <Eye className="w-3.5 h-3.5 text-emerald-600" />
                                          <span>Ver Evidência</span>
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Modal para upload de documentos gerais */}
          {showUploadDocModal && createPortal(
            <div className="fixed inset-0 z-50 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-zoom-in">
                <div className="bg-gradient-to-r from-emerald-800 to-emerald-700 text-white px-6 py-4 flex justify-between items-center">
                  <h3 className="font-bold text-lg">Arquivar Documento</h3>
                  <button onClick={() => setShowUploadDocModal(false)} className="p-1.5 bg-white/10 rounded-full hover:bg-emerald-600/50">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleSaveDoc} className="p-6 space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-600 uppercase">Propriedade Vinculada</label>
                    <select
                      value={docFormData.propriedade_id}
                      onChange={(e) => setDocFormData(prev => ({ ...prev, propriedade_id: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm focus:border-transparent text-foreground"
                      required
                    >
                      {properties.map(p => (
                        <option key={p.id} value={p.id}>{p.nome_fazenda}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-600 uppercase">Nome do Documento</label>
                    <input
                      type="text"
                      placeholder="Ex: CAR - Fazenda Boa Vista"
                      value={docFormData.nome}
                      onChange={(e) => setDocFormData(prev => ({ ...prev, nome: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm focus:border-transparent text-foreground"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-600 uppercase">Categoria</label>
                    <select
                      value={docFormData.categoria}
                      onChange={(e) => setDocFormData(prev => ({ ...prev, categoria: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm focus:border-transparent text-foreground"
                    >
                      <option value="CAR">Cadastro Ambiental Rural (CAR)</option>
                      <option value="LAU">Licença Ambiental (LAU/LAS)</option>
                      <option value="EPI">Comprovantes de EPI / Treinamentos</option>
                      <option value="Contrato">Contratos de Trabalho / Sociais</option>
                      <option value="Outros">Outros Documentos</option>
                    </select>
                  </div>

                  <div className="space-y-2 pt-2">
                    <label className="text-xs font-bold text-gray-600 uppercase block">Anexar Arquivo (PDF ou Imagem)</label>
                    {!docFormData.arquivo_url ? (
                      <div>
                        <input
                          type="file"
                          id="new-doc-file"
                          accept="image/*,application/pdf"
                          className="hidden"
                          onChange={handleUploadDocFile}
                        />
                        <button
                          type="button"
                          onClick={() => document.getElementById('new-doc-file')?.click()}
                          disabled={uploadingDocFile}
                          className="w-full py-4 border-2 border-dashed border-emerald-300 bg-emerald-50/50 hover:bg-emerald-100 text-emerald-700 rounded-xl flex flex-col items-center justify-center gap-1 font-bold text-xs cursor-pointer transition-colors disabled:opacity-50"
                        >
                          {uploadingDocFile ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <>
                              <Plus className="w-5 h-5" />
                              <span>Selecionar PDF ou Imagem</span>
                            </>
                          )}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 bg-emerald-50/80 border border-emerald-200 rounded-xl p-3">
                        <div className="bg-emerald-100 p-2 rounded-lg text-emerald-700">
                          {docFormData.arquivo_url.toLowerCase().includes('.pdf') ? (
                            <FileText className="w-5 h-5" />
                          ) : (
                            <ImageIcon className="w-5 h-5" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-gray-900 truncate">Arquivo Anexado com Sucesso</p>
                          <p className="text-[10px] text-emerald-600 font-medium">Sincronizado no Storage</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDocFormData(prev => ({ ...prev, arquivo_url: '' }))}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <X className="w-4.5 h-4.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-2 pt-4 border-t border-gray-100 mt-6">
                    <button
                      type="button"
                      onClick={() => setShowUploadDocModal(false)}
                      className="px-4 py-2 text-sm text-gray-500 bg-gray-50 hover:bg-gray-100 rounded-xl font-bold cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={!docFormData.arquivo_url}
                      className="px-4 py-2 text-sm text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-bold cursor-pointer"
                    >
                      Arquivar
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )}
        </div>
      )}

      {/* Modal de Questionário RTRS (Autoavaliação) */}
      {showQuestionario && (
        <ModalErrorBoundary onClose={() => setShowQuestionario(null)}>
          <QuestionarioRTRS
            modo="autoavaliacao"
            propriedadeNome={properties.find(p => p.id === showQuestionario)?.nome_fazenda || 'Fazenda'}
            onClose={() => setShowQuestionario(null)}
            onComplete={() => handleFinishAutoavaliacao()}
            propriedadeId={showQuestionario.toString()}
            auditoriaId={farmMetricsMap[showQuestionario.toString()]?.auditoriaId || undefined}
          />
        </ModalErrorBoundary>
      )}

      {/* Confirmação de Exclusão de Documento */}
      <ConfirmAction
        isOpen={!!deleteDocConfirmId}
        onClose={() => setDeleteDocConfirmId(null)}
        onConfirm={executeDeleteDoc}
        title="Excluir Documento"
        description="Deseja realmente remover este documento do armazenamento? Esta ação não poderá ser desfeita."
        confirmText="Excluir"
        actionType="danger"
      />

      {/* Modal Lightbox de Foto Ampliada */}
      {fotoAmpliada && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-fadeIn transition-all" onClick={() => setFotoAmpliada(null)}>
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
            <button type="button" onClick={() => setFotoAmpliada(null)} className="absolute -top-10 right-0 text-white bg-black/50 hover:bg-black/70 p-2 rounded-full transition-all cursor-pointer shadow-md">
              <X className="w-6 h-6" />
            </button>
            <img src={fotoAmpliada} alt="Evidência Ampliada" className="max-w-full max-h-[85vh] rounded-xl shadow-2xl object-contain border border-slate-700/60 bg-slate-900/40" />
            {fotoAmpliada.startsWith('http') && (
              <a href={fotoAmpliada} target="_blank" rel="noreferrer" className="mt-3 text-xs text-emerald-300 underline font-bold hover:text-white flex items-center gap-1 bg-black/40 px-3 py-1 rounded-full border border-white/10">
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Abrir imagem original em nova guia</span>
              </a>
            )}
          </div>
        </div>
      )}

      {/* Modal Viewer de PDF */}
      {pdfAmpliado && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-fadeIn" onClick={() => setPdfAmpliado(null)}>
          <div className="relative w-full max-w-5xl h-[88vh] flex flex-col bg-slate-900 rounded-2xl overflow-hidden border border-slate-700 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-3.5 bg-slate-800 border-b border-slate-700 text-white">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-400" />
                <span className="font-bold text-sm">Visualizador de Documento PDF</span>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={pdfAmpliado}
                  download="documento.pdf"
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar / Abrir PDF</span>
                </a>
                <button type="button" onClick={() => setPdfAmpliado(null)} className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="flex-1 w-full h-full bg-slate-950">
              <iframe src={pdfAmpliado} className="w-full h-full border-none" title="Documento PDF" />
            </div>
          </div>
        </div>
      )}

      {/* Modal de Localização Interativa por Mapa Pop-up */}
      <LocationFinderModal
        isOpen={showLocationModal}
        onClose={() => setShowLocationModal(false)}
        onConfirmLocation={handleConfirmLocationFromModal}
        initialFarmName={newFarmName}
      />

      {/* Modal Executivo de Panorama & Pontuação RTRS da Fazenda */}
      {panoramaModalFarm && (
        <Modal
          isOpen={true}
          onClose={() => setPanoramaModalFarm(null)}
          title=""
          maxWidth="max-w-4xl"
        >
          <div className="p-1 sm:p-2">
            {loadingPanorama ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-[#1B7547]" />
                <span className="text-xs font-bold text-slate-600">Calculando indicadores e conformidade RTRS...</span>
              </div>
            ) : (
              <PanoramaScoreRTRS
                propriedadeNome={panoramaModalFarm.nome_fazenda}
                municipio={resolveMunicipioFromCarOrName(panoramaModalFarm.codigo_car, panoramaModalFarm.nome_fazenda, panoramaModalFarm.municipio)}
                produtorNome={panoramaModalFarm.nome_produtor}
                criterios={panoramaCriteriosList}
                readOnly={true}
                etapa={farmMetricsMap[panoramaModalFarm.id]?.etapa || resolveFarmEtapa(panoramaModalFarm.id, panoramaModalFarm.etapa, null)}
                onClose={() => setPanoramaModalFarm(null)}
                onBackToQuestions={
                  farmMetricsMap[panoramaModalFarm.id]?.isSubmittedByTech
                    ? undefined
                    : () => {
                        const fId = panoramaModalFarm.id;
                        setPanoramaModalFarm(null);
                        setShowQuestionario(fId);
                      }
                }
              />
            )}
          </div>
        </Modal>
      )}

      {/* Modal de Onboarding / Revisão do Diagnóstico Inicial */}
      <ModalErrorBoundary onClose={() => setShowOnboardingModal(false)}>
        <OnboardingQuestionarioModal
          isOpen={showOnboardingModal}
          producerName={producerName}
          initialAnswers={onboardingAnswers}
          onClose={isManualOnboardingReview ? () => setShowOnboardingModal(false) : undefined}
          onComplete={(answers, alerts) => {
            setShowOnboardingModal(false);
            setIsManualOnboardingReview(false);
            setOnboardingAnswers(answers);
            setOnboardingAlerts(alerts);
            fetchFarmsAndPendencias();
          }}
        />
      </ModalErrorBoundary>
    </div>
  );
}
