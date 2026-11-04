import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Plus, AlertTriangle, CheckCircle, Search, ShieldAlert, Loader2, Sparkles, ClipboardList, Clock, CheckCircle2, Image as ImageIcon, FolderOpen, FileText, Trash2, X, Eye, Download, ExternalLink, Compass, Building2, ShieldCheck } from 'lucide-react';
import MapView from '../../components/map/MapView';
import type { FeatureCollection, Feature, Polygon } from 'geojson';
import QuestionarioRTRS from '../../components/auditoria/QuestionarioRTRS';
import OnboardingQuestionarioModal, { type OnboardingAnswers } from '../../components/auditoria/OnboardingQuestionarioModal';
import AIInsightsPanel from '../../components/ui/AIInsightsPanel';
import { aiService } from '../../services/aiService';
import siteContent from '../../config/site_content.json';
import { supabase } from '../../lib/supabase';
import { resolveFarmEtapa } from '../../lib/etapaUtils';
import { cleanEvidenceUrl, isPdfEvidence } from '../../lib/evidenceService';
import Modal from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import { useSearchParams } from 'react-router-dom';
import { getRemainingTimeLabel } from '../../lib/dateUtils';
import PropertyCodeInput from '../../components/form/PropertyCodeInput';
import type { PropertyCodeResult } from '../../components/form/PropertyCodeInput';
import { ListSkeleton } from '../../components/ui/Skeleton';
import ConfirmAction from '../../components/ui/ConfirmAction';
import LocationFinderModal, { type LocationResult } from '../../components/map/LocationFinderModal';

// Dados Geográficos Mockados de Fallback
const MOCK_FARMS: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: 1, name: 'Fazenda Boa Esperança', status: 'Autoavaliação pendente' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[-54.6, -20.4], [-54.5, -20.4], [-54.5, -20.5], [-54.6, -20.5], [-54.6, -20.4]]]
      }
    },
    {
      type: 'Feature',
      properties: { id: 2, name: 'Sítio Recanto', status: 'Certificada' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[-55.1, -21.0], [-55.0, -21.0], [-55.0, -21.1], [-55.1, -21.1], [-55.1, -21.0]]]
      }
    }
  ]
};

const MOCK_EMBARGOES: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { riskType: 'Desmatamento Ilegal (IBAMA)' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[-54.55, -20.45], [-54.45, -20.45], [-54.45, -20.55], [-54.55, -20.55], [-54.55, -20.45]]]
      }
    }
  ]
};

export default function DashboardProdutor() {
  const { success, error, warning } = useToast();
  const content = siteContent.dashboard_produtor;
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab = (rawTab === 'mapa' || rawTab === 'pendencias' || rawTab === 'ia' || rawTab === 'documentacao') 
    ? rawTab 
    : 'mapa';
  
  const setActiveTab = (tab: 'mapa' | 'pendencias' | 'ia' | 'documentacao') => {
    setSearchParams({ tab });
  };
  
  const [showRisk, setShowRisk] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [showNewFarmModal, setShowNewFarmModal] = useState(false);
  const [showCodeFarmModal, setShowCodeFarmModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [producerName, setProducerName] = useState('Produtor Rural');
  const [onboardingAnswers, setOnboardingAnswers] = useState<OnboardingAnswers | null>(null);
  const [codeFarmData, setCodeFarmData] = useState<(PropertyCodeResult & { area_soja_ha?: string }) | null>(null);
  const [showQuestionario, setShowQuestionario] = useState<string | number | null>(null);
  const [newFarmName, setNewFarmName] = useState('');
  const [farmsData, setFarmsData] = useState<FeatureCollection>(MOCK_FARMS);
  const [selectedFarmId, setSelectedFarmId] = useState<string | null>(null);

  const handleConfirmLocationFromModal = async (loc: LocationResult) => {
    setShowLocationModal(false);
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const farmName = newFarmName.trim() || `Fazenda Sede (${loc.municipio})`;
      const nowIso = new Date().toISOString();

      const newProp = {
        produtor_id: user.id,
        nome_fazenda: farmName,
        etapa: 'Prospecção',
        nome_produtor: user.user_metadata?.full_name || 'Produtor Rural',
        codigo_car: `MS-SEDE-${Math.floor(100000 + Math.random() * 900000)}`,
        origem_cadastro: 'Mapa',
        geom: loc.geom,
        created_at: nowIso,
        updated_at: nowIso
      };

      const { error: err } = await supabase.from('propriedades').insert([newProp]);
      if (err) throw err;

      await fetchFarmsAndPendencias();
      setShowNewFarmModal(false);
      setNewFarmName('');
      success(`Fazenda "${farmName}" cadastrada com sucesso via Geolocalização!`);
    } catch (err: any) {
      console.error('Erro ao cadastrar via mapa:', err);
      error('Erro ao salvar fazenda: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // AI States
  const [pendingIssues, setPendingIssues] = useState('');
  const [aiActionPlan, setAiActionPlan] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [hasGeneratedPlan, setHasGeneratedPlan] = useState(false);

  // Supabase states
  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<any[]>([]);
  const [pendencias, setPendencias] = useState<any[]>([]);
  const [selectedPendency, setSelectedPendency] = useState<any>(null);
  const [resolucaoTexto, setResolucaoTexto] = useState('');
  const [evidenciaUrl, setEvidenciaUrl] = useState('');
  const [isSubmittingResolution, setIsSubmittingResolution] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);

  // Documentação e Evidências States
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

  useEffect(() => {
    fetchFarmsAndPendencias();
  }, []);

  useEffect(() => {
    if (activeTab === 'documentacao') {
      fetchDocuments();
    }
  }, [activeTab]);

  const fetchDocuments = async () => {
    setLoadingDocs(true);
    try {
      // 1. Buscar documentos gerais do banco
      const { data: genDocs } = await supabase
        .from('documentos')
        .select('*')
        .order('created_at', { ascending: false });

      // 2. Buscar respostas da autoavaliação com evidências
      const { data: respData } = await supabase
        .from('respostas_auditoria')
        .select(`
          id,
          evidencia_url,
          created_at,
          auditorias (
            propriedade_id,
            status
          ),
          perguntas_rtrs (
            numero_criterio,
            secao
          )
        `)
        .not('evidencia_url', 'is', null);

      // 3. Buscar pendências com evidências
      const { data: pendsData } = await supabase
        .from('pendencias')
        .select('id, propriedade_id, titulo, evidencia_url, status, created_at')
        .not('evidencia_url', 'is', null);

      const mergedList: any[] = [];

      if (genDocs) {
        genDocs.forEach((d: any) => {
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

      if (respData) {
        respData.forEach((r: any) => {
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

      if (pendsData) {
        pendsData.forEach((p: any) => {
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
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        propriedade_id: docFormData.propriedade_id,
        nome: docFormData.nome,
        categoria: docFormData.categoria,
        arquivo_url: docFormData.arquivo_url,
        criado_por: user?.id || null
      };

      const { error: err } = await supabase.from('documentos').insert([payload]);
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
      const { error: err } = await supabase.from('documentos').delete().eq('id', id);
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
      // 1. Resolver usuário autenticado e perfil de produtor
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setProperties([]);
        setPendencias([]);
        setFarmsData({ type: 'FeatureCollection', features: [] });
        setLoading(false);
        return;
      }

      // Verificar Onboarding Obrigatorio de Primeiro Acesso
      const fullName = user?.user_metadata?.full_name || user?.email || 'Produtor Rural';
      setProducerName(fullName);

      const isCompletedLocally = localStorage.getItem('ms_onboarding_completed') === 'true' || (user?.id && !!localStorage.getItem(`ms_onboarding_${user.id}`));
      const isCompletedMetadata = !!user?.user_metadata?.onboarding_concluido;

      if (!isCompletedLocally && !isCompletedMetadata) {
        try {
          const { data: profData } = await supabase
            .from('perfis')
            .select('onboarding_concluido')
            .eq('id', user.id)
            .maybeSingle();

          if (profData && (profData as any).onboarding_concluido) {
            localStorage.setItem('ms_onboarding_completed', 'true');
            if (user?.id) localStorage.setItem(`ms_onboarding_${user.id}`, JSON.stringify({ completedAt: new Date().toISOString() }));
            setShowOnboardingModal(false);
          } else {
            setShowOnboardingModal(true);
          }
        } catch (e) {
          setShowOnboardingModal(false);
        }
      } else {
        setShowOnboardingModal(false);
      }

      // Resolver perfil para obter ID de perfil correspondente se houver
      let producerProfileId = user.id;
      if (user.email) {
        const { data: perf } = await supabase
          .from('perfis')
          .select('id')
          .ilike('email', user.email)
          .maybeSingle();

        if (perf?.id) {
          producerProfileId = perf.id;
        }
      }

      // 2. Buscar APENAS as propriedades pertencentes ao produtor logado
      let queryFilter = `produtor_id.eq.${user.id}`;
      if (producerProfileId && producerProfileId !== user.id) {
        queryFilter += `,produtor_id.eq.${producerProfileId}`;
      }

      const { data: props, error: propsError } = await supabase
        .from('propriedades')
        .select('*')
        .or(queryFilter)
        .order('created_at', { ascending: false });

      if (propsError) throw propsError;

      // 3. Buscar pendências apenas dessas propriedades
      let pends: any[] = [];
      if (props && props.length > 0) {
        const propIds = props.map((p: any) => p.id);
        const { data: pendsData, error: pendsError } = await supabase
          .from('pendencias')
          .select('*')
          .in('propriedade_id', propIds)
          .order('created_at', { ascending: false });
        if (!pendsError && pendsData) {
          pends = pendsData;
        }
      }

      setProperties(props || []);
      setPendencias(pends);

      // 4. Gerar FeatureCollection para o mapa EXCLUSIVAMENTE dos imóveis do produtor logado
      if (props && props.length > 0) {
        const features = await Promise.all(
          props.map(async (p: any, index: number) => {
            let geom = p.geom;

            // --- BLINDAGEM DE GEOMETRIA ---
            if (typeof geom === 'string') {
              try {
                const trimmed = geom.trim();
                if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                  geom = JSON.parse(trimmed);
                } else {
                  geom = null;
                }
              } catch (e) {
                console.warn(`Geom parse fallback para propriedade ${p.id}:`, e);
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
              } catch (e) {
                console.warn('Erro ao restaurar geometria do imóvel:', e);
              }
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
            return {
              type: 'Feature' as const,
              properties: { 
                id: p.id, 
                name: p.nome_fazenda, 
                municipio: p.municipio || '',
                status: openPendsCount > 0 ? `${openPendsCount} Pendência(s)` : 'Regularizada' 
              },
              geometry: geom
            };
          })
        );

        setFarmsData({
          type: 'FeatureCollection',
          features: features
        });
      } else {
        setFarmsData({ type: 'FeatureCollection', features: [] });
      }
    } catch (error) {
      console.error('Erro ao buscar dados do produtor:', error);
      setProperties([]);
      setPendencias([]);
      setFarmsData({ type: 'FeatureCollection', features: [] });
    } finally {
      setLoading(false);
    }
  }


  const runRiskAnalysis = () => {
    setIsSimulating(true);
    setTimeout(() => {
      setShowRisk(true);
      setIsSimulating(false);
    }, 1500);
  };

  const handleCreateCodeFarm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeFarmData) return;

    if (codeFarmData.origem === 'CAR') {
      const CAR_REGEX = /^[A-Z]{2}-\d{7}-[0-9A-Z]+$/;
      if (!CAR_REGEX.test(codeFarmData.codigo_car)) {
        warning('Formato de CAR inválido. Use o padrão UF-1234567-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado no Supabase.');

      const nowIso = new Date().toISOString();
      const newProp = {
        produtor_id: user.id,
        nome_fazenda: codeFarmData.nome_fazenda,
        etapa: 'Prospecção',
        nome_produtor: user.user_metadata?.full_name || 'Produtor',
        area_soja_ha: codeFarmData.area_soja_ha ? parseFloat(codeFarmData.area_soja_ha) : null,
        codigo_car: codeFarmData.origem === 'CAR' ? codeFarmData.codigo_car : null,
        codigo_sigef: codeFarmData.origem === 'SIGEF' ? codeFarmData.codigo_sigef : null,
        origem_cadastro: codeFarmData.origem,
        geom: codeFarmData.geom || null,
        created_at: nowIso,
        updated_at: nowIso
      };

      const { error: err } = await supabase.from('propriedades').insert([newProp]);
      if (err) throw err;

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

  const handleMapClick = async (lng: number, lat: number) => {
    if (showNewFarmModal && newFarmName) {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado no Supabase.');

        const geom = {
          type: 'Polygon',
          coordinates: [[[lng - 0.03, lat + 0.03], [lng + 0.03, lat + 0.03], [lng + 0.03, lat - 0.03], [lng - 0.03, lat - 0.03], [lng - 0.03, lat + 0.03]]]
        };

        const newProp = {
          produtor_id: user.id,
          nome_fazenda: newFarmName,
          etapa: 'Prospecção',
          nome_produtor: user.user_metadata?.full_name || 'Produtor',
          codigo_car: `MS-${Math.floor(1000000 + Math.random() * 9000000)}-ABCD.EFGH.IJKL.MNOP`,
          geom: geom
        };

        const { error: err } = await supabase.from('propriedades').insert([newProp]);
        if (err) throw err;

        await fetchFarmsAndPendencias();
        setShowNewFarmModal(false);
        setNewFarmName('');
        success('Propriedade cadastrada com sucesso!');
      } catch (err: any) {
        console.error('Erro ao salvar propriedade:', err);
        error('Erro ao salvar propriedade: ' + err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleFinishAutoavaliacao = (id: string | number) => {
    if (typeof id === 'number') {
      const updatedFeatures = farmsData.features.map(f => {
        if (f.properties?.id === id) {
          return { ...f, properties: { ...f.properties, status: 'Em Análise' } };
        }
        return f;
      });
      setFarmsData({ ...farmsData, features: updatedFeatures });
    } else {
      fetchFarmsAndPendencias();
      fetchDocuments();
    }
    setShowQuestionario(null);
  };

  const handleGenerateAIPlan = async () => {
    if (!pendingIssues.trim()) return;
    setIsAiLoading(true);
    setHasGeneratedPlan(true);
    const plan = await aiService.generateCorrectiveActions(pendingIssues);
    setAiActionPlan(plan);
    setIsAiLoading(false);
  };

  const handleAIPlanForPendency = (pend: any) => {
    const farmName = properties.find(p => p.id === pend.propriedade_id)?.nome_fazenda || 'Propriedade';
    setPendingIssues(`Fazenda: ${farmName}\nPendência: ${pend.titulo}\nDescrição/Exigência: ${pend.descricao}\nInstrução: Me dê um plano de ação imediato para regularizar essa pendência com foco nas regras da certificação RTRS.`);
    setActiveTab('ia');
  };

  const handleUploadEvidenceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
      const { error } = await supabase
        .from('pendencias')
        .update({
          status: 'Em Análise',
          evidencia_url: evidenciaUrl,
          resolucao_descricao: resolucaoTexto,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedPendency.id);

      if (error) throw error;

      success('Resolução enviada com sucesso! A pendência agora está sob revisão do Gestor.');
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

  const filteredFarms = farmsData.features.filter(f => 
    (f.properties?.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

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

  const selectedFarmObj = properties.find(p => p.id === selectedFarmId);
  const activeEtapaName = selectedFarmObj ? resolveFarmEtapa(selectedFarmObj.id, selectedFarmObj.etapa, null) : 'Prospecção';

  return (
    <div className="space-y-6 animate-fade-in-up max-w-7xl mx-auto pb-8">
      {/* Header Executivo do Produtor com Motion e Tipografia Fluida */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
            <div className="inline-flex items-center gap-1.5 sm:gap-2 bg-[#1B7547]/10 text-[#1B7547] px-2.5 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs font-extrabold uppercase tracking-wider">
              <MapPin className="w-3.5 h-3.5" />
              <span>Painel do Produtor Rural</span>
            </div>
            <span className="px-2.5 sm:px-3 py-1 bg-emerald-50 border border-emerald-200/80 text-emerald-800 rounded-full text-[11px] sm:text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-[#1B7547] animate-pulse"></span>
              Etapa Atual: {activeEtapaName}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">{content.titulo}</h1>
          <p className="text-slate-500 mt-1 text-xs sm:text-sm font-medium">{content.subtitulo}</p>
        </div>
        
        {/* Tab Navigation: Grid 2x2 no Mobile (100% visível, zero corte) e Segmented Bar no Desktop */}
        <div className="w-full md:w-auto bg-slate-100 p-1.5 rounded-2xl border border-slate-200/80 grid grid-cols-2 sm:flex sm:flex-wrap md:inline-flex gap-1.5 sm:gap-2 shadow-2xs shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('mapa')}
            className={`px-3 py-2 sm:px-5 sm:py-2.5 rounded-xl font-extrabold text-xs transition-all duration-300 flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer shrink-0 min-h-[40px] sm:min-h-0 ${
              activeTab === 'mapa' 
                ? 'bg-[#1B7547] text-white shadow-md shadow-[#1B7547]/20 scale-102' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <MapPin className="w-4 h-4 shrink-0" />
            <span className="truncate">{content.aba_mapa}</span>
          </button>
          
          <button
            type="button"
            onClick={() => setActiveTab('pendencias')}
            className={`px-3 py-2 sm:px-5 sm:py-2.5 rounded-xl font-extrabold text-xs transition-all duration-300 flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer shrink-0 min-h-[40px] sm:min-h-0 ${
              activeTab === 'pendencias' 
                ? 'bg-[#1B7547] text-white shadow-md shadow-[#1B7547]/20 scale-102' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <ClipboardList className="w-4 h-4 shrink-0" />
            <span className="truncate sm:hidden">Pendências</span>
            <span className="hidden sm:inline">Checklist de Pendências</span>
            {pendencias.filter(p => p.status === 'Pendente').length > 0 && (
              <span className="bg-[#C59B27] text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0 shadow-2xs">
                {pendencias.filter(p => p.status === 'Pendente').length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ia')}
            className={`px-3 py-2 sm:px-5 sm:py-2.5 rounded-xl font-extrabold text-xs transition-all duration-300 flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer shrink-0 min-h-[40px] sm:min-h-0 ${
              activeTab === 'ia' 
                ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-600/20 scale-102' 
                : 'text-slate-600 hover:text-indigo-600 hover:bg-white/60'
            }`}
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <span className="truncate">{content.aba_ia}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('documentacao')}
            className={`px-3 py-2 sm:px-5 sm:py-2.5 rounded-xl font-extrabold text-xs transition-all duration-300 flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer shrink-0 min-h-[40px] sm:min-h-0 ${
              activeTab === 'documentacao' 
                ? 'bg-[#1B7547] text-white shadow-md shadow-[#1B7547]/20 scale-102' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <FolderOpen className="w-4 h-4 shrink-0" />
            <span className="truncate sm:hidden">Evidências</span>
            <span className="hidden sm:inline">Documentação & Evidências</span>
          </button>
        </div>
      </div>

      {/* Grid de Estatísticas e Conformidade RTRS Responsivo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Fazendas */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-sm transition-all flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Propriedades Ativas</span>
            <p className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {properties.length || farmsData.features.length}
            </p>
            <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Cadastradas no Programa
            </span>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl shrink-0">
            <Building2 className="w-6 h-6" />
          </div>
        </div>

        {/* Card 2: Score de Conformidade */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-sm transition-all flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Conformidade RTRS</span>
            <p className="text-2xl sm:text-3xl font-black text-[#1B7547] tracking-tight">
              {(() => {
                const total = pendencias.length;
                if (total === 0) return '100%';
                const res = pendencias.filter(p => p.status === 'Resolvido' || p.status === 'Em Análise').length;
                return `${Math.round((res / total) * 100)}%`;
              })()}
            </p>
            <span className="text-[11px] text-slate-500 font-medium">Adequação socioambiental</span>
          </div>
          <div className="p-3 bg-emerald-50 text-[#1B7547] rounded-xl shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3: Pendências em Aberto */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-sm transition-all flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Pendências Abertas</span>
            <p className="text-2xl sm:text-3xl font-black text-amber-600 tracking-tight">
              {pendencias.filter(p => p.status === 'Pendente').length}
            </p>
            <span className="text-[11px] text-amber-700 font-medium flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              Requerem ação do produtor
            </span>
          </div>
          <div className="p-3 bg-amber-50 text-amber-700 rounded-xl shrink-0">
            <ClipboardList className="w-6 h-6" />
          </div>
        </div>

        {/* Card 4: Documentos & Evidências */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-sm transition-all flex items-center justify-between">
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

      {activeTab === 'mapa' && (
        <div key={`prod-mapa-${activeTab}`} className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in-up duration-300">
          {/* Painel Esquerdo: Lista de Fazendas */}
          <div className="lg:col-span-1 space-y-4">
            <div className="flex flex-col gap-3 w-full mb-6">
              <button 
                onClick={runRiskAnalysis}
                disabled={isSimulating}
                className="group/btn relative flex items-center justify-center gap-2 bg-amber-50 hover:bg-amber-100 text-amber-800 px-5 py-3 rounded-2xl font-extrabold text-xs border border-amber-200/80 transition-all duration-300 hover:scale-105 active:scale-95 shadow-2xs cursor-pointer"
              >
                {isSimulating ? <Loader2 className="w-4 h-4 animate-spin text-amber-700" /> : <ShieldAlert className="w-4 h-4 text-amber-600 transition-transform group-hover/btn:scale-110" />}
                <span>{showRisk ? 'Atualizar Risco' : content.botao_analise_risco}</span>
              </button>
              <button 
                onClick={() => setShowNewFarmModal(true)}
                className="group relative flex items-center justify-center gap-2 bg-gradient-to-r from-[#1B7547] to-[#15613a] hover:from-[#15613a] hover:to-[#0B3B23] text-white px-5 py-3 rounded-2xl font-extrabold text-xs shadow-md shadow-[#1B7547]/20 hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer overflow-hidden"
              >
                <span className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out pointer-events-none" />
                <Plus className="w-4 h-4 transition-transform group-hover:rotate-90 duration-300" />
                <span>{content.botao_nova_propriedade}</span>
              </button>
              <button 
                onClick={() => setShowCodeFarmModal(true)}
                className="group relative flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white px-5 py-3 rounded-2xl font-extrabold text-xs shadow-md shadow-emerald-600/20 hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer overflow-hidden"
              >
                <span className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out pointer-events-none" />
                <Plus className="w-4 h-4 transition-transform group-hover:rotate-90 duration-300" />
                <span>Cadastrar via Código (CAR/SIGEF/KML)</span>
              </button>
            </div>

            <div className="bg-card p-5 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100">
              <div className="relative mb-5">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
                <input 
                  type="text" 
                  placeholder={content.busca_placeholder}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all shadow-sm text-sm"
                />
              </div>
              
              <div className="space-y-3">
                {filteredFarms.map((feature, i) => {
                  const farmId = feature.properties?.id;
                  const isSelected = selectedFarmId === farmId;
                  const isMock = typeof farmId === 'number' && farmId < 10;
                  return (
                    <div 
                      key={i} 
                      onClick={() => setSelectedFarmId(farmId)}
                      className={`group relative overflow-hidden border rounded-xl p-4 hover:-translate-y-1 transition-all duration-300 ease-out animate-fade-in-up cursor-pointer ${
                        isSelected 
                          ? 'bg-emerald-50/40 border-emerald-500 shadow-md ring-2 ring-emerald-500/20' 
                          : 'bg-background border-border hover:border-primary/50 hover:shadow-lg'
                      }`}
                      style={{ animationDelay: `${i * 100}ms` }}
                    >
                      <div className={`absolute top-0 left-0 w-1.5 h-full transition-colors ${isSelected ? 'bg-emerald-600' : 'bg-primary/0 group-hover:bg-primary'}`}></div>
                      
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-foreground text-sm group-hover:text-primary transition-colors pr-2">
                          {feature.properties?.name}
                        </h3>
                        {feature.properties?.status === 'Certificada' || feature.properties?.status === 'Regularizada' ? (
                          <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-md uppercase tracking-wider border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" /> Regular
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[9px] font-bold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-md uppercase tracking-wider border border-amber-200">
                            <AlertTriangle className="w-3 h-3" /> {feature.properties?.status}
                          </span>
                        )}
                      </div>
                      
                      <div className="space-y-1 mb-3">
                        <p className="text-xs text-foreground font-medium flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span className="font-semibold text-slate-700">Município:</span> 
                          <span className="text-emerald-900 font-bold">{feature.properties?.municipio || 'Água Clara, MS'}</span>
                        </p>
                        <p className="text-[11px] text-muted-foreground pl-5 font-mono">
                          Centroide: {(() => {
                            const g = feature.geometry;
                            if (!g || !g.coordinates) return '-';
                            let c: any = g.coordinates;
                            while (Array.isArray(c[0])) c = c[0];
                            return typeof c[1] === 'number' && typeof c[0] === 'number' ? `${c[1].toFixed(2)}, ${c[0].toFixed(2)}` : '-';
                          })()}
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowQuestionario(feature.properties?.id);
                          }}
                          className="flex-1 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-[11px] font-bold transition-all border border-emerald-200 shadow-sm cursor-pointer text-center"
                        >
                          Autoavaliação RTRS
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveTab('pendencias');
                          }}
                          className="flex-1 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-[11px] font-bold transition-all border border-slate-200 shadow-sm cursor-pointer text-center"
                        >
                          Pendências
                        </button>
                      </div>
                      
                      {showRisk && i === 0 && (
                        <div className="mt-4 text-[11px] font-semibold bg-destructive/5 text-destructive p-2.5 rounded-lg flex gap-2 items-start border border-destructive/20">
                          <ShieldAlert className="w-4 h-4 shrink-0" />
                          <span>Atenção: Área com possível embargo IBAMA sobreposta.</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Painel Direito: Mapa Geoespacial */}
          <div className="lg:col-span-2 relative">
            {showNewFarmModal && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-card p-6 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-100 w-80 animate-zoom-in">
                <h4 className="font-bold text-foreground mb-4">{content.modal_nova_titulo}</h4>
                <input 
                  type="text" 
                  placeholder={content.modal_nova_placeholder}
                  value={newFarmName}
                  onChange={(e) => setNewFarmName(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-xl mb-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring shadow-sm"
                />
                <p className="text-xs text-muted-foreground mb-3 flex items-center gap-2 leading-relaxed font-medium">
                  <MapPin className="w-5 h-5 shrink-0 text-primary" />
                  {content.modal_nova_instrucao}
                </p>
                <button
                  type="button"
                  onClick={() => setShowLocationModal(true)}
                  className="w-full py-2 mb-3 bg-[#1B7547] hover:bg-[#16633b] text-white text-xs font-extrabold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Compass className="w-4 h-4 text-[#C59B27]" />
                  <span>Localizar Sede no Mapa (GPS Pop-up)</span>
                </button>
                <button 
                  onClick={() => setShowNewFarmModal(false)}
                  className="w-full py-2 text-sm text-foreground bg-secondary hover:bg-secondary/80 rounded-xl font-medium transition-colors"
                >
                  Cancelar
                </button>
              </div>
            )}

            <div className="h-[600px] w-full rounded-2xl overflow-hidden border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] relative">
              <MapView 
                farms={farmsData} 
                selectedFarmId={selectedFarmId}
                embargoes={showRisk ? MOCK_EMBARGOES : undefined} 
                onMapClick={handleMapClick}
                interactive={true}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal Cadastrar Fazenda por Código (Produtor) */}
      {showCodeFarmModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowCodeFarmModal(false)}
          title="Cadastrar Nova Fazenda"
        >
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
        </Modal>
      )}

      {activeTab === 'pendencias' && (
        <div key={`prod-pends-${activeTab}`} className="space-y-6 animate-fade-in-up duration-300 max-w-4xl mx-auto">
          <div className="bg-card p-6 lg:p-8 rounded-2xl border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
            <h2 className="text-2xl font-bold text-foreground mb-2 flex items-center gap-2">
              <ClipboardList className="w-6 h-6 text-primary" />
              Checklist de Pendências & Plano de Ação
            </h2>
            <p className="text-muted-foreground mb-6">
              Monitore e regularize pendências enviadas pelos técnicos de campo e gestores para atingir a certificação RTRS.
            </p>

            {properties.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-border rounded-xl">
                <p className="text-muted-foreground">Nenhuma propriedade cadastrada no seu perfil. Cadastre sua fazenda no mapa para iniciar.</p>
              </div>
            ) : (
              <div className="space-y-8">
                {properties.map(prop => {
                  const propPends = pendencias.filter(p => p.propriedade_id === prop.id);
                  return (
                    <div key={prop.id} className="border border-border rounded-xl overflow-hidden bg-background shadow-sm hover:shadow-md transition-shadow duration-300">
                      <div className="px-5 py-3 bg-muted/40 border-b border-border flex justify-between items-center">
                        <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-muted-foreground" />
                          {prop.nome_fazenda}
                        </h3>
                        <span className="text-xs font-semibold text-muted-foreground">
                          {propPends.length} pendência(s)
                        </span>
                      </div>
                      
                      <div className="divide-y divide-border">
                        {propPends.length === 0 ? (
                          <div className="p-8 text-center text-muted-foreground text-xs font-medium">
                            Nenhuma pendência associada a esta fazenda! Sua propriedade está em conformidade. 🎉
                          </div>
                        ) : (
                          <>
                            {/* Padrão Adaptativo Mobile: Cards Empilhados com Botões Confortáveis */}
                            <div className="block md:hidden divide-y divide-border">
                              {propPends.map(pend => (
                                <div key={`mob-${pend.id}`} className="p-4 space-y-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded uppercase tracking-wider border ${
                                      pend.status === 'Pendente' ? 'bg-amber-100/50 text-amber-800 border-amber-200' :
                                      pend.status === 'Em Análise' ? 'bg-indigo-100/50 text-indigo-800 border-indigo-200' :
                                      'bg-emerald-100/50 text-emerald-800 border-emerald-200'
                                    }`}>
                                      {pend.status}
                                    </span>
                                    {pend.prazo && (
                                      <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
                                        <Clock className="w-3.5 h-3.5" /> Prazo: {new Date(pend.prazo).toLocaleDateString('pt-BR')}
                                      </span>
                                    )}
                                  </div>

                                  <div>
                                    <h4 className="font-bold text-foreground text-sm tracking-tight">{pend.titulo}</h4>
                                    <p className="text-xs text-muted-foreground leading-relaxed mt-1">{pend.descricao}</p>
                                  </div>

                                  {pend.motivo_rejeicao && pend.status === 'Pendente' && (
                                    <div className="p-3 bg-amber-50/90 rounded-xl border border-amber-200 text-xs text-amber-950 space-y-1">
                                      <div className="font-bold text-amber-900 flex items-center gap-1.5 text-xs">
                                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                                        Ajustes Solicitados pelo Técnico:
                                      </div>
                                      <div className="italic text-amber-950 font-medium bg-amber-100/50 p-2 rounded-lg border border-amber-200/50">
                                        "{pend.motivo_rejeicao}"
                                      </div>
                                    </div>
                                  )}

                                  {pend.status === 'Em Análise' && (
                                    <div className="p-3 bg-indigo-50/50 rounded-lg border border-indigo-100 text-xs text-indigo-900 space-y-1">
                                      <div className="font-semibold">Resolução Enviada:</div>
                                      <div className="italic">"{pend.resolucao_descricao}"</div>
                                      {pend.evidencia_url && (
                                        <button
                                          type="button"
                                          onClick={() => handleOpenEvidencia(pend.evidencia_url)}
                                          className="text-indigo-700 underline font-semibold hover:text-indigo-950 flex items-center gap-1.5 cursor-pointer mt-1"
                                        >
                                          <Eye className="w-4 h-4 text-indigo-600 shrink-0" />
                                          <span>Ver Evidência Anexada</span>
                                        </button>
                                      )}
                                    </div>
                                  )}

                                  {/* Botões Mobile com Largura Total e Altura Confortável (min-h-[44px]) */}
                                  <div className="flex flex-col gap-2 pt-2 border-t border-border/40">
                                    {pend.status === 'Pendente' && (
                                      <button
                                        type="button"
                                        onClick={() => handleOpenResolutionModal(pend)}
                                        className="w-full min-h-[44px] px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5"
                                      >
                                        <CheckCircle2 className="w-4 h-4" />
                                        <span>Resolver Pendência (Anexar Evidência)</span>
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleAIPlanForPendency(pend)}
                                      className="w-full min-h-[44px] px-3.5 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs rounded-xl transition-all shadow-2xs active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5"
                                    >
                                      <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                                      <span>Gerar Plano de Ação IA</span>
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Padrão Adaptativo Desktop: Tabela Estruturada */}
                            <div className="hidden md:block overflow-x-auto">
                              <table className="w-full text-left text-xs border-collapse">
                                <thead className="bg-slate-50 border-b border-border text-slate-600 font-extrabold uppercase tracking-wider text-[11px]">
                                  <tr>
                                    <th className="px-5 py-3.5">Status & Prazo</th>
                                    <th className="px-5 py-3.5">Exigência / Descrição</th>
                                    <th className="px-5 py-3.5 text-right">Ações de Resolução</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border bg-white">
                                  {propPends.map(pend => (
                                    <tr key={`desk-${pend.id}`} className="hover:bg-slate-50/50 transition-colors">
                                      <td className="px-5 py-4 align-top w-48">
                                        <div className="space-y-1.5">
                                          <span className={`inline-block text-[10px] font-bold px-2.5 py-0.5 rounded uppercase tracking-wider border ${
                                            pend.status === 'Pendente' ? 'bg-amber-100/50 text-amber-800 border-amber-200' :
                                            pend.status === 'Em Análise' ? 'bg-indigo-100/50 text-indigo-800 border-indigo-200' :
                                            'bg-emerald-100/50 text-emerald-800 border-emerald-200'
                                          }`}>
                                            {pend.status}
                                          </span>
                                          {pend.prazo && (
                                            <p className="text-[11px] text-muted-foreground flex items-center gap-1 font-medium">
                                              <Clock className="w-3.5 h-3.5" /> {new Date(pend.prazo).toLocaleDateString('pt-BR')}
                                            </p>
                                          )}
                                        </div>
                                      </td>
                                      <td className="px-5 py-4 align-top">
                                        <h4 className="font-bold text-foreground text-sm tracking-tight">{pend.titulo}</h4>
                                        <p className="text-xs text-muted-foreground leading-relaxed mt-1">{pend.descricao}</p>
                                        {pend.motivo_rejeicao && pend.status === 'Pendente' && (
                                          <div className="mt-2 p-2.5 bg-amber-50/90 rounded-lg border border-amber-200 text-xs text-amber-950">
                                            <span className="font-bold">Ajustes Solicitados: </span>"{pend.motivo_rejeicao}"
                                          </div>
                                        )}
                                        {pend.status === 'Em Análise' && (
                                          <div className="mt-2 p-2.5 bg-indigo-50/50 rounded-lg border border-indigo-100 text-xs text-indigo-900">
                                            <span className="font-semibold">Resolução: </span>"{pend.resolucao_descricao}"
                                            {pend.evidencia_url && (
                                              <button
                                                type="button"
                                                onClick={() => handleOpenEvidencia(pend.evidencia_url)}
                                                className="text-indigo-700 underline font-semibold hover:text-indigo-950 flex items-center gap-1 cursor-pointer mt-1"
                                              >
                                                <Eye className="w-3.5 h-3.5 text-indigo-600" />
                                                <span>Ver Evidência</span>
                                              </button>
                                            )}
                                          </div>
                                        )}
                                      </td>
                                      <td className="px-5 py-4 align-top text-right w-56">
                                        <div className="flex flex-col items-end gap-2">
                                          {pend.status === 'Pendente' && (
                                            <button
                                              type="button"
                                              onClick={() => handleOpenResolutionModal(pend)}
                                              className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5"
                                            >
                                              <CheckCircle2 className="w-4 h-4" />
                                              <span>Resolver</span>
                                            </button>
                                          )}
                                          <button
                                            type="button"
                                            onClick={() => handleAIPlanForPendency(pend)}
                                            className="w-full px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs rounded-xl transition-all shadow-2xs active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5"
                                          >
                                            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                                            <span>Plano IA</span>
                                          </button>
                                        </div>
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
            )}
          {/* Modal de envio de resolução */}
          {selectedPendency && (
            <Modal
              isOpen={!!selectedPendency}
              onClose={() => setSelectedPendency(null)}
              title={`Resolver Pendência: ${selectedPendency.titulo}`}
            >
              <form onSubmit={handleSubmitResolution} className="space-y-4">
                <p className="text-sm text-muted-foreground font-medium leading-relaxed mb-4">
                  {selectedPendency.descricao}
                </p>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Descrição da Resolução</label>
                  <textarea
                    required
                    rows={4}
                    value={resolucaoTexto}
                    onChange={e => setResolucaoTexto(e.target.value)}
                    placeholder="Descreva as ações que você tomou para resolver esta pendência..."
                    className="w-full px-3 py-2 bg-background border border-input rounded-md focus:ring-2 focus:ring-primary focus:border-transparent text-sm resize-none"
                  />
                </div>
                 <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground block">Arquivo de Evidência (Imagem ou PDF)</label>
                  <div className="flex gap-2">
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
                      className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-md shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      {uploadingFile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5 text-primary" />}
                      {uploadingFile ? 'Carregando...' : 'Selecionar Arquivo'}
                    </button>
                    {evidenciaUrl && (
                      <span className="text-xs text-emerald-700 font-bold self-center truncate max-w-[200px]" title={evidenciaUrl}>
                        ✓ Arquivo Carregado
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Ou insira o Link da Evidência manualmente</label>
                  <input
                    type="url"
                    value={evidenciaUrl}
                    onChange={e => setEvidenciaUrl(e.target.value)}
                    placeholder="https://exemplo.com/comprovante.pdf"
                    className="w-full px-3 py-2 bg-background border border-input rounded-md focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                  />
                </div>
                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setSelectedPendency(null)}
                    className="px-4 py-2 font-medium text-sm rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingResolution}
                    className="px-4 py-2 font-medium text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    {isSubmittingResolution && <Loader2 className="w-4 h-4 animate-spin" />}
                    Enviar para Revisão
                  </button>
                </div>
              </form>
            </Modal>
          )}
        </div>
      </div>
      )}

      {activeTab === 'ia' && (
        <div key={`prod-ia-${activeTab}`} className="max-w-4xl mx-auto space-y-6 animate-fade-in-up duration-300">
          <div className="bg-card p-8 rounded-2xl border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
            <h2 className="text-2xl font-bold text-foreground mb-2 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-indigo-500" />
              {content.ia_titulo}
            </h2>
            <p className="text-muted-foreground mb-6">
              {content.ia_descricao}
            </p>
            
            <div className="space-y-4">
              <textarea 
                value={pendingIssues}
                onChange={(e) => setPendingIssues(e.target.value)}
                placeholder={content.ia_placeholder}
                rows={5}
                className="w-full p-4 bg-background border border-input rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all shadow-sm text-sm resize-none"
              />
              <button 
                onClick={handleGenerateAIPlan}
                disabled={isAiLoading || !pendingIssues.trim()}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-3 rounded-xl font-semibold transition-all shadow-sm hover:shadow-md active:scale-[0.98]"
              >
                {isAiLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                {isAiLoading ? content.ia_botao_carregando : content.ia_botao_gerar}
              </button>
            </div>
          </div>

          {hasGeneratedPlan && (
            <AIInsightsPanel 
              title={content.ia_painel_titulo} 
              insights={aiActionPlan} 
              isLoading={isAiLoading} 
            />
          )}
        </div>
      )}

      {activeTab === 'documentacao' && (
        <div className="space-y-6 animate-fade-in-up max-w-6xl mx-auto">
          {/* Cabeçalho */}
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
                setDocFormData(prev => ({ ...prev, propriedade_id: properties[0].id }));
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
              {/* SEÇÃO 1: DOCUMENTOS GERAIS DA FAZENDA (PADRÃO ADAPTATIVO: CARDS NO MOBILE / TABELA NO DESKTOP) */}
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
                    .filter(d => ['CAR', 'LAU', 'EPI', 'Outros', 'Armazenamento Geral'].includes(d.categoria) || d.origem === 'Armazenamento Geral')
                    .forEach(d => {
                      const key = d.categoria;
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
                      {/* Mobile: Cards Empilhados com Botões Confortáveis */}
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

                      {/* Desktop: Tabela Estruturada */}
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

              {/* SEÇÃO 2: EVIDÊNCIAS ORGANIZADAS PELOS 5 PRINCÍPIOS RTRS (PADRÃO ADAPTATIVO: CARDS NO MOBILE / TABELA NO DESKTOP) */}
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
                    if (doc.nome.includes(`Princípio ${principio.num}`) || (principio.num === 1 && doc.categoria === 'Checklist RTRS' && !doc.nome.includes('Princípio'))) {
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
                            {/* Mobile: Cards Empilhados com Botão Confortável min-h-[44px] */}
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

                            {/* Desktop: Tabela de Evidências */}
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

      {/* Modal de Questionário RTRS */}
      {showQuestionario && (
        <QuestionarioRTRS 
          modo="autoavaliacao"
          propriedadeNome={farmsData.features.find(f => f.properties?.id === showQuestionario)?.properties?.name || 'Fazenda'}
          onClose={() => setShowQuestionario(null)}
          onComplete={() => handleFinishAutoavaliacao(showQuestionario)}
          propriedadeId={showQuestionario.toString()}
        />
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

      {/* Modal Obrigatorio de Onboarding de Primeiro Acesso */}
      <OnboardingQuestionarioModal
        isOpen={showOnboardingModal}
        producerName={producerName}
        onComplete={(answers, alerts) => {
          setShowOnboardingModal(false);
          setOnboardingAnswers(answers);
          fetchFarmsAndPendencias();
        }}
      />


    </div>
  );
}
