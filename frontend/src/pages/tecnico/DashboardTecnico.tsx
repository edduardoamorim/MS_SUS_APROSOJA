import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MapPin, ClipboardList, CheckCircle2, CalendarDays, Clock, Plus, Trash2, Loader2, Search, Map as MapIcon, AlertTriangle, Eye, FileText, ChevronRight } from 'lucide-react';
import type { FeatureCollection } from 'geojson';
import MapView from '../../components/map/MapView';
import { supabase, createIsolatedAuthClient } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import QuestionarioRTRS from '../../components/auditoria/QuestionarioRTRS';
import Modal from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import { getRemainingTimeLabel } from '../../lib/dateUtils';
import PropertyCodeInput from '../../components/form/PropertyCodeInput';
import CityInput from '../../components/form/CityInput';
import ProducerInput from '../../components/form/ProducerInput';
import { ListSkeleton } from '../../components/ui/Skeleton';
import ConfirmAction from '../../components/ui/ConfirmAction';
import AuditDetailModal from '../../components/auditoria/AuditDetailModal';

function formatMunicipioName(str?: string | null): string {
  if (!str || str.trim().length === 0) return 'Mato Grosso do Sul, MS';
  let clean = str.trim().replace(/,\s*MS$/i, '').trim();

  const mapAccents: Record<string, string> = {
    '5005251': 'Maracaju',
    '5002902': 'Chapadão do Sul',
    '5000203': 'Água Clara',
    '5006606': 'Ponta Porã',
    '5003207': 'Corumbá',
    '5002704': 'Campo Grande',
    '5003702': 'Dourados',
    '5007901': 'Sidrolândia',
    '5008305': 'Três Lagoas',
    '5006200': 'Nova Andradina',
    '5006309': 'Paranaíba',
    '5005707': 'Naviraí',
    '5001102': 'Aquidauana',
    '5002209': 'Bonito',
    '5007307': 'Rio Verde de Mato Grosso',
    'agua clara': 'Água Clara',
    'água clara': 'Água Clara',
    'chapadao do sul': 'Chapadão do Sul',
    'chapadão do sul': 'Chapadão do Sul',
    'ponta pora': 'Ponta Porã',
    'ponta porã': 'Ponta Porã',
    'corumba': 'Corumbá',
    'corumbá': 'Corumbá',
    'maracaju': 'Maracaju',
    'tres lagoas': 'Três Lagoas',
    'três lagoas': 'Três Lagoas',
    'sidrolandia': 'Sidrolândia',
    'sidrolândia': 'Sidrolândia',
    'navirai': 'Naviraí',
    'naviraí': 'Naviraí',
    'paranaiba': 'Paranaíba',
    'paranaíba': 'Paranaíba',
    'rio verde': 'Rio Verde de Mato Grosso',
    'rio verde de mato grosso': 'Rio Verde de Mato Grosso'
  };

  const lower = clean.toLowerCase();
  if (mapAccents[lower]) {
    return `${mapAccents[lower]}, MS`;
  }

  const titleCase = clean
    .toLowerCase()
    .split(' ')
    .map(word => {
      if (['de', 'do', 'da', 'dos', 'das', 'e'].includes(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');

  return `${titleCase}, MS`;
}

function getTechnicianColor(nameOrId?: string, index: number = 0): string {
  if (!nameOrId) return '#94a3b8';
  const str = nameOrId.toLowerCase();
  if (str.includes('patr') || str.includes('vilela')) return '#a855f7'; // Roxo
  if (str.includes('alexandre') || str.includes('soares')) return '#3b82f6'; // Azul
  if (str.includes('técnico ms') || str.includes('tecnico ms')) return '#10b981'; // Verde Esmeralda

  const fallbackPalette = ['#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#f97316'];
  return fallbackPalette[index % fallbackPalette.length];
}

export default function DashboardTecnico() {
  const { success, error, warning } = useToast();
  const { user } = useAuth();
  const [selectedAuditForDetail, setSelectedAuditForDetail] = useState<any>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab = (rawTab === 'mapa' || rawTab === 'auditorias') ? rawTab : 'mapa';
  const setActiveTab = (tab: 'mapa' | 'auditorias') => setSearchParams({ tab });

  const [loading, setLoading] = useState(true);
  const [auditorias, setAuditorias] = useState<any[]>([]);
  const [showQuestionario, setShowQuestionario] = useState(false);
  const [activeAuditoria, setActiveAuditoria] = useState<any>(null);

  // Map & Collaborative States
  const [farmsData, setFarmsData] = useState<FeatureCollection>({ type: 'FeatureCollection', features: [] });
  const [selectedFarmId, setSelectedFarmId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [allAuditorias, setAllAuditorias] = useState<any[]>([]);
  const [filterMode, setFilterMode] = useState<'minhas' | 'todas'>('minhas');
  const [allTechnicians, setAllTechnicians] = useState<any[]>([]);

  // Pendencies States
  const [selectedPropForPends, setSelectedPropForPends] = useState<any>(null);
  const [propPendencias, setPropPendencias] = useState<any[]>([]);
  const [loadingPends, setLoadingPends] = useState(false);
  const [isNewPendFormOpen, setIsNewPendFormOpen] = useState(false);
  const [newPendData, setNewPendData] = useState({ titulo: '', descricao: '', prazo: '' });
  const [rejectingPendId, setRejectingPendId] = useState<string | null>(null);
  const [motivoRejeicaoText, setMotivoRejeicaoText] = useState('');

  // Autonomy States
  const [properties, setProperties] = useState<any[]>([]);
  const [producers, setProducers] = useState<any[]>([]);
  const [showCreateFarmModal, setShowCreateFarmModal] = useState(false);
  const [showScheduleAuditModal, setShowScheduleAuditModal] = useState(false);
  const [certifyConfirmId, setCertifyConfirmId] = useState<string | null>(null);
  const [deletePendConfirmId, setDeletePendConfirmId] = useState<string | null>(null);

  // Prospecção States
  const [produtorOption, setProdutorOption] = useState<'existente' | 'novo'>('existente');
  const [selectedProdutorId, setSelectedProdutorId] = useState<string>('');
  const [novoProdutorData, setNovoProdutorData] = useState({ nome: '', email: '', regiao: '' });
  const [propertiesList, setPropertiesList] = useState<{
    nome_fazenda: string;
    codigo_car: string;
    codigo_sigef: string;
    origem: string;
    geom: any | null;
    errorCar: string;
  }[]>([
    { nome_fazenda: '', codigo_car: '', codigo_sigef: '', origem: 'CAR', geom: null, errorCar: '' }
  ]);
  const [autoScheduleAudit, setAutoScheduleAudit] = useState(true);

  const handleOpenCreateFarmModal = () => {
    setProdutorOption('existente');
    setSelectedProdutorId('');
    setNovoProdutorData({ nome: '', email: '', regiao: '' });
    setPropertiesList([{ nome_fazenda: '', codigo_car: '', codigo_sigef: '', origem: 'CAR', geom: null, errorCar: '' }]);
    setAutoScheduleAudit(true);
    setShowCreateFarmModal(true);
  };
  const [auditFormData, setAuditFormData] = useState({
    propriedade_id: '',
    data_agendamento: new Date().toISOString().split('T')[0]
  });

  // Mock fallbacks if no database entries exist
  const [mockAuditorias, setMockAuditorias] = useState<any[]>([
    {
      id: 'mock-1',
      data_agendamento: new Date().toISOString(),
      status: 'Visita de Campo',
      propriedade_id: 'mock-prop-1',
      propriedades: {
        id: 'mock-prop-1',
        nome_fazenda: 'Fazenda Sol Nascente',
        nome_produtor: 'Pedro Souza',
        codigo_car: 'MS-5000000-AAAA.BBBB.CCCC.DDDD'
      }
    },
    {
      id: 'mock-2',
      data_agendamento: new Date().toISOString(),
      status: 'Acompanhamento',
      propriedade_id: 'mock-prop-2',
      propriedades: {
        id: 'mock-prop-2',
        nome_fazenda: 'Fazenda Terra Viva (Acompanhamento)',
        nome_produtor: 'Maria Oliveira',
        codigo_car: 'MS-6000000-EEEE.FFFF.GGGG.HHHH'
      }
    }
  ]);

  const [mockPendencias, setMockPendencias] = useState<any[]>([
    {
      id: 'mock-pend-1',
      propriedade_id: 'mock-prop-1',
      titulo: 'Retificar CAR (Cadastro Ambiental Rural)',
      descricao: 'Há uma sobreposição apontada no mapa que precisa ser corrigida.',
      status: 'Pendente',
      prazo: '2026-07-15'
    },
    {
      id: 'mock-pend-2',
      propriedade_id: 'mock-prop-2',
      titulo: 'Comprovante de Equipamento de Proteção Individual (EPI)',
      descricao: 'Apresentar recibos de entrega dos EPIs assinados pelos funcionários de campo.',
      status: 'Pendente',
      prazo: '2026-07-20',
      tecnico_responsavel_id: 'mock-tecnico'
    }
  ]);

  useEffect(() => {
    if (user) {
      fetchAudits();
      fetchAuxiliaryData();
      fetchCollaborativeMapData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function fetchAuxiliaryData() {
    try {
      // 1. Fetch properties
      const { data: propsData } = await supabase
        .from('propriedades')
        .select('id, nome_fazenda, nome_produtor, codigo_car');
      if (propsData) setProperties(propsData);

      // 2. Fetch producers
      const { data: prodsData } = await supabase
        .from('perfis')
        .select('id, nome, email, regiao')
        .eq('role', 'produtor');
      if (prodsData) setProducers(prodsData);

      // 3. Fetch all technicians
      const { data: tecsData } = await supabase
        .from('perfis')
        .select('id, nome')
        .eq('role', 'tecnico');
      if (tecsData) setAllTechnicians(tecsData);
    } catch (err) {
      console.error('Erro ao carregar dados auxiliares:', err);
    }
  }

  async function fetchCollaborativeMapData() {
    try {
      // 1. Carregar TODAS as propriedades cadastradas na tabela 'propriedades'
      const { data: propsList, error: propsError } = await supabase
        .from('propriedades')
        .select('id, nome_fazenda, nome_produtor, codigo_car, codigo_sigef, municipio, geom, produtor_id')
        .order('created_at', { ascending: false });

      if (propsError) throw propsError;

      // 2. Carregar TODAS as auditorias com técnicos responsáveis
      const { data: auds } = await supabase
        .from('auditorias')
        .select('id, status, data_agendamento, tecnico_responsavel_id, propriedade_id')
        .order('created_at', { ascending: false });

      if (auds) {
        setAllAuditorias(auds);
      }

      // 3. Mapear técnicos e atribuir paleta de cores exclusiva
      const { data: tecsData } = await supabase
        .from('perfis')
        .select('id, nome')
        .eq('role', 'tecnico');

      const techColorMapLocal: Record<string, string> = {};
      const tecMap: Record<string, string> = {};

      if (tecsData && tecsData.length > 0) {
        setAllTechnicians(tecsData);
        tecsData.forEach((t: any, idx: number) => {
          tecMap[t.id] = t.nome;
          techColorMapLocal[t.id] = getTechnicianColor(t.nome, idx);
        });
      } else {
        const tecIds = [...new Set((auds || []).map((a: any) => a.tecnico_responsavel_id).filter(Boolean))];
        if (tecIds.length > 0) {
          const { data: tecs } = await supabase
            .from('perfis')
            .select('id, nome')
            .in('id', tecIds);
          if (tecs) {
            tecs.forEach((t: any, idx: number) => {
              tecMap[t.id] = t.nome;
              techColorMapLocal[t.id] = getTechnicianColor(t.nome, idx);
            });
          }
        }
      }

      // Combinar propriedades com dados de auditoria e geometrias KML/CAR
      const allProps = propsList || [];
      const features = await Promise.all(
        allProps.map(async (p: any, index: number) => {
          const propAudits = (auds || []).filter((a: any) => a.propriedade_id === p.id);
          const latestAudit = propAudits[0];
          const tecId = latestAudit?.tecnico_responsavel_id || null;
          const tecName = tecId ? (tecMap[tecId] || 'Técnico Atribuído') : 'Sem técnico';
          const auditStatus = latestAudit?.status || 'Autoavaliação';

          // A fazenda é visível no portal do técnico
          const isMine = true;

          let geom = p.geom;

          // --- BLINDAGEM DE GEOMETRIA ---
          // Passo 1: Parse de geom se for string JSON
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

          // Passo 2: Validar GeoJSON
          if (geom && typeof geom === 'object' && (!geom.type || !geom.coordinates)) {
            geom = null;
          }

          // Passo 3: MultiPolygon → Polygon
          if (geom && geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
            geom = { type: 'Polygon', coordinates: geom.coordinates[0] || [] };
          }

          // Passo 4: Buscar no banco geoespacial de backup (se a geometria for nula)
          if (!geom) {
            try {
              if (p.codigo_car) {
                const cleanCar = p.codigo_car.trim();
                let { data: carGeomData } = await supabase
                  .from('imoveis_car')
                  .select('geom')
                  .eq('cod_imovel', cleanCar)
                  .limit(1)
                  .maybeSingle();
                if (!carGeomData?.geom) {
                  const { data: carGeomData2 } = await supabase
                    .from('imoveis_car')
                    .select('geom')
                    .eq('codigosica', cleanCar)
                    .limit(1)
                    .maybeSingle();
                  carGeomData = carGeomData2;
                }
                if (carGeomData?.geom) {
                  geom = typeof carGeomData.geom === 'string' && carGeomData.geom.trim().startsWith('{') ? JSON.parse(carGeomData.geom) : carGeomData.geom;
                }
              }
              if (!geom && p.codigo_sigef) {
                const cleanSigef = p.codigo_sigef.trim();
                let { data: sigefGeomData } = await supabase
                  .from('imoveis_sigef')
                  .select('geom')
                  .eq('parcela_co', cleanSigef)
                  .limit(1)
                  .maybeSingle();
                if (!sigefGeomData?.geom) {
                  const { data: sigefGeomData2 } = await supabase
                    .from('imoveis_sigef')
                    .select('geom')
                    .eq('codigo_imo', cleanSigef)
                    .limit(1)
                    .maybeSingle();
                  sigefGeomData = sigefGeomData2;
                }
                if (sigefGeomData?.geom) {
                  geom = typeof sigefGeomData.geom === 'string' && sigefGeomData.geom.trim().startsWith('{') ? JSON.parse(sigefGeomData.geom) : sigefGeomData.geom;
                }
              }
            } catch (e) {}
          }

          // Passo 5: MultiPolygon → Polygon (backup result)
          if (geom && geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
            geom = { type: 'Polygon', coordinates: geom.coordinates[0] || [] };
          }

          // Passo 6: Fallback de centroide para o mapa se continuar nulo
          if (!geom || typeof geom !== 'object' || !geom.type || !geom.coordinates) {
            const latBase = -20.4 - (index * 0.15);
            const lngBase = -54.6 - (index * 0.15);
            geom = {
              type: 'Polygon',
              coordinates: [[[lngBase, latBase], [lngBase + 0.05, latBase], [lngBase + 0.05, latBase - 0.05], [lngBase, latBase - 0.05], [lngBase, latBase]]]
            };
          }

          let resolvedMunicipio = p.municipio;
          const isGeneric = (val?: string | null) => !val || val.trim() === '' || val.toLowerCase().includes('geral');

          if (isGeneric(resolvedMunicipio)) {
            try {
              if (p.codigo_car) {
                const cleanCar = p.codigo_car.trim();
                const { data: carMuni } = await supabase
                  .from('imoveis_car')
                  .select('municipio')
                  .eq('cod_imovel', cleanCar)
                  .limit(1)
                  .maybeSingle();
                if (carMuni?.municipio) resolvedMunicipio = carMuni.municipio;
              }
              if (isGeneric(resolvedMunicipio) && p.codigo_sigef) {
                const cleanSigef = p.codigo_sigef.trim();
                const { data: sigefMuni } = await supabase
                  .from('imoveis_sigef')
                  .select('municipio_')
                  .eq('parcela_co', cleanSigef)
                  .limit(1)
                  .maybeSingle();
                if (sigefMuni?.municipio_) resolvedMunicipio = sigefMuni.municipio_;
              }
            } catch (e) {}
          }

          if (isGeneric(resolvedMunicipio)) {
            const nameLower = (p.nome_fazenda || '').toLowerCase();
            if (nameLower.includes('chapad')) resolvedMunicipio = 'Chapadão do Sul';
            else if (nameLower.includes('campanar')) resolvedMunicipio = 'Maracaju';
            else if (nameLower.includes('rio verde')) resolvedMunicipio = 'Água Clara';
            else if (nameLower.includes('santa virg')) resolvedMunicipio = 'Ponta Porã';
            else if (nameLower.includes('caceres') || nameLower.includes('cáceres')) resolvedMunicipio = 'Corumbá';
            else resolvedMunicipio = 'Mato Grosso do Sul';
          }

          const finalMunicipio = formatMunicipioName(resolvedMunicipio);

          const featureColor = tecId ? getTechnicianColor(tecName, index) : '#94a3b8';
          const isMineFarm = tecId ? (user?.id && tecId === user.id) : true;

          return {
            type: 'Feature' as const,
            properties: {
              id: p.id,
              name: p.nome_fazenda,
              municipio: finalMunicipio,
              tecnico_nome: tecName,
              tecnico_id: tecId,
              color: featureColor,
              isMine: isMineFarm,
              status: auditStatus,
              produtor: p.nome_produtor || 'Produtor Rural'
            },
            geometry: geom
          };
        })
      );

      setFarmsData({ type: 'FeatureCollection', features });
    } catch (err) {
      console.error('Erro ao carregar mapa colaborativo:', err);
    }
  }

  const isUUID = (str: any) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

  const handleCreateFarm = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 1. Validar e limpar a lista de propriedades
    let hasError = false;
    const updatedList = propertiesList.map(p => {
      const isCarEmpty = p.origem === 'CAR' && (!p.codigo_car || p.codigo_car.trim().length < 2);
      const isSigefEmpty = p.origem === 'SIGEF' && (!p.codigo_sigef || p.codigo_sigef.trim().length < 2);
      const isKmlEmpty = p.origem === 'KML' && !p.geom;

      if (isCarEmpty) {
        hasError = true;
        return { ...p, errorCar: 'Informe o código do CAR ou selecione uma opção da busca.' };
      }
      if (isSigefEmpty) {
        hasError = true;
        return { ...p, errorCar: 'Selecione uma parcela válida do SIGEF.' };
      }
      if (isKmlEmpty) {
        hasError = true;
        return { ...p, errorCar: 'Faça upload de um arquivo KML/KMZ com geometria.' };
      }
      return { ...p, errorCar: '' };
    });

    setPropertiesList(updatedList);
    if (hasError) {
      warning('Por favor, preencha os dados da propriedade antes de confirmar!');
      return;
    }

    setLoading(true);
    try {
      // Garantir nome de fazenda padrão caso fique em branco
      const processedProps = propertiesList.map(p => ({
        nome_fazenda: p.nome_fazenda?.trim() || `Fazenda ${p.codigo_car || p.codigo_sigef || 'Prospecção'}`,
        codigo_car: p.codigo_car || '',
        codigo_sigef: p.codigo_sigef || '',
        origem: p.origem,
        geom: p.geom
      }));

      const validProdId = isUUID(selectedProdutorId) ? selectedProdutorId : null;
      const validTecId = isUUID(user?.id) ? user.id : null;

      const payload = {
        produtor_option: produtorOption,
        produtor_id: produtorOption === 'existente' ? validProdId : null,
        novo_produtor: produtorOption === 'novo' ? novoProdutorData : null,
        propriedades_list: processedProps,
        tecnico_id: validTecId,
        auto_schedule: autoScheduleAudit
      };

      let isSuccess = false;

      // Estratégia 1: Tentar via RPC cadastrar_prospeccao_completa
      try {
        const { error: rpcError } = await supabase.rpc('cadastrar_prospeccao_completa', payload);
        if (!rpcError) {
          isSuccess = true;
        } else {
          console.warn('RPC cadastrar_prospeccao_completa respondeu com erro:', rpcError);
        }
      } catch (e) {
        console.warn('Falha na chamada RPC, executando fallback direto...', e);
      }

      // Estratégia 2: Fallback de inserção direta nas tabelas do Supabase
      if (!isSuccess) {
        let prodId = validProdId;
        let prodNome = 'Produtor Rural';

        // 2a. Tratar produtor
        if (produtorOption === 'novo' && novoProdutorData.nome) {
          const defaultEmail = novoProdutorData.email?.trim() || `${novoProdutorData.nome.toLowerCase().replace(/\s+/g, '')}@produtor.com.br`;
          let authUserId: string | null = null;
          
          try {
            const isolatedAuth = createIsolatedAuthClient();
            const { data: signUpData } = await isolatedAuth.auth.signUp({
              email: defaultEmail,
              password: 'Senha@123',
              options: {
                data: {
                  full_name: novoProdutorData.nome,
                  role: 'produtor'
                }
              }
            });
            if (signUpData?.user?.id && isUUID(signUpData.user.id)) {
              authUserId = signUpData.user.id;
            }
          } catch (e) {
            console.warn('Aviso ao criar conta Auth do produtor:', e);
          }

          const profileInsert: any = {
            nome: novoProdutorData.nome,
            email: defaultEmail,
            role: 'produtor',
            regiao: novoProdutorData.regiao || 'Geral, MS',
            status: 'Ativo'
          };
          if (authUserId) {
            profileInsert.id = authUserId;
          }

          const { data: newProd, error: prodErr } = await supabase
            .from('perfis')
            .upsert([profileInsert])
            .select()
            .single();
          
          if (!prodErr && newProd && isUUID(newProd.id)) {
            prodId = newProd.id;
            prodNome = newProd.nome;
          }
        } else if (selectedProdutorId) {
          const foundProd = producers.find(p => p.id === selectedProdutorId || p.nome === selectedProdutorId);
          if (foundProd) {
            prodNome = foundProd.nome;
            if (isUUID(foundProd.id)) prodId = foundProd.id;
          } else {
            prodNome = selectedProdutorId;
          }
        }

        // 2b. Inserir cada propriedade na tabela 'propriedades'
        for (const p of processedProps) {
          const propInsertPayload: any = {
            nome_fazenda: p.nome_fazenda,
            nome_produtor: prodNome,
            produtor_id: isUUID(prodId) ? prodId : null,
            codigo_car: p.origem === 'CAR' ? p.codigo_car : null,
            codigo_sigef: p.origem === 'SIGEF' ? p.codigo_sigef : null,
            origem_cadastro: p.origem || 'CAR'
          };

          if (p.geom) {
            propInsertPayload.geom = p.geom;
          }

          let insertedPropId: string | null = null;

          const { data: insertedProp, error: propErr } = await supabase
            .from('propriedades')
            .insert([propInsertPayload])
            .select()
            .single();

          if (!propErr && insertedProp) {
            insertedPropId = insertedProp.id;
            isSuccess = true;
          } else {
            console.warn('Inserção direta com geom falhou, tentando sem geom...', propErr);
            delete propInsertPayload.geom;
            const { data: retryProp, error: retryErr } = await supabase
              .from('propriedades')
              .insert([propInsertPayload])
              .select()
              .single();

            if (!retryErr && retryProp) {
              insertedPropId = retryProp.id;
              isSuccess = true;
            } else {
              console.error('Erro fatal ao inserir propriedade:', retryErr);
            }
          }

          // 2c. Criar auditoria se auto_schedule estiver ativo
          if (isSuccess && insertedPropId && autoScheduleAudit) {
            const auditPayload: any = {
              propriedade_id: insertedPropId,
              data_agendamento: new Date().toISOString().split('T')[0],
              status: 'Visita de Campo'
            };
            if (isUUID(user?.id)) {
              auditPayload.tecnico_responsavel_id = user.id;
            }
            await supabase.from('auditorias').insert([auditPayload]);
          }
        }
      }

      if (isSuccess) {
        success('Cadastro de prospecção e fazendas realizado com sucesso!');
        setShowCreateFarmModal(false);
        
        // Resetar estados
        setPropertiesList([{ nome_fazenda: '', codigo_car: '', codigo_sigef: '', origem: 'CAR', geom: null, errorCar: '' }]);
        setNovoProdutorData({ nome: '', email: '', regiao: '' });
        setSelectedProdutorId('');
        
        // Recarregar dados
        fetchAuxiliaryData();
        fetchAudits();
        fetchCollaborativeMapData();
      } else {
        error('Não foi possível salvar a propriedade. Verifique as informações.');
      }
    } catch (err: any) {
      console.error('Erro ao cadastrar:', err);
      error('Erro ao cadastrar: ' + (err.message || 'Verifique as informações digitadas.'));
    } finally {
      setLoading(false);
    }
  };

  const handleScheduleAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auditFormData.propriedade_id) {
      warning('Selecione uma fazenda!');
      return;
    }

    try {
      const payload = {
        propriedade_id: auditFormData.propriedade_id,
        tecnico_responsavel_id: user?.id,
        data_agendamento: auditFormData.data_agendamento,
        status: 'Visita de Campo'
      };

      const { error: err } = await supabase
        .from('auditorias')
        .insert([payload]);

      if (err) throw err;

      success('Vistoria agendada e atribuída com sucesso!');
      setShowScheduleAuditModal(false);
      
      fetchAudits();
    } catch (err: any) {
      console.error('Erro ao agendar vistoria:', err);
      error('Erro ao agendar vistoria: ' + err.message);
    }
  };

  const handleLiberarAuditoria = async (auditoriaId: string) => {
    setCertifyConfirmId(auditoriaId);
  };

  const executeCertify = async () => {
    const auditoriaId = certifyConfirmId;
    if (!auditoriaId) return;

    if (auditoriaId.startsWith('mock-')) {
      setAuditorias(auditorias.map(a => a.id === auditoriaId ? { ...a, status: 'Certificada' } : a));
      return;
    }

    try {
      const { error: err } = await supabase
        .from('auditorias')
        .update({ status: 'Certificada' })
        .eq('id', auditoriaId);
      if (err) throw err;
      
      setAuditorias(auditorias.map(a => a.id === auditoriaId ? { ...a, status: 'Certificada' } : a));
      success('Auditoria liberada e certificada com sucesso!');
    } catch (err: any) {
      console.error('Erro ao certificar auditoria:', err);
      error('Erro ao certificar: ' + err.message);
    } finally {
      setCertifyConfirmId(null);
    }
  };

  async function fetchAudits() {
    setLoading(true);
    try {
      const { data: auditsData, error: auditsError } = await supabase
        .from('auditorias')
        .select(`
          id,
          data_agendamento,
          status,
          propriedade_id,
          propriedades (
            id,
            nome_fazenda,
            nome_produtor,
            codigo_car
          )
        `)
        .eq('tecnico_responsavel_id', user?.id);

      if (auditsError) throw auditsError;

      // Buscar pendências atribuídas a este técnico
      let pendsProperties: any[] = [];
      try {
        const { data: pendsData, error: pendsError } = await supabase
          .from('pendencias')
          .select(`
            propriedade_id,
            propriedades:propriedade_id (
              id,
              nome_fazenda,
              nome_produtor,
              codigo_car
            )
          `)
          .eq('tecnico_responsavel_id', user?.id);
        
        if (!pendsError && pendsData) {
          pendsProperties = pendsData;
        }
      } catch (e) {
        console.warn('Erro ao carregar pendências atribuídas:', e);
      }

      // Criar pseudo-auditorias para as propriedades de pendência que não tenham auditoria agendada
      const existingPropIds = new Set((auditsData || []).map((a: any) => a.propriedade_id));
      const pseudoAudits: any[] = [];

      pendsProperties.forEach((p: any) => {
        if (p.propriedades && !existingPropIds.has(p.propriedade_id)) {
          existingPropIds.add(p.propriedade_id);
          pseudoAudits.push({
            id: `assigned-pend-${p.propriedade_id}`,
            data_agendamento: new Date().toISOString(),
            status: 'Acompanhamento',
            propriedade_id: p.propriedade_id,
            propriedades: p.propriedades
          });
        }
      });

      const finalAudits = [...(auditsData || []), ...pseudoAudits];

      if (finalAudits.length === 0) {
        // Se não houver auditorias, tenta atribuir a propriedade padrão do seed
        const { error: insertError } = await supabase
          .from('auditorias')
          .insert([
            {
              propriedade_id: '22222222-2222-2222-2222-222222222222',
              tecnico_responsavel_id: user?.id,
              status: 'Visita de Campo',
              data_agendamento: new Date().toISOString()
            }
          ]);

        if (!insertError) {
          const { data: refetchedData, error: refetchError } = await supabase
            .from('auditorias')
            .select(`
              id,
              data_agendamento,
              status,
              propriedade_id,
              propriedades (
                id,
                nome_fazenda,
                nome_produtor,
                codigo_car
              )
            `)
            .eq('tecnico_responsavel_id', user?.id);

          if (!refetchError && refetchedData && refetchedData.length > 0) {
            setAuditorias(refetchedData);
            setLoading(false);
            return;
          }
        }
      }

      setAuditorias(finalAudits.length > 0 ? finalAudits : mockAuditorias);
    } catch (err: any) {
      console.error('Erro ao carregar auditorias do banco:', err);
      setAuditorias(mockAuditorias);
    } finally {
      setLoading(false);
    }
  }

  const handleStartAuditoria = (auditoria: any) => {
    setActiveAuditoria(auditoria);
    setShowQuestionario(true);
  };

  const handleComplete = async (auditoriaId: string) => {
    if (auditoriaId.startsWith('mock-')) {
      setAuditorias(auditorias.map(a => a.id === auditoriaId ? { ...a, status: 'Em Análise' } : a));
      setShowQuestionario(false);
      return;
    }

    try {
      const { error: err } = await supabase
        .from('auditorias')
        .update({ status: 'Em Análise' })
        .eq('id', auditoriaId);
      if (err) throw err;
      
      setAuditorias(auditorias.map(a => a.id === auditoriaId ? { ...a, status: 'Em Análise' } : a));
      setShowQuestionario(false);
      success('Relatório de auditoria salvo com sucesso!');
    } catch (err: any) {
      console.error('Erro ao atualizar auditoria:', err);
      error('Erro ao salvar relatório de auditoria: ' + err.message);
    }
  };

  // Funções de Pendências
  const handleOpenPendencias = async (prop: any) => {
    setSelectedPropForPends(prop);
    setLoadingPends(true);

    if (prop.id.startsWith('mock-')) {
      const pends = mockPendencias.filter(p => p.propriedade_id === prop.id);
      setPropPendencias(pends);
      setLoadingPends(false);
      return;
    }

    try {
      const { data, error: err } = await supabase
        .from('pendencias')
        .select('*')
        .eq('propriedade_id', prop.id)
        .order('created_at', { ascending: false });
      if (err) throw err;
      setPropPendencias(data || []);
    } catch (err: any) {
      console.error('Erro ao buscar pendências:', err);
      error('Erro ao carregar pendências: ' + err.message);
    } finally {
      setLoadingPends(false);
    }
  };

  const handleAddPendency = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPropForPends) return;

    if (newPendData.prazo) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const parts = newPendData.prazo.split('-');
      const selectedDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      selectedDate.setHours(0, 0, 0, 0);
      
      if (selectedDate < today) {
        warning('O prazo limite não pode ser uma data retroativa (no passado)!');
        return;
      }
    }

    if (selectedPropForPends.id.startsWith('mock-')) {
      const newPend = {
        id: `mock-pend-${Date.now()}`,
        propriedade_id: selectedPropForPends.id,
        titulo: newPendData.titulo,
        descricao: newPendData.descricao,
        prazo: newPendData.prazo || null,
        status: 'Pendente',
        created_at: new Date().toISOString()
      };
      setMockPendencias([newPend, ...mockPendencias]);
      setPropPendencias([newPend, ...propPendencias]);
      setIsNewPendFormOpen(false);
      setNewPendData({ titulo: '', descricao: '', prazo: '' });
      return;
    }

    try {
      const payload = {
        propriedade_id: selectedPropForPends.id,
        titulo: newPendData.titulo,
        descricao: newPendData.descricao,
        prazo: newPendData.prazo || null,
        status: 'Pendente',
        criado_por: user?.id || null,
        tecnico_responsavel_id: user?.id || null
      };

      const { data, error: err } = await supabase
        .from('pendencias')
        .insert([payload])
        .select()
        .single();
      if (err) throw err;

      if (data) {
        setPropPendencias([data, ...propPendencias]);
      }
      setIsNewPendFormOpen(false);
      setNewPendData({ titulo: '', descricao: '', prazo: '' });
      success('Pendência criada com sucesso!');
    } catch (err: any) {
      console.error('Erro ao criar pendência:', err);
      error('Erro ao criar pendência: ' + err.message);
    }
  };

  const handleConfirmReject = async (id: string) => {
    if (!motivoRejeicaoText.trim()) {
      warning('Por favor, informe o motivo da rejeição ou os ajustes necessários.');
      return;
    }

    if (id.startsWith('mock-')) {
      setMockPendencias(mockPendencias.map(p => p.id === id ? { ...p, status: 'Pendente', motivo_rejeicao: motivoRejeicaoText } : p));
      setPropPendencias(propPendencias.map(p => p.id === id ? { ...p, status: 'Pendente', motivo_rejeicao: motivoRejeicaoText } : p));
      setRejectingPendId(null);
      setMotivoRejeicaoText('');
      success('Pendência rejeitada e devolvida ao produtor!');
      return;
    }

    try {
      const payload = {
        status: 'Pendente',
        motivo_rejeicao: motivoRejeicaoText
      };
      const { error: err } = await supabase
        .from('pendencias')
        .update(payload)
        .eq('id', id);
      if (err) throw err;

      setPropPendencias(propPendencias.map(p => p.id === id ? { ...p, ...payload } : p));
      setRejectingPendId(null);
      setMotivoRejeicaoText('');
      success('Pendência rejeitada e devolvida ao produtor com as observações!');
    } catch (err: any) {
      console.error('Erro ao rejeitar pendência:', err);
      error('Erro ao rejeitar pendência: ' + err.message);
    }
  };

  const handleUpdatePendencyStatus = async (id: string, newStatus: 'Resolvida' | 'Pendente') => {
    if (id.startsWith('mock-')) {
      setMockPendencias(mockPendencias.map(p => p.id === id ? { ...p, status: newStatus } : p));
      setPropPendencias(propPendencias.map(p => p.id === id ? { ...p, status: newStatus } : p));
      return;
    }

    try {
      const payload: any = { status: newStatus };
      if (newStatus === 'Resolvida') {
        payload.resolucao_descricao = 'Resolvido in loco pelo técnico.';
      }
      const { error: err } = await supabase
        .from('pendencias')
        .update(payload)
        .eq('id', id);
      if (err) throw err;

      setPropPendencias(propPendencias.map(p => p.id === id ? { ...p, ...payload } : p));
      success('Status da pendência atualizado com sucesso!');
    } catch (err: any) {
      console.error('Erro ao atualizar status da pendência:', err);
      error('Erro ao atualizar status: ' + err.message);
    }
  };

  const handleDeletePendency = async (id: string) => {
    setDeletePendConfirmId(id);
  };

  const executeDeletePendency = async () => {
    const id = deletePendConfirmId;
    if (!id) return;

    if (id.startsWith('mock-')) {
      setMockPendencias(mockPendencias.filter(p => p.id !== id));
      setPropPendencias(propPendencias.filter(p => p.id !== id));
      return;
    }

    try {
      const { error: err } = await supabase
        .from('pendencias')
        .delete()
        .eq('id', id);
      if (err) throw err;

      setPropPendencias(propPendencias.filter(p => p.id !== id));
      success('Pendência removida com sucesso!');
    } catch (err: any) {
      console.error('Erro ao excluir pendência:', err);
      error('Erro ao excluir pendência: ' + err.message);
    } finally {
      setDeletePendConfirmId(null);
    }
  };

  const filteredFarms = farmsData.features.filter(f => {
    const matchSearch = (f.properties?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.properties?.municipio || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.properties?.tecnico_nome || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.properties?.produtor || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchFilter = filterMode === 'todas' || f.properties?.isMine;
    return matchSearch && matchFilter;
  });

  const techColorMap: Record<string, string> = {};
  allTechnicians.forEach((t, i) => { techColorMap[t.id] = getTechnicianColor(t.nome, i); });

  const filteredFarmsGeoJSON: FeatureCollection = { type: 'FeatureCollection', features: filteredFarms };

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Portal do Técnico</h1>
          <p className="text-muted-foreground mt-1 text-lg">Gestão de vistorias, auditorias e acompanhamento de fazendas.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleOpenCreateFarmModal}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm rounded-lg shadow-md transition-all cursor-pointer active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            Cadastrar Fazenda
          </button>
          <button
            onClick={() => {
              setAuditFormData({ propriedade_id: properties[0]?.id || '', data_agendamento: new Date().toISOString().split('T')[0] });
              setShowScheduleAuditModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-lg shadow-md transition-all cursor-pointer active:scale-[0.98]"
          >
            <CalendarDays className="w-4 h-4" />
            Iniciar Vistoria
          </button>
          <div className="flex items-center gap-2 bg-secondary text-secondary-foreground px-4 py-2 rounded-lg text-sm font-semibold border border-border shadow-sm">
            <CalendarDays className="w-4 h-4 text-primary" />
            <span>Hoje, {new Date().toLocaleDateString('pt-BR')}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-muted/50 p-1 rounded-xl inline-flex gap-1 border border-border/50">
        <button
          onClick={() => setActiveTab('mapa')}
          className={`px-6 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
            activeTab === 'mapa'
              ? 'bg-card text-foreground shadow-sm font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <MapIcon className="w-4 h-4 text-emerald-600" />
          Mapa & Propriedades
        </button>
        <button
          onClick={() => setActiveTab('auditorias')}
          className={`px-6 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
            activeTab === 'auditorias'
              ? 'bg-card text-foreground shadow-sm font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <ClipboardList className="w-4 h-4 text-indigo-600" />
          Auditorias
        </button>
      </div>

      {/* ====== TAB: MAPA & PROPRIEDADES ====== */}
      <div className={activeTab === 'mapa' ? 'block' : 'hidden'}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Panel: Farm List */}
          <div className="lg:col-span-1 space-y-4">
            {/* Filter Toggle */}
            <div className="flex gap-1 bg-muted/60 p-0.5 rounded-lg border border-border/50">
              <button
                onClick={() => setFilterMode('minhas')}
                className={`flex-1 py-2 px-3 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  filterMode === 'minhas' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                Minhas Fazendas
              </button>
              <button
                onClick={() => setFilterMode('todas')}
                className={`flex-1 py-2 px-3 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  filterMode === 'todas' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Eye className="w-3.5 h-3.5 text-indigo-600" />
                Todas as Fazendas
              </button>
            </div>

            {/* Search */}
            <div className="bg-card p-5 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100">
              <div className="relative mb-5">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Buscar por fazenda, município, técnico..."
                  className="w-full pl-10 pr-4 py-2.5 bg-background border border-input rounded-xl text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary focus:outline-none text-foreground transition-all placeholder:text-muted-foreground/60"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Farm List */}
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1 scrollbar-thin">
                {filteredFarms.length === 0 && (
                  <div className="text-center py-10 text-muted-foreground">
                    <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-amber-400" />
                    <p className="text-sm font-medium">Nenhuma propriedade encontrada</p>
                    <p className="text-xs mt-1">Cadastre ou altere o filtro</p>
                  </div>
                )}
                {filteredFarms.map((farm, idx) => {
                  const props = farm.properties!;
                  const isSelected = selectedFarmId === props.id;
                  const tecColor = techColorMap[props.tecnico_id] || 'hsl(0, 0%, 60%)';
                  const statusBadge = props.status === 'Certificada'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                    : props.status === 'Visita de Campo'
                    ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
                    : props.status === 'Acompanhamento'
                    ? 'bg-purple-100 text-purple-800 border-purple-200'
                    : 'bg-amber-100 text-amber-800 border-amber-200';

                  return (
                    <div
                      key={props.id}
                      onClick={() => setSelectedFarmId(isSelected ? null : props.id)}
                      className={`relative group cursor-pointer rounded-xl border transition-all duration-200 overflow-hidden animate-fade-in-up ${
                        isSelected
                          ? 'border-primary bg-primary/5 shadow-lg ring-2 ring-primary/20'
                          : 'border-border bg-card hover:border-primary/30 hover:shadow-md hover:-translate-y-0.5'
                      }`}
                      style={{ animationDelay: `${idx * 40}ms` }}
                    >
                      {/* Color bar indicating technician */}
                      <div
                        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
                        style={{ backgroundColor: tecColor }}
                      />
                      <div className="pl-4 pr-3 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <h4 className="font-bold text-sm text-foreground truncate">{props.name}</h4>
                            {props.municipio && (
                              <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-primary/70" />
                                {formatMunicipioName(props.municipio)}
                              </p>
                            )}
                            <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5 font-medium">
                              <span className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0 shadow-sm" style={{ backgroundColor: tecColor }} />
                              <span>{props.tecnico_id ? props.tecnico_nome : 'Sem técnico atribuído'}</span>
                              {props.tecnico_id && props.tecnico_id === user?.id && (
                                <span className="text-[9px] font-bold bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 px-1.5 py-0.2 rounded-md uppercase tracking-wider ml-0.5">
                                  Você
                                </span>
                              )}
                            </p>
                            {props.produtor && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">Produtor: {props.produtor}</p>
                            )}
                          </div>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap ${statusBadge}`}>
                            {props.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Technician Legend */}
            {filterMode === 'todas' && allTechnicians.length > 0 && (
              <div className="bg-card p-4 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100">
                <div className="flex items-center justify-between mb-3 border-b border-border/40 pb-2">
                  <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    Legenda — Técnicos
                  </h4>
                  <span className="text-[10px] text-muted-foreground font-semibold">
                    {allTechnicians.length} técnicos
                  </span>
                </div>
                <div className="space-y-1.5">
                  {allTechnicians.map(t => {
                    const color = techColorMap[t.id] || '#94a3b8';
                    const count = farmsData.features.filter(f => f.properties?.tecnico_id === t.id).length;
                    const isCurrentUser = t.id === user?.id;

                    return (
                      <div key={t.id} className="flex items-center justify-between py-1.5 px-2.5 rounded-xl hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-3 h-3 rounded-full flex-shrink-0 shadow-sm border border-black/10" style={{ backgroundColor: color }} />
                          <span className="text-xs font-semibold text-foreground truncate">{t.nome}</span>
                          {isCurrentUser && (
                            <span className="text-[9px] font-bold bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 px-1.5 py-0.2 rounded-md uppercase tracking-wider flex-shrink-0">
                              Você
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-bold text-slate-700 bg-slate-100 border border-slate-200 px-3 py-0.5 rounded-full">
                          {count} {count === 1 ? 'fazenda' : 'fazendas'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right Panel: Map */}
          <div className="lg:col-span-2">
            <div className="bg-card rounded-2xl shadow-lg border border-slate-100 overflow-hidden h-[75vh] min-h-[500px]">
              <MapView
                farms={filteredFarmsGeoJSON}
                farmsData={filteredFarmsGeoJSON}
                selectedFarmId={selectedFarmId}
                onSelectFarm={setSelectedFarmId}
                activeTab={activeTab}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ====== TAB: AUDITORIAS ====== */}
      <div className={activeTab === 'auditorias' ? 'block' : 'hidden'}>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ListSkeleton />
            <ListSkeleton />
            <ListSkeleton />
            <ListSkeleton />
          </div>
        ) : !auditorias || auditorias.length === 0 ? (
          <div className="bg-card p-12 rounded-2xl border border-border text-center space-y-3">
            <ClipboardList className="w-12 h-12 text-muted-foreground mx-auto opacity-50" />
            <h3 className="text-lg font-bold text-foreground">Nenhuma auditoria cadastrada</h3>
            <p className="text-sm text-muted-foreground">Cadastre uma nova fazenda ou agende auditorias para visualizar nesta aba.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {auditorias.map((auditoria, index) => {
              if (!auditoria) return null;
              const prop = Array.isArray(auditoria?.propriedades) ? auditoria.propriedades[0] : auditoria?.propriedades;
              const isMock = typeof auditoria?.id === 'string' && auditoria.id.startsWith('mock-');
              const auditId = auditoria?.id || `audit-${index}`;

              return (
                <div
                  key={auditId}
                  className="bg-card rounded-xl shadow-xs border border-border overflow-hidden hover:-translate-y-1 hover:shadow-xl hover:border-primary/20 transition-all duration-300 ease-out group flex flex-col justify-between animate-fade-in-up"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div>
                    <div className="px-5 py-4 bg-muted/50 border-b border-border flex justify-between items-center">
                      <div className="flex items-center gap-2 text-muted-foreground font-medium text-sm">
                        <MapPin className="w-4 h-4 text-primary" />
                        <span>{prop?.municipio && prop.municipio !== 'Geral, MS' ? prop.municipio : (prop?.nome_fazenda?.toLowerCase().includes('chapad') ? 'Chapadão do Sul, MS' : 'Maracaju, MS')}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border ${
                          auditoria.status === 'Autoavaliação' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                          auditoria.status === 'Visita de Campo' ? 'bg-indigo-100 text-indigo-800 border-indigo-200' :
                          auditoria.status === 'Em Análise' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                          auditoria.status === 'Acompanhamento' ? 'bg-purple-100 text-purple-800 border-purple-200 font-semibold shadow-sm' :
                          'bg-emerald-100 text-emerald-800 border-emerald-200'
                        }`}>
                          {auditoria.status}
                        </span>
                      </div>
                    </div>

                    <div
                      className="p-6 cursor-pointer group/card transition-all duration-300 relative hover:bg-gradient-to-br hover:from-card hover:to-primary/5"
                      onClick={() => setSelectedAuditForDetail(auditoria)}
                      title="Clique para visualizar Ficha Técnica Completa"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-extrabold text-xl text-foreground group-hover/card:text-primary transition-colors tracking-tight truncate">
                            {prop?.nome_fazenda || 'Fazenda'}
                          </h3>
                          <p className="text-sm font-medium text-muted-foreground mt-1.5 flex items-center gap-1.5">
                            Produtor: <strong className="text-foreground font-semibold">{prop?.nome_produtor || 'Não informado'}</strong>
                          </p>
                        </div>

                        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover/card:bg-primary group-hover/card:text-white group-hover/card:scale-110 group-hover/card:shadow-md transition-all duration-300">
                          <ChevronRight className="w-5 h-5 transition-transform duration-300 group-hover/card:translate-x-0.5" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 pt-0 border-t border-border/30 mt-2 flex flex-col gap-2">
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleOpenPendencias(prop)}
                          className="flex-1 py-2 bg-amber-50 hover:bg-amber-100/80 text-amber-950 border border-amber-200 rounded-lg flex items-center justify-center gap-1.5 font-bold text-sm transition-all cursor-pointer shadow-xs"
                        >
                          <ClipboardList className="w-4 h-4 text-amber-800" />
                          Pendências
                        </button>

                        {auditoria.status === 'Visita de Campo' || auditoria.status === 'Autoavaliação' ? (
                          <button
                            onClick={() => handleStartAuditoria(auditoria)}
                            className="flex-1 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg flex items-center justify-center gap-1.5 font-bold text-sm transition-all cursor-pointer shadow-xs active:scale-[0.98]"
                          >
                            <ClipboardList className="w-4 h-4" />
                            Realizar Visita
                          </button>
                        ) : auditoria.status === 'Em Análise' ? (
                          <button
                            onClick={() => handleStartAuditoria(auditoria)}
                            className="flex-1 py-2 bg-indigo-50 border border-indigo-200 text-indigo-800 hover:bg-indigo-100 rounded-lg flex items-center justify-center gap-1.5 font-bold text-sm transition-all cursor-pointer shadow-xs"
                          >
                            <Clock className="w-4 h-4 text-indigo-600" />
                            Em Análise do Gestor
                          </button>
                        ) : auditoria.status === 'Acompanhamento' ? (
                          <div className="flex-1 py-2 bg-purple-50 border border-purple-200 text-purple-800 rounded-lg flex items-center justify-center gap-1.5 font-bold text-sm shadow-xs">
                            <Clock className="w-4 h-4 text-purple-600 animate-pulse" />
                            Acompanhamento
                          </div>
                        ) : auditoria.status === 'Certificada' ? (
                          <div className="flex-1 py-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center justify-center gap-1.5 font-bold text-sm shadow-xs">
                            <CheckCircle2 className="w-4 h-4" />
                            Certificada
                          </div>
                        ) : (
                          <button
                            onClick={() => handleStartAuditoria(auditoria)}
                            className="flex-1 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg flex items-center justify-center gap-1.5 font-bold text-sm transition-all cursor-pointer shadow-xs"
                          >
                            <ClipboardList className="w-4 h-4" />
                            Realizar Visita
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal de Ficha Técnica Completa da Auditoria */}
        {selectedAuditForDetail && (
          <AuditDetailModal
            isOpen={!!selectedAuditForDetail}
            onClose={() => setSelectedAuditForDetail(null)}
            auditoria={selectedAuditForDetail}
            onStartVisita={handleStartAuditoria}
            onOpenPendencias={handleOpenPendencias}
          />
        )}
      </div>

      {showQuestionario && activeAuditoria && (
        <QuestionarioRTRS 
          modo="auditoria"
          propriedadeNome={activeAuditoria.propriedades?.nome_fazenda || "Fazenda Sol Nascente"}
          onClose={() => setShowQuestionario(false)}
          onComplete={() => handleComplete(activeAuditoria.id)}
          auditoriaId={activeAuditoria.id}
        />
      )}

      {/* Modal de Pendências */}
      {selectedPropForPends && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedPropForPends(null)}
          title={`Checklist de Pendências - ${selectedPropForPends.nome_fazenda}`}
        >
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <span className="text-xs text-muted-foreground font-semibold">
                Exigências de Regularização
              </span>
              {!isNewPendFormOpen && (
                <button
                  onClick={() => setIsNewPendFormOpen(true)}
                  className="flex items-center gap-1 text-[11px] bg-primary hover:bg-primary/90 text-primary-foreground px-2.5 py-1.5 rounded font-bold transition-all cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> Nova Exigência
                </button>
              )}
            </div>

            {isNewPendFormOpen && (
              <form onSubmit={handleAddPendency} className="p-3 bg-muted/40 border border-border rounded-xl space-y-3 animate-fade-in-down">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Título da Exigência</label>
                  <input
                    required
                    placeholder="Ex: Enviar comprovante de EPI"
                    value={newPendData.titulo}
                    onChange={e => setNewPendData({...newPendData, titulo: e.target.value})}
                    className="w-full px-2.5 py-1.5 bg-background border border-input rounded-md text-xs focus:ring-1 focus:ring-primary focus:outline-none text-foreground"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Descrição detalhada</label>
                  <textarea
                    required
                    rows={2}
                    placeholder="Descreva o que o produtor precisa corrigir..."
                    value={newPendData.descricao}
                    onChange={e => setNewPendData({...newPendData, descricao: e.target.value})}
                    className="w-full px-2.5 py-1.5 bg-background border border-input rounded-md text-xs focus:ring-1 focus:ring-primary focus:outline-none text-foreground"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Prazo Limite</label>
                  <input
                    type="date"
                    min={new Date().toISOString().split('T')[0]}
                    value={newPendData.prazo}
                    onChange={e => setNewPendData({...newPendData, prazo: e.target.value})}
                    className="w-full px-2.5 py-1.5 bg-background border border-input rounded-md text-xs focus:ring-1 focus:ring-primary focus:outline-none text-foreground"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsNewPendFormOpen(false)}
                    className="px-2.5 py-1 bg-secondary text-secondary-foreground text-xs rounded font-medium hover:bg-secondary/80 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-2.5 py-1 bg-primary text-primary-foreground text-xs rounded font-semibold hover:bg-primary/90 cursor-pointer"
                  >
                    Salvar Exigência
                  </button>
                </div>
              </form>
            )}

            {loadingPends ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : propPendencias.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-xs font-medium border border-dashed border-border rounded-xl">
                Nenhuma pendência cadastrada para esta propriedade.
              </div>
            ) : (
              <div className="space-y-3">
                {propPendencias.map(pend => (
                  <div key={pend.id} className="p-4 bg-background border border-border rounded-xl space-y-2.5 relative group shadow-sm">
                    <div className="flex justify-between items-start gap-2">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border ${
                            pend.status === 'Pendente' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                            pend.status === 'Em Análise' ? 'bg-indigo-100 text-indigo-800 border-indigo-200' :
                            'bg-emerald-100 text-emerald-800 border-emerald-200'
                          }`}>
                            {pend.status}
                          </span>
                          {pend.prazo && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 font-medium">
                              <Clock className="w-3 h-3" /> {new Date(pend.prazo).toLocaleDateString('pt-BR')}
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
                        <h4 className="font-bold text-foreground text-sm tracking-tight">{pend.titulo}</h4>
                        <p className="text-xs text-muted-foreground leading-normal font-medium">{pend.descricao}</p>
                        
                        {pend.motivo_rejeicao && pend.status === 'Pendente' && (
                          <div className="p-2.5 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-950 space-y-0.5 mt-2">
                            <span className="font-bold text-amber-900 text-[11px] flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                              Motivo da Última Rejeição / Ajustes Solicitados:
                            </span>
                            <span className="italic text-amber-900 font-medium block pl-4">"{pend.motivo_rejeicao}"</span>
                          </div>
                        )}

                        {pend.status === 'Pendente' && (
                          <div className="pt-1">
                            <button
                              onClick={() => handleUpdatePendencyStatus(pend.id, 'Resolvida')}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-semibold rounded shadow-sm transition-all cursor-pointer"
                            >
                              Resolver Manualmente (In Loco)
                            </button>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeletePendency(pend.id)}
                        className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors shrink-0 opacity-0 group-hover:opacity-100 cursor-pointer"
                        title="Deletar Pendência"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {pend.status === 'Em Análise' && (
                      <div className="p-3 bg-indigo-50/50 rounded-lg border border-indigo-100 space-y-2">
                        <div className="text-[11px] font-bold text-indigo-950 uppercase tracking-wider">Solução Enviada pelo Produtor:</div>
                        <p className="text-xs text-indigo-900 font-medium italic">"{pend.resolucao_descricao}"</p>
                        {pend.evidencia_url && (
                          <div className="text-xs">
                            <a href={pend.evidencia_url} target="_blank" rel="noreferrer" className="text-indigo-700 underline font-semibold hover:text-indigo-955">
                              Ver Evidência Anexada
                            </a>
                          </div>
                        )}

                        {rejectingPendId === pend.id ? (
                          <div className="p-3 bg-red-50/80 rounded-lg border border-red-200 space-y-2 mt-2">
                            <div className="text-xs font-bold text-red-950 flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                              Descreva o motivo da rejeição / ajustes necessários:
                            </div>
                            <textarea
                              rows={3}
                              value={motivoRejeicaoText}
                              onChange={e => setMotivoRejeicaoText(e.target.value)}
                              placeholder="Ex: O comprovante enviado está ilegível. Favor anexar foto nítida do documento."
                              className="w-full p-2 bg-background border border-input rounded-md text-xs focus:ring-1 focus:ring-destructive focus:outline-none text-foreground"
                            />
                            <div className="flex justify-end gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => { setRejectingPendId(null); setMotivoRejeicaoText(''); }}
                                className="px-2.5 py-1 bg-secondary text-secondary-foreground text-[10px] font-semibold rounded hover:bg-secondary/80 cursor-pointer"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleConfirmReject(pend.id)}
                                className="px-2.5 py-1 bg-destructive hover:bg-destructive/90 text-white text-[10px] font-bold rounded shadow-sm transition-all cursor-pointer flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                Confirmar Rejeição & Reabrir
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2 pt-1.5 justify-end">
                            <button
                              onClick={() => { setRejectingPendId(pend.id); setMotivoRejeicaoText(''); }}
                              className="px-2.5 py-1 bg-destructive/10 hover:bg-destructive/20 text-destructive text-[10px] font-bold rounded border border-destructive/20 transition-all cursor-pointer"
                            >
                              Rejeitar / Pedir Ajuste
                            </button>
                            <button
                              onClick={() => handleUpdatePendencyStatus(pend.id, 'Resolvida')}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-semibold rounded shadow-sm transition-all cursor-pointer"
                            >
                              Aprovar & Regularizar
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end pt-4 border-t border-border mt-6">
              <button
                type="button"
                onClick={() => setSelectedPropForPends(null)}
                className="px-4 py-2 font-medium text-sm rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Cadastrar Fazenda (Prospecção Completa) */}
      {showCreateFarmModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowCreateFarmModal(false)}
          title="Cadastrar Nova Prospecção"
        >
          <form onSubmit={handleCreateFarm} className="space-y-6 max-h-[80vh] overflow-y-auto pr-2">
            
            {/* Seção 1: Produtor Rural */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-4">
              <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                1. Identificação do Produtor Rural
              </h4>
              
              <div className="flex bg-slate-200/60 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setProdutorOption('existente')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    produtorOption === 'existente' 
                      ? 'bg-white text-slate-800 shadow-sm' 
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Selecionar Existente
                </button>
                <button
                  type="button"
                  onClick={() => setProdutorOption('novo')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    produtorOption === 'novo' 
                      ? 'bg-white text-slate-800 shadow-sm' 
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Cadastrar Novo Produtor
                </button>
              </div>

              {produtorOption === 'existente' ? (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Selecione o Produtor</label>
                  <ProducerInput
                    producers={producers}
                    selectedId={selectedProdutorId}
                    onChange={setSelectedProdutorId}
                    placeholder="Digite o nome do produtor para pesquisar..."
                    required
                  />
                </div>
              ) : (
                <div className="space-y-3 animate-fade-in">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Nome Completo</label>
                    <input
                      required={produtorOption === 'novo'}
                      type="text"
                      placeholder="Ex: João da Silva"
                      value={novoProdutorData.nome}
                      onChange={e => setNovoProdutorData({...novoProdutorData, nome: e.target.value})}
                      className="w-full px-3 py-2 bg-background border border-input rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-transparent focus:outline-none text-foreground"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">E-mail</label>
                      <input
                        required={produtorOption === 'novo'}
                        type="email"
                        placeholder="produtor@email.com"
                        value={novoProdutorData.email}
                        onChange={e => setNovoProdutorData({...novoProdutorData, email: e.target.value})}
                        className="w-full px-3 py-2 bg-background border border-input rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-transparent focus:outline-none text-foreground"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Região / Cidade</label>
                      <CityInput
                        value={novoProdutorData.regiao}
                        onChange={val => setNovoProdutorData({...novoProdutorData, regiao: val})}
                        className="w-full px-3 py-2 bg-background border border-input rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-transparent focus:outline-none text-foreground"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Seção 2: Lista de Propriedades */}
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                  2. Propriedades Rurais
                </h4>
                <button
                  type="button"
                  onClick={() => setPropertiesList([...propertiesList, { nome_fazenda: '', codigo_car: '', codigo_sigef: '', origem: 'CAR', geom: null, errorCar: '' }])}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold transition-all border border-emerald-100 cursor-pointer shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Nova Fazenda
                </button>
              </div>

              <div className="space-y-4">
                {propertiesList.map((prop, idx) => (
                  <div key={idx} className="p-4 bg-white border border-slate-200/80 rounded-xl relative shadow-sm hover:-translate-y-1 hover:shadow-md hover:border-emerald-300/40 transition-all duration-300 ease-out">
                    {propertiesList.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setPropertiesList(propertiesList.filter((_, i) => i !== idx))}
                        className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title="Remover fazenda"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase block mb-3">
                      Fazenda #{idx + 1}
                    </span>

                    <PropertyCodeInput
                      initialNomeFazenda={prop.nome_fazenda}
                      initialCodigoCar={prop.codigo_car}
                      onChange={(data) => {
                        const newList = [...propertiesList];
                        newList[idx] = {
                          ...newList[idx],
                          nome_fazenda: data.nome_fazenda,
                          codigo_car: data.codigo_car,
                          codigo_sigef: data.codigo_sigef,
                          origem: data.origem,
                          geom: data.geom
                        };
                        setPropertiesList(newList);
                      }}
                    />
                    {prop.errorCar && (
                      <span className="text-[10px] text-red-600 font-bold block mt-2 leading-normal">
                        {prop.errorCar}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Seção 3: Opções Adicionais */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wide block">
                  Agendamento Automático
                </label>
                <span className="text-xs text-muted-foreground">
                  Cria e atribui visitas de campo para hoje, permitindo iniciar as auditorias imediatamente.
                </span>
              </div>
              <input
                type="checkbox"
                checked={autoScheduleAudit}
                onChange={e => setAutoScheduleAudit(e.target.checked)}
                className="w-5 h-5 accent-primary cursor-pointer border-gray-300 rounded focus:ring-primary focus:ring-2 shrink-0"
              />
            </div>

            {/* Botões do Rodapé */}
            <div className="flex justify-end gap-2 pt-4 border-t border-border mt-6">
              <button
                type="button"
                onClick={() => setShowCreateFarmModal(false)}
                className="px-4 py-2 text-sm font-bold rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80 cursor-pointer transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 text-sm font-black rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shadow transition-all active:scale-[0.98] flex items-center gap-1.5 disabled:opacity-50"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirmar Cadastro
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal Iniciar Vistoria */}
      {showScheduleAuditModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowScheduleAuditModal(false)}
          title="Agendar / Iniciar Nova Vistoria"
        >
          <form onSubmit={handleScheduleAudit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground uppercase">Fazenda para Vistoriar</label>
              <select
                required
                value={auditFormData.propriedade_id}
                onChange={e => setAuditFormData({...auditFormData, propriedade_id: e.target.value})}
                className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-1 focus:ring-primary focus:outline-none text-foreground"
              >
                <option value="">Selecione uma fazenda...</option>
                {properties.map(p => (
                  <option key={p.id} value={p.id}>{p.nome_fazenda} ({p.nome_produtor})</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground uppercase">Data Planejada da Visita</label>
              <input
                required
                type="date"
                value={auditFormData.data_agendamento}
                onChange={e => setAuditFormData({...auditFormData, data_agendamento: e.target.value})}
                className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-1 focus:ring-primary focus:outline-none text-foreground"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => setShowScheduleAuditModal(false)}
                className="px-4 py-2 text-sm font-medium rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-bold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shadow active:scale-[0.98]"
              >
                Confirmar Vistoria
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Confirmação Bonita de Certificação */}
      <ConfirmAction
        isOpen={!!certifyConfirmId}
        onClose={() => setCertifyConfirmId(null)}
        onConfirm={executeCertify}
        title="Confirmar Certificação"
        description="Deseja realmente aprovar e certificar esta propriedade diretamente? Esta ação irá atestar a conformidade da propriedade no sistema."
        confirmText="Certificar Propriedade"
        actionType="success"
      />

      {/* Confirmação de Exclusão de Pendência */}
      <ConfirmAction
        isOpen={!!deletePendConfirmId}
        onClose={() => setDeletePendConfirmId(null)}
        onConfirm={executeDeletePendency}
        title="Excluir Pendência"
        description="Tem certeza que deseja remover esta pendência? Esta ação não pode ser desfeita."
        confirmText="Excluir"
        actionType="danger"
      />
    </div>
  );
}
