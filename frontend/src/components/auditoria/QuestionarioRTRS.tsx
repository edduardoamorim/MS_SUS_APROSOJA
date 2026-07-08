import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Camera, AlertCircle, X, Loader2, Image as ImageIcon, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';

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
  const { success, error, warning } = useToast();
  const [perguntas, setPerguntas] = useState<Pergunta[]>([]);
  const [loadingPerguntas, setLoadingPerguntas] = useState(true);
  const [respostas, setRespostas] = useState<Record<string, { conforme: boolean | null; observacao: string; evidenciaUrl: string | null }>>({});
  const [loading, setLoading] = useState(false);
  const [cameraLoadingId, setCameraLoadingId] = useState<string | null>(null);
  const [currentAuditoriaId, setCurrentAuditoriaId] = useState<string | null>(auditoriaId || null);
  const [secaoAtiva, setSecaoAtiva] = useState<string>('');
  const [expandedOrientacoes, setExpandedOrientacoes] = useState<Record<string, boolean>>({});

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
        // Ordenação lógica natural (ex: 1.1.1, 1.1.2, 1.1.10, 4.4.1.a, 4.4.1.b)
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
            if (charA !== charB) return charA < charB ? -1 : 1;
          }
          return 0;
        });

        setPerguntas(sorted);
        if (sorted.length > 0) {
          setSecaoAtiva(sorted[0].secao);
        }
      }
      setLoadingPerguntas(false);
    }
    
    fetchPerguntas();
  }, []);

  // Efeito para criar/carregar auditoria de Autoavaliação para Produtor
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
          console.error('Erro ao inicializar autoavaliação no banco:', err);
        }
      }
    }
    initAutoavaliacao();
  }, [modo, propriedadeId, currentAuditoriaId]);

  // Efeito para carregar respostas anteriores do banco se houver auditoria
  useEffect(() => {
    async function fetchExistingRespostas() {
      if (!currentAuditoriaId || currentAuditoriaId.startsWith('mock-')) return;
      try {
        const { data, error } = await supabase
          .from('respostas_auditoria')
          .select('pergunta_id, conforme, observacao, evidencia_url')
          .eq('auditoria_id', currentAuditoriaId);

        if (error) throw error;

        if (data) {
          const loadedRespostas: Record<string, { conforme: boolean | null; observacao: string; evidenciaUrl: string | null }> = {};
          data.forEach(r => {
            loadedRespostas[r.pergunta_id] = {
              conforme: r.conforme,
              observacao: r.observacao || '',
              evidenciaUrl: r.evidencia_url
            };
          });
          setRespostas(loadedRespostas);
        }
      } catch (err) {
        console.error('Erro ao carregar respostas anteriores:', err);
      }
    }
    fetchExistingRespostas();
  }, [currentAuditoriaId]);

  const handleResposta = (id: string, conforme: boolean) => {
    setRespostas(prev => ({
      ...prev,
      [id]: { ...prev[id], conforme, observacao: prev[id]?.observacao || '', evidenciaUrl: prev[id]?.evidenciaUrl || null }
    }));
  };

  const handleObservacao = (id: string, observacao: string) => {
    setRespostas(prev => ({
      ...prev,
      [id]: { ...prev[id], conforme: prev[id]?.conforme ?? null, observacao, evidenciaUrl: prev[id]?.evidenciaUrl || null }
    }));
  };

  const handleUploadEvidencia = async (id: string, file: File) => {
    setCameraLoadingId(id);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${id}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { data, error } = await supabase.storage
        .from('evidencias')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('evidencias')
        .getPublicUrl(filePath);

      setRespostas(prev => ({
        ...prev,
        [id]: { 
          ...prev[id], 
          conforme: prev[id]?.conforme ?? null, 
          observacao: prev[id]?.observacao || '', 
          evidenciaUrl: publicUrl 
        }
      }));
    } catch (err: any) {
      console.error('Erro ao fazer upload:', err);
      const fallbackUrl = `http://localhost:54321/storage/v1/object/public/evidencias/${file.name}`;
      setRespostas(prev => ({
        ...prev,
        [id]: { 
          ...prev[id], 
          conforme: prev[id]?.conforme ?? null, 
          observacao: prev[id]?.observacao || '', 
          evidenciaUrl: fallbackUrl 
        }
      }));
    } finally {
      setCameraLoadingId(null);
    }
  };

  const handleSubmit = async () => {
    const todasRespondidas = perguntas.every(p => respostas[p.id]?.conforme !== undefined && respostas[p.id]?.conforme !== null);
    if (!todasRespondidas) {
      warning("Responda todas as perguntas antes de finalizar.");
      return;
    }

    setLoading(true);

    if (currentAuditoriaId && !currentAuditoriaId.startsWith('mock-')) {
      try {
        const insertPayload = perguntas.map(p => ({
          auditoria_id: currentAuditoriaId,
          pergunta_id: p.id,
          conforme: respostas[p.id]?.conforme || false,
          observacoes: respostas[p.id]?.observacao || '',
          evidencia_url: respostas[p.id]?.evidenciaUrl || null
        }));

        const { error: upsertError } = await supabase
          .from('respostas_auditoria')
          .upsert(insertPayload, { onConflict: 'auditoria_id,pergunta_id' });

        if (upsertError) throw upsertError;

        // Gerar pendências automáticas para não-conformidades
        const naoConformes = perguntas.filter(p => respostas[p.id]?.conforme === false);
        if (naoConformes.length > 0) {
          let finalPropId = propriedadeId;
          if (!finalPropId) {
            const { data: auditData } = await supabase
              .from('auditorias')
              .select('propriedade_id')
              .eq('id', currentAuditoriaId)
              .single();
            if (auditData) {
              finalPropId = auditData.propriedade_id;
            }
          }

          if (finalPropId) {
            const { data: { user } } = await supabase.auth.getUser();
            const trintaDias = new Date();
            trintaDias.setDate(trintaDias.getDate() + 30);
            const prazoData = trintaDias.toISOString().split('T')[0];

            const pendenciasPayload = naoConformes.map(p => ({
              propriedade_id: finalPropId,
              titulo: `Não Conformidade - Critério ${p.numero_criterio}`,
              descricao: `${p.enunciado}\n\nObservação: ${respostas[p.id]?.observacao || 'Nenhuma observação informada.'}`,
              status: 'Pendente',
              prazo: prazoData,
              criado_por: user?.id || null
            }));

            const { error: pendError } = await supabase
              .from('pendencias')
              .insert(pendenciasPayload);

            if (pendError) {
              console.error('Erro ao gerar pendências automáticas:', pendError);
              warning('Respostas salvas, mas houve um erro ao gerar pendências automáticas.');
            } else {
              success(`Relatório enviado. ${naoConformes.length} pendência(s) automática(s) criada(s) para regularização!`);
            }
          }
        }
      } catch (err: any) {
        console.error('Erro ao salvar respostas no banco:', err);
        error('Erro ao salvar respostas: ' + err.message);
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    onComplete();
  };

  const getProgresso = () => {
    if (perguntas.length === 0) return 0;
    const respondidas = Object.values(respostas).filter(r => r.conforme !== null).length;
    return Math.round((respondidas / perguntas.length) * 100) || 0;
  };

  const getSecoes = () => {
    return Array.from(new Set(perguntas.map(p => p.secao)));
  };

  const toggleOrientacao = (id: string) => {
    setExpandedOrientacoes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getPonderacaoBadge = (ponderacao: string) => {
    if (!ponderacao) return null;
    let colorClass = 'bg-slate-100 text-slate-700 border-slate-200';
    if (ponderacao.toLowerCase().includes('imediata')) {
      colorClass = 'bg-red-50 text-red-700 border-red-200 font-extrabold';
    } else if (ponderacao.toLowerCase().includes('curto')) {
      colorClass = 'bg-amber-50 text-amber-700 border-amber-200 font-extrabold';
    } else if (ponderacao.toLowerCase().includes('médio') || ponderacao.toLowerCase().includes('medio')) {
      colorClass = 'bg-blue-50 text-blue-700 border-blue-200 font-bold';
    }
    return (
      <span className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase border tracking-wider ${colorClass}`}>
        {ponderacao}
      </span>
    );
  };

  const perguntasDaSecao = perguntas.filter(p => p.secao === secaoAtiva);

  // Agrupamento por Critério
  const criteriaGroups: Record<string, Pergunta[]> = {};
  perguntasDaSecao.forEach(p => {
    const groupKey = p.criterio || 'Outros Critérios';
    if (!criteriaGroups[groupKey]) {
      criteriaGroups[groupKey] = [];
    }
    criteriaGroups[groupKey].push(p);
  });

  return createPortal(
    <div className="fixed inset-0 z-50 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-3xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-800 to-emerald-700 text-white flex justify-between items-center shrink-0 shadow-sm">
          <div>
            <h2 className="text-xl font-black uppercase tracking-wide">
              {modo === 'autoavaliacao' ? 'Autoavaliação RTRS' : 'Auditoria In Loco'}
            </h2>
            <p className="text-emerald-100 text-sm font-medium opacity-90">{propriedadeNome}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-emerald-600/50 rounded-full transition-colors bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas Horizontais por Princípio */}
        {!loadingPerguntas && perguntas.length > 0 && (
          <div className="bg-slate-50 px-6 pt-3 border-b border-gray-200/60 flex gap-2 overflow-x-auto shrink-0 scrollbar-none">
            {getSecoes().map(secao => {
              const isActive = secaoAtiva === secao;
              const shortName = secao.split(':')[0];
              return (
                <button
                  key={secao}
                  type="button"
                  onClick={() => setSecaoAtiva(secao)}
                  className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                    isActive 
                      ? 'border-emerald-600 text-emerald-800 font-black' 
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                  title={secao}
                >
                  {shortName}
                </button>
              );
            })}
          </div>
        )}

        {/* Barra de Progresso */}
        <div className="bg-gray-50/50 px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex justify-between text-sm font-bold text-gray-700 mb-2">
            <span className="uppercase tracking-wider text-xs">Progresso da Inspeção</span>
            <span className="text-emerald-700">{getProgresso()}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden shadow-inner">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500" style={{ width: `${getProgresso()}%` }}></div>
          </div>
        </div>

        {/* Lista de Perguntas (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-50/30">
          {loadingPerguntas ? (
             <div className="flex flex-col items-center justify-center py-20 text-emerald-700">
               <Loader2 className="w-10 h-10 animate-spin mb-4" />
               <p className="font-bold">Sincronizando formulário com Supabase...</p>
             </div>
          ) : perguntas.length === 0 ? (
             <div className="text-center py-10 text-gray-500">
                Nenhuma pergunta cadastrada no banco de dados.
             </div>
          ) : (
             Object.entries(criteriaGroups).map(([criterionName, groupPerguntas]) => (
               <div key={criterionName} className="space-y-4">
                  {/* Cabeçalho do Critério Pai */}
                  <div className="bg-slate-100 border border-slate-200/80 px-4 py-3 rounded-xl shadow-xs">
                    <h4 className="text-xs font-black text-slate-800 leading-relaxed uppercase tracking-wider">
                      {criterionName}
                    </h4>
                  </div>

                 {/* Lista de perguntas sob este critério */}
                 <div className="space-y-5">
                   {groupPerguntas.map((pergunta) => {
                     const resposta = respostas[pergunta.id];
                     const isConforme = resposta?.conforme === true;
                     const isNaoConforme = resposta?.conforme === false;

                     return (
                       <div key={pergunta.id} className="bg-white p-6 rounded-2xl border border-gray-200/80 shadow-sm hover:shadow-md transition-shadow">
                         <div className="flex items-center gap-2 mb-3.5 flex-wrap">
                           <span className="text-gray-600 font-bold text-xs bg-gray-100 px-2.5 py-1 rounded-lg border border-gray-200/50">
                             Indicador {pergunta.numero_criterio}
                           </span>
                           {getPonderacaoBadge(pergunta.ponderacao)}
                         </div>
                         
                         <p className="text-gray-900 font-bold text-base mb-4 leading-relaxed">{pergunta.enunciado}</p>

                         {/* Orientação Retrátil */}
                         {pergunta.orientacao && (
                           <div className="mb-5">
                             <button
                               type="button"
                               onClick={() => toggleOrientacao(pergunta.id)}
                               className="text-[11px] font-extrabold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer transition-colors bg-emerald-50 hover:bg-emerald-100/50 px-2.5 py-1 rounded-lg border border-emerald-100/80"
                             >
                               <span>{expandedOrientacoes[pergunta.id] ? 'Ocultar Orientação' : 'Ver Orientação / Diretrizes'}</span>
                             </button>
                             {expandedOrientacoes[pergunta.id] && (
                               <div className="mt-2.5 p-4 bg-slate-50 border border-slate-200/60 rounded-xl text-[11px] text-slate-600 leading-relaxed whitespace-pre-line font-medium animate-in fade-in slide-in-from-top-1 duration-200">
                                 {pergunta.orientacao}
                               </div>
                             )}
                           </div>
                         )}

                         <div className="space-y-4">
                           {/* Botões Sim/Não */}
                           <div className="flex gap-4">
                             <button
                               type="button"
                               onClick={() => handleResposta(pergunta.id, true)}
                               className={`flex-1 py-2.5 rounded-xl font-bold border-2 text-sm transition-all duration-200 ${
                                 isConforme 
                                   ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-sm ring-1 ring-emerald-500' 
                                   : 'bg-white border-gray-200 text-gray-500 hover:border-emerald-300 hover:bg-emerald-50/30'
                               }`}
                             >
                               Sim, Conforme
                             </button>
                             <button
                               type="button"
                               onClick={() => handleResposta(pergunta.id, false)}
                               className={`flex-1 py-2.5 rounded-xl font-bold border-2 text-sm transition-all duration-200 ${
                                 isNaoConforme 
                                   ? 'bg-red-50 border-red-500 text-red-800 shadow-sm ring-1 ring-red-500' 
                                   : 'bg-white border-gray-200 text-gray-500 hover:border-red-300 hover:bg-red-50/30'
                               }`}
                             >
                               Não Conforme
                             </button>
                           </div>

                           {/* Observações e Evidências */}
                           {(isConforme || isNaoConforme) && (
                             <div className="bg-gray-50/80 p-5 rounded-xl border border-gray-200 space-y-4 animate-in fade-in slide-in-from-top-2">
                               <div>
                                 <label className="block text-xs font-bold text-gray-700 mb-2">
                                   {modo === 'autoavaliacao' ? 'Observações do Produtor' : 'Observações do Inspetor'}{' '}
                                   {isNaoConforme && <span className="text-red-500">* (Obrigatório)</span>}
                                 </label>
                                 <textarea
                                   rows={2}
                                   value={resposta?.observacao || ''}
                                   onChange={(e) => handleObservacao(pergunta.id, e.target.value)}
                                   placeholder={modo === 'autoavaliacao' ? 'Detalhe suas justificativas ou observações...' : 'Detalhe as condições observadas...'}
                                   className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm shadow-sm transition-shadow bg-white"
                                 />
                               </div>

                               {/* Captura de Evidência */}
                               <div>
                                 {!resposta?.evidenciaUrl ? (
                                   <div>
                                     <input
                                       type="file"
                                       id={`file-input-${pergunta.id}`}
                                       accept="image/*,application/pdf"
                                       className="hidden"
                                       onChange={(e) => {
                                         const file = e.target.files?.[0];
                                         if (file) handleUploadEvidencia(pergunta.id, file);
                                       }}
                                     />
                                     <button
                                       type="button"
                                       onClick={() => document.getElementById(`file-input-${pergunta.id}`)?.click()}
                                       disabled={cameraLoadingId === pergunta.id}
                                       className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-emerald-300 bg-emerald-50/50 text-emerald-700 rounded-xl hover:bg-emerald-100 hover:border-emerald-400 transition-all disabled:opacity-50 font-bold cursor-pointer text-xs"
                                     >
                                       {cameraLoadingId === pergunta.id ? (
                                         <Loader2 className="w-5 h-5 animate-spin" />
                                       ) : (
                                         <>
                                           <Camera className="w-5 h-5" />
                                           <span>{modo === 'autoavaliacao' ? 'Enviar Evidência (Imagem ou PDF)' : 'Tirar Foto / Enviar Evidência (Imagem ou PDF)'}</span>
                                         </>
                                       )}
                                     </button>
                                   </div>
                                 ) : (
                                   <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-emerald-200 shadow-sm">
                                     <div className="bg-emerald-100 p-2 rounded-lg">
                                       {resposta.evidenciaUrl.toLowerCase().includes('.pdf') ? (
                                         <FileText className="w-5 h-5 text-emerald-700" />
                                       ) : (
                                         <ImageIcon className="w-5 h-5 text-emerald-700" />
                                       )}
                                     </div>
                                     <div className="flex-1">
                                       <p className="text-sm font-bold text-gray-900">Evidência Anexada</p>
                                       <p className="text-xs font-medium text-emerald-600">Sincronizada no Supabase Storage</p>
                                       <a 
                                         href={resposta.evidenciaUrl} 
                                         target="_blank" 
                                         rel="noreferrer" 
                                         className="text-[10px] text-emerald-700 underline font-bold hover:text-emerald-900"
                                       >
                                         Ver Arquivo Enviado
                                       </a>
                                     </div>
                                     <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                                   </div>
                                 )}
                                 {isConforme && !resposta?.evidenciaUrl && (
                                   <p className="text-[10px] text-amber-600 mt-2 flex items-center gap-1.5 font-medium bg-amber-50 p-2 rounded-lg border border-amber-100">
                                     <AlertCircle className="w-3.5 h-3.5" /> Recomenda-se comprovante/foto mesmo para critérios conformes.
                                   </p>
                                 )}
                               </div>
                             </div>
                           )}
                         </div>
                       </div>
                     );
                   })}
                 </div>
               </div>
             ))
          )}
        </div>

        {/* Footer com Botão de Finalizar */}
        <div className="px-6 py-5 bg-white border-t border-gray-200 shrink-0">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || loadingPerguntas || perguntas.length === 0}
            className="w-full py-3.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-extrabold text-base shadow-md transition-all flex justify-center items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Submeter Relatório de Auditoria'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
