import { useSync } from '../../context/SyncContext';
import defaultAuditoriasJson from '../../data/default_auditorias.json';
import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { MapPin, ClipboardList, CheckCircle2, CalendarDays, Clock, Plus, Trash2, Loader2, Search, Map as MapIcon, AlertTriangle, Eye, FileText, ChevronRight, FolderOpen, Image as ImageIcon, Download, ExternalLink, X, WifiOff, Database, DownloadCloud, ClipboardCheck, LayoutGrid, Table2, RotateCw, RefreshCw, ShieldCheck, Award } from 'lucide-react';
import type { FeatureCollection } from 'geojson';
import MapView from '../../components/map/MapView';
import { supabase, createIsolatedAuthClient } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import QuestionarioRTRS from '../../components/auditoria/QuestionarioRTRS';
import Modal from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import { getRemainingTimeLabel, formatUltimaAlteracao } from '../../lib/dateUtils';
import PropertyCodeInput from '../../components/form/PropertyCodeInput';
import CityInput from '../../components/form/CityInput';
import ProducerInput from '../../components/form/ProducerInput';
import { ListSkeleton, AuditCardSkeleton } from '../../components/ui/Skeleton';
import ConfirmAction from '../../components/ui/ConfirmAction';
import AuditDetailModal from '../../components/auditoria/AuditDetailModal';
import ModalErrorBoundary from '../../components/ui/ModalErrorBoundary';
import { resolveMunicipioFromCarOrName } from '../../lib/geoUtils';
import { resolveFarmEtapa, persistFarmEtapa, normalizeEtapa } from '../../lib/etapaUtils';
import { db, enqueueMutation, getCachedReadData, cacheReadData, generateUUID, getCachedAuditorias, bulkSaveAuditorias, useLiveAuditorias, updateCachedAuditoria, compareAuditoriasDeterministically, resetAuthFailedQueueItems, getPendingEvidenceKeys, getCachedPendenciasByPropriedade, bulkSavePendencias } from '../../lib/offlineDb';
import { prepareFieldModeData, getLastFieldPrepInfo, seedDefaultAuditorias, hydrateAuditoriasCache } from '../../services/precacheService';
import { syncEngine } from '../../services/syncEngine';
import { normalizePerguntaId } from '../../constants/rtrsMapping';
import { cleanEvidenceUrl, isPdfEvidence } from '../../lib/evidenceService';
import { syncPendencyStatusWithRtrsAnswer } from '../../lib/pendenciaService';


// Helper canônico de identificação de critério (disponível em todo o módulo sem erro de escopo)
export function getCanonicalCrit(item: any): string {
  if (!item) return '';
  if (item.pergunta_id) {
    const canon = normalizePerguntaId(item.pergunta_id);
    if (canon) return canon;
  }
  if (item.id && typeof item.id === 'string' && item.id.startsWith('resp-')) {
    const withoutResp = item.id.slice(5);
    const m = withoutResp.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);
    if (m) return normalizePerguntaId(m[0]);
    const critMatch = withoutResp.match(/\d+\.\d+\.\d+/);
    if (critMatch) return normalizePerguntaId(critMatch[0]);
  }
  return normalizePerguntaId(item.id) || item.nome || '';
}

// Helper unificado para associação de técnico responsável
export function isTechnicianMatch(tecId: string | null | undefined, user: any): boolean {
  if (!tecId) return true;
  const userEmail = (user?.email || '').toLowerCase();
  const userId = user?.id;
  if (userId && tecId === userId) return true;
  if (tecId === 'tec-patricia-01' && userEmail.includes('analistacampo1')) return true;
  if (tecId === 'tec-alexandre-02' && userEmail.includes('analistacampo2')) return true;
  if (tecId === 'tec-vistoriador-03' && userEmail.includes('tecnico@ms')) return true;
  if (userEmail.includes('analistacampo1') && tecId === 'b02f1f87-b998-4f4f-a66b-e169b28c0df5') return true;
  if (userEmail.includes('analistacampo2') && tecId === 'cf4ebd0f-f933-4853-8adc-3a65da55ec6d') return true;
  if (userEmail.includes('tecnico@ms') && tecId === 'bb03c918-ed79-479c-87bf-c8f65a95ac2c') return true;
  return false;
}

// Helpers de Inicialização Imediata (Zero Skeleton / 0ms Cold Start Offline)
export function getInitialDefaultAuditorias(): any[] {
  try {
    return (defaultAuditoriasJson as any[]).map(a => {
      const propFound = Array.isArray(a.propriedades) ? a.propriedades[0] : a.propriedades;
      const propId = a.propriedade_id || propFound?.id;
      return {
        id: a.id,
        propriedade_id: propId,
        tecnico_responsavel_id: a.tecnico_responsavel_id,
        data_agendamento: a.data_agendamento,
        status: a.status || 'EM ANDAMENTO',
        etapa: normalizeEtapa(a.etapa) || 'Prospecção',
        ultima_alteracao_at: a.ultima_alteracao_at || a.updated_at || a.created_at || new Date().toISOString(),
        propriedades: propFound || { nome_fazenda: 'Fazenda', nome_produtor: 'Produtor' },
        created_at: a.created_at || new Date().toISOString(),
        updated_at: a.updated_at || new Date().toISOString()
      };
    }).sort(compareAuditoriasDeterministically);
  } catch {
    return [];
  }
}

export function getInitialDefaultProperties(): any[] {
  return getInitialDefaultAuditorias().map(c => {
    const prop = Array.isArray(c.propriedades) ? c.propriedades[0] : c.propriedades;
    return {
      id: c.propriedade_id || prop?.id || c.id,
      nome_fazenda: prop?.nome_fazenda || 'Fazenda',
      nome_produtor: prop?.nome_produtor || 'Produtor',
      codigo_car: prop?.codigo_car || ''
    };
  });
}

export function getInitialFarmsGeoJSON(): FeatureCollection {
  try {
    const features = (defaultAuditoriasJson as any[]).map((a, index) => {
      const p = Array.isArray(a.propriedades) ? a.propriedades[0] : a.propriedades;
      const geom = p?.geom || {
        type: 'Point',
        coordinates: [-54.5, -20.5]
      };
      return {
        type: 'Feature' as const,
        properties: {
          id: a.propriedade_id || p?.id || a.id,
          name: p?.nome_fazenda || 'Fazenda',
          municipio: formatMunicipioName(p?.municipio || 'Mato Grosso do Sul'),
          tecnico_nome: 'Técnico de Campo',
          tecnico_id: a.tecnico_responsavel_id || 'tec-campo',
          color: '#1B7547',
          isMine: true,
          status: a.status || 'EM ANDAMENTO',
          produtor: p?.nome_produtor || 'Produtor Rural',
          ultima_alteracao_at: a.ultima_alteracao_at || a.updated_at || a.created_at,
          data_agendamento: a.data_agendamento || null
        },
        geometry: geom
      };
    });
    return { type: 'FeatureCollection', features };
  } catch {
    return { type: 'FeatureCollection', features: [] };
  }
}

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

  // Limpeza reativa de erros de auth e reabilitação de fila local ao montar ou autenticar
  useEffect(() => {
    if (user) {
      syncEngine.clearAuthError();
      resetAuthFailedQueueItems().catch(e => console.warn('[DashboardTecnico] Erro ao resetar fila local:', e));
    }
  }, [user]);

  const [selectedAuditForDetail, setSelectedAuditForDetail] = useState<any>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab = (rawTab === 'mapa' || rawTab === 'auditorias' || rawTab === 'documentacao') ? rawTab : 'mapa';
  const setActiveTab = (tab: 'mapa' | 'auditorias' | 'documentacao') => setSearchParams({ tab });

  // Documentação e Evidências States
  const [documentos, setDocumentos] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('tab') === 'documentacao';
    }
    return false;
  });
  const isFetchingDocsRef = useRef(false);
  const hasQueuedDocsFetchRef = useRef(false);
  const [selectedDocPropId, setSelectedDocPropId] = useState('');
  const [selectedDocCategoria, setSelectedDocCategoria] = useState('');
  const [docSearchQuery, setDocSearchQuery] = useState('');
  const [docViewMode, setDocViewMode] = useState<'auto' | 'cards' | 'table'>('auto');
  const [isRetryingSync, setIsRetryingSync] = useState(false);
  const [deleteDocConfirmId, setDeleteDocConfirmId] = useState<string | null>(null);
  const [showUploadDocModal, setShowUploadDocModal] = useState(false);
  const [uploadingDocFile, setUploadingDocFile] = useState(false);
  const [docFormData, setDocFormData] = useState({
    nome: '',
    categoria: 'CAR',
    propriedade_id: '',
    file: null as File | null
  });

  useEffect(() => {
    if (activeTab === 'documentacao') {
      fetchTechnicalDocuments();
      fetchAudits();
    } else if (activeTab === 'auditorias') {
      fetchAudits(true);
    } else if (activeTab === 'mapa') {
      fetchCollaborativeMapData();
    }
  }, [activeTab]);

  useEffect(() => {
    const handleRecheck = () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastAuditsFetchRef.current > 3000) {
        if (activeTab === 'auditorias') fetchAudits(true);
        else if (activeTab === 'mapa') fetchCollaborativeMapData();
        else if (activeTab === 'documentacao') {
          fetchTechnicalDocuments();
          fetchAudits(true);
        }
      }
    };
    window.addEventListener('focus', handleRecheck);
    document.addEventListener('visibilitychange', handleRecheck);
    return () => {
      window.removeEventListener('focus', handleRecheck);
      document.removeEventListener('visibilitychange', handleRecheck);
    };
  }, [activeTab]);

  useEffect(() => {
    const handleEvidenceUploaded = () => {
      fetchTechnicalDocuments();
    };
    const handleSyncComplete = () => {
      fetchTechnicalDocuments();
      fetchAudits(true);
    };
    const handleAuditUpdated = () => {
      fetchAudits(true);
      fetchTechnicalDocuments();
    };

    window.addEventListener('ms:evidence-uploaded', handleEvidenceUploaded);
    window.addEventListener('ms:sync-complete', handleSyncComplete);
    window.addEventListener('ms:outbox-changed', handleSyncComplete);
    window.addEventListener('ms:audit-updated', handleAuditUpdated);

    // Inscrição Realtime leve do Supabase em auditorias e respostas_auditoria
    let realtimeChannel: any = null;
    if (supabase) {
      try {
        let timer: any = null;
        const debouncedRefresh = () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            fetchAudits(true);
            fetchTechnicalDocuments();
          }, 400);
        };

        realtimeChannel = supabase
          .channel('tecnico-dashboard-realtime')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'auditorias' }, debouncedRefresh)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'respostas_auditoria' }, debouncedRefresh)
          .subscribe();
      } catch (err) {
        console.warn('[Realtime] Falha ao assinar mudanças:', err);
      }
    }

    return () => {
      window.removeEventListener('ms:evidence-uploaded', handleEvidenceUploaded);
      window.removeEventListener('ms:sync-complete', handleSyncComplete);
      window.removeEventListener('ms:outbox-changed', handleSyncComplete);
      window.removeEventListener('ms:audit-updated', handleAuditUpdated);
      if (realtimeChannel && supabase) {
        try {
          supabase.removeChannel(realtimeChannel);
        } catch {}
      }
    };
  }, []);

  const resolveTechnicianProperties = async (): Promise<{
    assignedPropIds: Set<string>;
    realAudits: any[];
    realProps: any[];
  }> => {
    const assignedPropIds = new Set<string>();
    let realAudits: any[] = [];
    let realProps: any[] = [];

    const defaultMockIds = new Set((defaultAuditoriasJson as any[]).map(a => a.id));
    const defaultMockPropIds = new Set((defaultAuditoriasJson as any[]).map(a => a.propriedade_id));

    // 1. Tentar ler do Dexie auditorias que sejam reais (não apenas os mocks iniciais)
    try {
      const cached = await db.cached_auditorias.toArray();
      const realCached = cached.filter(c => !c.id.startsWith('mock-') && !defaultMockIds.has(c.id));
      if (realCached.length > 0) {
        realAudits = cached;
        cached.forEach(a => {
          if (isTechnicianMatch(a.tecnico_responsavel_id, user)) {
            if (a.propriedade_id) assignedPropIds.add(a.propriedade_id);
            const p = Array.isArray(a.propriedades) ? a.propriedades[0] : a.propriedades;
            if (p?.id) assignedPropIds.add(p.id);
          }
        });
      }
    } catch (e) {}

    // 2. Se estiver online e ainda não tivermos propriedades reais mapeadas (ou apenas mocks padrão)
    const hasOnlyMocks = assignedPropIds.size === 0 || Array.from(assignedPropIds).every(id => defaultMockPropIds.has(id));
    if (hasOnlyMocks && typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        const { data: remoteAuds, error: audErr } = await supabase
          .from('auditorias')
          .select(`
            id,
            propriedade_id,
            tecnico_responsavel_id,
            status,
            etapa,
            data_agendamento,
            created_at,
            updated_at,
            propriedades (
              id,
              nome_fazenda,
              nome_produtor,
              codigo_car,
              codigo_sigef,
              municipio,
              etapa
            )
          `)
          .order('updated_at', { ascending: false, nullsFirst: false });

        if (!audErr && remoteAuds && remoteAuds.length > 0) {
          realAudits = remoteAuds;
          const propMap = new Map<string, any>();

          remoteAuds.forEach((a: any) => {
            const p = Array.isArray(a.propriedades) ? a.propriedades[0] : a.propriedades;
            const pId = a.propriedade_id || p?.id;
            if (p && pId) propMap.set(pId, p);

            if (isTechnicianMatch(a.tecnico_responsavel_id, user)) {
              if (pId) assignedPropIds.add(pId);
            }
          });

          realProps = Array.from(propMap.values());

          // Hidrata o cache do Dexie e o estado em background
          if (remoteAuds.length > 0) {
            bulkSaveAuditorias(remoteAuds).catch(() => {});
            setAuditorias(remoteAuds);
            if (realProps.length > 0) {
              setProperties(realProps);
            }
          }
        }
      } catch (err) {
        console.warn('[Docs] Falha ao resolver auditorias do Supabase:', err);
      }
    }

    // 3. Fallback para auditorias em memória
    if (assignedPropIds.size === 0) {
      (auditorias || []).forEach(a => {
        if (a.propriedade_id) assignedPropIds.add(a.propriedade_id);
        const p = Array.isArray(a.propriedades) ? a.propriedades[0] : a.propriedades;
        if (p?.id) assignedPropIds.add(p.id);
      });
    }

    return { assignedPropIds, realAudits, realProps };
  };

  const getAssignedPropIdsForCurrentTech = async (): Promise<Set<string>> => {
    const { assignedPropIds } = await resolveTechnicianProperties();
    return assignedPropIds;
  };

  const fetchTechnicalDocuments = async () => {
    if (isFetchingDocsRef.current) {
      hasQueuedDocsFetchRef.current = true;
      return;
    }
    isFetchingDocsRef.current = true;
    setLoadingDocs(true);
    try {
      // 1. Carregamento IMEDIATO (0ms) do Dexie local com DEDUPLICAÇÃO ESTRITA
      const localChecklistMap = new Map<string, any>();
      const localPendsList: any[] = [];
      let localList: any[] = [];
      let pendingEvidenceKeys = new Set<string>();
      let cachedAudsList: any[] = [];

      const pergMap = new Map<string, any>();
      const auditMap = new Map<string, any>();
      const propMap = new Map<string, any>();
      const deletedEvidenceKeys = new Set<string>();

      // Inicializa mapeamento inicial a partir de props/state
      (properties || []).forEach(p => {
        if (p.id) propMap.set(p.id, p);
      });
      (auditorias || []).forEach(a => {
        if (a.id) auditMap.set(a.id, a);
        if (a.propriedade_id) auditMap.set(a.propriedade_id, a);
        const p = Array.isArray(a.propriedades) ? a.propriedades[0] : a.propriedades;
        if (p && (p.id || a.propriedade_id)) {
          propMap.set(p.id || a.propriedade_id, p);
        }
      });

      // Helper para resolução unificada de fazenda e propriedade acessível em todo o escopo
      const resolveFarmInfo = (auditIdOrPropId?: string) => {
        if (!auditIdOrPropId) return { propId: '', fazendaNome: 'Fazenda', produtorNome: 'Produtor' };
        const audit = auditMap.get(auditIdOrPropId);
        const propRel = Array.isArray(audit?.propriedades) ? audit.propriedades[0] : audit?.propriedades;
        const propId = audit?.propriedade_id || propRel?.id || (propMap.has(auditIdOrPropId) ? auditIdOrPropId : '');
        const prop = propRel || (propId ? propMap.get(propId) : null) || propMap.get(auditIdOrPropId) || {};
        return {
          propId: propId || auditIdOrPropId,
          fazendaNome: prop.nome_fazenda || audit?.nome_fazenda || 'Fazenda',
          produtorNome: prop.nome_produtor || audit?.nome_produtor || 'Produtor'
        };
      };

      try {
        const [cachedPergs, cachedAuds, localResps, localPends, localFiles, outboxMutations, localJournal, fetchedPendingKeys] = await Promise.all([
          db.cached_perguntas.toArray(),
          db.cached_auditorias.toArray(),
          db.cached_respostas.filter(r => !!r.evidencia_url).toArray(),
          db.cached_pendencias.filter(p => !!p.evidencia_url).toArray(),
          db.outbox_files.toArray(),
          db.outbox_mutations.toArray(),
          db.sync_journal.toArray(),
          getPendingEvidenceKeys()
        ]);
        pendingEvidenceKeys = fetchedPendingKeys;
        cachedAudsList = cachedAuds;

        cachedPergs.forEach(p => {
          if (p.id) pergMap.set(p.id, p);
          if (p.numero_criterio) pergMap.set(normalizePerguntaId(p.numero_criterio), p);
        });

        cachedAuds.forEach(a => {
          if (a.id) auditMap.set(a.id, a);
          if (a.propriedade_id) auditMap.set(a.propriedade_id, a);
          const p = Array.isArray(a.propriedades) ? a.propriedades[0] : a.propriedades;
          if (p && (p.id || a.propriedade_id)) {
            propMap.set(p.id || a.propriedade_id, p);
          }
        });
        (properties || []).forEach(p => {
          if (p.id) propMap.set(p.id, p);
        });
        (auditorias || []).forEach(a => {
          const p = Array.isArray(a.propriedades) ? a.propriedades[0] : a.propriedades;
          if (p && (p.id || a.propriedade_id)) {
            propMap.set(p.id || a.propriedade_id, p);
          }
        });

        // Utiliza getCanonicalCrit exportado no topo do módulo

        // Mapa de mutações para vincular arquivos e respostas
        const fileIdToMutationMap = new Map<string, any>();
        outboxMutations.forEach(m => {
          if (m.file_ids && Array.isArray(m.file_ids)) {
            m.file_ids.forEach((fid: any) => {
              fileIdToMutationMap.set(String(fid), m);
            });
          }
        });

        // Mapeamento estrito de arquivos e blobs locais
        const strictFileMap = new Map<string, string>();

        localFiles.forEach(f => {
          if (!f.file_blob) return;
          let bUrl = '';
          try {
            bUrl = URL.createObjectURL(f.file_blob);
          } catch (e) {
            return;
          }

          const mut = fileIdToMutationMap.get(String(f.id));
          let auditId = mut?.payload?.auditoria_id;
          let perguntaId = mut?.payload?.pergunta_id;

          if (!auditId || !perguntaId) {
            const match = (f.storage_path || f.file_name || '').match(/evidencia_([0-9a-fA-F-]+)_([0-9a-fA-F-]+)/);
            if (match) {
              auditId = auditId || match[1];
              perguntaId = perguntaId || match[2];
            }
          }

          if (auditId && perguntaId) {
            const canonPergId = normalizePerguntaId(perguntaId);
            strictFileMap.set(`${auditId}_${canonPergId}`, bUrl);
          }
        });

        // Identifica evidências explicitamente deletadas no sync_journal para supressão imediata
        deletedEvidenceKeys.clear();
        localJournal.forEach(jItem => {
          if (!jItem.auditoria_id || !jItem.pergunta_id) return;
          const canonPergId = normalizePerguntaId(jItem.pergunta_id);
          const strictKey = `${jItem.auditoria_id}_${canonPergId}`;
          if (jItem.is_explicit_delete || jItem.evidencia_url === null) {
            deletedEvidenceKeys.add(strictKey);
            strictFileMap.delete(strictKey);
          }
        });

        // Mescla blobs do sync_journal no strictFileMap
        localJournal.forEach(jItem => {
          if (!jItem.auditoria_id || !jItem.pergunta_id) return;
          const canonPergId = normalizePerguntaId(jItem.pergunta_id);
          const strictKey = `${jItem.auditoria_id}_${canonPergId}`;

          if (deletedEvidenceKeys.has(strictKey)) return;

          if (jItem.file_blob) {
            try {
              const bUrl = URL.createObjectURL(jItem.file_blob);
              strictFileMap.set(strictKey, bUrl);
            } catch (e) {}
          } else if (jItem.evidencia_url && !strictFileMap.has(strictKey)) {
            strictFileMap.set(strictKey, jItem.evidencia_url);
          }
        });

        // Varredura de rascunhos locais de questionário (localStorage) para não perder anexos legítimos
        if (typeof localStorage !== 'undefined') {
          try {
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k && k.startsWith('rtrs_draft_')) {
                const rawDraft = localStorage.getItem(k);
                if (rawDraft) {
                  const draftObj = JSON.parse(rawDraft);
                  if (draftObj && typeof draftObj === 'object') {
                    Object.entries(draftObj).forEach(([rawPergId, val]: [string, any]) => {
                      if (val?.evidenciaUrl && typeof val.evidenciaUrl === 'string') {
                        const canon = normalizePerguntaId(rawPergId);
                        cachedAudsList.forEach(a => {
                          const strictKey = `${a.id}_${canon}`;
                          if (!strictFileMap.has(strictKey) && !deletedEvidenceKeys.has(strictKey)) {
                            strictFileMap.set(strictKey, val.evidenciaUrl);
                          }
                        });
                      }
                    });
                  }
                }
              }
            }
          } catch (e) {}
        }

        // Inserção deduplicada no localChecklistMap
        const upsertLocalChecklist = (incoming: any) => {
          const canonCrit = getCanonicalCrit(incoming);
          const dedupKey = `${incoming.propriedade_id || incoming.fazendaNome}_${canonCrit}`;
          if (!localChecklistMap.has(dedupKey)) {
            localChecklistMap.set(dedupKey, incoming);
          } else {
            const existing = localChecklistMap.get(dedupKey);
            const timeExisting = new Date(existing.dataEnvioReal || existing.data || 0).getTime();
            const timeIncoming = new Date(incoming.dataEnvioReal || incoming.data || 0).getTime();
            const preferIncoming = timeIncoming >= timeExisting;

            const isIncomingBlob = incoming.arquivo_url && (String(incoming.arquivo_url).startsWith('blob:') || String(incoming.arquivo_url).startsWith('data:'));
            const isExistingBlob = existing.arquivo_url && (String(existing.arquivo_url).startsWith('blob:') || String(existing.arquivo_url).startsWith('data:'));

            const finalUrl = (isIncomingBlob && !isExistingBlob)
              ? incoming.arquivo_url
              : (preferIncoming && incoming.arquivo_url)
              ? incoming.arquivo_url
              : (existing.arquivo_url || incoming.arquivo_url);

            const incomingPending = !!incoming.isLocalPending;
            const existingPending = !!existing.isLocalPending;

            localChecklistMap.set(dedupKey, {
              ...existing,
              ...incoming,
              id: existing.id || incoming.id,
              arquivo_url: finalUrl,
              data: preferIncoming ? incoming.data : existing.data,
              dataEnvioReal: preferIncoming ? incoming.dataEnvioReal : existing.dataEnvioReal,
              isLocalPending: preferIncoming ? incomingPending : (incomingPending || existingPending),
              fazendaNome: (existing.fazendaNome && existing.fazendaNome !== 'Fazenda') ? existing.fazendaNome : (incoming.fazendaNome || 'Fazenda'),
              produtorNome: (existing.produtorNome && existing.produtorNome !== 'Produtor') ? existing.produtorNome : (incoming.produtorNome || 'Produtor'),
              nome: (incoming.nome && incoming.nome.length > (existing.nome?.length || 0)) ? incoming.nome : existing.nome
            });
          }
        };

        // 1. Processar cached_respostas locais
        localResps.forEach(r => {
          const canonPergId = normalizePerguntaId(r.pergunta_id);
          const strictKey = `${r.auditoria_id}_${canonPergId}`;
          if (deletedEvidenceKeys.has(strictKey)) return;

          const { propId, fazendaNome, produtorNome } = resolveFarmInfo(r.auditoria_id);
          const perg = pergMap.get(canonPergId) || pergMap.get(r.pergunta_id);

          let previewUrl = r.evidencia_url;
          if (!previewUrl || previewUrl.startsWith('blob:')) {
            if (strictFileMap.has(strictKey)) {
              previewUrl = strictFileMap.get(strictKey)!;
            }
          }

          const isLocalPending = pendingEvidenceKeys.has(strictKey);

          const numCrit = perg?.numero_criterio ? `Critério ${perg.numero_criterio} - ` : (r.numero_criterio ? `Critério ${r.numero_criterio} - ` : '');
          const critTitle = perg?.enunciado ? `${numCrit}${perg.enunciado}` : (numCrit || `Critério RTRS`);
          const dataEnvioReal = (r as any).evidencia_uploaded_at || r.updated_at || r.created_at || new Date().toISOString();

          upsertLocalChecklist({
            id: `resp-${r.auditoria_id}-${canonPergId}`,
            nome: critTitle,
            categoria: 'CHECKLIST RTRS',
            propriedade_id: propId,
            auditoria_id: r.auditoria_id,
            pergunta_id: canonPergId,
            fazendaNome,
            produtorNome,
            arquivo_url: previewUrl,
            origem: 'Auditoria In Loco',
            data: dataEnvioReal,
            dataEnvioReal: dataEnvioReal,
            updated_at: r.updated_at,
            created_at: r.created_at,
            isLocalPending: !!isLocalPending,
            podeDeletar: false
          });
        });

        // 1.5. Processar itens do Unified WAL (db.sync_journal)
        localJournal.forEach(jItem => {
          if (jItem.is_explicit_delete || jItem.evidencia_url === null) return;
          if (!jItem.file_blob && !jItem.evidencia_url) return;

          const canonPergId = normalizePerguntaId(jItem.pergunta_id);
          const strictKey = `${jItem.auditoria_id}_${canonPergId}`;
          if (deletedEvidenceKeys.has(strictKey)) return;

          let previewUrl = jItem.evidencia_url || '';
          if (jItem.file_blob) {
            try {
              previewUrl = URL.createObjectURL(jItem.file_blob);
            } catch (e) {}
          }
          if (!previewUrl && strictFileMap.has(strictKey)) {
            previewUrl = strictFileMap.get(strictKey)!;
          }

          const { propId, fazendaNome, produtorNome } = resolveFarmInfo(jItem.auditoria_id);
          const perg = pergMap.get(canonPergId) || pergMap.get(jItem.pergunta_id);

          const isLocalPending = pendingEvidenceKeys.has(strictKey);

          const numCrit = perg?.numero_criterio ? `Critério ${perg.numero_criterio} - ` : (jItem.numero_criterio ? `Critério ${jItem.numero_criterio} - ` : '');
          const critTitle = perg?.enunciado ? `${numCrit}${perg.enunciado}` : (numCrit || `Critério RTRS`);
          const dataEnvioReal = jItem.updated_at || new Date(jItem.created_at || Date.now()).toISOString();

          upsertLocalChecklist({
            id: `resp-${jItem.auditoria_id}-${canonPergId}`,
            nome: critTitle,
            categoria: 'CHECKLIST RTRS',
            propriedade_id: propId,
            auditoria_id: jItem.auditoria_id,
            pergunta_id: canonPergId,
            fazendaNome,
            produtorNome,
            arquivo_url: previewUrl,
            origem: 'Auditoria In Loco',
            data: dataEnvioReal,
            dataEnvioReal: dataEnvioReal,
            updated_at: jItem.updated_at,
            created_at: new Date(jItem.created_at || Date.now()).toISOString(),
            isLocalPending: !!isLocalPending,
            podeDeletar: false
          });
        });

        // 2. Processar mutações da outbox (apenas ativamente pendentes)
        outboxMutations.forEach(m => {
          if (m.status !== 'pending' && m.status !== 'pending_retry' && m.status !== 'syncing') return;

          if (m.table === 'respostas_auditoria' && m.payload?.auditoria_id && m.payload?.pergunta_id) {
            const canonPergId = normalizePerguntaId(m.payload.pergunta_id);
            const strictKey = `${m.payload.auditoria_id}_${canonPergId}`;
            if (deletedEvidenceKeys.has(strictKey)) return;
            if (m.payload.evidencia_url === null && (!m.file_ids || m.file_ids.length === 0)) return;

            if (m.payload.evidencia_url || (m.file_ids && m.file_ids.length > 0) || strictFileMap.has(strictKey)) {
              const { propId, fazendaNome, produtorNome } = resolveFarmInfo(m.payload.auditoria_id);
              const perg = pergMap.get(canonPergId) || pergMap.get(m.payload.pergunta_id);

              let previewUrl = m.payload.evidencia_url || '';
              if (!previewUrl && strictFileMap.has(strictKey)) {
                previewUrl = strictFileMap.get(strictKey)!;
              }

              const numCrit = perg?.numero_criterio ? `Critério ${perg.numero_criterio} - ` : '';
              const critTitle = perg?.enunciado ? `${numCrit}${perg.enunciado}` : `Critério RTRS`;
              const dataEnvioReal = m.payload.evidencia_uploaded_at || m.payload.updated_at || m.created_at || new Date().toISOString();

              upsertLocalChecklist({
                id: `resp-${m.payload.auditoria_id}-${canonPergId}`,
                nome: critTitle,
                categoria: 'CHECKLIST RTRS',
                propriedade_id: propId,
                pergunta_id: canonPergId,
                fazendaNome,
                produtorNome,
                arquivo_url: previewUrl,
                origem: 'Auditoria In Loco',
                data: dataEnvioReal,
                dataEnvioReal: dataEnvioReal,
                updated_at: m.payload.updated_at,
                created_at: m.created_at,
                isLocalPending: true,
                podeDeletar: false
              });
            }
          }
        });

        // 3. Processar arquivos da outbox (apenas uploads ativamente pendentes)
        localFiles.forEach(f => {
          if (f.status !== 'pending' && f.status !== 'uploading' && f.status !== 'pending_retry') return;

          const mut = fileIdToMutationMap.get(String(f.id));
          let auditId = mut?.payload?.auditoria_id;
          let perguntaId = mut?.payload?.pergunta_id;

          if (!auditId || !perguntaId) {
            const match = (f.storage_path || f.file_name || '').match(/evidencia_([0-9a-fA-F-]+)_([0-9a-fA-F-]+)/);
            if (match) {
              auditId = auditId || match[1];
              perguntaId = perguntaId || match[2];
            }
          }

          if (!auditId || !perguntaId) return;

          const canonPergId = normalizePerguntaId(perguntaId);
          const strictKey = `${auditId}_${canonPergId}`;
          if (deletedEvidenceKeys.has(strictKey)) return;

          const { propId, fazendaNome, produtorNome } = resolveFarmInfo(auditId);
          const perg = pergMap.get(canonPergId) || pergMap.get(perguntaId);

          const numCrit = perg?.numero_criterio ? `Critério ${perg.numero_criterio} - ` : '';
          const critTitle = perg?.enunciado ? `${numCrit}${perg.enunciado}` : (numCrit || f.file_name);
          const blobUrl = strictFileMap.get(strictKey) || f.public_url || '';

          upsertLocalChecklist({
            id: `resp-${auditId}-${canonPergId}`,
            nome: critTitle,
            categoria: 'CHECKLIST RTRS',
            propriedade_id: propId,
            pergunta_id: canonPergId,
            fazendaNome,
            produtorNome,
            arquivo_url: blobUrl,
            origem: 'Auditoria In Loco',
            data: f.created_at,
            dataEnvioReal: f.created_at,
            isLocalPending: true,
            podeDeletar: false
          });
        });

        localPends.forEach(p => {
          const prop = propMap.get(p.propriedade_id) || {};
          localPendsList.push({
            id: `pend-${p.id}`,
            nome: p.titulo,
            categoria: 'REGULARIZAÇÃO',
            propriedade_id: p.propriedade_id,
            fazendaNome: prop.nome_fazenda || 'Fazenda',
            produtorNome: prop.nome_produtor || 'Produtor',
            arquivo_url: p.evidencia_url,
            origem: `Resolução de Pendência (${p.status})`,
            data: p.created_at || new Date().toISOString(),
            isLocalPending: false,
            podeDeletar: false
          });
        });

        localList = [...localChecklistMap.values(), ...localPendsList];

        if (localList.length > 0) {
          localList.sort((a, b) => new Date(b.dataEnvioReal || b.data || b.updated_at || b.created_at || 0).getTime() - new Date(a.dataEnvioReal || a.data || a.updated_at || a.created_at || 0).getTime());
          setDocumentos(localList);
        }
      } catch (dexieErr) {
        console.warn('[Docs] Aviso ao carregar documentos do Dexie local:', dexieErr);
      }

      // Se offline, encerra mantendo os dados locais deduplicados
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setLoadingDocs(false);
        return;
      }

      // 2. Busca remota no Supabase com proteção e resolução ativa de propriedades
      const { assignedPropIds } = await resolveTechnicianProperties();

      const remoteFetchPromise = async () => {
        const fetchGenDocs = async () => {
          try {
            return await supabase
              .from('documentos_propriedade')
              .select(`
                id,
                nome,
                categoria,
                propriedade_id,
                arquivo_url,
                created_at,
                propriedades (
                  nome_fazenda,
                  nome_produtor
                )
              `)
              .order('created_at', { ascending: false });
          } catch (e) {
            console.warn('Tabela documentos_propriedade inacessível:', e);
            return { data: null, error: e };
          }
        };

        const fetchRespData = async () => {
          try {
            return await supabase
              .from('respostas_auditoria')
              .select(`
                id,
                auditoria_id,
                pergunta_id,
                conforme,
                nao_se_aplica,
                observacoes,
                evidencia_url,
                created_at,
                updated_at,
                auditorias (
                  id,
                  propriedade_id,
                  status,
                  tecnico_responsavel_id,
                  propriedades (
                    id,
                    nome_fazenda,
                    nome_produtor
                  )
                ),
                perguntas_rtrs (
                  numero_criterio,
                  secao,
                  enunciado
                )
              `)
              .not('evidencia_url', 'is', null)
              .order('created_at', { ascending: false });
          } catch (e) {
            console.warn('Tabela respostas_auditoria inacessível:', e);
            return { data: null, error: e };
          }
        };

        const fetchPendsData = async () => {
          try {
            return await supabase
              .from('pendencias')
              .select(`
                id,
                propriedade_id,
                titulo,
                evidencia_url,
                status,
                created_at,
                propriedades (
                  nome_fazenda,
                  nome_produtor
                )
              `)
              .not('evidencia_url', 'is', null)
              .order('created_at', { ascending: false });
          } catch (e) {
            console.warn('Tabela pendencias inacessível:', e);
            return { data: null, error: e };
          }
        };

        const [genDocsRes, respDataRes, pendsDataRes] = await Promise.all([
          fetchGenDocs(),
          fetchRespData(),
          fetchPendsData()
        ]);

        const genDocs = genDocsRes?.data || null;
        const respData = respDataRes?.data || null;
        const pendsData = pendsDataRes?.data || null;

        // Hidratação silenciosa e protegida das respostas e evidências no Dexie local para garantir 0ms nas próximas vezes sem apagar status
        if (respData && respData.length > 0) {
          try {
            const [localResps, localJournal] = await Promise.all([
              db.cached_respostas.toArray().catch(() => []),
              db.sync_journal.toArray().catch(() => [])
            ]);

            const localRespMap = new Map<string, any>();
            localResps.forEach(lr => {
              const canon = normalizePerguntaId(lr.pergunta_id);
              localRespMap.set(`${lr.auditoria_id}_${canon}`, lr);
              localRespMap.set(`${lr.auditoria_id}_${lr.pergunta_id}`, lr);
            });

            const pendingJournalKeys = new Set<string>();
            localJournal.forEach(j => {
              if (j.status === 'pending' || j.status === 'syncing') {
                const canon = normalizePerguntaId(j.pergunta_id);
                pendingJournalKeys.add(`${j.auditoria_id}_${canon}`);
                pendingJournalKeys.add(`${j.auditoria_id}_${j.pergunta_id}`);
              }
            });

            const toCacheMap = new Map<string, any>();
            respData.forEach((r: any) => {
              if (r.auditoria_id && r.pergunta_id && r.evidencia_url) {
                const canonPergId = normalizePerguntaId(r.pergunta_id);
                const dedupKey = `${r.auditoria_id}_${canonPergId}`;

                // Se houver alteração pendente no sync_journal, não sobrescreve com dados do servidor
                if (pendingJournalKeys.has(dedupKey) || pendingJournalKeys.has(`${r.auditoria_id}_${r.pergunta_id}`)) {
                  return;
                }

                const existing = localRespMap.get(dedupKey) || localRespMap.get(`${r.auditoria_id}_${r.pergunta_id}`);

                // Se o dado local tem updated_at mais recente que o servidor, preserva os dados locais
                if (existing?.updated_at && r.updated_at) {
                  const localTime = new Date(existing.updated_at).getTime();
                  const remoteTime = new Date(r.updated_at).getTime();
                  if (localTime > remoteTime) {
                    return;
                  }
                }

                const mergedItem = {
                  id: r.id || existing?.id,
                  auditoria_id: r.auditoria_id,
                  pergunta_id: canonPergId || r.pergunta_id,
                  conforme: r.conforme ?? (existing?.conforme ?? false),
                  nao_se_aplica: !!(r.nao_se_aplica ?? existing?.nao_se_aplica),
                  observacoes: (r.observacoes !== undefined && r.observacoes !== null) ? r.observacoes : (existing?.observacoes || ''),
                  evidencia_url: r.evidencia_url || existing?.evidencia_url || null,
                  numero_criterio: r.perguntas_rtrs?.numero_criterio || existing?.numero_criterio,
                  created_at: r.created_at || existing?.created_at,
                  updated_at: r.updated_at || existing?.updated_at || new Date().toISOString(),
                  evidencia_uploaded_at: existing?.evidencia_uploaded_at || r.updated_at || r.created_at,
                  data_envio: existing?.data_envio || r.updated_at || r.created_at
                };

                if (toCacheMap.has(dedupKey)) {
                  const prev = toCacheMap.get(dedupKey);
                  const prevTime = new Date(prev.updated_at || prev.created_at || 0).getTime();
                  const currTime = new Date(mergedItem.updated_at || mergedItem.created_at || 0).getTime();
                  if (currTime > prevTime) {
                    toCacheMap.set(dedupKey, mergedItem);
                  }
                } else {
                  toCacheMap.set(dedupKey, mergedItem);
                }
              }
            });

            const toCache = Array.from(toCacheMap.values());
            if (toCache.length > 0) {
              await db.cached_respostas.bulkPut(toCache);
            }
          } catch (cacheErr) {
            console.warn('[Docs] Falha ao hidratar cache de respostas no Dexie:', cacheErr);
          }
        }

        const remoteList: any[] = [];

        if (genDocs) {
          genDocs.forEach((d: any) => {
            const propRel = Array.isArray(d.propriedades) ? d.propriedades[0] : d.propriedades;
            remoteList.push({
              id: d.id,
              nome: d.nome,
              categoria: d.categoria,
              propriedade_id: d.propriedade_id,
              fazendaNome: propRel?.nome_fazenda || 'Geral',
              produtorNome: propRel?.nome_produtor || 'N/A',
              arquivo_url: d.arquivo_url,
              origem: 'Armazenamento Geral',
              data: d.created_at,
              podeDeletar: true
            });
          });
        }

        if (respData) {
          respData.forEach((r: any) => {
            const audit = Array.isArray(r.auditorias) ? r.auditorias[0] : r.auditorias;
            const propRel = Array.isArray(audit?.propriedades) ? audit.propriedades[0] : audit?.propriedades;
            const fallbackFarm = resolveFarmInfo(r.auditoria_id);
            const propId = audit?.propriedade_id || propRel?.id || fallbackFarm.propId;

            if (propId) {
              const canonPergId = getCanonicalCrit(r);
              const perg = Array.isArray(r.perguntas_rtrs) ? r.perguntas_rtrs[0] : r.perguntas_rtrs;
              const pergFallback = pergMap.get(canonPergId) || pergMap.get(r.pergunta_id);
              const numCrit = perg?.numero_criterio ? `Critério ${perg.numero_criterio} - ` : (pergFallback?.numero_criterio ? `Critério ${pergFallback.numero_criterio} - ` : '');
              const title = perg?.enunciado ? `${numCrit}${perg.enunciado}` : (pergFallback?.enunciado ? `${numCrit}${pergFallback.enunciado}` : `Princípio ${perg?.secao || 'RTRS'} - ${numCrit || 'N/A'}`);
              const dataEnvioReal = (r as any).evidencia_uploaded_at || r.updated_at || r.created_at;
              remoteList.push({
                id: `resp-${r.auditoria_id || ''}-${canonPergId}`,
                nome: title,
                categoria: 'CHECKLIST RTRS',
                propriedade_id: propId,
                auditoria_id: r.auditoria_id,
                pergunta_id: canonPergId,
                fazendaNome: propRel?.nome_fazenda || audit?.nome_fazenda || fallbackFarm.fazendaNome || 'Fazenda',
                produtorNome: propRel?.nome_produtor || audit?.nome_produtor || fallbackFarm.produtorNome || 'N/A',
                arquivo_url: r.evidencia_url,
                origem: audit?.status === 'Autoavaliação' ? 'Autoavaliação RTRS' : 'Auditoria In Loco',
                data: dataEnvioReal,
                dataEnvioReal: dataEnvioReal,
                updated_at: r.updated_at,
                created_at: r.created_at,
                podeDeletar: false
              });
            }
          });
        }

        if (pendsData) {
          pendsData.forEach((p: any) => {
            const propRel = Array.isArray(p.propriedades) ? p.propriedades[0] : p.propriedades;
            if (p.propriedade_id) {
              remoteList.push({
                id: `pend-${p.id}`,
                nome: p.titulo,
                categoria: 'REGULARIZAÇÃO',
                propriedade_id: p.propriedade_id,
                fazendaNome: propRel?.nome_fazenda || 'Fazenda',
                produtorNome: propRel?.nome_produtor || 'N/A',
                arquivo_url: p.evidencia_url,
                origem: `Resolução de Pendência (${p.status})`,
                data: p.created_at,
                podeDeletar: false
              });
            }
          });
        }

        return remoteList;
      };

      try {
        const timeoutPromise = new Promise<any[]>((resolve) =>
          setTimeout(() => {
            console.warn('[Docs] Timeout de 15s na busca remota de documentos.');
            resolve([]);
          }, 15000)
        );

        const fetchedRemote = await Promise.race([remoteFetchPromise(), timeoutPromise]);

        // MESCLAGEM INTELIGENTE COM DEDUPLICAÇÃO ESTRITA POR CRITÉRIO E PROPRIEDADE
        const mergedMap = new Map<string, any>();

        (fetchedRemote || []).forEach(doc => {
          if (doc.auditoria_id && doc.pergunta_id) {
            const strictKey = `${doc.auditoria_id}_${normalizePerguntaId(doc.pergunta_id)}`;
            if (deletedEvidenceKeys.has(strictKey)) return;
          }
          const canonPergId = doc.categoria === 'CHECKLIST RTRS' ? getCanonicalCrit(doc) : '';
          const dedupKey = doc.categoria === 'CHECKLIST RTRS'
            ? `${doc.propriedade_id || doc.fazendaNome}_${canonPergId || doc.nome}`
            : doc.id;

          mergedMap.set(dedupKey, {
            ...doc,
            isLocalPending: false
          });
        });

        localList.forEach(doc => {
          const canonPergId = doc.categoria === 'CHECKLIST RTRS' ? getCanonicalCrit(doc) : '';
          const auditId = doc.auditoria_id || (doc.id && doc.id.startsWith('resp-') ? doc.id.split('-')[1] : '');
          const strictKey = `${auditId || ''}_${canonPergId}`;

          if (doc.categoria === 'CHECKLIST RTRS' && deletedEvidenceKeys.has(strictKey)) {
            return;
          }

          const dedupKey = doc.categoria === 'CHECKLIST RTRS'
            ? `${doc.propriedade_id || doc.fazendaNome}_${canonPergId || doc.nome}`
            : doc.id;

          if (mergedMap.has(dedupKey)) {
            const existing = mergedMap.get(dedupKey);
            const timeExisting = new Date(existing.dataEnvioReal || existing.data || existing.updated_at || existing.created_at || 0).getTime();
            const timeIncoming = new Date(doc.dataEnvioReal || doc.data || doc.updated_at || doc.created_at || 0).getTime();

            const hasPendingQueue = pendingEvidenceKeys.has(strictKey);

            const isLocalBlob = doc.arquivo_url && (String(doc.arquivo_url).startsWith('blob:') || String(doc.arquivo_url).startsWith('data:'));
            // Um registro com URL pública no Supabase Storage só é pendente se houver uma nova alteração pendente na fila
            const isTrulyPending = hasPendingQueue || (isLocalBlob && !existing.arquivo_url);
            const preferLocal = isTrulyPending || (!existing.arquivo_url && !!doc.arquivo_url) || (timeIncoming > timeExisting && isLocalBlob);

            const finalUrl = (preferLocal && doc.arquivo_url) ? doc.arquivo_url : (existing.arquivo_url || doc.arquivo_url);

            // Sincroniza o cache local com a URL pública oficial do Supabase
            if (existing.arquivo_url && String(existing.arquivo_url).startsWith('http') && !hasPendingQueue) {
              const auditIdToUpdate = existing.auditoria_id || doc.auditoria_id;
              if (auditIdToUpdate && canonPergId) {
                db.cached_respostas
                  .where('auditoria_id')
                  .equals(auditIdToUpdate)
                  .and(r => normalizePerguntaId(r.pergunta_id) === canonPergId)
                  .modify({ evidencia_url: existing.arquivo_url })
                  .catch(() => {});
              }
            }

            mergedMap.set(dedupKey, {
              ...existing,
              ...doc,
              id: existing.id || doc.id,
              fazendaNome: (existing.fazendaNome && existing.fazendaNome !== 'Fazenda') ? existing.fazendaNome : (doc.fazendaNome || 'Fazenda'),
              produtorNome: (existing.produtorNome && existing.produtorNome !== 'Produtor') ? existing.produtorNome : (doc.produtorNome || 'Produtor'),
              isLocalPending: isTrulyPending,
              data: preferLocal ? doc.data : (existing.data || doc.data),
              dataEnvioReal: preferLocal ? doc.dataEnvioReal : (existing.dataEnvioReal || doc.dataEnvioReal),
              arquivo_url: finalUrl
            });
          } else {
            const hasPendingQueue = pendingEvidenceKeys.has(strictKey);
            const isTrulyPending = hasPendingQueue || (doc.arquivo_url && !String(doc.arquivo_url).startsWith('http'));

            // Se o documento foi explicitamente excluído no sync_journal, suprime e limpa cache local
            const isExplicitlyDeleted = deletedEvidenceKeys.has(strictKey);
            if (isExplicitlyDeleted) {
              if (auditId && canonPergId) {
                db.cached_respostas
                  .where('auditoria_id')
                  .equals(auditId)
                  .and(r => normalizePerguntaId(r.pergunta_id) === canonPergId)
                  .modify({ evidencia_url: null, evidencia_uploaded_at: null, data_envio: null })
                  .catch(() => {});
              }
              return; // Suprime a evidência excluída
            }

            // AUTO-CURA (Self-Healing): Se o documento local tem URL válida (http... ou data:),
            // mas não veio na query remota do Supabase (por exemplo, após sobrescrita concorrente),
            // NÃO apaga! Mantém na tela e cura o registro no Supabase em segundo plano!
            if (doc.categoria === 'CHECKLIST RTRS' && doc.arquivo_url && auditId && !auditId.startsWith('mock-')) {
              const urlToRestore = doc.arquivo_url;
              if (String(urlToRestore).startsWith('http') && canonPergId) {
                supabase
                  .from('respostas_auditoria')
                  .update({ evidencia_url: urlToRestore, updated_at: new Date().toISOString() })
                  .eq('auditoria_id', auditId)
                  .eq('pergunta_id', canonPergId)
                  .then(() => {});
              }
            }

            mergedMap.set(dedupKey, {
              ...doc,
              isLocalPending: isTrulyPending
            });
          }
        });

        // BLINDAGEM FINAL CONTRA REPETIÇÕES: Garante unicidade estrita por critério + fazenda
        const finalUniqueMap = new Map<string, any>();
        Array.from(mergedMap.values()).forEach(item => {
          const canonCrit = item.categoria === 'CHECKLIST RTRS'
            ? (getCanonicalCrit(item) || item.nome)
            : item.id;
          const uniqueKey = `${item.propriedade_id || item.fazendaNome}_${item.categoria}_${canonCrit}`;
          if (!finalUniqueMap.has(uniqueKey)) {
            finalUniqueMap.set(uniqueKey, item);
          } else {
            const prev = finalUniqueMap.get(uniqueKey);
            const timePrev = new Date(prev.dataEnvioReal || prev.data || 0).getTime();
            const timeItem = new Date(item.dataEnvioReal || item.data || 0).getTime();
            if (timeItem >= timePrev) {
              finalUniqueMap.set(uniqueKey, {
                ...prev,
                ...item,
                id: prev.id || item.id,
                fazendaNome: (prev.fazendaNome && prev.fazendaNome !== 'Fazenda') ? prev.fazendaNome : (item.fazendaNome || 'Fazenda'),
                produtorNome: (prev.produtorNome && prev.produtorNome !== 'Produtor') ? prev.produtorNome : (item.produtorNome || 'Produtor'),
                isLocalPending: item.isLocalPending !== undefined ? item.isLocalPending : prev.isLocalPending,
                arquivo_url: item.arquivo_url || prev.arquivo_url
              });
            }
          }
        });

        const finalList = Array.from(finalUniqueMap.values());
        finalList.sort((a, b) => {
          const timeA = new Date(a.dataEnvioReal || a.data || a.updated_at || a.created_at || 0).getTime();
          const timeB = new Date(b.dataEnvioReal || b.data || b.updated_at || b.created_at || 0).getTime();
          return timeB - timeA; // Mais recente sempre no topo absoluto
        });
        setDocumentos(finalList);
      } catch (raceErr) {
        console.warn('[Docs] Aviso na consulta remota de documentos:', raceErr);
        if (localList.length > 0) {
          const finalLocalUnique = new Map<string, any>();
          localList.forEach(item => {
            const canonCrit = item.categoria === 'CHECKLIST RTRS'
              ? (getCanonicalCrit(item) || item.nome)
              : item.id;
            const uniqueKey = `${item.propriedade_id || item.fazendaNome}_${item.categoria}_${canonCrit}`;
            if (!finalLocalUnique.has(uniqueKey)) {
              finalLocalUnique.set(uniqueKey, item);
            }
          });
          setDocumentos(Array.from(finalLocalUnique.values()));
        }
      }
    } catch (err: any) {
      console.error('Erro ao carregar documentos no técnico:', err);
    } finally {
      setLoadingDocs(false);
      isFetchingDocsRef.current = false;
      if (hasQueuedDocsFetchRef.current) {
        hasQueuedDocsFetchRef.current = false;
        fetchTechnicalDocuments();
      }
    }
  };

  const { isOnline, connectionState, syncNow, isSyncing } = useSync();
  const isOfflineMode = (typeof navigator !== 'undefined' && !navigator.onLine) || !isOnline || connectionState === 'OFFLINE';

  const [loading, setLoading] = useState(false);
  const liveAuditorias = useLiveAuditorias();
  const [auditorias, setAuditorias] = useState<any[]>(getInitialDefaultAuditorias);
  const [properties, setProperties] = useState<any[]>(getInitialDefaultProperties);
  const [isPreparingField, setIsPreparingField] = useState(false);
  const [lastPrepSummary, setLastPrepSummary] = useState<string | null>(null);

  // Sincronização reativa contínua com o Dexie (SSOT)
  useEffect(() => {
    if (liveAuditorias && liveAuditorias.length > 0) {
      setAuditorias(liveAuditorias);
      setLoading(false);
    }
  }, [liveAuditorias]);

  // Prioridade de leitura local imediata (0ms) ao montar
  useEffect(() => {
    let isMounted = true;
    const initLocalData = async () => {
      try {
        let local = await db.cached_auditorias.toArray();
        if (!local || local.length === 0) {
          local = await seedDefaultAuditorias();
        }
        if (!isMounted) return;
        if (local && local.length > 0) {
          const sorted = [...local].sort(compareAuditoriasDeterministically);
          setAuditorias(sorted);
          setLoading(false);
          const localProps = sorted.map(c => {
            const prop = Array.isArray(c.propriedades) ? c.propriedades[0] : c.propriedades;
            return {
              id: c.propriedade_id || prop?.id || c.id,
              nome_fazenda: prop?.nome_fazenda || 'Fazenda',
              nome_produtor: prop?.nome_produtor || 'Produtor',
              codigo_car: prop?.codigo_car || ''
            };
          });
          setProperties(localProps);
        }
      } catch (e) {
        if (isMounted) setLoading(false);
      }
      fetchCollaborativeMapData();
      if (typeof navigator !== 'undefined' && navigator.onLine && user) {
        prepareFieldModeData(user).then((res) => {
          if ((res as any)?.summary) setLastPrepSummary((res as any).summary);
          else if (res?.success) {
            getLastFieldPrepInfo().then(info => {
              if (info?.summary) setLastPrepSummary(info.summary);
            }).catch(() => {});
          }
        }).catch(() => {
          getLastFieldPrepInfo().then(info => {
            if (info?.summary) setLastPrepSummary(info.summary);
          }).catch(() => {});
        });
      } else {
        getLastFieldPrepInfo().then(info => {
          if (info?.summary) setLastPrepSummary(info.summary);
        }).catch(() => {});
      }
    };
    initLocalData();
    return () => { isMounted = false; };
  }, []);
  const [showQuestionario, setShowQuestionario] = useState(false);
  const [activeAuditoria, setActiveAuditoria] = useState<any>(null);
  const [questionarioInitialTab, setQuestionarioInitialTab] = useState<'resumo' | 'criterios' | 'ficha'>('criterios');
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);
  const [pdfAmpliado, setPdfAmpliado] = useState<string | null>(null);

  // Map & Collaborative States
  const [farmsData, setFarmsData] = useState<FeatureCollection>(getInitialFarmsGeoJSON);
  const [selectedFarmId, setSelectedFarmId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [allAuditorias, setAllAuditorias] = useState<any[]>([]);
  const [filterMode, setFilterMode] = useState<'minhas' | 'todas'>('minhas');
  const [allTechnicians, setAllTechnicians] = useState<any[]>([]);

  // Pendencies States
  const [technicalEtapaTab, setTechnicalEtapaTab] = useState<'Prospecção' | 'Auditoria Prévia' | 'Auditoria Oficial'>('Prospecção');
  const isFetchingAuditsRef = useRef(false);
  const lastAuditsFetchRef = useRef(0);
  const hasQueuedAuditsFetchRef = useRef(false);

  // Lista memoizada para a etapa ativa (elimina re-cálculos a cada render)
  const filteredAuditorias = useMemo(() => {
    const filtered = auditorias.filter(a => {
      const etapa = normalizeEtapa(a.etapa);
      return etapa === technicalEtapaTab;
    });
    return filtered.sort(compareAuditoriasDeterministically);
  }, [auditorias, technicalEtapaTab]);

  // Contadores memoizados para os botões das 3 etapas
  const etapaCounts = useMemo(() => {
    let prospecao = 0;
    let previa = 0;
    let oficial = 0;
    auditorias.forEach(a => {
      const etapa = normalizeEtapa(a.etapa);
      if (etapa === 'Auditoria Prévia') previa++;
      else if (etapa === 'Auditoria Oficial') oficial++;
      else prospecao++;
    });
    return { prospecao, previa, oficial };
  }, [auditorias]);
  const [selectedPropForPends, setSelectedPropForPends] = useState<any>(null);
  const [propPendencias, setPropPendencias] = useState<any[]>([]);
  const [loadingPends, setLoadingPends] = useState(false);
  const [isNewPendFormOpen, setIsNewPendFormOpen] = useState(false);
  const [newPendData, setNewPendData] = useState({ titulo: '', descricao: '', prazo: '' });
  const [rejectingPendId, setRejectingPendId] = useState<string | null>(null);
  const [motivoRejeicaoText, setMotivoRejeicaoText] = useState('');

  // Autonomy States
  // properties initialized above with getInitialDefaultProperties
  const [producers, setProducers] = useState<any[]>([]);
  const [showCreateFarmModal, setShowCreateFarmModal] = useState(false);
  const [showScheduleAuditModal, setShowScheduleAuditModal] = useState(false);
  const [certifyConfirmId, setCertifyConfirmId] = useState<string | null>(null);
  const [deletePendConfirmId, setDeletePendConfirmId] = useState<string | null>(null);

  // Prospecção States
  const [produtorOption, setProdutorOption] = useState<'existente' | 'novo'>('existente');
  const [selectedProdutorId, setSelectedProdutorId] = useState<string>('');
  const [novoProdutorData, setNovoProdutorData] = useState({ nome: '', email: '', telefone: '', regiao: '' });
  const [propertiesList, setPropertiesList] = useState<{
    nome_fazenda: string;
    codigo_car: string;
    codigo_sigef: string;
    origem: string;
    geom: any | null;
    errorCar: string;
    area_soja_ha?: string;
  }[]>([
    { nome_fazenda: '', codigo_car: '', codigo_sigef: '', origem: 'CAR', geom: null, errorCar: '', area_soja_ha: '' }
  ]);
  const [autoScheduleAudit, setAutoScheduleAudit] = useState(true);

  const handleOpenCreateFarmModal = () => {
    setProdutorOption('existente');
    setSelectedProdutorId('');
    setNovoProdutorData({ nome: '', email: '', telefone: '', regiao: '' });
    setPropertiesList([{ nome_fazenda: '', codigo_car: '', codigo_sigef: '', origem: 'CAR', geom: null, errorCar: '', area_soja_ha: '' }]);
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
    fetchAudits();
    fetchAuxiliaryData();
    fetchCollaborativeMapData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function fetchAuxiliaryData() {
    try {
      // 1. Fetch properties
      const { data: propsData } = await supabase
        .from('propriedades')
        .select('id, nome_fazenda, nome_produtor, codigo_car');
      if (propsData && propsData.length > 0) {
        setProperties(propsData);
      } else {
        const local = await db.cached_auditorias.toArray();
        if (local && local.length > 0) {
          setProperties(local.map(c => {
            const p = Array.isArray(c.propriedades) ? c.propriedades[0] : c.propriedades;
            return {
              id: c.propriedade_id || p?.id || c.id,
              nome_fazenda: p?.nome_fazenda || 'Fazenda',
              nome_produtor: p?.nome_produtor || 'Produtor',
              codigo_car: p?.codigo_car || ''
            };
          }));
        }
      }

      // 2. Fetch producers
      const { data: prodsData } = await supabase
        .from('perfis')
        .select('id, nome, email, telefone, regiao')
        .eq('role', 'produtor')
        .order('nome', { ascending: true });
      if (prodsData && prodsData.length > 0) {
        setProducers(prodsData);
      }

      // 3. Fetch all technicians
      const { data: tecsData } = await supabase
        .from('perfis')
        .select('id, nome')
        .eq('role', 'tecnico');
      if (tecsData) setAllTechnicians(tecsData);
    } catch (err) {
      try {
        const local = await db.cached_auditorias.toArray();
        if (local && local.length > 0) {
          setProperties(local.map(c => {
            const p = Array.isArray(c.propriedades) ? c.propriedades[0] : c.propriedades;
            return {
              id: c.propriedade_id || p?.id || c.id,
              nome_fazenda: p?.nome_fazenda || 'Fazenda',
              nome_produtor: p?.nome_produtor || 'Produtor',
              codigo_car: p?.codigo_car || ''
            };
          }));
        }
      } catch (e) {}
    }
  }

  async function fetchLatestActivityTimestamps(): Promise<{
    auditRespMap: Map<string, string>;
    propPendsMap: Map<string, string>;
  }> {
    const auditRespMap = new Map<string, string>();
    const propPendsMap = new Map<string, string>();

    try {
      const [respRes, pendRes] = await Promise.all([
        supabase.from('respostas_auditoria').select('auditoria_id, updated_at, created_at'),
        supabase.from('pendencias').select('propriedade_id, updated_at, created_at')
      ]);

      if (respRes.data) {
        respRes.data.forEach((r: any) => {
          if (!r.auditoria_id) return;
          const ts = r.updated_at || r.created_at;
          if (!ts) return;
          const currentMax = auditRespMap.get(r.auditoria_id);
          if (!currentMax || new Date(ts).getTime() > new Date(currentMax).getTime()) {
            auditRespMap.set(r.auditoria_id, ts);
          }
        });
      }

      if (pendRes.data) {
        pendRes.data.forEach((p: any) => {
          if (!p.propriedade_id) return;
          const ts = p.updated_at || p.created_at;
          if (!ts) return;
          const currentMax = propPendsMap.get(p.propriedade_id);
          if (!currentMax || new Date(ts).getTime() > new Date(currentMax).getTime()) {
            propPendsMap.set(p.propriedade_id, ts);
          }
        });
      }
    } catch (err) {
      console.warn('Erro ao carregar timestamps de atividade:', err);
    }

    return { auditRespMap, propPendsMap };
  }

  function computeCompositeUltimaAlteracao(params: {
    auditUpdatedAt?: string | null;
    auditCreatedAt?: string | null;
    propUpdatedAt?: string | null;
    propCreatedAt?: string | null;
    auditId?: string | null;
    propId?: string | null;
    farmName?: string | null;
    auditRespMap?: Map<string, string>;
    propPendsMap?: Map<string, string>;
  }): string {
    const {
      auditUpdatedAt,
      auditCreatedAt,
      propUpdatedAt,
      propCreatedAt,
      auditId,
      propId,
      farmName,
      auditRespMap,
      propPendsMap
    } = params;

    const cleanName = (farmName || '').split('-')[0].trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    const localModTime = (cleanName ? localStorage.getItem(`rtrs_last_modified_${cleanName}`) : null) || 
                         (auditId ? localStorage.getItem(`rtrs_last_modified_id_${auditId}`) : null);

    const respTime = auditId && auditRespMap ? auditRespMap.get(auditId) : null;
    const pendTime = propId && propPendsMap ? propPendsMap.get(propId) : null;

    const candidates = [
      auditUpdatedAt,
      auditCreatedAt,
      propUpdatedAt,
      propCreatedAt,
      respTime,
      pendTime,
      localModTime
    ].filter(Boolean);

    let maxTs = auditUpdatedAt || auditCreatedAt || propUpdatedAt || propCreatedAt || new Date().toISOString();
    candidates.forEach(ts => {
      if (ts && new Date(ts).getTime() > new Date(maxTs).getTime()) {
        maxTs = ts;
      }
    });

    return maxTs;
  }

  async function fetchCollaborativeMapData() {
    try {
      // 1. Carregar TODAS as propriedades cadastradas na tabela 'propriedades'
      let propsList: any[] = [];
      let auds: any[] = [];
      try {
        const { data: pData, error: pErr } = await supabase
          .from('propriedades')
          .select('id, nome_fazenda, nome_produtor, codigo_car, codigo_sigef, municipio, geom, produtor_id, created_at, updated_at')
          .order('updated_at', { ascending: false, nullsFirst: false });
        if (!pErr && pData && pData.length > 0) {
          propsList = pData;
        }
      } catch (e) {}

      // 2. Carregar TODAS as auditorias com técnicos responsáveis
      try {
        const { data: aData, error: aErr } = await supabase
          .from('auditorias')
          .select('id, status, data_agendamento, tecnico_responsavel_id, propriedade_id, created_at, updated_at')
          .order('updated_at', { ascending: false, nullsFirst: false });
        if (!aErr && aData && aData.length > 0) {
          auds = aData;
          setAllAuditorias(aData);
        }
      } catch (e) {}

      // Fallback local-first do Dexie se offline ou retorno vazio
      if (propsList.length === 0) {
        let cached = await db.cached_auditorias.toArray();
        if (!cached || cached.length === 0) {
          cached = await seedDefaultAuditorias();
        }
        if (cached && cached.length > 0) {
          auds = cached;
          setAllAuditorias(cached);
          propsList = cached.map(c => {
            const prop = Array.isArray(c.propriedades) ? c.propriedades[0] : c.propriedades;
            return {
              id: c.propriedade_id || prop?.id || c.id,
              nome_fazenda: prop?.nome_fazenda || 'Fazenda',
              nome_produtor: prop?.nome_produtor || 'Produtor',
              codigo_car: prop?.codigo_car || null,
              codigo_sigef: prop?.codigo_sigef || null,
              municipio: prop?.municipio || 'Mato Grosso do Sul',
              geom: prop?.geom || null,
              produtor_id: null,
              created_at: c.created_at,
              updated_at: c.updated_at
            };
          });
        }
      }

      // 2.5 Buscar carimbos de atividade compostos
      const { auditRespMap, propPendsMap } = await fetchLatestActivityTimestamps();

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

          // Calcular carimbo de última alteração composto blindado
          const ultima_alteracao_at = computeCompositeUltimaAlteracao({
            auditUpdatedAt: latestAudit?.updated_at,
            auditCreatedAt: latestAudit?.created_at,
            propUpdatedAt: p.updated_at,
            propCreatedAt: p.created_at,
            auditId: latestAudit?.id,
            propId: p.id,
            farmName: p.nome_fazenda,
            auditRespMap,
            propPendsMap
          });

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
          const isOfflineMap = typeof navigator !== 'undefined' && !navigator.onLine;
          const isMineFarm = isOfflineMap ? true : (tecId ? (user?.id ? tecId === user.id : true) : true);

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
              produtor: p.nome_produtor || 'Produtor Rural',
              ultima_alteracao_at: ultima_alteracao_at,
              data_agendamento: latestAudit?.data_agendamento || null
            },
            geometry: geom
          };
        })
      );

      // Ordenar estritamente por última alteração (mais recente PRIMEIRO)
      features.sort((a, b) => {
        const timeA = new Date(a.properties.ultima_alteracao_at || 0).getTime();
        const timeB = new Date(b.properties.ultima_alteracao_at || 0).getTime();
        return timeB - timeA;
      });

      setFarmsData({ type: 'FeatureCollection', features });
    } catch (err) {
      console.error('Erro ao carregar mapa colaborativo:', err);
    }
  }

  const isUUID = (str: any) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

  const handleCreateFarm = async (e: React.FormEvent) => {
    e.preventDefault();

    // 0. Validar seleção/cadastro do produtor antes de prosseguir
    if (produtorOption === 'existente' && !selectedProdutorId) {
      warning('Por favor, selecione um produtor cadastrado na lista ou mude para "Cadastrar Novo Produtor".');
      return;
    }
    if (produtorOption === 'novo' && !novoProdutorData.nome.trim()) {
      warning('Por favor, informe o nome completo do novo produtor rural.');
      return;
    }
    
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
      const selectedProdObj = producers.find(p => p.id === selectedProdutorId);
      const defaultMunicipio = (produtorOption === 'novo' ? novoProdutorData.regiao : selectedProdObj?.regiao) || 'Geral, MS';

      // Garantir nome de fazenda padrão caso fique em branco e preservar todos os campos
      const processedProps = propertiesList.map(p => ({
        nome_fazenda: p.nome_fazenda?.trim() || `Fazenda ${p.codigo_car || p.codigo_sigef || 'Prospecção'}`,
        codigo_car: p.codigo_car || '',
        codigo_sigef: p.codigo_sigef || '',
        origem: p.origem,
        origem_cadastro: p.origem || 'CAR',
        geom: p.geom,
        area_soja_ha: p.area_soja_ha ? parseFloat(p.area_soja_ha) : null,
        municipio: defaultMunicipio
      }));

      const validProdId = isUUID(selectedProdutorId) ? selectedProdutorId : null;
      const validTecId = isUUID(user?.id) ? user?.id : null;

      // Pré-reconciliar ou criar Auth + Perfil para o produtor via RPC reconciliar_perfil_produtor (com fallback Auth isolado)
      let preCreatedAuthUserId: string | null = null;
      if (produtorOption === 'novo' && novoProdutorData.nome.trim()) {
        const cleanNome = novoProdutorData.nome.trim();
        const defaultEmail = (novoProdutorData.email?.trim() || `${cleanNome.toLowerCase().replace(/[^a-z0-9]+/g, '')}@produtor.ms.gov.br`).toLowerCase();
        try {
          const { data: recData, error: recErr } = await supabase.rpc('reconciliar_perfil_produtor', {
            p_auth_id: null,
            p_email: defaultEmail,
            p_nome: cleanNome,
            p_telefone: novoProdutorData.telefone?.trim() || null,
            p_regiao: novoProdutorData.regiao?.trim() || null,
            p_role: 'produtor'
          });
          if (!recErr && recData?.id && isUUID(recData.id)) {
            preCreatedAuthUserId = recData.id;
          }
        } catch (e) {
          console.warn('Aviso ao chamar reconciliar_perfil_produtor:', e);
        }

        if (!preCreatedAuthUserId) {
          try {
            const isolatedAuth = createIsolatedAuthClient();
            const { data: signUpData } = await isolatedAuth.auth.signUp({
              email: defaultEmail,
              password: 'Senha@123',
              options: {
                data: {
                  full_name: cleanNome,
                  role: 'produtor'
                }
              }
            });
            if (signUpData?.user?.id && isUUID(signUpData.user.id)) {
              preCreatedAuthUserId = signUpData.user.id;
            }
          } catch (e) {
            console.warn('Aviso ao criar conta Auth do produtor:', e);
          }
        }
      }

      const payload = {
        produtor_option: produtorOption,
        produtor_id: produtorOption === 'existente' ? validProdId : preCreatedAuthUserId,
        novo_produtor: produtorOption === 'novo' ? { ...novoProdutorData, id: preCreatedAuthUserId } : null,
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
        let prodId = validProdId || preCreatedAuthUserId;
        let prodNome = 'Produtor Rural';

        // 2a. Tratar produtor (sem duplicar signUp nem perfis)
        if (produtorOption === 'novo' && novoProdutorData.nome.trim()) {
          const cleanNome = novoProdutorData.nome.trim();
          const defaultEmail = (novoProdutorData.email?.trim() || `${cleanNome.toLowerCase().replace(/[^a-z0-9]+/g, '')}@produtor.ms.gov.br`).toLowerCase();

          // Verificar se o perfil já existe por ID ou e-mail antes de fazer upsert
          let existingProd: any = null;
          if (prodId) {
            const { data } = await supabase.from('perfis').select('id, nome, email').eq('id', prodId).maybeSingle();
            existingProd = data;
          }
          if (!existingProd) {
            const { data } = await supabase.from('perfis').select('id, nome, email').ilike('email', defaultEmail).maybeSingle();
            existingProd = data;
          }

          if (existingProd && isUUID(existingProd.id)) {
            prodId = existingProd.id;
            prodNome = cleanNome || existingProd.nome;
            await supabase
              .from('perfis')
              .update({
                nome: prodNome,
                telefone: novoProdutorData.telefone?.trim() || null,
                regiao: novoProdutorData.regiao || 'Geral, MS'
              })
              .eq('id', prodId);
          } else {
            const profileInsert: any = {
              nome: cleanNome,
              email: defaultEmail,
              role: 'produtor',
              telefone: novoProdutorData.telefone?.trim() || null,
              regiao: novoProdutorData.regiao || 'Geral, MS',
              status: 'Ativo'
            };
            if (preCreatedAuthUserId) {
              profileInsert.id = preCreatedAuthUserId;
            }

            const { data: newProd, error: prodErr } = await supabase
              .from('perfis')
              .upsert([profileInsert])
              .select()
              .single();

            if (!prodErr && newProd && isUUID(newProd.id)) {
              prodId = newProd.id;
              prodNome = newProd.nome;
            } else {
              prodNome = cleanNome;
            }
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
          const nowIso = new Date().toISOString();
          const propInsertPayload: any = {
            nome_fazenda: p.nome_fazenda,
            nome_produtor: prodNome,
            produtor_id: isUUID(prodId) ? prodId : null,
            tecnico_id: validTecId,
            codigo_car: p.origem === 'CAR' ? p.codigo_car : null,
            codigo_sigef: p.origem === 'SIGEF' ? p.codigo_sigef : null,
            origem_cadastro: p.origem || 'CAR',
            municipio: p.municipio || 'Geral, MS',
            area_soja_ha: p.area_soja_ha,
            etapa: 'Prospecção',
            created_at: nowIso,
            updated_at: nowIso
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
            const { data: existingAuds } = await supabase
              .from('auditorias')
              .select('id')
              .eq('propriedade_id', insertedPropId);

            if (!existingAuds || existingAuds.length === 0) {
              const auditPayload: any = {
                propriedade_id: insertedPropId,
                data_agendamento: new Date().toISOString(),
                status: 'Em Andamento',
                etapa: 'Prospecção'
              };
              if (validTecId) {
                auditPayload.tecnico_responsavel_id = validTecId;
              }
              await supabase.from('auditorias').insert([auditPayload]);
            }
          }
        }

        // 2d. Atualizar fazendas_vinculadas no perfil do produtor
        if (isUUID(prodId)) {
          try {
            await supabase.rpc('reconciliar_perfil_produtor', {
              p_auth_id: prodId,
              p_role: 'produtor'
            });
          } catch (e) {}
        }
      }

      if (!isSuccess) {
        // MODO CAMPO LOCAL-FIRST: Se a rede falhar ou estiver offline, salva no Dexie e enfileira na Outbox
        const nowIso = new Date().toISOString();
        const prodNome = novoProdutorData.nome || selectedProdutorId || 'Produtor Rural';

        for (const p of processedProps) {
          const propId = generateUUID();
          const auditId = generateUUID();
          const farmName = p.nome_fazenda || `Fazenda Prospecção`;

          const newAuditItem = {
            id: auditId,
            propriedade_id: propId,
            tecnico_responsavel_id: user?.id || 'b02f1f87-b998-4f4f-a66b-e169b28c0df5',
            data_agendamento: nowIso.split('T')[0],
            status: 'EM ANDAMENTO',
            etapa: 'Prospecção',
            ultima_alteracao_at: nowIso,
            created_at: nowIso,
            updated_at: nowIso,
            propriedades: {
              id: propId,
              nome_fazenda: farmName,
              nome_produtor: prodNome,
              codigo_car: p.codigo_car || null,
              codigo_sigef: p.codigo_sigef || null,
              municipio: 'Mato Grosso do Sul',
              geom: p.geom || null,
              etapa: 'Prospecção',
              created_at: nowIso,
              updated_at: nowIso
            }
          };

          await db.cached_auditorias.put(newAuditItem as any);

          // Enfileira inserção da propriedade e da auditoria
          await enqueueMutation({
            table: 'propriedades',
            action: 'insert',
            payload: {
              id: propId,
              nome_fazenda: farmName,
              nome_produtor: prodNome,
              codigo_car: p.codigo_car || null,
              codigo_sigef: p.codigo_sigef || null,
              origem_cadastro: p.origem || 'CAR',
              geom: p.geom || null,
              created_at: nowIso,
              updated_at: nowIso
            },
            on_conflict: 'id'
          });

          if (autoScheduleAudit) {
            await enqueueMutation({
              table: 'auditorias',
              action: 'insert',
              payload: {
                id: auditId,
                propriedade_id: propId,
                tecnico_responsavel_id: user?.id,
                data_agendamento: nowIso.split('T')[0],
                status: 'EM ANDAMENTO',
                etapa: 'Prospecção',
                created_at: nowIso,
                updated_at: nowIso
              },
              on_conflict: 'id'
            });
          }

          setAuditorias(prev => [newAuditItem, ...prev]);
          setProperties(prev => [{ id: propId, nome_fazenda: farmName, nome_produtor: prodNome, codigo_car: p.codigo_car || '' }, ...prev]);
        }

        isSuccess = true;
      }

      if (isSuccess) {
        success('Cadastro de prospecção e fazendas realizado com sucesso!');
        setShowCreateFarmModal(false);
        
        // Resetar estados
        setPropertiesList([{ nome_fazenda: '', codigo_car: '', codigo_sigef: '', origem: 'CAR', geom: null, errorCar: '', area_soja_ha: '' }]);
        setNovoProdutorData({ nome: '', email: '', telefone: '', regiao: '' });
        setSelectedProdutorId('');
        
        // Recarregar dados
        fetchAuxiliaryData();
        fetchAudits();
        fetchCollaborativeMapData();
      }
    } catch (err: any) {
      console.error('Erro ao cadastrar:', err);
      error('Erro ao cadastrar: ' + (err.message || 'Verifique as informações digitadas.'));
    } finally {
      setLoading(false);
      isFetchingAuditsRef.current = false;
    }
  };

  const handleScheduleAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auditFormData.propriedade_id) {
      warning('Selecione uma fazenda!');
      return;
    }

    try {
      const nowIso = new Date().toISOString();
      const payload = {
        propriedade_id: auditFormData.propriedade_id,
        tecnico_responsavel_id: user?.id,
        data_agendamento: auditFormData.data_agendamento,
        status: 'Visita de Campo',
        updated_at: nowIso
      };

      let scheduledOnline = false;
      try {
        const { data: existingAudits, error: fetchErr } = await supabase
          .from('auditorias')
          .select('id')
          .eq('propriedade_id', auditFormData.propriedade_id)
          .order('created_at', { ascending: false });

        if (!fetchErr) {
          if (existingAudits && existingAudits.length > 0) {
            const targetId = existingAudits[0].id;
            const { error: err } = await supabase
              .from('auditorias')
              .update({
                tecnico_responsavel_id: user?.id,
                data_agendamento: auditFormData.data_agendamento,
                status: 'Visita de Campo',
                updated_at: nowIso
              })
              .eq('id', targetId);

            if (!err) scheduledOnline = true;
          } else {
            const { error: err } = await supabase
              .from('auditorias')
              .insert([{ ...payload, created_at: nowIso }]);

            if (!err) scheduledOnline = true;
          }

          if (scheduledOnline) {
            await supabase
              .from('propriedades')
              .update({ updated_at: nowIso })
              .eq('id', auditFormData.propriedade_id);
          }
        }
      } catch (netErr) {
        console.warn('[OFFLINE] Falha de rede ao agendar online, aplicando persistência local:', netErr);
      }

      // Sempre garante persistência local no Dexie e enfileiramento na Outbox (Local-First)
      const existing = auditorias.find(a => a.propriedade_id === auditFormData.propriedade_id);
      const targetAuditId = existing ? existing.id : generateUUID();
      const propObj = properties.find(p => p.id === auditFormData.propriedade_id);

      const updatedItem = {
        ...(existing || {}),
        id: targetAuditId,
        propriedade_id: auditFormData.propriedade_id,
        tecnico_responsavel_id: user?.id || existing?.tecnico_responsavel_id || 'b02f1f87-b998-4f4f-a66b-e169b28c0df5',
        data_agendamento: auditFormData.data_agendamento,
        status: 'Visita de Campo',
        etapa: existing?.etapa || 'Prospecção',
        ultima_alteracao_at: nowIso,
        updated_at: nowIso,
        propriedades: existing?.propriedades || propObj || {
          id: auditFormData.propriedade_id,
          nome_fazenda: propObj?.nome_fazenda || 'Fazenda',
          nome_produtor: propObj?.nome_produtor || 'Produtor Rural'
        }
      };

      await db.cached_auditorias.put(updatedItem as any);

      if (!scheduledOnline) {
        await enqueueMutation({
          table: 'auditorias',
          action: existing && !existing.id.startsWith('mock-') ? 'update' : 'upsert',
          payload: {
            id: targetAuditId,
            propriedade_id: auditFormData.propriedade_id,
            tecnico_responsavel_id: user?.id,
            data_agendamento: auditFormData.data_agendamento,
            status: 'Visita de Campo',
            updated_at: nowIso
          },
          on_conflict: 'id'
        });
      }

      setAuditorias(prev => {
        const found = prev.some(a => a.id === targetAuditId);
        if (found) {
          return prev.map(a => a.id === targetAuditId ? { ...a, ...updatedItem } : a);
        }
        return [updatedItem, ...prev];
      });

      success('Vistoria agendada e salva com sucesso!');
      setShowScheduleAuditModal(false);
      
      fetchAudits();
      fetchCollaborativeMapData();
    } catch (err: any) {
      console.error('Erro ao agendar vistoria:', err);
      error('Erro ao agendar vistoria: ' + (err.message || 'Erro inesperado'));
    }
  };

  const handleUpdateTechnicalAuditEtapa = async (auditId: string, novaEtapa: 'Prospecção' | 'Auditoria Prévia' | 'Auditoria Oficial') => {
    try {
      const target = auditorias.find(a => a.id === auditId);
      const propId = target?.propriedade_id || target?.propriedades?.id;
      const nowIso = new Date().toISOString();

      if (propId) {
        await persistFarmEtapa(propId, auditId, novaEtapa);
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          try {
            await supabase.from('propriedades').update({ updated_at: nowIso }).eq('id', propId);
          } catch {
            await enqueueMutation({
              table: 'propriedades',
              action: 'update',
              payload: { id: propId, updated_at: nowIso }
            });
          }
        } else {
          await enqueueMutation({
            table: 'propriedades',
            action: 'update',
            payload: { id: propId, updated_at: nowIso }
          });
        }
      }

      if (auditId && !auditId.startsWith('v-audit-') && !auditId.startsWith('mock-')) {
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          try {
            await supabase.from('auditorias').update({ etapa: novaEtapa, updated_at: nowIso }).eq('id', auditId);
          } catch {
            await enqueueMutation({
              table: 'auditorias',
              action: 'update',
              payload: { id: auditId, etapa: novaEtapa, updated_at: nowIso }
            });
          }
        } else {
          await enqueueMutation({
            table: 'auditorias',
            action: 'update',
            payload: { id: auditId, etapa: novaEtapa, updated_at: nowIso }
          });
        }
      }

      if (auditId) {
        await updateCachedAuditoria(auditId, { etapa: novaEtapa, ultima_alteracao_at: nowIso });
      }

      success(`Etapa atualizada para ${novaEtapa} com sucesso!`);
      fetchAudits();
      fetchCollaborativeMapData();
    } catch (err: any) {
      console.error('Erro ao alterar etapa:', err);
      error('Falha ao atualizar etapa da auditoria.');
    }
  };

  const handleLiberarAuditoria = async (auditoriaId: string) => {
    setCertifyConfirmId(auditoriaId);
  };

  const executeCertify = async () => {
    const auditoriaId = certifyConfirmId;
    if (!auditoriaId) return;

    if (auditoriaId) {
      await updateCachedAuditoria(auditoriaId, { status: 'Certificada' });
    }

    if (auditoriaId.startsWith('mock-') || auditoriaId.startsWith('prop-audit-')) {
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await enqueueMutation({
        table: 'auditorias',
        action: 'update',
        payload: { id: auditoriaId, status: 'Certificada' }
      });
      success('Auditoria liberada e certificada localmente (Modo Campo)!');
      setCertifyConfirmId(null);
      return;
    }

    try {
      const { error: err } = await supabase
        .from('auditorias')
        .update({ status: 'Certificada' })
        .eq('id', auditoriaId);
      if (err) throw err;
      
      success('Auditoria liberada e certificada com sucesso!');
    } catch (err: any) {
      await enqueueMutation({
        table: 'auditorias',
        action: 'update',
        payload: { id: auditoriaId, status: 'Certificada' }
      });
      success('Auditoria liberada e enfileirada para envio.');
    } finally {
      setCertifyConfirmId(null);
    }
  };

  const handlePrepareFieldMode = async () => {
    setIsPreparingField(true);
    try {
      const res = await prepareFieldModeData(user);
      if (res.success) {
        const info = await getLastFieldPrepInfo();
        setLastPrepSummary(info.summary);
        success(`Modo Campo Pronto! ${res.perguntasCount} critérios RTRS e ${res.auditoriasCount} vistorias salvos no aparelho.`);
      } else {
        warning('Alguns dados não puderam ser baixados, mas a base local foi preservada.');
      }
    } catch (e: any) {
      console.error('Erro ao preparar modo campo:', e);
      error('Falha ao preparar modo campo: ' + e.message);
    } finally {
      setIsPreparingField(false);
      fetchAudits();
    }
  };

  async function fetchAudits(force = false) {
    const now = Date.now();
    // Previne execuções concorrentes ou requisições repetitivas no intervalo de 4 segundos
    if (isFetchingAuditsRef.current) {
      if (force) {
        hasQueuedAuditsFetchRef.current = true;
      }
      return;
    }
    if (!force && now - lastAuditsFetchRef.current < 4000 && auditorias.length > 0) return;

    isFetchingAuditsRef.current = true;
    lastAuditsFetchRef.current = now;

    // 1. CARREGAMENTO IMEDIATO LOCAL-FIRST DO DEXIE (CACHE-FIRST / 0ms)
    try {
      let local = await db.cached_auditorias.toArray();
      if (!local || local.length === 0) {
        local = await seedDefaultAuditorias();
      }
      if (local && local.length > 0) {
        const sorted = [...local].sort(compareAuditoriasDeterministically);
        setAuditorias(sorted);
        setLoading(false);
      }
    } catch (e) {
      console.warn('[OFFLINE] Falha na leitura imediata do Dexie:', e);
    }

    // 2. Se offline pelo navigator, encerra a busca remota imediatamente preservando o cache local
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setLoading(false);
      isFetchingAuditsRef.current = false;
      return;
    }

    // 3. Em segundo plano (se online), consulta o Supabase com proteção absoluta contra esvaziamento
    try {
      const fetchPromise = (async () => {
        const { data: propsData, error: propsErr } = await supabase
          .from('propriedades')
          .select('id, nome_fazenda, nome_produtor, codigo_car, codigo_sigef, municipio, geom, etapa, created_at, updated_at');

        const { data: auditsData, error: audErr } = await supabase
          .from('auditorias')
          .select(`
            id,
            data_agendamento,
            status,
            etapa,
            tecnico_responsavel_id,
            propriedade_id,
            created_at,
            updated_at,
            propriedades (
              id,
              nome_fazenda,
              nome_produtor,
              codigo_car,
              codigo_sigef,
              municipio,
              geom,
              etapa,
              created_at,
              updated_at
            )
          `)
          .order('updated_at', { ascending: false, nullsFirst: false });

        // PROTEÇÃO CRÍTICA CONTRA RESPOSTA NULA/VAZIA OU ERRO DE REDE:
        // Se a rede falhar ou não retornar registros, NUNCA zerar o estado local!
        if (propsErr || audErr || !propsData || propsData.length === 0 || !auditsData || auditsData.length === 0) {
          console.warn('[OFFLINE/REVALIDATION] Falha de rede ou resposta vazia do Supabase. Mantendo dados locais intactos.');
          return;
        }

        const propMap = new Map<string, any>();
        propsData.forEach((p: any) => propMap.set(p.id, p));

        const { auditRespMap, propPendsMap } = await fetchLatestActivityTimestamps();

        const userEmail = (user?.email || '').toLowerCase();

        const auditByProp = new Map<string, any>();

        auditsData.forEach((a: any) => {
          const propRel = Array.isArray(a.propriedades) ? a.propriedades[0] : a.propriedades;
          const propFound = propRel || propMap.get(a.propriedade_id);
          const propId = a.propriedade_id || propFound?.id;
          if (!propId) return;

          const resolvedEtapa = resolveFarmEtapa(propId, propFound?.etapa, a.etapa);

          const lastTs = computeCompositeUltimaAlteracao({
            auditUpdatedAt: a.updated_at,
            auditCreatedAt: a.created_at,
            propUpdatedAt: propFound?.updated_at,
            propCreatedAt: propFound?.created_at,
            auditId: a.id,
            propId: propId,
            farmName: propFound?.nome_fazenda,
            auditRespMap,
            propPendsMap
          });

          const auditItem = {
            ...a,
            etapa: resolvedEtapa,
            ultima_alteracao_at: lastTs,
            propriedades: propFound || { nome_fazenda: 'Fazenda', nome_produtor: 'Produtor' }
          };

          const existing = auditByProp.get(propId);
          if (!existing) {
            auditByProp.set(propId, auditItem);
          } else {
            const existingHasResp = existing.id && auditRespMap.has(existing.id);
            const newHasResp = a.id && auditRespMap.has(a.id);
            if (!existingHasResp && newHasResp) {
              auditByProp.set(propId, auditItem);
            } else if (existingHasResp === newHasResp) {
              const timeExisting = new Date(existing.ultima_alteracao_at || existing.updated_at || 0).getTime();
              const timeNew = new Date(lastTs || a.updated_at || 0).getTime();
              if (timeNew > timeExisting) {
                auditByProp.set(propId, auditItem);
              }
            }
          }
        });

        const allList: any[] = Array.from(auditByProp.values());

        const existingPropIds = new Set(allList.map(a => a.propriedade_id));
        propsData.forEach((p: any) => {
          if (!existingPropIds.has(p.id)) {
            const lastTs = computeCompositeUltimaAlteracao({
              auditUpdatedAt: null,
              auditCreatedAt: null,
              propUpdatedAt: p.updated_at,
              propCreatedAt: p.created_at,
              auditId: `mock-audit-${p.id}`,
              propId: p.id,
              farmName: p.nome_fazenda,
              auditRespMap,
              propPendsMap
            });

            allList.push({
              id: `mock-audit-${p.id}`,
              propriedade_id: p.id,
              tecnico_responsavel_id: user?.id || null,
              data_agendamento: new Date().toISOString(),
              status: 'Autoavaliação',
              etapa: resolveFarmEtapa(p.id, p.etapa),
              ultima_alteracao_at: lastTs,
              propriedades: p
            });
          }
        });

        // Buscar prazos de pendências
        const pendenciasPrazoMap = new Map<string, string>();
        try {
          const { data: pendenciasData } = await supabase
            .from('pendencias')
            .select('propriedade_id, prazo, status')
            .neq('status', 'Resolvida')
            .not('prazo', 'is', null)
            .order('prazo', { ascending: true });

          if (pendenciasData) {
            pendenciasData.forEach((pend: any) => {
              const existing = pendenciasPrazoMap.get(pend.propriedade_id);
              if (!existing || new Date(pend.prazo) < new Date(existing)) {
                pendenciasPrazoMap.set(pend.propriedade_id, pend.prazo);
              }
            });
          }
        } catch (e) {}

        allList.forEach(a => {
          a.prazo_pendencia = pendenciasPrazoMap.get(a.propriedade_id) || null;
        });

        // Filtrar para o técnico logado de forma resiliente
        const filteredForTech = allList.filter((a: any) => {
          const tecId = a.tecnico_responsavel_id;
          if (!tecId) return true;
          if (user?.id && tecId === user.id) return true;
          if (tecId === 'tec-patricia-01' && userEmail.includes('analistacampo1')) return true;
          if (tecId === 'tec-alexandre-02' && userEmail.includes('analistacampo2')) return true;
          if (tecId === 'tec-vistoriador-03' && userEmail.includes('tecnico@ms')) return true;
          if (userEmail.includes('analistacampo1') && tecId === 'b02f1f87-b998-4f4f-a66b-e169b28c0df5') return true;
          if (userEmail.includes('analistacampo2') && tecId === 'cf4ebd0f-f933-4853-8adc-3a65da55ec6d') return true;
          if (userEmail.includes('tecnico@ms') && tecId === 'bb03c918-ed79-479c-87bf-c8f65a95ac2c') return true;
          return true; // No modo offline ou testes, garante visibilidade de todas
        });

        // PROTEÇÃO CONTRA SOBRESCRITA POR ARRAY VAZIO:
        // Só atualiza Dexie e state se encontramos pelo menos 1 registro válido
        if (filteredForTech && filteredForTech.length > 0) {
          filteredForTech.sort(compareAuditoriasDeterministically);
          await bulkSaveAuditorias(filteredForTech);
          setAuditorias(filteredForTech);
        } else {
          console.warn('[REVALIDATION] Nenhum registro retornado para o técnico. Mantendo cache local intacto.');
        }
      })();

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout de rede na consulta remota de auditorias')), 6000)
      );

      await Promise.race([fetchPromise, timeoutPromise]);
    } catch (err: any) {
      console.warn('[OFFLINE] Falha na rede ao atualizar auditorias. Mantendo cache local:', err);
    } finally {
      setLoading(false); // IMPRESCINDÍVEL: nunca deixar a tela em skeleton infinito
      isFetchingAuditsRef.current = false;
      if (hasQueuedAuditsFetchRef.current) {
        hasQueuedAuditsFetchRef.current = false;
        fetchAudits(true);
      }
    }
  }

  const handleStartAuditoria = (auditoria: any, initialTab: 'resumo' | 'criterios' | 'ficha' = 'criterios') => {
    setSelectedAuditForDetail(null);
    setQuestionarioInitialTab(initialTab);
    setActiveAuditoria(auditoria);
    setShowQuestionario(true);
  };

  const handleComplete = async (auditoriaId: string) => {
    const nowIso = new Date().toISOString();
    if (auditoriaId) {
      await updateCachedAuditoria(auditoriaId, { status: 'Aguardando Aprovação', ultima_alteracao_at: nowIso });
      setAuditorias(prev => prev.map(a => a.id === auditoriaId ? { ...a, status: 'Aguardando Aprovação', ultima_alteracao_at: nowIso } : a));
    }

    if (auditoriaId.startsWith('mock-') || auditoriaId.startsWith('prop-audit-')) {
      setShowQuestionario(false);
      fetchAudits(true);
      fetchTechnicalDocuments();
      return;
    }

    try {
      await supabase
        .from('auditorias')
        .update({ status: 'Aguardando Aprovação', updated_at: nowIso })
        .eq('id', auditoriaId);
      setShowQuestionario(false);
      fetchAudits(true);
      fetchTechnicalDocuments();
    } catch (err: any) {
      console.warn('Aviso ao atualizar status final da auditoria:', err);
      setShowQuestionario(false);
      fetchAudits(true);
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

    // 1. Leitura Local-First imediata do Dexie (0ms)
    try {
      const localPends = await getCachedPendenciasByPropriedade(prop.id);
      if (localPends && localPends.length > 0) {
        setPropPendencias(localPends);
      }
    } catch (e) {}

    // 2. Se offline, encerra imediatamente mantendo os dados locais
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
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
      if (data) {
        setPropPendencias(data);
        await bulkSavePendencias(data);
      }
    } catch (err: any) {
      console.warn('Aviso ao carregar pendências remotas:', err);
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

    // Modo Campo Offline: Enfileira pendência na Outbox se estiver offline
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const offlinePendId = generateUUID();
      const offlinePend = {
        id: offlinePendId,
        propriedade_id: selectedPropForPends.id,
        titulo: newPendData.titulo,
        descricao: newPendData.descricao,
        prazo: newPendData.prazo || null,
        status: 'Pendente',
        criado_por: user?.id || null,
        created_at: new Date().toISOString()
      };

      await enqueueMutation({
        table: 'pendencias',
        action: 'insert',
        payload: offlinePend
      });

      setPropPendencias([offlinePend, ...propPendencias]);
      setIsNewPendFormOpen(false);
      setNewPendData({ titulo: '', descricao: '', prazo: '' });
      success('Pendência registrada e salva no aparelho (Modo Campo)!');
      return;
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
      let payload: any = {
        propriedade_id: selectedPropForPends.id,
        titulo: newPendData.titulo,
        descricao: newPendData.descricao,
        prazo: newPendData.prazo || null,
        status: 'Pendente',
        criado_por: user?.id || null,
        tecnico_responsavel_id: user?.id || null
      };

      let { data, error: err } = await supabase
        .from('pendencias')
        .insert([payload])
        .select()
        .single();

      // Fallback de Autocura: se o PostgREST schema cache estiver desatualizado para tecnico_responsavel_id ou criado_por
      if (err && (err.message?.includes('tecnico_responsavel_id') || err.message?.includes('criado_por') || err.message?.includes('schema cache'))) {
        console.warn('Re-tentando inserção de pendência sem colunas opcionais devido a erro no schema cache:', err.message);
        delete payload.tecnico_responsavel_id;
        delete payload.criado_por;

        const retry = await supabase
          .from('pendencias')
          .insert([payload])
          .select()
          .single();

        data = retry.data;
        err = retry.error;
      }

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

  const sampleEvidenceSVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="%230f172a"/><rect x="40" y="40" width="720" height="520" rx="16" fill="%231e293b" stroke="%23334155" stroke-width="2"/><circle cx="400" cy="240" r="80" fill="%2310b981" opacity="0.2"/><path d="M400 180 L440 220 L420 220 L420 280 L380 280 L380 220 L360 220 Z" fill="%2310b981"/><text x="400" y="360" font-family="sans-serif" font-size="24" font-weight="bold" fill="%23f8fafc" text-anchor="middle">Evidência de Campo RTRS</text><text x="400" y="400" font-family="sans-serif" font-size="16" fill="%2394a3b8" text-anchor="middle">Comprovante de Conformidade Ambiental e Social</text><rect x="250" y="450" width="300" height="44" rx="22" fill="%2310b981"/><text x="400" y="478" font-family="sans-serif" font-size="14" font-weight="bold" fill="%23ffffff" text-anchor="middle">Documento Verificado ✓</text></svg>`;

  const handleOpenEvidencia = (url?: string | null) => {
    const cleanUrl = cleanEvidenceUrl(url);
    if (!cleanUrl) {
      warning('Nenhum arquivo ou imagem disponível para esta evidência.');
      return;
    }

    if (isPdfEvidence(cleanUrl)) {
      setPdfAmpliado(cleanUrl);
    } else {
      setFotoAmpliada(cleanUrl);
    }
  };

  const handleRetrySync = async () => {
    if (isRetryingSync || isSyncing) return;
    setIsRetryingSync(true);
    try {
      if (syncNow) {
        await syncNow(true);
      }
      await fetchTechnicalDocuments();
      success('Sincronização iniciada com sucesso!');
    } catch (err: any) {
      console.warn('[DashboardTecnico] Erro ao sincronizar novamente:', err);
      error('Falha ao sincronizar: ' + (err?.message || 'erro de conexão'));
    } finally {
      setIsRetryingSync(false);
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

      const targetPend = propPendencias.find(p => p.id === id);
      if (targetPend) {
        await syncPendencyStatusWithRtrsAnswer(targetPend, 'Pendente');
      }

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
      const targetPend = propPendencias.find(p => p.id === id);
      const payload: any = { status: newStatus };
      if (newStatus === 'Resolvida') {
        payload.resolucao_descricao = targetPend?.resolucao_descricao || 'Resolvido in loco pelo técnico.';
      }
      const { error: err } = await supabase
        .from('pendencias')
        .update(payload)
        .eq('id', id);
      if (err) throw err;

      if (targetPend) {
        await syncPendencyStatusWithRtrsAnswer(targetPend, newStatus);
      }

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

  const isOfflineFilter = typeof navigator !== 'undefined' && !navigator.onLine;
  const filteredFarms = farmsData.features.filter(f => {
    const matchSearch = (f.properties?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.properties?.municipio || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.properties?.tecnico_nome || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.properties?.produtor || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchFilter = filterMode === 'todas' || f.properties?.isMine || isOfflineFilter;
    return matchSearch && matchFilter;
  });

  const techColorMap: Record<string, string> = {};
  allTechnicians.forEach((t, i) => { techColorMap[t.id] = getTechnicianColor(t.nome, i); });

  const filteredFarmsGeoJSON: FeatureCollection = { type: 'FeatureCollection', features: filteredFarms };

  const filteredDocs = useMemo(() => {
    return documentos.filter(doc => {
      const matchSearch = docSearchQuery === '' || 
        doc.nome.toLowerCase().includes(docSearchQuery.toLowerCase()) ||
        doc.fazendaNome.toLowerCase().includes(docSearchQuery.toLowerCase());
      const matchProp = selectedDocPropId === '' || doc.propriedade_id === selectedDocPropId;
      const matchCat = selectedDocCategoria === '' || doc.categoria === selectedDocCategoria;
      return matchSearch && matchProp && matchCat;
    });
  }, [documentos, docSearchQuery, selectedDocPropId, selectedDocCategoria]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in-up pb-8">
      {/* Header Executivo do Técnico com Motion */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 sm:p-6 rounded-3xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="inline-flex items-center gap-2 bg-[#1B7547]/10 text-[#1B7547] px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider mb-2">
            <ClipboardList className="w-3.5 h-3.5" />
            <span>Módulo Técnico de Vistorias In-Loco</span>
          </div>
          <h1 className="text-xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Portal do Técnico de Campo</h1>
          <p className="text-slate-500 mt-1 text-xs sm:text-sm font-medium">Gestão de vistorias, auditorias RTRS e acompanhamento geoespacial de fazendas.</p>
        </div>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-stretch sm:items-center gap-2 w-full md:w-auto shrink-0">
          <button
            onClick={handleOpenCreateFarmModal}
            className="group relative flex items-center justify-center gap-2 px-3 sm:px-5 py-2.5 sm:py-3 bg-gradient-to-r from-[#1B7547] to-[#15613a] hover:from-[#15613a] hover:to-[#0B3B23] text-white font-extrabold text-xs rounded-2xl shadow-md shadow-[#1B7547]/20 hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer overflow-hidden text-center"
          >
            <span className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out pointer-events-none" />
            <Plus className="w-4 h-4 transition-transform group-hover:rotate-90 duration-300" />
            <span>Cadastrar Fazenda</span>
          </button>

          <button
            onClick={() => {
              setAuditFormData({ propriedade_id: properties[0]?.id || '', data_agendamento: new Date().toISOString().split('T')[0] });
              setShowScheduleAuditModal(true);
            }}
            className="group relative flex items-center justify-center gap-2 px-3 sm:px-5 py-2.5 sm:py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-extrabold text-xs rounded-2xl shadow-md shadow-indigo-600/20 hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer overflow-hidden text-center"
          >
            <span className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out pointer-events-none" />
            <CalendarDays className="w-4 h-4 transition-transform group-hover:scale-110 duration-300" />
            <span>Iniciar Vistoria</span>
          </button>

          <div className="flex items-center justify-center gap-2 bg-slate-100 text-slate-700 px-3 sm:px-4 py-2.5 rounded-2xl text-xs font-extrabold border border-slate-200 shadow-2xs text-center">
            <CalendarDays className="w-4 h-4 text-[#1B7547]" />
            <span>Hoje, {new Date().toLocaleDateString('pt-BR')}</span>
          </div>
        </div>
      </div>

      {/* Banner Informativo do Modo Campo no Portal do Técnico */}
      {isOfflineMode && (
        <div className="bg-gradient-to-r from-amber-500/15 via-amber-600/10 to-amber-500/5 border border-amber-500/40 rounded-3xl p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-fade-in">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-amber-500/20 text-amber-900 rounded-2xl border border-amber-500/30 shrink-0">
              <WifiOff className="w-5 h-5 text-amber-800" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-xs uppercase tracking-wider text-amber-950 bg-amber-200/90 px-2.5 py-0.5 rounded-md border border-amber-300">
                  Modo Campo Ativo
                </span>
                <span className="text-xs font-extrabold text-amber-900">Operação 100% Desconectada</span>
              </div>
              <p className="text-xs text-amber-800/90 mt-1 font-medium">
                Você pode realizar visitas, responder questionários RTRS e registrar evidências fotográficas offline. Os dados serão gravados com segurança no aparelho.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <div className="text-xs font-black text-amber-900 bg-amber-100/90 px-3.5 py-2 rounded-2xl border border-amber-300 shadow-2xs flex items-center gap-2">
              <Database className="w-4 h-4 text-amber-700" />
              <span>{auditorias.length} fazendas disponíveis</span>
            </div>
          </div>
        </div>
      )}

      {/* Tabs Principais - Grid 3-colunas no Mobile (Zero Rolagem Oculta) e Segmented Bar no Desktop */}
      <div className="bg-slate-100 p-1.5 rounded-2xl border border-slate-200/80 grid grid-cols-3 sm:inline-flex sm:flex-wrap gap-1.5 sm:gap-2 shadow-2xs w-full sm:w-auto">
        <button
          type="button"
          onClick={() => setActiveTab('mapa')}
          className={`px-1.5 sm:px-5 py-2 sm:py-2.5 rounded-xl font-extrabold text-[11px] sm:text-xs transition-all duration-300 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 cursor-pointer text-center ${
            activeTab === 'mapa'
              ? 'bg-[#1B7547] text-white shadow-md shadow-[#1B7547]/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <div className="flex items-center gap-1 shrink-0">
            <MapIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="sm:hidden text-[11px] font-black">Mapa</span>
          </div>
          <span className="hidden sm:inline whitespace-nowrap">Mapa & Propriedades</span>
          <span className={`text-[9px] sm:text-[10px] px-1.5 py-0.2 rounded-full font-black ${
            activeTab === 'mapa' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
          }`}>
            {filteredFarms.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('auditorias')}
          className={`px-1.5 sm:px-5 py-2 sm:py-2.5 rounded-xl font-extrabold text-[11px] sm:text-xs transition-all duration-300 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 cursor-pointer text-center ${
            activeTab === 'auditorias'
              ? 'bg-[#1B7547] text-white shadow-md shadow-[#1B7547]/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <div className="flex items-center gap-1 shrink-0">
            <ClipboardList className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="sm:hidden text-[11px] font-black">Auditorias</span>
          </div>
          <span className="hidden sm:inline whitespace-nowrap">Auditorias & Visitas</span>
          <span className={`text-[9px] sm:text-[10px] px-1.5 py-0.2 rounded-full font-black ${
            activeTab === 'auditorias' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
          }`}>
            {auditorias.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('documentacao')}
          className={`px-1.5 sm:px-5 py-2 sm:py-2.5 rounded-xl font-extrabold text-[11px] sm:text-xs transition-all duration-300 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 cursor-pointer text-center ${
            activeTab === 'documentacao'
              ? 'bg-[#1B7547] text-white shadow-md shadow-[#1B7547]/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <div className="flex items-center gap-1 shrink-0">
            <FolderOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="sm:hidden text-[11px] font-black">Evidências</span>
          </div>
          <span className="hidden sm:inline whitespace-nowrap">Histórico de Documentação & Evidências</span>
          <span className={`text-[9px] sm:text-[10px] px-1.5 py-0.2 rounded-full font-black ${
            activeTab === 'documentacao' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
          }`}>
            {documentos.length}
          </span>
        </button>
      </div>

      {/* ====== TAB: MAPA & PROPRIEDADES COM MOTION FLUIDO ====== */}
      <div className={activeTab === 'mapa' ? 'block animate-fade-in-up duration-300' : 'hidden'}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Panel: Farm List */}
          <div className="lg:col-span-1 space-y-4">
            {/* Filter Toggle com Motion Padronizado */}
            <div className="flex gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200/80 shadow-2xs">
              <button
                onClick={() => {
                  setFilterMode('minhas');
                  setSelectedFarmId(null);
                }}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-extrabold transition-all duration-300 flex items-center justify-center gap-1.5 cursor-pointer ${
                  filterMode === 'minhas' 
                    ? 'bg-[#1B7547] text-white shadow-md shadow-[#1B7547]/20 ' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>Minhas Fazendas</span>
              </button>
              <button
                onClick={() => {
                  setFilterMode('todas');
                  setSelectedFarmId(null);
                }}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-extrabold transition-all duration-300 flex items-center justify-center gap-1.5 cursor-pointer ${
                  filterMode === 'todas' 
                    ? 'bg-[#1B7547] text-white shadow-md shadow-[#1B7547]/20 ' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Todas as Fazendas</span>
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

                        {/* Indicador de Visita Agendada ou Última Alteração */}
                        <div className="mt-2.5 pt-2 border-t border-slate-100/80 flex items-center justify-between text-[10px] text-slate-500 font-medium">
                          {props.data_agendamento ? (
                            <div className="flex items-center gap-1.5 text-slate-700 font-bold">
                              <CalendarDays className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              <span>Visita agendada:</span>
                              <span className="text-blue-700 font-black">{new Date(props.data_agendamento).toLocaleDateString('pt-BR')}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-slate-700 font-bold">
                              <Clock className="w-3.5 h-3.5 text-[#1B7547] shrink-0" />
                              <span>Última alteração:</span>
                              <span className="text-[#1B7547] font-black">{formatUltimaAlteracao(props.ultima_alteracao_at).relative}</span>
                            </div>
                          )}
                        </div>

                        {isSelected && (
                          <div className="mt-3 pt-2.5 border-t border-emerald-100 flex items-center gap-2 animate-fade-in">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const targetAudit = auditorias.find(a => (a.propriedade_id === props.id || a.propriedades?.id === props.id));
                                handleStartAuditoria(targetAudit || {
                                  id: `mock-view-${props.id}`,
                                  propriedade_id: props.id,
                                  status: props.status || 'Visita de Campo',
                                  propriedades: { id: props.id, nome_fazenda: props.name, nome_produtor: props.produtor, municipio: props.municipio }
                                }, 'resumo');
                              }}
                              className="w-full py-2 px-3 bg-gradient-to-r from-[#1B7547] to-[#15613a] hover:from-[#15613a] hover:to-[#0B3B23] text-white rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer hover:scale-102 active:scale-95"
                            >
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                              <span>Abrir Central da Fazenda & Score RTRS</span>
                            </button>
                          </div>
                        )}
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

      {/* ====== TAB: AUDITORIAS COM MOTION FLUIDO ====== */}
      <div className={activeTab === 'auditorias' ? 'block space-y-6 animate-fade-in-up duration-300' : 'hidden'}>
        {/* SUB-ABAS DAS 3 ETAPAS COM MOTION DESIGN */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => setTechnicalEtapaTab('Prospecção')}
            className={`p-5 rounded-3xl border text-left transition-all duration-300 cursor-pointer flex items-center justify-between group ${
              technicalEtapaTab === 'Prospecção'
                ? 'bg-gradient-to-br from-amber-50 to-white border-amber-300 ring-4 ring-amber-400/20 shadow-lg '
                : 'bg-white border-slate-200/80 hover:bg-slate-50 hover:shadow-md'
            }`}
          >
            <div>
              <div className="flex items-center gap-2.5">
                <span className={`w-7 h-7 rounded-2xl text-xs font-extrabold flex items-center justify-center transition-transform group-hover:scale-110 ${
                  technicalEtapaTab === 'Prospecção' ? 'bg-[#C59B27] text-white shadow-md' : 'bg-amber-100 text-amber-900'
                }`}>1</span>
                <h4 className="font-extrabold text-sm text-slate-900">1. Prospecção</h4>
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5 font-medium">Onboarding e cadastro de fazendas</p>
            </div>
            <span className="text-base font-extrabold text-[#C59B27] bg-[#C59B27]/10 px-3 py-1.5 rounded-2xl border border-[#C59B27]/20 shadow-2xs">
              {etapaCounts.prospecao}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTechnicalEtapaTab('Auditoria Prévia')}
            className={`p-5 rounded-3xl border text-left transition-all duration-300 cursor-pointer flex items-center justify-between group ${
              technicalEtapaTab === 'Auditoria Prévia'
                ? 'bg-gradient-to-br from-blue-50 to-white border-blue-300 ring-4 ring-blue-400/20 shadow-lg '
                : 'bg-white border-slate-200/80 hover:bg-slate-50 hover:shadow-md'
            }`}
          >
            <div>
              <div className="flex items-center gap-2.5">
                <span className={`w-7 h-7 rounded-2xl text-xs font-extrabold flex items-center justify-center transition-transform group-hover:scale-110 ${
                  technicalEtapaTab === 'Auditoria Prévia' ? 'bg-blue-600 text-white shadow-md' : 'bg-blue-100 text-blue-900'
                }`}>2</span>
                <h4 className="font-extrabold text-sm text-slate-900">2. Auditoria Prévia</h4>
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5 font-medium">Diagnóstico prévio e autoavaliação</p>
            </div>
            <span className="text-base font-extrabold text-blue-700 bg-blue-100/80 px-3 py-1.5 rounded-2xl border border-blue-200 shadow-2xs">
              {etapaCounts.previa}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTechnicalEtapaTab('Auditoria Oficial')}
            className={`p-5 rounded-3xl border text-left transition-all duration-300 cursor-pointer flex items-center justify-between group ${
              technicalEtapaTab === 'Auditoria Oficial'
                ? 'bg-gradient-to-br from-emerald-50 to-white border-emerald-300 ring-4 ring-emerald-400/20 shadow-lg '
                : 'bg-white border-slate-200/80 hover:bg-slate-50 hover:shadow-md'
            }`}
          >
            <div>
              <div className="flex items-center gap-2.5">
                <span className={`w-7 h-7 rounded-2xl text-xs font-extrabold flex items-center justify-center transition-transform group-hover:scale-110 ${
                  technicalEtapaTab === 'Auditoria Oficial' ? 'bg-[#1B7547] text-white shadow-md' : 'bg-emerald-100 text-emerald-900'
                }`}>3</span>
                <h4 className="font-extrabold text-sm text-slate-900">3. Auditoria Oficial</h4>
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5 font-medium">Vistoria técnica final & Certificação</p>
            </div>
            <span className="text-base font-extrabold text-[#1B7547] bg-[#1B7547]/10 px-3 py-1.5 rounded-2xl border border-[#1B7547]/20 shadow-2xs">
              {etapaCounts.oficial}
            </span>
          </button>
        </div>

                {/* Container estável com contenção de layout (Zero CLS / Zero Flicker) */}
        <div className="min-h-[520px] relative">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {loading && auditorias.length === 0 ? (
              <>
                <AuditCardSkeleton />
                <AuditCardSkeleton />
                <AuditCardSkeleton />
                <AuditCardSkeleton />
              </>
            ) : filteredAuditorias.length === 0 ? (
              <div
                className="col-span-full bg-card min-h-[360px] p-12 rounded-2xl border border-border text-center flex flex-col items-center justify-center space-y-3 animate-fade-in shadow-xs"
              >
                <ClipboardList className="w-12 h-12 text-muted-foreground mx-auto opacity-50" />
                <h3 className="text-lg font-bold text-foreground">Nenhuma auditoria nesta etapa ({technicalEtapaTab})</h3>
                <p className="text-sm text-muted-foreground max-w-md">Altere a etapa no seletor da fazenda ou cadastre uma nova prospecção para iniciar o ciclo.</p>
              </div>
            ) : (
              filteredAuditorias.map((auditoria) => {
                if (!auditoria) return null;
                const prop = Array.isArray(auditoria?.propriedades) ? auditoria.propriedades[0] : auditoria?.propriedades;
                const isMock = typeof auditoria?.id === 'string' && auditoria.id.startsWith('mock-');

                return (
                  <div
                    key={auditoria.id}
                    className="bg-card rounded-xl shadow-xs border border-border overflow-hidden hover:-translate-y-1 hover:shadow-xl hover:border-primary/20 transition-all duration-300 ease-out group flex flex-col justify-between animate-fade-in"
                  >
                    <div>
                      <div className="px-5 py-4 bg-muted/50 border-b border-border flex justify-between items-center">
                        <div className="flex items-center gap-2 text-muted-foreground font-medium text-sm">
                          <MapPin className="w-4 h-4 text-primary" />
                          <span>{resolveMunicipioFromCarOrName(prop?.codigo_car, prop?.nome_fazenda, prop?.municipio)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border ${
                            auditoria.status === 'Aguardando Aprovação' || auditoria.status === 'Em Análise' ? 'bg-amber-50 text-amber-800 border-amber-300 font-extrabold shadow-2xs' :
                            auditoria.status === 'Autoavaliação' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                            auditoria.status === 'Visita de Campo' ? 'bg-indigo-100 text-indigo-800 border-indigo-200' :
                            auditoria.status === 'Acompanhamento' ? 'bg-purple-100 text-purple-800 border-purple-200 font-semibold shadow-sm' :
                            auditoria.status === 'Certificada' ? 'bg-emerald-100 text-emerald-800 border-emerald-300 font-extrabold' :
                            'bg-emerald-50 text-emerald-800 border-emerald-200'
                          }`}>
                            {auditoria.status === 'Aguardando Aprovação' || auditoria.status === 'Em Análise' ? 'Aguardando Aprovação' : auditoria.status}
                          </span>
                        </div>
                      </div>

                      <div
                        className="p-6 cursor-pointer group/card transition-all duration-300 relative hover:bg-gradient-to-br hover:from-card hover:to-primary/5"
                        onClick={() => handleStartAuditoria(auditoria, 'resumo')}
                        title="Clique para abrir a Central da Fazenda (Resumo Score RTRS, Critérios e Ficha Cadastral)"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-extrabold text-xl text-foreground group-hover/card:text-primary transition-colors tracking-tight truncate">
                              {prop?.nome_fazenda || 'Fazenda'}
                            </h3>
                            <p className="text-sm font-medium text-muted-foreground mt-1.5 flex items-center gap-1.5">
                              Produtor: <strong className="text-foreground font-semibold">{prop?.nome_produtor || 'Não informado'}</strong>
                            </p>

                            {/* Indicadores de datas relevantes */}
                            <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-col gap-1.5 text-xs">
                              {/* Última alteração (sempre) */}
                              <div className="flex items-center gap-1.5 font-bold text-slate-600">
                                <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span>Última alteração:</span>
                                <span className="text-slate-800 font-extrabold">{formatUltimaAlteracao(auditoria.ultima_alteracao_at || auditoria.updated_at || auditoria.created_at).relative}</span>
                              </div>
                              {/* Visita agendada (quando houver) */}
                              {auditoria.data_agendamento && (
                                <div className="flex items-center gap-1.5 font-bold text-slate-600">
                                  <CalendarDays className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                  <span>Visita agendada:</span>
                                  <span className="text-blue-700 font-extrabold">{new Date(auditoria.data_agendamento).toLocaleDateString('pt-BR')}</span>
                                </div>
                              )}
                              {/* Prazo de pendência (quando houver) */}
                              {auditoria.prazo_pendencia && (
                                <div className="flex items-center gap-1.5 font-bold text-slate-600">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                  <span>Prazo pendência:</span>
                                  <span className={`font-extrabold ${new Date(auditoria.prazo_pendencia) < new Date() ? 'text-red-600' : 'text-amber-700'}`}>
                                    {new Date(auditoria.prazo_pendencia).toLocaleDateString('pt-BR')}
                                    {new Date(auditoria.prazo_pendencia) < new Date() && ' (vencido)'}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover/card:bg-primary group-hover/card:text-white group-hover/card:scale-110 group-hover/card:shadow-md transition-all duration-300" title="Ver Resumo & Ficha da Fazenda">
                            <ChevronRight className="w-5 h-5 transition-transform duration-300 group-hover/card:translate-x-0.5" />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-6 pt-0 border-t border-slate-100 mt-2 flex flex-col gap-2">
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleOpenPendencias(prop)}
                            className="group/btn flex-1 py-2.5 bg-amber-100/80 hover:bg-amber-200/80 text-amber-950 border border-amber-300/80 rounded-2xl flex items-center justify-center gap-2 font-extrabold text-xs transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer shadow-2xs"
                          >
                            <ClipboardList className="w-4 h-4 text-[#C59B27] transition-transform group-hover/btn:scale-110 duration-300" />
                            <span>Pendências</span>
                          </button>

                          {auditoria.status === 'Aguardando Aprovação' || auditoria.status === 'Em Análise' ? (
                            <button
                              onClick={() => handleStartAuditoria(auditoria, 'resumo')}
                              className="group/btn flex-1 py-2.5 bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100 rounded-2xl flex items-center justify-center gap-2 font-extrabold text-xs transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer shadow-2xs"
                            >
                              <Clock className="w-4 h-4 text-amber-600 transition-transform group-hover/btn:scale-110 duration-300" />
                              <span>Enviado ao Gestor • Ver Resumo</span>
                            </button>
                          ) : auditoria.status === 'Acompanhamento' ? (
                            <button
                              onClick={() => handleStartAuditoria(auditoria, 'resumo')}
                              className="flex-1 py-2.5 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-800 rounded-2xl flex items-center justify-center gap-2 font-extrabold text-xs shadow-2xs cursor-pointer transition-all"
                            >
                              <Clock className="w-4 h-4 text-purple-600 animate-pulse" />
                              <span>Acompanhamento • Ver Central</span>
                            </button>
                          ) : auditoria.status === 'Certificada' ? (
                            <button
                              onClick={() => handleStartAuditoria(auditoria, 'resumo')}
                              className="flex-1 py-2.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-2xl flex items-center justify-center gap-2 font-extrabold text-xs shadow-2xs cursor-pointer transition-all"
                            >
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              <span>Certificada • Ver Panorama</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleStartAuditoria(auditoria, 'criterios')}
                              className="group relative flex-1 py-2.5 bg-gradient-to-r from-[#1B7547] to-[#15613a] hover:from-[#15613a] hover:to-[#0B3B23] text-white rounded-2xl flex items-center justify-center gap-2 font-extrabold text-xs transition-all duration-300 shadow-md shadow-[#1B7547]/20 hover:shadow-xl hover:scale-105 active:scale-95 cursor-pointer overflow-hidden"
                            >
                              <span className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out pointer-events-none" />
                              <ClipboardList className="w-4 h-4 transition-transform group-hover:scale-110 duration-300" />
                              <span>Checklist RTRS (Critérios)</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Modal de Ficha Técnica Completa da Auditoria */}
        {selectedAuditForDetail && (
          <ModalErrorBoundary onClose={() => { setShowQuestionario(false); setSelectedAuditForDetail(null); }}>
            <AuditDetailModal
              isOpen={!!selectedAuditForDetail}
              onClose={() => setSelectedAuditForDetail(null)}
              auditoria={selectedAuditForDetail}
              onStartVisita={handleStartAuditoria}
              onOpenPendencias={handleOpenPendencias}
            />
          </ModalErrorBoundary>
        )}
      </div>

            {/* ====== TAB: DOCUMENTAÇÃO & EVIDÊNCIAS COM MOTION FLUIDO ====== */}
      <div className={activeTab === 'documentacao' ? 'block space-y-6 animate-fade-in-up duration-300' : 'hidden'}>
        <div className="bg-white p-4 sm:p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="inline-flex items-center gap-2 bg-[#1B7547]/10 text-[#1B7547] px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider mb-2">
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Repositório Técnico de Arquivos</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              Histórico de Documentação & Evidências
            </h2>
            <p className="text-slate-500 text-xs mt-1 font-medium">
              Central de controle de laudos, licenças, CAR, fotos e comprovantes de conformidade RTRS das propriedades.
            </p>
          </div>
        </div>

        {/* Filtros Responsivos da Documentação & Seletor de Modo de Visualização */}
        <div className="bg-white p-4 rounded-3xl border border-slate-200/80 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 shadow-xs">
          <div className="relative w-full lg:w-72">
            <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar documento, critério ou fazenda..."
              value={docSearchQuery}
              onChange={(e) => setDocSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs font-medium focus:outline-none focus:ring-4 focus:ring-[#1B7547]/15 focus:border-[#1B7547] shadow-xs transition-all"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center w-full lg:w-auto">
            <select
              value={selectedDocPropId}
              onChange={(e) => setSelectedDocPropId(e.target.value)}
              className="w-full sm:w-auto px-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs font-extrabold text-slate-800 outline-none cursor-pointer focus:ring-4 focus:ring-[#1B7547]/15 focus:border-[#1B7547] transition-all shadow-2xs"
            >
              <option value="">Todas as Minhas Fazendas</option>
              {(() => {
                const map = new Map<string, string>();
                (properties || []).forEach(p => {
                  if (p.id && p.nome_fazenda) map.set(p.id, p.nome_fazenda);
                });
                (auditorias || []).forEach(a => {
                  const p = Array.isArray(a.propriedades) ? a.propriedades[0] : a.propriedades;
                  const pId = a.propriedade_id || p?.id;
                  const pNome = p?.nome_fazenda || a.nome_fazenda;
                  if (pId && pNome && pNome !== 'Fazenda') map.set(pId, pNome);
                });
                (documentos || []).forEach(d => {
                  if (d.propriedade_id && d.fazendaNome && d.fazendaNome !== 'Fazenda' && d.fazendaNome !== 'Geral') {
                    map.set(d.propriedade_id, d.fazendaNome);
                  }
                });
                return Array.from(map.entries()).map(([id, nome]) => (
                  <option key={id} value={id}>{nome}</option>
                ));
              })()}
            </select>

            <select
              value={selectedDocCategoria}
              onChange={(e) => setSelectedDocCategoria(e.target.value)}
              className="w-full sm:w-auto px-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs font-extrabold text-slate-800 outline-none cursor-pointer focus:ring-4 focus:ring-[#1B7547]/15 focus:border-[#1B7547] transition-all shadow-2xs"
            >
              <option value="">Todas as Categorias</option>
              <option value="CAR">CAR</option>
              <option value="LAU">Licença Ambiental (LAU)</option>
              <option value="EPI">Comprovante de EPI</option>
              <option value="Checklist RTRS">Checklist RTRS</option>
              <option value="Regularização">Regularização</option>
              <option value="Outros">Outros</option>
            </select>

            {/* Seletor Segmentado de Modo de Visualização */}
            <div className="flex items-center justify-center bg-slate-100 p-1 rounded-2xl border border-slate-200/80 shadow-2xs shrink-0 self-stretch sm:self-auto">
              <button
                type="button"
                onClick={() => setDocViewMode('auto')}
                title="Modo Automático (Cards no Celular, Tabela no Desktop)"
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer ${
                  docViewMode === 'auto'
                    ? 'bg-[#1B7547] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Auto</span>
              </button>
              <button
                type="button"
                onClick={() => setDocViewMode('cards')}
                title="Visualização em Cards"
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer ${
                  docViewMode === 'cards'
                    ? 'bg-[#1B7547] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Cards</span>
              </button>
              <button
                type="button"
                onClick={() => setDocViewMode('table')}
                title="Visualização em Tabela"
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer ${
                  docViewMode === 'table'
                    ? 'bg-[#1B7547] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Table2 className="w-3.5 h-3.5" />
                <span>Tabela</span>
              </button>
            </div>
          </div>
        </div>

        {/* Container Principal de Arquivos (Cards Mobile / Tabela Desktop) */}
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
          {loadingDocs && documentos.length === 0 ? (
            <div className="py-12 text-center text-slate-500 flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-[#1B7547]" />
              <span className="text-xs font-extrabold">Carregando histórico de arquivos...</span>
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="py-12 text-center text-slate-400 font-medium">
              <FolderOpen className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="font-extrabold text-sm text-slate-700">Nenhum documento encontrado</p>
              <p className="text-xs text-slate-400 mt-1">
                {documentos.length === 0
                  ? 'Anexe comprovantes, fotos ou evidências no questionário RTRS para visualizá-los aqui.'
                  : 'Nenhum resultado corresponde aos filtros selecionados.'}
              </p>
            </div>
          ) : (
            <>
              {/* MODO BENTO CARDS (Mobile / Forçado por seletor) */}
              {(docViewMode === 'cards' || docViewMode === 'auto') && (
                <div className={docViewMode === 'cards' ? 'block' : 'block md:hidden'}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 p-3 sm:p-4">
                    {filteredDocs.map((doc) => {
                      const isPdf = !!doc.arquivo_url?.toLowerCase().includes('.pdf');
                      const isPending = !!doc.isLocalPending;
                      const isFailed = !!doc.hasError || (isPending && (connectionState as string) === 'FAILED');

                      return (
                        <div
                          key={`card-${doc.id || doc.nome}-${doc.propriedade_id}`}
                          className="rounded-xl p-4 shadow-sm border border-slate-200 bg-white flex flex-col justify-between gap-3 hover:border-slate-300 transition-colors"
                        >
                          <div className="space-y-3">
                            {/* Topo: Badges de Status de Sincronização e Categoria */}
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              {isFailed ? (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-800 border border-rose-300 shadow-2xs">
                                    <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                                    <span>Falha no envio</span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={handleRetrySync}
                                    disabled={isRetryingSync || isSyncing}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-extrabold bg-rose-100 hover:bg-rose-200 active:bg-rose-300 text-rose-900 transition-colors disabled:opacity-50 cursor-pointer"
                                    title="Tentar sincronizar novamente"
                                  >
                                    <RotateCw className={`w-3 h-3 ${(isRetryingSync || isSyncing) ? 'animate-spin' : ''}`} />
                                    <span>Tentar novamente</span>
                                  </button>
                                </div>
                              ) : isPending ? (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs shrink-0" title="Evidência salva no aparelho. Aguardando sincronização com a nuvem.">
                                    <Clock className="w-3 h-3 text-amber-700 animate-pulse shrink-0" />
                                    <span>Pendente no Celular</span>
                                  </span>
                                  {isOnline && (
                                    <button
                                      type="button"
                                      onClick={handleRetrySync}
                                      disabled={isRetryingSync || isSyncing}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-extrabold bg-amber-200/80 hover:bg-amber-300 text-amber-950 transition-colors disabled:opacity-50 cursor-pointer"
                                      title="Enviar agora para a nuvem"
                                    >
                                      <RotateCw className={`w-2.5 h-2.5 ${(isRetryingSync || isSyncing) ? 'animate-spin' : ''}`} />
                                      <span>Enviar</span>
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200/80 shadow-2xs" title="Arquivo sincronizado na nuvem">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  <span>Sincronizado</span>
                                </span>
                              )}

                              <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200/80 shadow-2xs shrink-0">
                                {doc.categoria}
                              </span>
                            </div>

                            {/* Título: Nome do Documento / Critério com leitura ampla */}
                            <h3 className="text-sm font-extrabold text-slate-900 leading-snug break-words">
                              {doc.nome}
                            </h3>

                            {/* Propriedade: Nome da fazenda com ícone MapPin */}
                            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                              <MapPin className="w-3.5 h-3.5 text-[#1B7547] shrink-0" />
                              <span className="break-words">{doc.fazendaNome}</span>
                            </div>

                            {/* Linha de Detalhes: Origem e Data de Envio */}
                            <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 font-medium gap-2 pt-2 border-t border-slate-100">
                              <span className="inline-flex items-center gap-1">
                                <span className="text-slate-400">Origem:</span>
                                <span className="font-semibold text-slate-700">{doc.origem || 'Auditoria In Loco'}</span>
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <span className="text-slate-400">Envio:</span>
                                <span className="font-semibold text-slate-700 whitespace-nowrap">
                                  {formatUltimaAlteracao(doc.data).fullDate} às {formatUltimaAlteracao(doc.data).timeStr}
                                </span>
                              </span>
                            </div>
                          </div>

                          {/* Ação: Botão Ver Imagem ou Abrir PDF com min 44px de toque */}
                          <button
                            type="button"
                            onClick={() => handleOpenEvidencia(doc.arquivo_url)}
                            className="w-full min-h-[44px] py-2.5 px-4 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-[#1B7547] border border-emerald-200/70 rounded-xl font-extrabold text-xs transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer shadow-2xs mt-1"
                          >
                            {isPdf ? (
                              <>
                                <FileText className="w-4 h-4 text-[#1B7547] shrink-0" />
                                <span>Abrir PDF</span>
                              </>
                            ) : (
                              <>
                                <ImageIcon className="w-4 h-4 text-[#1B7547] shrink-0" />
                                <span>Ver Imagem</span>
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* MODO TABELA (Desktop / Forçado por seletor) */}
              {(docViewMode === 'table' || docViewMode === 'auto') && (
                <div className={docViewMode === 'table' ? 'block' : 'hidden md:block'}>
                  {docViewMode === 'table' && (
                    <div className="md:hidden px-4 py-2 bg-slate-50 border-b border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
                      <span>Deslize horizontalmente para ver todas as colunas</span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 animate-pulse" />
                    </div>
                  )}
                  <div className="overflow-x-auto p-2 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                    <table className="w-full text-left text-xs font-medium">
                      <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-extrabold text-[10px] uppercase tracking-wider">
                        <tr>
                          <th className="px-6 py-4">Documento / Critério</th>
                          <th className="px-6 py-4">Propriedade</th>
                          <th className="px-6 py-4">Categoria</th>
                          <th className="px-6 py-4">Origem</th>
                          <th className="px-6 py-4">Data Envio</th>
                          <th className="px-6 py-4 text-center">Arquivo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredDocs.map((doc) => {
                          const isPdf = !!doc.arquivo_url?.toLowerCase().includes('.pdf');
                          const isPending = !!doc.isLocalPending;
                          const isFailed = !!doc.hasError || (isPending && (connectionState as string) === 'FAILED');

                          return (
                            <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors duration-200 group">
                              <td className="px-6 py-4 text-slate-900 font-extrabold">
                                <div className="flex flex-col gap-1">
                                  <span className="text-slate-900 font-extrabold leading-snug">{doc.nome}</span>
                                  <div className="flex items-center gap-2">
                                    {isFailed ? (
                                      <div className="flex items-center gap-1.5">
                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-800 border border-rose-300 shadow-2xs">
                                          <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                                          <span>Falha no envio</span>
                                        </span>
                                        <button
                                          type="button"
                                          onClick={handleRetrySync}
                                          disabled={isRetryingSync || isSyncing}
                                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-extrabold bg-rose-100 hover:bg-rose-200 text-rose-900 transition-colors disabled:opacity-50 cursor-pointer"
                                          title="Tentar sincronizar novamente"
                                        >
                                          <RotateCw className={`w-2.5 h-2.5 ${(isRetryingSync || isSyncing) ? 'animate-spin' : ''}`} />
                                          <span>Tentar novamente</span>
                                        </button>
                                      </div>
                                    ) : isPending ? (
                                      <div className="flex items-center gap-1.5">
                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs shrink-0" title="Evidência salva no aparelho. Aguardando sincronização com a nuvem.">
                                          <Clock className="w-3 h-3 text-amber-700 animate-pulse" />
                                          <span>Pendente no Celular</span>
                                        </span>
                                        {isOnline && (
                                          <button
                                            type="button"
                                            onClick={handleRetrySync}
                                            disabled={isRetryingSync || isSyncing}
                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-extrabold bg-amber-200/80 hover:bg-amber-300 text-amber-950 transition-colors disabled:opacity-50 cursor-pointer"
                                            title="Enviar agora para a nuvem"
                                          >
                                            <RotateCw className={`w-2.5 h-2.5 ${(isRetryingSync || isSyncing) ? 'animate-spin' : ''}`} />
                                            <span>Enviar</span>
                                          </button>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200/80 shadow-2xs shrink-0" title="Arquivo sincronizado na nuvem">
                                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                        <span>Sincronizado</span>
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-slate-700 font-bold">{doc.fazendaNome}</td>
                              <td className="px-6 py-4">
                                <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase bg-slate-100 text-slate-700 border border-slate-200/80 shadow-2xs">
                                  {doc.categoria}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-slate-500 text-xs font-medium">{doc.origem}</td>
                              <td className="px-6 py-4 text-slate-700 font-bold whitespace-nowrap">
                                <span className="text-xs text-slate-800 font-extrabold">
                                  {formatUltimaAlteracao(doc.data).fullDate} às {formatUltimaAlteracao(doc.data).timeStr}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEvidencia(doc.arquivo_url)}
                                  className="group/btn inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#1B7547]/10 hover:bg-[#1B7547]/20 text-[#1B7547] rounded-xl text-xs font-extrabold transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer"
                                >
                                  {isPdf ? (
                                    <>
                                      <FileText className="w-3.5 h-3.5 text-[#1B7547] shrink-0 transition-transform group-hover/btn:scale-110 duration-300" />
                                      <span>Abrir PDF</span>
                                    </>
                                  ) : (
                                    <>
                                      <ImageIcon className="w-3.5 h-3.5 text-[#1B7547] shrink-0 transition-transform group-hover/btn:scale-110 duration-300" />
                                      <span>Ver Imagem</span>
                                    </>
                                  )}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showQuestionario && activeAuditoria && (
        <ModalErrorBoundary onClose={() => { setShowQuestionario(false); setSelectedAuditForDetail(null); }}>
          <QuestionarioRTRS 
            modo="auditoria"
            propriedadeNome={activeAuditoria.propriedades?.nome_fazenda || "Fazenda Sol Nascente"}
            onClose={() => {
              setShowQuestionario(false);
              fetchAudits(true);
              fetchCollaborativeMapData();
              fetchTechnicalDocuments();
            }}
            onComplete={() => {
              handleComplete(activeAuditoria.id);
              fetchAudits(true);
              fetchCollaborativeMapData();
              fetchTechnicalDocuments();
            }}
            onSubmitted={(submittedId, newStatus) => {
              const nowIso = new Date().toISOString();
              setAuditorias(prev => prev.map(a =>
                (a.id === submittedId || a.id === activeAuditoria.id)
                  ? { ...a, status: newStatus, ultima_alteracao_at: nowIso }
                  : a
              ));
            }}
            auditoriaId={activeAuditoria.id}
            propriedadeId={activeAuditoria.propriedade_id || activeAuditoria.propriedades?.id}
            initialMainTab={questionarioInitialTab}
            propriedadeData={Array.isArray(activeAuditoria.propriedades) ? activeAuditoria.propriedades[0] : activeAuditoria.propriedades}
            auditoriaStatus={activeAuditoria.status}
          />
        </ModalErrorBoundary>
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

                    {(pend.status === 'Em Análise' || pend.status === 'Resolvida') && (
                      <div className="p-3 bg-indigo-50/50 rounded-lg border border-indigo-100 space-y-2">
                        <div className="text-[11px] font-bold text-indigo-950 uppercase tracking-wider">Solução Enviada pelo Produtor:</div>
                        <p className="text-xs text-indigo-900 font-medium italic">"{pend.resolucao_descricao}"</p>
                        {pend.evidencia_url && (
                          <div className="text-xs">
                            <button
                              type="button"
                              onClick={() => handleOpenEvidencia(pend.evidencia_url)}
                              className="text-indigo-700 underline font-semibold hover:text-indigo-950 flex items-center gap-1.5 cursor-pointer"
                            >
                              <Eye className="w-4 h-4 text-indigo-600 shrink-0" />
                              <span>Ver Evidência Anexada</span>
                            </button>
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
                    onCreateNew={(typedName) => {
                      setProdutorOption('novo');
                      setSelectedProdutorId('');
                      setNovoProdutorData(prev => ({ ...prev, nome: typedName }));
                    }}
                    placeholder="Digite o nome, e-mail ou telefone do produtor..."
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
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">E-mail de Contato</label>
                      <input
                        required={produtorOption === 'novo'}
                        type="email"
                        placeholder="produtor@email.com"
                        value={novoProdutorData.email || ''}
                        onChange={e => setNovoProdutorData({...novoProdutorData, email: e.target.value})}
                        className="w-full px-3 py-2 bg-background border border-input rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-transparent focus:outline-none text-foreground"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Telefone / WhatsApp</label>
                      <input
                        required={produtorOption === 'novo'}
                        type="tel"
                        placeholder="(67) 99999-9999"
                        value={novoProdutorData.telefone || ''}
                        onChange={e => setNovoProdutorData({...novoProdutorData, telefone: e.target.value})}
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

                    <div className="space-y-1 mt-3">
                      <label className="text-[10px] font-bold text-slate-600 uppercase">Área Plantada de Soja da Fazenda (ha)</label>
                      <input
                        type="number"
                        step="0.1"
                        placeholder="Ex: 850 (hectares)"
                        value={prop.area_soja_ha || ''}
                        onChange={e => {
                          const newList = [...propertiesList];
                          newList[idx] = { ...newList[idx], area_soja_ha: e.target.value };
                          setPropertiesList(newList);
                        }}
                        className="w-full px-3 py-2 bg-background border border-input rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-transparent focus:outline-none text-foreground font-medium"
                      />
                    </div>

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
                {(properties.length > 0 ? properties : auditorias.map(a => {
                  const p = Array.isArray(a.propriedades) ? a.propriedades[0] : a.propriedades;
                  return {
                    id: a.propriedade_id || p?.id || a.id,
                    nome_fazenda: p?.nome_fazenda || 'Fazenda',
                    nome_produtor: p?.nome_produtor || 'Produtor Rural'
                  };
                })).map(p => (
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

      {/* Modal Lightbox de Foto Ampliada em Portal z-[9999] */}
      {fotoAmpliada && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-fadeIn transition-all" onClick={() => setFotoAmpliada(null)}>
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center bg-slate-900/90 p-4 rounded-3xl border border-slate-700 shadow-2xl" onClick={e => e.stopPropagation()}>
            <button 
              type="button" 
              onClick={() => setFotoAmpliada(null)} 
              className="absolute -top-3 -right-3 text-white bg-slate-800 hover:bg-slate-700 p-2 rounded-full transition-all cursor-pointer shadow-xl border border-slate-600 z-10"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="relative max-h-[75vh] overflow-hidden rounded-2xl flex items-center justify-center bg-slate-950">
              <img 
                src={fotoAmpliada} 
                alt="Evidência Ampliada" 
                onError={(e) => {
                  console.warn('Erro ao renderizar imagem ampliada:', fotoAmpliada);
                }}
                className="max-w-full max-h-[75vh] object-contain rounded-xl" 
              />
            </div>

            <div className="mt-3 flex items-center justify-between w-full px-2 gap-4">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Evidência Comprovatória de Conformidade
              </span>
              {fotoAmpliada.startsWith('http') && !fotoAmpliada.includes('data:image/svg') && (
                <a 
                  href={fotoAmpliada} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="text-xs text-emerald-400 hover:text-white underline font-bold flex items-center gap-1 bg-white/10 px-3 py-1.5 rounded-full border border-white/10 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Abrir em nova guia</span>
                </a>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Viewer de PDF em Portal z-[9999] */}
      {pdfAmpliado && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-fadeIn" onClick={() => setPdfAmpliado(null)}>
          <div className="relative w-full max-w-5xl h-[88vh] flex flex-col bg-slate-900 rounded-3xl overflow-hidden border border-slate-700 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 bg-slate-800 border-b border-slate-700 text-white">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-400" />
                <span className="font-extrabold text-sm">Visualizador de Documento Evidência PDF</span>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={pdfAmpliado}
                  download="evidencia-documento.pdf"
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar PDF</span>
                </a>
                <button type="button" onClick={() => setPdfAmpliado(null)} className="text-slate-400 hover:text-white p-1.5 rounded-full hover:bg-slate-700 transition-colors cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 w-full h-full bg-slate-950">
              <iframe src={pdfAmpliado} className="w-full h-full border-none" title="Documento PDF" />
            </div>
          </div>
        </div>,
        document.body
      )}


    </div>
  );
}
