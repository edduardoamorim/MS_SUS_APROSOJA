import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Camera, AlertCircle, X, Loader2, Image as ImageIcon, FileText, Save, ChevronLeft, ChevronRight, CloudCheck } from 'lucide-react';
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
  ativo?: boolean;
}

export default function QuestionarioRTRS({ modo, propriedadeNome, onClose, onComplete, auditoriaId, propriedadeId }: QuestionarioRTRSProps) {
  const { user } = useAuth();
  const { success, error, warning } = useToast();
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
        .select('id, secao, numero_criterio, enunciado, criterio, ponderacao, orientacao, ativo')
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
            .select('*')
            .eq('auditoria_id', targetAuditId);

          if (!error && data && data.length > 0) {
            const loadedRespostas: Record<string, { conforme: boolean | null; observacao: string; evidenciaUrl: string | null }> = {};
            data.forEach(r => {
              const rawObs = (r as any).observacoes || (r as any).observacao || '';
              loadedRespostas[r.pergunta_id] = {
                conforme: r.conforme,
                observacao: rawObs,
                evidenciaUrl: r.evidencia_url
              };
            });
            setRespostas(prev => ({ ...loadedRespostas, ...prev }));
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

  const handleResposta = (id: string, conforme: boolean) => {
    setRespostas(prev => {
      const next = {
        ...prev,
        [id]: { ...prev[id], conforme, observacao: prev[id]?.observacao || '', evidenciaUrl: prev[id]?.evidenciaUrl || null }
      };
      try { localStorage.setItem(getCacheKey(), JSON.stringify(next)); } catch (e) {}
      return next;
    });
  };

  const handleObservacao = (id: string, observacao: string) => {
    setRespostas(prev => {
      const next = {
        ...prev,
        [id]: { ...prev[id], conforme: prev[id]?.conforme ?? null, observacao, evidenciaUrl: prev[id]?.evidenciaUrl || null }
      };
      try { localStorage.setItem(getCacheKey(), JSON.stringify(next)); } catch (e) {}
      return next;
    });
  };

  const handleOpenEvidencia = (url: string) => {
    if (!url) return;
    if (url.toLowerCase().includes('.pdf') || url.startsWith('data:application/pdf')) {
      if (url.startsWith('data:')) {
        const win = window.open('');
        if (win) {
          win.document.write(`
            <!DOCTYPE html>
            <html>
              <head><title>Visualizar Evidência PDF</title></head>
              <body style="margin:0; height:100vh;">
                <iframe src="${url}" style="width:100vw; height:100vh; border:none;"></iframe>
              </body>
            </html>
          `);
        }
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } else {
      setFotoAmpliada(url);
    }
  };

  const handleUploadEvidencia = async (id: string, file: File) => {
    setCameraLoadingId(id);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `evidencia_${currentAuditoriaId || 'temp'}_${id}_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      let urlToUse = '';

      try {
        const { error: uploadError } = await supabase.storage
          .from('evidencias')
          .upload(filePath, file, { cacheControl: '3600', upsert: true });

        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from('evidencias')
            .getPublicUrl(filePath);
          urlToUse = publicUrl;
        } else {
          console.warn('Upload storage falhou, tentando converter arquivo localmente:', uploadError);
        }
      } catch (stgErr) {
        console.warn('Exceção ao enviar para storage:', stgErr);
      }

      if (!urlToUse) {
        urlToUse = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve((e.target?.result as string) || '');
          reader.readAsDataURL(file);
        });
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
              observacao: updatedRespostas[id].observacao || '',
              evidencia_url: urlToUse
            }], { onConflict: 'auditoria_id,pergunta_id' }).then(({ error: err }) => {
              if (err) console.warn('Aviso no salvamento automático de evidência:', err);
            });
          }
        });

        success('Evidência enviada e salva com sucesso!');
      }
    } catch (err: any) {
      console.error('Erro ao processar evidência:', err);
      error('Falha ao anexar imagem de evidência.');
    } finally {
      setCameraLoadingId(null);
    }
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
        observacao: respostas[id].observacao || '',
        evidencia_url: respostas[id].evidenciaUrl || null
      }));

      let { error: upsertError } = await supabase
        .from('respostas_auditoria')
        .upsert(insertPayload, { onConflict: 'auditoria_id,pergunta_id' });

      if (upsertError && upsertError.message?.includes('observacao')) {
        const fallbackPayload = insertPayload.map(({ observacao, ...rest }) => rest);
        const { error: fallbackError } = await supabase
          .from('respostas_auditoria')
          .upsert(fallbackPayload, { onConflict: 'auditoria_id,pergunta_id' });
        upsertError = fallbackError;
      }

      if (upsertError) {
        console.error('Erro de upsert em respostas_auditoria:', upsertError);
        throw upsertError;
      }

      if (modo === 'auditoria') {
        await supabase
          .from('auditorias')
          .update({ 
            status: 'Em Andamento',
            ...(user?.id ? { tecnico_responsavel_id: user.id } : {})
          })
          .eq('id', activeId);
      }

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
        observacao: respostas[p.id]?.observacao || '',
        evidencia_url: respostas[p.id]?.evidenciaUrl || null
      }));

      let { error: upsertError } = await supabase
        .from('respostas_auditoria')
        .upsert(insertPayload, { onConflict: 'auditoria_id,pergunta_id' });

      if (upsertError && upsertError.message?.includes('observacao')) {
        const fallbackPayload = insertPayload.map(({ observacao, ...rest }) => rest);
        const { error: fallbackError } = await supabase
          .from('respostas_auditoria')
          .upsert(fallbackPayload, { onConflict: 'auditoria_id,pergunta_id' });
        upsertError = fallbackError;
      }

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
          data_realizacao: new Date().toISOString()
        })
        .eq('id', activeId);

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
  const totalRespondidas = Object.values(respostas).filter(r => r.conforme !== null && r.conforme !== undefined).length;
  const percentualConcluido = totalPerguntas > 0 ? Math.round((totalRespondidas / totalPerguntas) * 100) : 0;

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-center p-2 sm:p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-slate-50 w-full max-w-4xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-emerald-100">
        
        {/* Cabeçalho do Modal */}
        <div className="bg-emerald-800 text-white px-6 py-4 flex items-center justify-between shrink-0 shadow-sm">
          <div>
            <span className="text-[10px] font-extrabold tracking-widest text-emerald-200 uppercase bg-emerald-900/60 px-2.5 py-1 rounded-md border border-emerald-700/50">
              {modo === 'autoavaliacao' ? 'Autoavaliação do Produtor' : 'Auditoria In Loco'}
            </span>
            <h2 className="text-xl font-black text-white mt-1 leading-tight">{propriedadeNome}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-emerald-700/60 rounded-xl transition-colors text-emerald-100 hover:text-white cursor-pointer">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Navegação Elegante de Princípios (Tabs Reformuladas) */}
        {/* BANNER EM DESTAQUE DO PRINCÍPIO ATIVO (SEM CORTES DE TEXTO) */}
        {secaoAtiva && (
          <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-900 text-white p-5 shrink-0 border-b border-emerald-700 shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-700/80 text-emerald-100 px-3 py-1 rounded-md border border-emerald-600/50 shadow-xs">
                    Princípio {secoesUnicas.indexOf(secaoAtiva) + 1} de {secoesUnicas.length}
                  </span>
                  <span className="text-[11px] font-extrabold text-emerald-200 bg-black/20 px-3 py-1 rounded-md border border-white/10">
                    {perguntas.filter(p => p.secao === secaoAtiva && respostas[p.id]?.conforme !== null && respostas[p.id]?.conforme !== undefined).length} de {perguntas.filter(p => p.secao === secaoAtiva).length} critérios respondidos
                  </span>
                </div>
                {/* NOME COMPLETO DO PRINCÍPIO SEM QUALQUER CORTE */}
                <h3 className="text-lg sm:text-xl font-black text-white leading-snug tracking-tight">
                  {secaoAtiva}
                </h3>
              </div>

              {/* BOTÕES DE NAVEGAÇÃO RÁPIDA ENTRE PRINCÍPIOS */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const idx = secoesUnicas.indexOf(secaoAtiva);
                    if (idx > 0) setSecaoAtiva(secoesUnicas[idx - 1]);
                  }}
                  disabled={secoesUnicas.indexOf(secaoAtiva) <= 0}
                  className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5 border border-white/10"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Anterior</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const idx = secoesUnicas.indexOf(secaoAtiva);
                    if (idx < secoesUnicas.length - 1) setSecaoAtiva(secoesUnicas[idx + 1]);
                  }}
                  disabled={secoesUnicas.indexOf(secaoAtiva) >= secoesUnicas.length - 1}
                  className="px-4 py-2 bg-emerald-400 hover:bg-emerald-300 text-emerald-950 font-black rounded-xl text-xs transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5 shadow-md"
                >
                  <span>Próximo</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TABS DE SELEÇÃO RÁPIDA (STEPPER DOS 5 PRINCÍPIOS MINIMALISTA) */}
        <div className="bg-slate-100 border-b border-slate-200 px-4 py-2.5 shrink-0 flex items-center gap-2 overflow-x-auto scrollbar-none">
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
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 border ${
                  isSelected
                    ? 'bg-emerald-800 text-white border-emerald-800 shadow-sm ring-2 ring-emerald-600/30'
                    : isDone
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-200/80'
                }`}
              >
                <span className={`w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-black ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {idx + 1}
                </span>
                <span className="font-extrabold whitespace-nowrap">{shortName}</span>
                {isDone ? (
                  <CheckCircle2 className={`w-4 h-4 shrink-0 ${isSelected ? 'text-emerald-300' : 'text-emerald-600'}`} />
                ) : (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded font-black ${
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
        <div className="bg-emerald-50/80 px-6 py-2.5 border-b border-emerald-100 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-bold text-emerald-900 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
              Progresso Geral
            </span>

            {/* STATUS BADGE DA CONEXÃO DO BANCO COM AUTO-HIDE (DESAPARECE SUAVEMENTE) */}
            {showSyncBadge && (
              syncingDb ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-extrabold border border-emerald-300 animate-pulse shadow-xs">
                  <Loader2 className="w-3 h-3 animate-spin text-emerald-700" />
                  <span>Carregando dados...</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white text-emerald-800 text-[11px] font-bold border border-emerald-200 shadow-xs animate-fade-in">
                  <CloudCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Dados carregados</span>
                </span>
              )
            )}
          </div>

          <div className="flex items-center gap-3 w-1/3 max-w-xs">
            <div className="w-full bg-emerald-200/60 h-2.5 rounded-full overflow-hidden p-0.5 border border-emerald-200">
              <div className="bg-gradient-to-r from-emerald-600 to-teal-500 h-full transition-all duration-500 rounded-full" style={{ width: `${percentualConcluido}%` }} />
            </div>
            <span className="font-black text-emerald-800 min-w-[35px] text-right">{percentualConcluido}%</span>
          </div>
        </div>

        {/* Lista de Perguntas do Princípio */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {loadingPerguntas || (syncingDb && Object.keys(respostas).length === 0) ? (
            <div className="py-6 space-y-6">
              <div className="flex items-center justify-center gap-3 text-emerald-800 bg-emerald-50/90 p-4 rounded-xl border border-emerald-200/80 animate-pulse shadow-xs">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                <span className="text-sm font-extrabold tracking-wide">Carregando questionário e dados da auditoria...</span>
              </div>

              {/* SKELETON PLACEHOLDERS PROFISSIONAIS */}
              {[1, 2].map((n) => (
                <div key={n} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 animate-pulse shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="h-6 bg-slate-200 rounded-lg w-32" />
                    <div className="h-5 bg-emerald-100 rounded-full w-24" />
                  </div>
                  <div className="h-5 bg-slate-200 rounded-md w-4/5" />
                  <div className="h-4 bg-slate-100 rounded-md w-full" />
                  <div className="grid grid-cols-2 gap-4 pt-3">
                    <div className="h-12 bg-slate-100 rounded-xl border border-slate-200" />
                    <div className="h-12 bg-slate-100 rounded-xl border border-slate-200" />
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
                <div key={pergunta.id} className={`bg-white rounded-2xl border p-5 transition-all shadow-sm ${isConforme ? 'border-emerald-300 ring-1 ring-emerald-100 bg-emerald-50/10' : isNaoConforme ? 'border-red-300 ring-1 ring-red-100 bg-red-50/10' : 'border-gray-200 hover:border-emerald-200'}`}>
                  <div className="flex flex-col gap-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-white bg-slate-800 px-2.5 py-1 rounded-lg">Indicador {pergunta.numero_criterio}</span>
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${pergunta.ponderacao === 'Imediata' ? 'bg-red-100 text-red-700 border border-red-200' : pergunta.ponderacao === 'Curto Prazo' ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-blue-100 text-blue-800 border border-blue-200'}`}>
                          {pergunta.ponderacao}
                        </span>
                      </div>
                    </div>
                    
                    <h3 className="text-base font-bold text-gray-900 leading-snug">{pergunta.enunciado || pergunta.criterio}</h3>
                    
                    {pergunta.orientacao && (
                      <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                        <button type="button" onClick={() => setExpandedOrientacoes(prev => ({ ...prev, [pergunta.id]: !prev[pergunta.id] }))} className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 flex items-center justify-between hover:bg-slate-100 transition-colors">
                          <span className="flex items-center gap-1.5 text-emerald-800">Ver Orientação / Diretrizes</span>
                          <span className="text-slate-400 font-extrabold text-sm">{expandedOrientacoes[pergunta.id] ? '−' : '+'}</span>
                        </button>
                        {expandedOrientacoes[pergunta.id] && (
                          <div className="px-4 pb-3 pt-1 text-xs text-slate-600 leading-relaxed border-t border-slate-200/60 bg-white">{pergunta.orientacao}</div>
                        )}
                      </div>
                    )}
                    
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <button type="button" onClick={() => handleResposta(pergunta.id, true)} className={`py-3 px-4 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${isConforme ? 'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-600 ring-offset-1' : 'bg-white border-2 border-emerald-200 text-emerald-800 hover:bg-emerald-50'}`}>
                        <CheckCircle2 className="w-4 h-4" /> Sim, Conforme
                      </button>
                      <button type="button" onClick={() => handleResposta(pergunta.id, false)} className={`py-3 px-4 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${isNaoConforme ? 'bg-red-600 text-white shadow-md ring-2 ring-red-600 ring-offset-1' : 'bg-white border-2 border-red-200 text-red-800 hover:bg-red-50'}`}>
                        <AlertCircle className="w-4 h-4" /> Não Conforme
                      </button>
                    </div>

                    {resposta?.conforme !== null && resposta?.conforme !== undefined && (
                      <div className="mt-2 pt-4 border-t border-gray-100 space-y-3 animate-fadeIn">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">Observações do Inspetor</label>
                          <textarea rows={2} value={resposta?.observacao || ''} onChange={(e) => handleObservacao(pergunta.id, e.target.value)} placeholder="Detalhe as condições observadas..." className="w-full p-3 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all" />
                        </div>
                        
                        <div>
                          {cameraLoadingId === pergunta.id ? (
                            <div className="flex items-center gap-3 bg-amber-50 p-3 rounded-xl border border-amber-200 shadow-sm animate-pulse">
                              <Loader2 className="w-5 h-5 animate-spin text-amber-600 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-amber-900">Sincronizando arquivo na nuvem...</p>
                                <p className="text-[10px] text-amber-700">Aguarde o término do envio antes de prosseguir.</p>
                              </div>
                            </div>
                          ) : !resposta?.evidenciaUrl ? (
                            <div>
                              <input type="file" id={`file-input-${pergunta.id}`} accept="image/*,application/pdf" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleUploadEvidencia(pergunta.id, file); }} />
                              <button type="button" onClick={() => document.getElementById(`file-input-${pergunta.id}`)?.click()} className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-emerald-300 bg-emerald-50/50 text-emerald-700 rounded-xl hover:bg-emerald-100 hover:border-emerald-400 transition-all font-bold cursor-pointer text-xs">
                                <Camera className="w-5 h-5 text-emerald-600" />
                                <span>{modo === 'autoavaliacao' ? 'Enviar Evidência (Imagem ou PDF)' : 'Tirar Foto / Enviar Evidência (Imagem ou PDF)'}</span>
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-emerald-200 shadow-sm">
                              <div className="bg-emerald-100 rounded-lg overflow-hidden w-10 h-10 flex items-center justify-center shrink-0 cursor-pointer hover:opacity-85 transition-opacity border border-emerald-200" onClick={() => handleOpenEvidencia(resposta.evidenciaUrl!)}>
                                {resposta.evidenciaUrl.toLowerCase().includes('.pdf') ? <FileText className="w-5 h-5 text-emerald-700" /> : <img src={resposta.evidenciaUrl} alt="Evidência" className="w-full h-full object-cover" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-900 truncate">Evidência Anexada</p>
                                <button type="button" onClick={() => handleOpenEvidencia(resposta.evidenciaUrl!)} className="text-[11px] text-emerald-700 underline font-bold hover:text-emerald-900 cursor-pointer block mt-0.5 text-left">Ver Arquivo Enviado</button>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                                <button type="button" title="Remover" onClick={() => setRespostas(prev => ({ ...prev, [pergunta.id]: { ...prev[pergunta.id], evidenciaUrl: null } }))} className="text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-50 cursor-pointer"><X className="w-4 h-4" /></button>
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
        <div className="px-6 py-4 bg-white border-t border-slate-200 shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500 order-2 sm:order-1">
            <Save className="w-4 h-4 text-emerald-600" />
            <span>
              {lastSavedTime ? `Rascunho salvo às ${lastSavedTime}` : 'Você pode salvar parcialmente e continuar depois'}
            </span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto order-1 sm:order-2">
            <button
              type="button"
              onClick={handleSavePartial}
              disabled={savingPartial || loading || loadingPerguntas}
              className="flex-1 sm:flex-none px-5 py-3 bg-white border-2 border-slate-300 hover:border-emerald-600 text-slate-700 hover:text-emerald-800 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {savingPartial ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                  <span>Salvando Rascunho...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 text-emerald-600" />
                  <span>Salvar Rascunho</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || savingPartial || loadingPerguntas || perguntas.length === 0}
              className="flex-1 sm:flex-none px-6 py-3 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl font-extrabold text-xs sm:text-sm shadow-md transition-all flex justify-center items-center gap-2 disabled:opacity-60 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Finalizando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5 text-emerald-300" />
                  <span>Submeter Relatório de Auditoria</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Modal Lightbox de Foto Ampliada */}
      {fotoAmpliada && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 cursor-zoom-out" onClick={() => setFotoAmpliada(null)}>
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
            <button onClick={() => setFotoAmpliada(null)} className="absolute -top-10 right-0 text-white bg-white/20 hover:bg-white/40 p-2 rounded-full transition-all cursor-pointer"><X className="w-6 h-6" /></button>
            <img src={fotoAmpliada} alt="Evidência Ampliada" className="max-w-full max-h-[85vh] rounded-xl shadow-2xl object-contain border border-slate-700" />
            {fotoAmpliada.startsWith('http') && <a href={fotoAmpliada} target="_blank" rel="noreferrer" className="mt-3 text-xs text-emerald-300 underline font-bold hover:text-white">Abrir em nova guia</a>}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
