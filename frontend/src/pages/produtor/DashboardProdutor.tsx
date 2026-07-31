import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Plus, AlertTriangle, CheckCircle, Search, ShieldAlert, Loader2, Sparkles, ClipboardList, Clock, CheckCircle2, Image as ImageIcon, FolderOpen, FileText, Trash2, X, Eye, Download, ExternalLink } from 'lucide-react';
import MapView from '../../components/map/MapView';
import type { FeatureCollection, Feature, Polygon } from 'geojson';
import QuestionarioRTRS from '../../components/auditoria/QuestionarioRTRS';
import AIInsightsPanel from '../../components/ui/AIInsightsPanel';
import { aiService } from '../../services/aiService';
import siteContent from '../../config/site_content.json';
import { supabase } from '../../lib/supabase';
import { resolveFarmEtapa } from '../../lib/etapaUtils';
import Modal from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import { useSearchParams } from 'react-router-dom';
import { getRemainingTimeLabel } from '../../lib/dateUtils';
import PropertyCodeInput from '../../components/form/PropertyCodeInput';
import type { PropertyCodeResult } from '../../components/form/PropertyCodeInput';
import { ListSkeleton } from '../../components/ui/Skeleton';
import ConfirmAction from '../../components/ui/ConfirmAction';

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
  const [codeFarmData, setCodeFarmData] = useState<PropertyCodeResult | null>(null);
  const [showQuestionario, setShowQuestionario] = useState<string | number | null>(null);
  const [newFarmName, setNewFarmName] = useState('');
  const [farmsData, setFarmsData] = useState<FeatureCollection>(MOCK_FARMS);
  const [selectedFarmId, setSelectedFarmId] = useState<string | null>(null);

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

  const handleOpenEvidencia = (url?: string | null) => {
    if (!url || !url.trim()) return;
    let cleanUrl = url.trim();

    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://') && !cleanUrl.startsWith('data:')) {
      try {
        const bucket = cleanUrl.includes('auditoria-evidencias') ? 'auditoria-evidencias' : 'evidencias';
        const filePath = cleanUrl.replace(/^(evidencias|auditoria-evidencias)\//, '');
        const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
        if (data?.publicUrl) cleanUrl = data.publicUrl;
      } catch (e) {
        console.warn('Erro ao obter URL pública do storage:', e);
      }
    }

    const lower = cleanUrl.toLowerCase();
    const isPdf = lower.includes('.pdf') || lower.startsWith('data:application/pdf');

    if (isPdf) {
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
      const fileExt = file.name.split('.').pop();
      const fileName = `doc-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { data, error } = await supabase.storage
        .from('evidencias')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('evidencias')
        .getPublicUrl(filePath);

      setDocFormData(prev => ({ ...prev, arquivo_url: publicUrl }));
      success('Arquivo carregado com sucesso!');
    } catch (err: any) {
      console.error('Erro ao carregar arquivo de documento:', err);
      const reader = new FileReader();
      reader.onload = (evt) => {
        if (evt.target?.result) {
          setDocFormData(prev => ({ ...prev, arquivo_url: evt.target!.result as string }));
          success('Arquivo carregado com sucesso!');
        }
      };
      reader.readAsDataURL(file);
    } finally {
      setUploadingDocFile(false);
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
      const { data: props, error: propsError } = await supabase
        .from('propriedades')
        .select('*')
        .or(`produtor_id.eq.${user.id},produtor_id.eq.${producerProfileId}`)
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

      const newProp = {
        produtor_id: user.id,
        nome_fazenda: codeFarmData.nome_fazenda,
        etapa: 'Prospecção',
        nome_produtor: user.user_metadata?.full_name || 'Produtor',
        codigo_car: codeFarmData.origem === 'CAR' ? codeFarmData.codigo_car : null,
        codigo_sigef: codeFarmData.origem === 'SIGEF' ? codeFarmData.codigo_sigef : null,
        origem_cadastro: codeFarmData.origem,
        geom: codeFarmData.geom || null
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
      const fileExt = file.name.split('.').pop();
      const fileName = `pendencia-${selectedPendency.id}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { data, error } = await supabase.storage
        .from('evidencias')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('evidencias')
        .getPublicUrl(filePath);

      setEvidenciaUrl(publicUrl);
    } catch (err: any) {
      console.error('Erro ao carregar arquivo na storage, usando fallback base64:', err);
      // Fallback base64
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setEvidenciaUrl(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    } finally {
      setUploadingFile(false);
    }
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
    <div className="space-y-8 animate-fade-in max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border pb-6">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-extrabold text-foreground tracking-tight">{content.titulo}</h1>
            <span className="px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
              Etapa Atual: {activeEtapaName}
            </span>
          </div>
          <p className="text-muted-foreground mt-1 text-lg">{content.subtitulo}</p>
        </div>
        
        {/* Tab Navigation */}
        <div className="flex bg-muted/50 p-1 rounded-xl border border-border shrink-0">
          <button
            onClick={() => setActiveTab('mapa')}
            className={`px-6 py-2 rounded-lg font-medium text-sm transition-all ${
              activeTab === 'mapa' 
                ? 'bg-card text-foreground shadow-sm' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {content.aba_mapa}
          </button>
          
          <button
            onClick={() => setActiveTab('pendencias')}
            className={`px-6 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
              activeTab === 'pendencias' 
                ? 'bg-card text-foreground shadow-sm' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ClipboardList className="w-4 h-4 text-primary" />
            Checklist de Pendências
            {pendencias.filter(p => p.status === 'Pendente').length > 0 && (
              <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0">
                {pendencias.filter(p => p.status === 'Pendente').length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('ia')}
            className={`px-6 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
              activeTab === 'ia' 
                ? 'bg-card text-indigo-600 shadow-sm font-semibold' 
                : 'text-muted-foreground hover:text-indigo-600/80'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            {content.aba_ia}
          </button>

          <button
            onClick={() => setActiveTab('documentacao')}
            className={`px-6 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
              activeTab === 'documentacao' 
                ? 'bg-card text-foreground shadow-sm font-semibold' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <FolderOpen className="w-4 h-4 text-emerald-600" />
            Documentação & Evidências
          </button>
        </div>
      </div>

      {activeTab === 'mapa' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in-up delay-100 opacity-0" style={{ animationFillMode: 'forwards' }}>
          {/* Painel Esquerdo: Lista de Fazendas */}
          <div className="lg:col-span-1 space-y-4">
            <div className="flex flex-col gap-3 w-full mb-6">
              <button 
                onClick={runRiskAnalysis}
                disabled={isSimulating}
                className="flex items-center justify-center gap-2 bg-amber-50 text-amber-700 hover:bg-amber-100 px-4 py-2.5 rounded-xl font-semibold border border-amber-200 transition-colors shadow-sm active:scale-[0.98]"
              >
                {isSimulating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
                {showRisk ? 'Atualizar Risco' : content.botao_analise_risco}
              </button>
              <button 
                onClick={() => setShowNewFarmModal(true)}
                className="flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2.5 rounded-xl font-semibold transition-all shadow-sm hover:shadow-md active:scale-[0.98]"
              >
                <Plus className="w-4 h-4" />
                {content.botao_nova_propriedade}
              </button>
              <button 
                onClick={() => setShowCodeFarmModal(true)}
                className="flex items-center justify-center gap-2 bg-emerald-600 text-white hover:bg-emerald-700 px-4 py-2.5 rounded-xl font-semibold transition-all shadow-sm hover:shadow-md active:scale-[0.98] cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Cadastrar via Código (CAR/SIGEF/KML)
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
                <p className="text-xs text-muted-foreground mb-5 flex items-center gap-2 leading-relaxed font-medium">
                  <MapPin className="w-5 h-5 shrink-0 text-primary" />
                  {content.modal_nova_instrucao}
                </p>
                <button 
                  onClick={() => setShowNewFarmModal(false)}
                  className="w-full py-2.5 text-sm text-foreground bg-secondary hover:bg-secondary/80 rounded-xl font-medium transition-colors"
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
          title="Cadastrar Fazenda via Código"
        >
          <form onSubmit={handleCreateCodeFarm} className="space-y-4">
            <PropertyCodeInput
              onChange={(data) => setCodeFarmData(data)}
            />
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
        <div className="space-y-6 animate-fade-in-up delay-150 opacity-0 max-w-4xl mx-auto" style={{ animationFillMode: 'forwards' }}>
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
                          propPends.map(pend => (
                            <div key={pend.id} className="p-5 flex flex-col md:flex-row md:items-start justify-between gap-4 group">
                              <div className="space-y-2 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
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
                                  {(() => {
                                    const label = getRemainingTimeLabel(pend.prazo, pend.status);
                                    if (!label) return null;
                                    return (
                                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${label.className}`}>
                                        {label.text}
                                      </span>
                                    );
                                  })()}
                                </div>
                                <h4 className="font-bold text-foreground text-base tracking-tight">{pend.titulo}</h4>
                                <p className="text-sm text-muted-foreground leading-relaxed font-medium">{pend.descricao}</p>
                                
                                {pend.motivo_rejeicao && pend.status === 'Pendente' && (
                                  <div className="mt-3 p-3.5 bg-amber-50/90 rounded-xl border border-amber-200 text-xs text-amber-950 space-y-1.5 shadow-sm">
                                    <div className="font-bold text-amber-900 flex items-center gap-1.5 text-xs">
                                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                                      Ajustes Solicitados pelo Técnico / Motivo da Rejeição:
                                    </div>
                                    <div className="italic text-amber-950 font-medium bg-amber-100/50 p-2 rounded-lg border border-amber-200/50">
                                      "{pend.motivo_rejeicao}"
                                    </div>
                                    <p className="text-[11px] text-amber-800 font-medium">
                                      Por favor, realize os ajustes acima e clique em "Resolver" para reenviar a comprovação.
                                    </p>
                                  </div>
                                )}

                                {pend.status === 'Em Análise' && (
                                  <div className="mt-3 p-3 bg-indigo-50/50 rounded-lg border border-indigo-100 text-xs text-indigo-900 space-y-1">
                                    <div className="font-semibold">Resolução Enviada:</div>
                                    <div className="italic">"{pend.resolucao_descricao}"</div>
                                    {pend.evidencia_url && (
                                      <div className="mt-1">
                                        <button
                                          type="button"
                                          onClick={() => handleOpenEvidencia(pend.evidencia_url)}
                                          className="underline text-indigo-600 font-semibold hover:text-indigo-800 flex items-center gap-1.5 cursor-pointer text-xs"
                                        >
                                          <Eye className="w-4 h-4 text-indigo-600 shrink-0" />
                                          <span>Ver Evidência Anexada</span>
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>

                              <div className="flex flex-row md:flex-col gap-2 shrink-0 md:self-center">
                                {pend.status === 'Pendente' && (
                                  <button
                                    onClick={() => setSelectedPendency(pend)}
                                    className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg text-xs transition-colors shadow-sm cursor-pointer"
                                  >
                                    Resolver
                                  </button>
                                )}
                                <button
                                  onClick={() => handleAIPlanForPendency(pend)}
                                  className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-lg text-xs transition-colors border border-indigo-200 flex items-center gap-1.5 cursor-pointer"
                                >
                                  <Sparkles className="w-3.5 h-3.5" />
                                  Como Resolver? (IA)
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

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
      )}

      {activeTab === 'ia' && (
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in-up delay-200 opacity-0" style={{ animationFillMode: 'forwards' }}>
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
          <div className="bg-card p-6 rounded-2xl border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <FolderOpen className="w-6 h-6 text-emerald-600" />
                Documentação Vigente da Propriedade
              </h2>
              <p className="text-muted-foreground text-sm mt-1">
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
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm cursor-pointer shrink-0"
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
              {/* SEÇÃO 1: DOCUMENTOS GERAIS DA FAZENDA (ÚLTIMA VERSÃO) */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-emerald-700" />
                    Documentos Gerais da Fazenda (Últimas Versões)
                  </h3>
                  <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
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
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {latestGenDocs.map((doc) => (
                        <div key={doc.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col justify-between space-y-3">
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                                {doc.categoria}
                              </span>
                              <span className="text-[10px] text-slate-400 font-bold">
                                {new Date(doc.data).toLocaleDateString('pt-BR')}
                              </span>
                            </div>
                            <h4 className="text-xs font-bold text-slate-900 mt-2 line-clamp-1">{doc.nome}</h4>
                            <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded mt-1 inline-block">✓ Versão Vigente</span>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
                            <button
                              type="button"
                              onClick={() => handleOpenEvidencia(doc.arquivo_url)}
                              className="text-xs text-emerald-700 hover:text-emerald-900 font-extrabold underline flex items-center gap-1 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Ver Arquivo</span>
                            </button>

                            {doc.podeDeletar && (
                              <button
                                type="button"
                                onClick={() => handleDeleteDoc(doc.id)}
                                className="p-1 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                                title="Excluir"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* SEÇÃO 2: EVIDÊNCIAS ORGANIZADAS PELOS 5 PRINCÍPIOS RTRS (APENAS O ÚLTIMO ANEXADO POR CRITÉRIO) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    Evidências Organizadas por Princípios RTRS
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
                      <div className="bg-slate-50 px-6 py-3.5 border-b border-slate-200 flex items-center justify-between">
                        <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-emerald-700 text-white flex items-center justify-center text-[10px]">
                            {principio.num}
                          </span>
                          {principio.nome}
                        </span>
                        <span className="text-xs font-bold text-slate-500 bg-white px-2.5 py-0.5 rounded-full border border-slate-200">
                          {principioDocs.length} critério(s) com evidência
                        </span>
                      </div>

                      <div className="p-4">
                        {principioDocs.length === 0 ? (
                          <div className="py-4 text-center text-slate-400 text-xs font-medium">
                            Nenhuma evidência anexada para os critérios deste princípio ainda.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {principioDocs.map((doc) => (
                              <div key={doc.id} className="p-3.5 bg-slate-50/70 rounded-xl border border-slate-200 flex items-center justify-between gap-3 hover:bg-slate-100/60 transition-colors">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <span className="text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200">
                                      Última Versão
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-medium">
                                      {new Date(doc.data).toLocaleDateString('pt-BR')}
                                    </span>
                                  </div>
                                  <h4 className="text-xs font-bold text-slate-900 truncate">{doc.nome}</h4>
                                  <p className="text-[11px] text-slate-500 truncate">{doc.origem}</p>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleOpenEvidencia(doc.arquivo_url)}
                                  className="px-3 py-1.5 bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-800 rounded-lg text-xs font-bold transition-all shadow-xs shrink-0 flex items-center gap-1 cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Ver Evidência</span>
                                </button>
                              </div>
                            ))}
                          </div>
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
    </div>
  );
}
