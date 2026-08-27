import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Camera, AlertCircle, X, Loader2, Image as ImageIcon, FileText, Save, ChevronLeft, ChevronRight, CloudCheck, Download, ExternalLink } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

interface QuestionarioRTRSProps {
  modo: 'autoavaliacao' | 'auditoria';
  propriedadeNome: string;
  onClose: () => void;
  onComplete: () => void;
  auditoriaId?: string;
  propriedadeId?: string;
}

interface Pergunta {
  id: string;
  secao: string;
  numero_criterio: string;
  enunciado: string;
  criterio: string;
  ponderacao: string;
  orientacao: string;
  interpretacao_nacional?: string;
  ativo?: boolean;
}

export default function QuestionarioRTRS({ modo, propriedadeNome, onClose, onComplete, auditoriaId, propriedadeId }: QuestionarioRTRSProps) {
  const { user } = useAuth();
  const { success, error, warning, info } = useToast();
  const [perguntas, setPerguntas] = useState<Pergunta[]>([]);
  const [loadingPerguntas, setLoadingPerguntas] = useState(true);
  const [respostas, setRespostas] = useState<Record<string, { conforme: boolean | null; observacao: string; evidenciaUrl: string | null }>>({});
  const [syncingDb, setSyncingDb] = useState(true);
  const [showSyncBadge, setShowSyncBadge] = useState(true);
  const [loading, setLoading] = useState(false);
  const [savingPartial, setSavingPartial] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [cameraLoadingId, setCameraLoadingId] = useState<string | null>(null);
  const [currentAuditoriaId, setCurrentAuditoriaId] = useState<string | null>(auditoriaId || null);
  const [secaoAtiva, setSecaoAtiva] = useState<string>('');
  const [expandedOrientacoes, setExpandedOrientacoes] = useState<Record<string, boolean>>({});
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);
  const [pdfAmpliado, setPdfAmpliado] = useState<string | null>(null);

  // Auto-hide do badge "Dados carregados" após 2.5s
  useEffect(() => {
    if (syncingDb) {
      setShowSyncBadge(true);
    } else {
      const timer = setTimeout(() => {
        setShowSyncBadge(false);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [syncingDb]);

  // Efeito para buscar perguntas
  useEffect(() => {
    async function fetchPerguntas() {
      const { data, error } = await supabase
        .from('perguntas_rtrs')
        .select('*')
        .eq('ativo', true);
        
      if (error) {
        console.error('Erro ao buscar perguntas', error);
      } else if (data) {
        const parseNum = (str: string) => {
          return str.split('.').map(x => {
            const match = x.match(/^(\d*)([a-zA-Z]*)$/);
            if (match) {
              const num = match[1] ? parseInt(match[1], 10) : 0;
              const char = match[2] || '';
              return [num, char];
            }
            return [0, x];
          });
        };

        const sorted = [...data].sort((a, b) => {
          const partsA = parseNum(a.numero_criterio || '');
          const partsB = parseNum(b.numero_criterio || '');
          for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
            if (partsA[i] === undefined) return -1;
            if (partsB[i] === undefined) return 1;
            const itemA = partsA[i];
            const itemB = partsB[i];
            
            const numA = typeof itemA[0] === 'number' ? itemA[0] : 0;
            const numB = typeof itemB[0] === 'number' ? itemB[0] : 0;
            const charA = typeof itemA[1] === 'string' ? itemA[1] : '';
            const charB = typeof itemB[1] === 'string' ? itemB[1] : '';
            
            if (numA !== numB) return numA - numB;
            if (charA !== charB) return charA.localeCompare(charB);
          }
          return 0;
        });

        setPerguntas(sorted);
        if (sorted.length > 0) {
          const secoes = Array.from(new Set(sorted.map(p => p.secao)));
          setSecaoAtiva(secoes[0]);
        }
      }
      setLoadingPerguntas(false);
    }
    
    fetchPerguntas();
  }, []);

  useEffect(() => {
    async function initAutoavaliacao() {
      if (modo === 'autoavaliacao' && propriedadeId && !currentAuditoriaId) {
        try {
          const { data, error } = await supabase
            .from('auditorias')
            .select('id')
            .eq('propriedade_id', propriedadeId)
            .eq('status', 'Autoavaliação')
            .limit(1);

          if (error) throw error;

          if (data && data.length > 0) {
            setCurrentAuditoriaId(data[0].id);
          } else {
            const { data: newAudit, error: createError } = await supabase
              .from('auditorias')
              .insert([{
                propriedade_id: propriedadeId,
                status: 'Autoavaliação',
                data_agendamento: new Date().toISOString()
              }])
              .select('id')
              .single();

            if (createError) throw createError;
            if (newAudit) {
              setCurrentAuditoriaId(newAudit.id);
            }
          }
        } catch (err) {
          console.error('Erro ao inicializar autoavaliação:', err);
        }
      }
    }
    initAutoavaliacao();
  }, [modo, propriedadeId, currentAuditoriaId]);

  const getCacheKey = () => {
    const cleanName = (propriedadeNome || '').split('-')[0].trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    return `rtrs_draft_${cleanName}`;
  };

  useEffect(() => {
    try {
      const localDraft = localStorage.getItem(getCacheKey());
      if (localDraft) {
        const parsed = JSON.parse(localDraft);
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          // Sanitiza qualquer URL fantasma ou quebrada do cache local
          Object.keys(parsed).forEach(k => {
            if (parsed[k]?.evidenciaUrl && (parsed[k].evidenciaUrl.includes('supabase.local') || parsed[k].evidenciaUrl.includes('1787833477963'))) {
              parsed[k].evidenciaUrl = null;
            }
          });
          setRespostas(parsed);
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar rascunho local:', e);
    }

    async function fetchExistingRespostas() {
      setSyncingDb(true);
      try {
        let targetAuditId = currentAuditoriaId;
        const cleanName = (propriedadeNome || '').split('-')[0].trim();

        if (!targetAuditId || targetAuditId.startsWith('mock-') || targetAuditId.startsWith('assigned-pend-')) {
          let targetPropId = propriedadeId;
          if (!targetPropId || targetPropId.startsWith('mock-')) {
            const { data: foundProp } = await supabase
              .from('propriedades')
              .select('id')
              .ilike('nome_fazenda', `%${cleanName}%`)
              .limit(1)
              .maybeSingle();
            if (foundProp?.id) targetPropId = foundProp.id;
          }

          if (targetPropId && !targetPropId.startsWith('mock-')) {
            const { data: existingAudit } = await supabase
              .from('auditorias')
              .select('id')
              .eq('propriedade_id', targetPropId)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (existingAudit?.id) {
              targetAuditId = existingAudit.id;
              setCurrentAuditoriaId(existingAudit.id);
            }
          }
        }

        if (targetAuditId && !targetAuditId.startsWith('mock-') && !targetAuditId.startsWith('assigned-pend-')) {
          const { data, error } = await supabase
            .from('respostas_auditoria')
            .select(`
              pergunta_id,
              conforme,
              observacoes,
              evidencia_url,
              perguntas_rtrs (
                id,
                numero_criterio
              )
            `)
            .eq('auditoria_id', targetAuditId);

          if (!error && data && data.length > 0) {
            const loadedRespostas: Record<string, { conforme: boolean | null; observacao: string; evidenciaUrl: string | null; numero_criterio?: string }> = {};
            data.forEach(r => {
              const rawObs = (r as any).observacoes || '';
              const numCrit = (r as any).perguntas_rtrs?.numero_criterio || '';
              let evUrl = r.evidencia_url;
              if (evUrl && (evUrl.includes('supabase.local') || evUrl.includes('1787833477963'))) {
                evUrl = null;
              }
              loadedRespostas[r.pergunta_id] = {
                conforme: r.conforme,
                observacao: rawObs,
                evidenciaUrl: evUrl,
                numero_criterio: numCrit
              };
            });
            setRespostas(prev => ({ ...prev, ...loadedRespostas }));
            try {
              localStorage.setItem(getCacheKey(), JSON.stringify(loadedRespostas));
            } catch (e) {}
          }
        }
      } catch (err) {
        console.error('Erro ao carregar respostas anteriores:', err);
      } finally {
        setTimeout(() => setSyncingDb(false), 400);
      }
    }
    fetchExistingRespostas();
  }, [currentAuditoriaId, propriedadeId, propriedadeNome]);

  // Reconciliação e limpeza automática de rascunhos com as perguntas ativas
  useEffect(() => {
    if (perguntas.length > 0 && Object.keys(respostas).length > 0) {
      const validMap = new Map(perguntas.map(p => [p.id, p]));
      const numMap = new Map(perguntas.map(p => [p.numero_criterio, p.id]));
      
      let needsCleanup = false;
      const sanitized: Record<string, { conforme: boolean | null; observacao: string; evidenciaUrl: string | null; numero_criterio?: string }> = {};

      Object.entries(respostas).forEach(([key, val]) => {
        if (validMap.has(key)) {
          sanitized[key] = {
            ...val,
            numero_criterio: validMap.get(key)!.numero_criterio
          };
        } else if (val && (val as any).numero_criterio && numMap.has((val as any).numero_criterio)) {
          const newId = numMap.get((val as any).numero_criterio)!;
          sanitized[newId] = {
            ...val,
            numero_criterio: (val as any).numero_criterio
          };
          needsCleanup = true;
        } else {
          // Chave órfã de IDs legados - ignora e limpa do estado
          needsCleanup = true;
        }
      });

      if (needsCleanup) {
        setRespostas(sanitized);
        try {
          localStorage.setItem(getCacheKey(), JSON.stringify(sanitized));
        } catch (e) {}
      }
    }
  }, [perguntas]);

  // Auto-sync de respostas para LocalStorage a cada alteração
  useEffect(() => {
    if (Object.keys(respostas).length > 0) {
      try {
        localStorage.setItem(getCacheKey(), JSON.stringify(respostas));
      } catch (e) {
        console.warn('Erro ao salvar rascunho local:', e);
      }
    }
  }, [respostas, propriedadeNome]);

  const touchAuditoriaTimestamp = async (activeAuditId?: string | null) => {
    const aid = activeAuditId || currentAuditoriaId;
    const nowIso = new Date().toISOString();

    // 1. Armazenamento instantâneo em LocalStorage com chave por nome da fazenda e por ID
    try {
      const cleanName = (propriedadeNome || '').split('-')[0].trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
      if (cleanName) {
        localStorage.setItem(`rtrs_last_modified_${cleanName}`, nowIso);
      }
      if (aid && !aid.startsWith('mock-') && !aid.startsWith('assigned-pend-')) {
        localStorage.setItem(`rtrs_last_modified_id_${aid}`, nowIso);
      }
    } catch (e) {}

    // 2. Persistir updated_at em tempo real no Supabase
    if (aid && !aid.startsWith('mock-') && !aid.startsWith('assigned-pend-')) {
      supabase
        .from('auditorias')
        .update({ 
          updated_at: nowIso,
          status: modo === 'autoavaliacao' ? 'Autoavaliação' : 'Em Andamento',
          ...(user?.id ? { tecnico_responsavel_id: user.id } : {})
        })
        .eq('id', aid)
        .then(({ error: aErr }) => {
          if (aErr) console.warn('Aviso ao atualizar timestamp da auditoria:', aErr);
        });

      if (propriedadeId && !propriedadeId.startsWith('mock-')) {
        supabase
          .from('propriedades')
          .update({ updated_at: nowIso })
          .eq('id', propriedadeId)
          .then(({ error: pErr }) => {
            if (pErr) console.warn('Aviso ao atualizar timestamp da propriedade:', pErr);
          });
      } else {
        supabase
          .from('auditorias')
          .select('propriedade_id')
          .eq('id', aid)
          .maybeSingle()
          .then(({ data: auditRow }) => {
            if (auditRow?.propriedade_id) {
              supabase.from('propriedades').update({ updated_at: nowIso }).eq('id', auditRow.propriedade_id).then(() => {});
            }
          });
      }
    }
  };

  const handleResposta = (id: string, conforme: boolean) => {
    const pergunta = perguntas.find(p => p.id === id);
    setRespostas(prev => {
      const next = {
        ...prev,
        [id]: { 
          ...prev[id], 
          conforme, 
          observacao: prev[id]?.observacao || '', 
          evidenciaUrl: prev[id]?.evidenciaUrl || null,
          numero_criterio: pergunta?.numero_criterio || ''
        }
      };
      try { localStorage.setItem(getCacheKey(), JSON.stringify(next)); } catch (e) {}
      return next;
    });

    getOrCreateRealAuditoriaId().then(activeId => {
      if (activeId && !activeId.startsWith('mock-') && !activeId.startsWith('assigned-pend-')) {
        supabase.from('respostas_auditoria').upsert([{
          auditoria_id: activeId,
          pergunta_id: id,
          conforme,
          observacoes: respostas[id]?.observacao || '',
          evidencia_url: respostas[id]?.evidenciaUrl || null
        }], { onConflict: 'auditoria_id,pergunta_id' }).then(({ error: err }) => {
          if (err) console.warn('Aviso no salvamento automático da resposta:', err);
        });
        touchAuditoriaTimestamp(activeId);
      }
    });
  };

  const handleObservacao = (id: string, observacao: string) => {
    const pergunta = perguntas.find(p => p.id === id);
    setRespostas(prev => {
      const next = {
        ...prev,
        [id]: { 
          ...prev[id], 
          conforme: prev[id]?.conforme ?? null, 
          observacao, 
          evidenciaUrl: prev[id]?.evidenciaUrl || null,
          numero_criterio: pergunta?.numero_criterio || ''
        }
      };
      try { localStorage.setItem(getCacheKey(), JSON.stringify(next)); } catch (e) {}
      return next;
    });

    getOrCreateRealAuditoriaId().then(activeId => {
      if (activeId && !activeId.startsWith('mock-') && !activeId.startsWith('assigned-pend-')) {
        supabase.from('respostas_auditoria').upsert([{
          auditoria_id: activeId,
          pergunta_id: id,
          conforme: respostas[id]?.conforme ?? null,
          observacoes: observacao,
          evidencia_url: respostas[id]?.evidenciaUrl || null
        }], { onConflict: 'auditoria_id,pergunta_id' }).then(({ error: err }) => {
          if (err) console.warn('Aviso no salvamento automático da observação:', err);
        });
        touchAuditoriaTimestamp(activeId);
      }
    });
  };

  const handleOpenEvidencia = (url: string) => {
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

  // Compactador leve de imagem para fallback base64 (garante < 300KB para não estourar o limite de payload do PostgREST)
  const compressImageForFallback = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const MAX_WIDTH = 1280;
          const MAX_HEIGHT = 1280;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height = Math.round((height * MAX_WIDTH) / width);
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width = Math.round((width * MAX_HEIGHT) / height);
              height = MAX_HEIGHT;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.82));
          } else {
            resolve((e.target?.result as string) || '');
          }
        };
        img.onerror = () => resolve((e.target?.result as string) || '');
        img.src = (e.target?.result as string) || '';
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  };

  const handleUploadEvidencia = async (id: string, file: File) => {
    setCameraLoadingId(id);
    try {
      const rawExt = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const fileExt = rawExt === 'jpeg' ? 'jpg' : (rawExt || 'jpg');
      const fileName = `evidencia_${currentAuditoriaId || 'temp'}_${id}_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const mimeType = file.type && file.type !== 'text/plain'
        ? file.type
        : (fileExt === 'png' ? 'image/png' : fileExt === 'pdf' ? 'application/pdf' : fileExt === 'webp' ? 'image/webp' : 'image/jpeg');

      let urlToUse = '';

      // Tenta upload para o Supabase Storage principal ('evidencias')
      try {
        const { error: uploadError } = await supabase.storage
          .from('evidencias')
          .upload(filePath, file, { 
            cacheControl: '3600', 
            upsert: true,
            contentType: mimeType 
          });

        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from('evidencias')
            .getPublicUrl(filePath);
          urlToUse = publicUrl;
        } else {
          console.warn('Upload falhou no bucket evidencias, tentando bucket secundario:', uploadError);
          const { error: secError } = await supabase.storage
            .from('documentos-e-midias')
            .upload(filePath, file, { 
              cacheControl: '3600', 
              upsert: true,
              contentType: mimeType 
            });

          if (!secError) {
            const { data: { publicUrl } } = supabase.storage
              .from('documentos-e-midias')
              .getPublicUrl(filePath);
            urlToUse = publicUrl;
          } else {
            console.warn('Upload falhou no bucket secundario:', secError);
          }
        }
      } catch (stgErr) {
        console.warn('Storage indisponível, utilizando fallback em base64 otimizado:', stgErr);
      }

      // Se ambos os storages falharem ou estiverem inacessíveis, fallback para base64 otimizado
      if (!urlToUse || urlToUse.includes('supabase.local')) {
        urlToUse = await compressImageForFallback(file);
      }

      if (urlToUse) {
        const updatedRespostas = {
          ...respostas,
          [id]: { 
            ...respostas[id], 
            conforme: respostas[id]?.conforme ?? null, 
            observacao: respostas[id]?.observacao || '', 
            evidenciaUrl: urlToUse 
          }
        };

        setRespostas(updatedRespostas);
        try {
          localStorage.setItem(getCacheKey(), JSON.stringify(updatedRespostas));
        } catch (e) {}

        // Persistir imediatamente a evidência anexada no banco de dados
        getOrCreateRealAuditoriaId().then(activeId => {
          if (activeId && !activeId.startsWith('mock-') && !activeId.startsWith('assigned-pend-')) {
            supabase.from('respostas_auditoria').upsert([{
              auditoria_id: activeId,
              pergunta_id: id,
              conforme: updatedRespostas[id].conforme,
              observacoes: updatedRespostas[id].observacao || '',
              evidencia_url: urlToUse
            }], { onConflict: 'auditoria_id,pergunta_id' }).then(({ error: err }) => {
              if (err) console.warn('Aviso no salvamento automático de evidência:', err);
            });
            touchAuditoriaTimestamp(activeId);
          }
        });

        success('Evidência enviada e salva com sucesso!');
      } else {
        error('Falha ao processar o arquivo selecionado.');
      }
    } catch (err: any) {
      console.error('Erro ao processar evidência:', err);
      error('Falha ao anexar imagem de evidência.');
    } finally {
      setCameraLoadingId(null);
    }
  };

  const handleRemoveEvidencia = (id: string) => {
    setRespostas(prev => {
      const next = {
        ...prev,
        [id]: {
          ...prev[id],
          evidenciaUrl: null
        }
      };
      try {
        localStorage.setItem(getCacheKey(), JSON.stringify(next));
      } catch (e) {}
      return next;
    });

    getOrCreateRealAuditoriaId().then(activeId => {
      if (activeId && !activeId.startsWith('mock-') && !activeId.startsWith('assigned-pend-')) {
        supabase.from('respostas_auditoria')
          .update({ evidencia_url: null })
          .eq('auditoria_id', activeId)
          .eq('pergunta_id', id)
          .then(({ error: err }) => {
            if (err) {
              console.warn('Aviso ao remover evidência do banco:', err);
            }
          });
        touchAuditoriaTimestamp(activeId);
      }
    });

    const inputEl = document.getElementById(`file-input-${id}`) as HTMLInputElement | null;
    if (inputEl) inputEl.value = '';

    info('Evidência removida com sucesso.');
  };

  const getOrCreateRealAuditoriaId = async (): Promise<string | null> => {
    let activeId = currentAuditoriaId;
    const isSynthetic = !activeId || activeId.startsWith('mock-') || activeId.startsWith('assigned-pend-');

    if (isSynthetic) {
      let targetPropId = propriedadeId;
      const cleanName = (propriedadeNome || '').split('-')[0].trim();

      if (!targetPropId || targetPropId.startsWith('mock-')) {
        const { data: foundProp } = await supabase
          .from('propriedades')
          .select('id')
          .ilike('nome_fazenda', `%${cleanName}%`)
          .limit(1)
          .maybeSingle();

        if (foundProp?.id) {
          targetPropId = foundProp.id;
        } else {
          const { data: firstProp } = await supabase
            .from('propriedades')
            .select('id')
            .limit(1)
            .maybeSingle();
          if (firstProp?.id) targetPropId = firstProp.id;
        }
      }

      if (targetPropId && !targetPropId.startsWith('mock-')) {
        try {
          const { data: existingAudit } = await supabase
            .from('auditorias')
            .select('id')
            .eq('propriedade_id', targetPropId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (existingAudit?.id) {
            activeId = existingAudit.id;
            setCurrentAuditoriaId(existingAudit.id);
          } else {
            const { data: newAudit, error: createError } = await supabase
              .from('auditorias')
              .insert([{
                propriedade_id: targetPropId,
                tecnico_responsavel_id: user?.id || null,
                status: modo === 'autoavaliacao' ? 'Autoavaliação' : 'Em Andamento',
                data_agendamento: new Date().toISOString()
              }])
              .select('id')
              .single();

            if (!createError && newAudit?.id) {
              activeId = newAudit.id;
              setCurrentAuditoriaId(newAudit.id);
            }
          }
        } catch (err) {
          console.error('Erro ao resolver/criar auditoria real:', err);
        }
      }
    }

    return activeId;
  };

  const handleSavePartial = async () => {
    const answeredIds = Object.keys(respostas).filter(id => respostas[id]?.conforme !== null && respostas[id]?.conforme !== undefined);
    if (answeredIds.length === 0) {
      warning('Responda ao menos um indicador para salvar o rascunho.');
      return;
    }

    // Salva imediatamente no LocalStorage para garantir persistência instantânea
    try {
      localStorage.setItem(getCacheKey(), JSON.stringify(respostas));
    } catch (e) {}

    setSavingPartial(true);
    try {
      const activeId = await getOrCreateRealAuditoriaId();

      if (!activeId || activeId.startsWith('mock-') || activeId.startsWith('assigned-pend-')) {
        throw new Error('Não foi possível registrar ou vincular um ID de auditoria válido no banco de dados.');
      }

      const insertPayload = answeredIds.map(id => ({
        auditoria_id: activeId,
        pergunta_id: id,
        conforme: respostas[id].conforme,
        observacoes: respostas[id].observacao || '',
        evidencia_url: respostas[id].evidenciaUrl || null
      }));

      const { error: upsertError } = await supabase
        .from('respostas_auditoria')
        .upsert(insertPayload, { onConflict: 'auditoria_id,pergunta_id' });

      if (upsertError) {
        console.error('Erro de upsert em respostas_auditoria:', upsertError);
        throw upsertError;
      }

      if (modo === 'auditoria') {
        await supabase
          .from('auditorias')
          .update({ 
            status: 'Em Andamento',
            updated_at: new Date().toISOString(),
            ...(user?.id ? { tecnico_responsavel_id: user.id } : {})
          })
          .eq('id', activeId);
      }
      touchAuditoriaTimestamp(activeId);

      const timeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      setLastSavedTime(timeStr);
      success(`Rascunho salvo com sucesso no banco às ${timeStr}! Você pode continuar depois.`);
    } catch (err: any) {
      console.error('Erro ao salvar rascunho:', err);
      error('Falha ao salvar rascunho no banco de dados: ' + (err.message || 'Erro de conexão'));
    } finally {
      setSavingPartial(false);
    }
  };

  const handleSubmit = async () => {
    const todasRespondidas = perguntas.every(p => respostas[p.id]?.conforme !== undefined && respostas[p.id]?.conforme !== null);
    if (!todasRespondidas) {
      warning("Responda todas as perguntas antes de finalizar a auditoria.");
      return;
    }

    setLoading(true);

    try {
      const activeId = await getOrCreateRealAuditoriaId();
      if (!activeId || activeId.startsWith('mock-') || activeId.startsWith('assigned-pend-')) {
        throw new Error('Não foi possível registrar um ID de auditoria válido no banco de dados.');
      }

      const insertPayload = perguntas.map(p => ({
        auditoria_id: activeId,
        pergunta_id: p.id,
        conforme: respostas[p.id]?.conforme || false,
        observacoes: respostas[p.id]?.observacao || '',
        evidencia_url: respostas[p.id]?.evidenciaUrl || null
      }));

      const { error: upsertError } = await supabase
        .from('respostas_auditoria')
        .upsert(insertPayload, { onConflict: 'auditoria_id,pergunta_id' });

      if (upsertError) throw upsertError;

      const naoConformes = perguntas.filter(p => respostas[p.id]?.conforme === false);
      if (naoConformes.length > 0) {
        let finalPropId = propriedadeId;
        if (!finalPropId || finalPropId.startsWith('mock-')) {
          const { data: auditData } = await supabase
            .from('auditorias')
            .select('propriedade_id')
            .eq('id', activeId)
            .single();
          finalPropId = auditData?.propriedade_id;
        }

        if (finalPropId) {
          const pendsPayload = naoConformes.map(p => ({
            propriedade_id: finalPropId,
            auditoria_id: activeId,
            titulo: `Não conformidade - Critério ${p.numero_criterio}`,
            descricao: `Ação necessária para atender ao critério ${p.numero_criterio}: "${p.enunciado}". Observação registrada: ${respostas[p.id]?.observacao || 'Nenhuma'}`,
            gravidade: p.ponderacao === 'Imediata' ? 'Alta' : p.ponderacao === 'Curto Prazo' ? 'Média' : 'Baixa',
            status: 'Pendente',
            prazo: p.ponderacao === 'Imediata' ? new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0] : new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0]
          }));

          await supabase
            .from('pendencias')
            .upsert(pendsPayload, { onConflict: 'auditoria_id,titulo' });
        }
      }

      const nextStatus = modo === 'autoavaliacao' ? 'Concluída' : 'Aguardando Aprovação';
      await supabase
        .from('auditorias')
        .update({ 
          status: nextStatus,
          data_realizacao: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', activeId);

      touchAuditoriaTimestamp(activeId);

      success(modo === 'autoavaliacao' ? 'Autoavaliação concluída com sucesso!' : 'Relatório de Auditoria submetido com sucesso!');
      onComplete();
    } catch (err: any) {
      console.error('Erro ao salvar auditoria:', err);
      error('Erro ao salvar auditoria no banco: ' + (err.message || 'Erro de conexão'));
    } finally {
      setLoading(false);
    }
  };

  const secoesUnicas = Array.from(new Set(perguntas.map(p => p.secao)));
  const perguntasFiltradas = perguntas.filter(p => p.secao === secaoAtiva);

  const totalPerguntas = perguntas.length;
  const totalRespondidas = perguntas.filter(p => {
    const r = respostas[p.id];
    return r && r.conforme !== null && r.conforme !== undefined;
  }).length;
  const percentualConcluido = totalPerguntas > 0 ? Math.round((totalRespondidas / totalPerguntas) * 100) : 0;

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-center items-center p-0 sm:p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-slate-50 w-full max-w-4xl h-full sm:h-auto sm:max-h-[92vh] rounded-none sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden border-0 sm:border sm:border-emerald-100">
        
        {/* Cabeçalho do Modal */}
        <div className="bg-emerald-800 text-white px-3 py-2 sm:px-6 sm:py-3.5 flex items-center justify-between shrink-0 shadow-sm">
          <div className="min-w-0 flex-1 pr-2">
            <span className="text-[9px] sm:text-[10px] font-extrabold tracking-wider text-emerald-200 uppercase bg-emerald-900/60 px-2 py-0.5 rounded border border-emerald-700/50">
              {modo === 'autoavaliacao' ? 'Autoavaliação do Produtor' : 'Auditoria In Loco'}
            </span>
            <h2 className="text-sm sm:text-xl font-black text-white mt-0.5 leading-tight truncate">{propriedadeNome}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 sm:p-2 hover:bg-emerald-700/60 rounded-xl transition-colors text-emerald-100 hover:text-white cursor-pointer shrink-0">
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Banner em Destaque do Princípio Ativo (Compacto no Mobile) */}
        {secaoAtiva && (
          <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-900 text-white p-2.5 sm:p-5 shrink-0 border-b border-emerald-700 shadow-md">
            <div className="flex flex-row items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider bg-emerald-700/80 text-emerald-100 px-2 py-0.5 rounded border border-emerald-600/50 shadow-xs">
                    P{secoesUnicas.indexOf(secaoAtiva) + 1} de {secoesUnicas.length}
                  </span>
                  <span className="text-[9px] sm:text-[11px] font-extrabold text-emerald-200 bg-black/20 px-2 py-0.5 rounded border border-white/10">
                    {perguntas.filter(p => p.secao === secaoAtiva && respostas[p.id]?.conforme !== null && respostas[p.id]?.conforme !== undefined).length}/{perguntas.filter(p => p.secao === secaoAtiva).length} respondidos
                  </span>
                </div>
                <h3 className="text-xs sm:text-xl font-black text-white leading-snug tracking-tight truncate mt-0.5 sm:mt-1">
                  {secaoAtiva}
                </h3>
              </div>

              {/* Botões de Navegação entre Princípios */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const idx = secoesUnicas.indexOf(secaoAtiva);
                    if (idx > 0) setSecaoAtiva(secoesUnicas[idx - 1]);
                  }}
                  disabled={secoesUnicas.indexOf(secaoAtiva) <= 0}
                  className="px-2 py-1.5 sm:px-3.5 sm:py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg sm:rounded-xl text-xs font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1 border border-white/10"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Anterior</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const idx = secoesUnicas.indexOf(secaoAtiva);
                    if (idx < secoesUnicas.length - 1) setSecaoAtiva(secoesUnicas[idx + 1]);
                  }}
                  disabled={secoesUnicas.indexOf(secaoAtiva) >= secoesUnicas.length - 1}
                  className="px-2.5 py-1.5 sm:px-4 sm:py-2 bg-emerald-400 hover:bg-emerald-300 text-emerald-950 font-black rounded-lg sm:rounded-xl text-xs transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1 shadow-md"
                >
                  <span className="hidden sm:inline">Próximo</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tabs de Seleção Rápida dos 5 Princípios */}
        <div className="bg-slate-100 border-b border-slate-200 px-2 py-1.5 sm:px-4 sm:py-2.5 shrink-0 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          {secoesUnicas.map((secao, idx) => {
            const isSelected = secaoAtiva === secao;
            const countSec = perguntas.filter(p => p.secao === secao).length;
            const countResp = perguntas.filter(p => p.secao === secao && respostas[p.id]?.conforme !== null && respostas[p.id]?.conforme !== undefined).length;
            const isDone = countSec > 0 && countResp === countSec;

            const shortTitles: Record<number, string> = {
              1: 'Legislação',
              2: 'Trabalhista',
              3: 'Comunidade',
              4: 'Meio Ambiente',
              5: 'Boas Práticas'
            };
            const shortName = shortTitles[idx + 1] || `P${idx + 1}`;

            return (
              <button
                key={secao}
                type="button"
                onClick={() => setSecaoAtiva(secao)}
                className={`px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 border ${
                  isSelected
                    ? 'bg-emerald-800 text-white border-emerald-800 shadow-sm ring-2 ring-emerald-600/30'
                    : isDone
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-200/80'
                }`}
              >
                <span className={`w-4 h-4 sm:w-5 sm:h-5 rounded-md sm:rounded-lg flex items-center justify-center text-[9px] sm:text-[10px] font-black ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {idx + 1}
                </span>
                <span className="font-extrabold whitespace-nowrap">{shortName}</span>
                {isDone ? (
                  <CheckCircle2 className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${isSelected ? 'text-emerald-300' : 'text-emerald-600'}`} />
                ) : (
                  <span className={`text-[9px] sm:text-[10px] px-1 py-0.2 rounded font-black ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {countResp}/{countSec}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Barra de Progresso e Status de Sincronização */}
        <div className="bg-emerald-50/80 px-3 py-1.5 sm:px-6 sm:py-2.5 border-b border-emerald-100 flex items-center justify-between gap-2 text-[11px] sm:text-xs shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold text-emerald-900 flex items-center gap-1 shrink-0">
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-600 animate-pulse" />
              Progresso
            </span>

            {showSyncBadge && (
              syncingDb ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] sm:text-[11px] font-extrabold border border-emerald-300 animate-pulse shrink-0">
                  <Loader2 className="w-3 h-3 animate-spin text-emerald-700" />
                  <span className="hidden sm:inline">Carregando...</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white text-emerald-800 text-[10px] sm:text-[11px] font-bold border border-emerald-200 shrink-0">
                  <CloudCheck className="w-3 h-3 text-emerald-600" />
                  <span className="hidden sm:inline">Dados carregados</span>
                </span>
              )
            )}
          </div>

          <div className="flex items-center gap-2 w-28 sm:w-1/3 sm:max-w-xs shrink-0">
            <div className="w-full bg-emerald-200/60 h-2 sm:h-2.5 rounded-full overflow-hidden p-0.5 border border-emerald-200">
              <div className="bg-gradient-to-r from-emerald-600 to-teal-500 h-full transition-all duration-500 rounded-full" style={{ width: `${percentualConcluido}%` }} />
            </div>
            <span className="font-black text-emerald-800 min-w-[30px] text-right text-[11px] sm:text-xs">{percentualConcluido}%</span>
          </div>
        </div>

        {/* Lista de Perguntas do Princípio (Área Principal com Espaço Maximizado) */}
        <div className="flex-1 overflow-y-auto p-2.5 sm:p-6 space-y-3 sm:space-y-6">
          {loadingPerguntas || (syncingDb && Object.keys(respostas).length === 0) ? (
            <div className="py-6 space-y-4">
              <div className="flex items-center justify-center gap-3 text-emerald-800 bg-emerald-50/90 p-4 rounded-xl border border-emerald-200/80 animate-pulse shadow-xs">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                <span className="text-sm font-extrabold tracking-wide">Carregando questionário e dados da auditoria...</span>
              </div>

              {[1, 2].map((n) => (
                <div key={n} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 animate-pulse shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="h-5 bg-slate-200 rounded-lg w-28" />
                    <div className="h-4 bg-emerald-100 rounded-full w-20" />
                  </div>
                  <div className="h-4 bg-slate-200 rounded-md w-4/5" />
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="h-10 bg-slate-100 rounded-xl border border-slate-200" />
                    <div className="h-10 bg-slate-100 rounded-xl border border-slate-200" />
                  </div>
                </div>
              ))}
            </div>
          ) : perguntasFiltradas.length === 0 ? (
            <div className="py-16 text-center text-gray-500 font-medium">Nenhum critério nesta seção.</div>
          ) : (
            perguntasFiltradas.map((pergunta) => {
              const resposta = respostas[pergunta.id];
              const isConforme = resposta?.conforme === true;
              const isNaoConforme = resposta?.conforme === false;

              return (
                <div key={pergunta.id} className={`bg-white rounded-xl sm:rounded-2xl border p-3.5 sm:p-5 transition-all shadow-sm ${isConforme ? 'border-emerald-300 ring-1 ring-emerald-100 bg-emerald-50/10' : isNaoConforme ? 'border-red-300 ring-1 ring-red-100 bg-red-50/10' : 'border-gray-200 hover:border-emerald-200'}`}>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] sm:text-xs font-black text-white bg-slate-800 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md sm:rounded-lg">Indicador {pergunta.numero_criterio}</span>
                        <span className={`text-[9px] sm:text-[10px] font-extrabold px-1.5 py-0.5 rounded ${pergunta.ponderacao === 'Imediata' ? 'bg-red-100 text-red-700 border border-red-200' : pergunta.ponderacao === 'Curto Prazo' ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-blue-100 text-blue-800 border border-blue-200'}`}>
                          {pergunta.ponderacao}
                        </span>
                      </div>
                    </div>
                    
                    <h3 className="text-xs sm:text-base font-bold text-gray-900 leading-snug">{pergunta.enunciado || pergunta.criterio}</h3>
                    
                    {(() => {
                      const parseOrientacoes = (orientacao?: string, interpretacao_nacional?: string) => {
                        let nat = (interpretacao_nacional || '').trim();
                        let ori = (orientacao || '').trim();

                        if (!nat && ori.includes('[INTERPRETAÇÃO NACIONAL - BRASIL]')) {
                          const parts = ori.split('[DIRETRIZES GERAIS]');
                          const natPart = parts[0].replace('[INTERPRETAÇÃO NACIONAL - BRASIL]', '').trim();
                          const genPart = parts[1] ? parts[1].trim() : '';
                          nat = natPart;
                          ori = genPart;
                        }

                        return {
                          interpretacaoNacional: nat,
                          orientacaoGeral: ori
                        };
                      };

                      const { interpretacaoNacional, orientacaoGeral } = parseOrientacoes(pergunta.orientacao, pergunta.interpretacao_nacional);
                      if (!interpretacaoNacional && !orientacaoGeral) return null;

                      return (
                        <div className="bg-slate-50 rounded-lg sm:rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                          <button 
                            type="button" 
                            onClick={() => setExpandedOrientacoes(prev => ({ ...prev, [pergunta.id]: !prev[pergunta.id] }))} 
                            className="w-full px-3 py-2 sm:px-4 sm:py-2.5 text-left text-xs font-bold text-slate-700 flex items-center justify-between hover:bg-slate-100/80 transition-colors cursor-pointer"
                          >
                            <span className="text-emerald-800 font-extrabold uppercase tracking-wide text-[11px]">
                              {expandedOrientacoes[pergunta.id] ? 'Ocultar Orientação' : 'Ver Orientação / Diretrizes'}
                            </span>
                            <span className="text-slate-400 font-extrabold text-sm">{expandedOrientacoes[pergunta.id] ? '−' : '+'}</span>
                          </button>
                          {expandedOrientacoes[pergunta.id] && (
                            <div className="px-3 py-3 sm:px-4 sm:py-3 space-y-2.5 border-t border-slate-200 bg-white">
                              {interpretacaoNacional && (
                                <div className="bg-gradient-to-br from-amber-50/90 to-amber-50/40 border border-amber-200/90 rounded-lg p-2.5 sm:p-3 shadow-2xs">
                                  <div className="flex items-center gap-1.5 text-[10px] font-black text-amber-900 uppercase tracking-wider mb-1">
                                    <span>🇧🇷</span>
                                    <span>Orientações para as Interpretações Nacionais (Brasil)</span>
                                  </div>
                                  <p className="text-[11px] sm:text-xs text-amber-950 leading-relaxed font-medium whitespace-pre-line">
                                    {interpretacaoNacional}
                                  </p>
                                </div>
                              )}
                              {orientacaoGeral && (
                                <div className="bg-slate-50/70 border border-slate-200/70 rounded-lg p-2.5 sm:p-3 shadow-2xs">
                                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                                    <span>📋</span>
                                    <span>Diretrizes e Orientações Gerais</span>
                                  </div>
                                  <p className="text-[11px] sm:text-xs text-slate-700 leading-relaxed font-medium whitespace-pre-line">
                                    {orientacaoGeral}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    
                    <div className="grid grid-cols-2 gap-2 sm:gap-3 pt-1">
                      <button type="button" onClick={() => handleResposta(pergunta.id, true)} className={`py-2.5 px-2 sm:py-3 sm:px-4 rounded-xl font-extrabold text-[11px] sm:text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${isConforme ? 'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-600 ring-offset-1' : 'bg-white border-2 border-emerald-200 text-emerald-800 hover:bg-emerald-50'}`}>
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>Sim, Conforme</span>
                      </button>
                      <button type="button" onClick={() => handleResposta(pergunta.id, false)} className={`py-2.5 px-2 sm:py-3 sm:px-4 rounded-xl font-extrabold text-[11px] sm:text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${isNaoConforme ? 'bg-red-600 text-white shadow-md ring-2 ring-red-600 ring-offset-1' : 'bg-white border-2 border-red-200 text-red-800 hover:bg-red-50'}`}>
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>Não Conforme</span>
                      </button>
                    </div>

                    {resposta?.conforme !== null && resposta?.conforme !== undefined && (
                      <div className="mt-1 pt-3 border-t border-gray-100 space-y-2.5 animate-fadeIn">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">Observações do Inspetor</label>
                          <textarea rows={2} value={resposta?.observacao || ''} onChange={(e) => handleObservacao(pergunta.id, e.target.value)} placeholder="Detalhe as condições observadas..." className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all" />
                        </div>
                        
                        <div>
                          {cameraLoadingId === pergunta.id ? (
                            <div className="flex items-center gap-2.5 bg-amber-50 p-2.5 rounded-xl border border-amber-200 shadow-sm animate-pulse">
                              <Loader2 className="w-4 h-4 animate-spin text-amber-600 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-amber-900">Sincronizando arquivo na nuvem...</p>
                                <p className="text-[10px] text-amber-700">Aguarde o término do envio antes de prosseguir.</p>
                              </div>
                            </div>
                          ) : !resposta?.evidenciaUrl ? (
                            <div>
                              <input 
                                type="file" 
                                id={`file-input-${pergunta.id}`} 
                                accept="image/png,image/jpeg,image/jpg,image/webp,image/*,application/pdf" 
                                className="hidden" 
                                onChange={(e) => { 
                                  const file = e.target.files?.[0]; 
                                  if (file) handleUploadEvidencia(pergunta.id, file); 
                                  e.target.value = '';
                                }} 
                              />
                              <button type="button" onClick={() => document.getElementById(`file-input-${pergunta.id}`)?.click()} className="w-full flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-emerald-300 bg-emerald-50/50 text-emerald-700 rounded-xl hover:bg-emerald-100 hover:border-emerald-400 transition-all font-bold cursor-pointer text-xs">
                                <Camera className="w-4 h-4 text-emerald-600 shrink-0" />
                                <span>{modo === 'autoavaliacao' ? 'Enviar Evidência (PNG, JPEG ou PDF)' : 'Tirar Foto / Enviar Evidência (PNG, JPEG ou PDF)'}</span>
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2.5 bg-white p-2.5 rounded-xl border border-emerald-200 shadow-sm">
                              <div className="bg-emerald-100 rounded-lg overflow-hidden w-9 h-9 flex items-center justify-center shrink-0 cursor-pointer hover:opacity-85 transition-opacity border border-emerald-200" onClick={() => handleOpenEvidencia(resposta.evidenciaUrl!)}>
                                {resposta.evidenciaUrl.toLowerCase().includes('.pdf') ? (
                                  <FileText className="w-4 h-4 text-emerald-700" />
                                ) : (
                                  <img 
                                    src={resposta.evidenciaUrl} 
                                    alt="Evidência" 
                                    className="w-full h-full object-cover" 
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                      const parent = e.currentTarget.parentElement;
                                      if (parent && !parent.querySelector('.broken-indicator')) {
                                        parent.classList.add('bg-amber-50');
                                        const indicator = document.createElement('span');
                                        indicator.className = 'broken-indicator text-[10px] font-extrabold text-amber-700';
                                        indicator.innerText = 'FOTO';
                                        parent.appendChild(indicator);
                                      }
                                    }}
                                  />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-gray-900 truncate">Evidência Anexada</p>
                                <button type="button" onClick={() => handleOpenEvidencia(resposta.evidenciaUrl!)} className="text-[10px] text-emerald-700 underline font-bold hover:text-emerald-900 cursor-pointer block mt-0.5 text-left">Ver Arquivo Enviado</button>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                <button type="button" title="Remover e anexar novamente" onClick={() => handleRemoveEvidencia(pergunta.id)} className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded-lg hover:bg-red-50 cursor-pointer"><X className="w-4 h-4" /></button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Rodapé Profissional com Salvamento Parcial / Rascunho e Submissão */}
        <div className="px-3 py-2.5 sm:px-6 sm:py-4 bg-white border-t border-slate-200 shrink-0 flex flex-row items-center justify-between gap-2">
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
            <Save className="w-4 h-4 text-emerald-600" />
            <span>
              {lastSavedTime ? `Rascunho salvo às ${lastSavedTime}` : 'Você pode salvar parcialmente e continuar depois'}
            </span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleSavePartial}
              disabled={savingPartial || loading}
              className="flex-1 sm:flex-none px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl font-extrabold text-xs sm:text-sm border border-slate-200/80 transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer shadow-2xs flex items-center justify-center gap-2"
            >
              {savingPartial ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#1B7547]" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 text-[#1B7547] shrink-0" />
                  <span>Salvar Rascunho</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || savingPartial || loadingPerguntas || perguntas.length === 0}
              className="group relative flex-1 sm:flex-none px-6 py-3 bg-gradient-to-r from-[#1B7547] to-[#15613a] hover:from-[#15613a] hover:to-[#0B3B23] text-white rounded-2xl font-extrabold text-xs sm:text-sm shadow-md shadow-[#1B7547]/20 hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-300 flex justify-center items-center gap-2 disabled:opacity-60 cursor-pointer overflow-hidden"
            >
              <span className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out pointer-events-none" />
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                  <span>Submetendo Vistoria...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-300 shrink-0 transition-transform group-hover:scale-110 duration-300" />
                  <span>Submeter Vistoria RTRS</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Modal Lightbox de Foto Ampliada */}
      {fotoAmpliada && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-fadeIn transition-all" onClick={() => setFotoAmpliada(null)}>
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
            <button onClick={() => setFotoAmpliada(null)} className="absolute -top-10 right-0 text-white bg-black/50 hover:bg-black/70 p-2 rounded-full transition-all cursor-pointer shadow-md"><X className="w-6 h-6" /></button>
            <img 
              src={fotoAmpliada} 
              alt="Evidência Ampliada" 
              className="max-w-full max-h-[85vh] rounded-xl shadow-2xl object-contain border border-slate-700/60 bg-slate-900/40" 
              onError={(e) => {
                const target = e.currentTarget;
                target.style.display = 'none';
                const parent = target.parentElement;
                if (parent && !parent.querySelector('.img-error-card')) {
                  const card = document.createElement('div');
                  card.className = 'img-error-card bg-slate-900/95 border border-red-500/50 p-6 rounded-2xl text-center max-w-sm text-white shadow-2xl';
                  card.innerHTML = '<p class="font-bold text-red-400 text-sm mb-1">Evidência Indisponível</p><p class="text-xs text-slate-300">Não foi possível carregar a imagem selecionada. Remova e anexe novamente pelo questionário.</p>';
                  parent.appendChild(card);
                }
              }}
            />
            {fotoAmpliada.startsWith('http') && <a href={fotoAmpliada} target="_blank" rel="noreferrer" className="mt-3 text-xs text-emerald-300 underline font-bold hover:text-white flex items-center gap-1 bg-black/40 px-3 py-1 rounded-full border border-white/10"><ExternalLink className="w-3.5 h-3.5" /><span>Abrir em nova guia</span></a>}
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
    </div>,
    document.body
  );
}
