import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { ClipboardList, Plus, Search, Edit3, Trash2, GripVertical, CheckCircle, XCircle, ChevronDown, Sparkles } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import ConfirmDelete from '../../components/ui/ConfirmDelete';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';

export default function GestorQuestionarios() {
  const { success, error } = useToast();
  const [secaoAtiva, setSecaoAtiva] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [secoes, setSecoes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [perguntas, setPerguntas] = useState<any[]>([]);

  // Modal States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSecaoOpen, setIsSecaoOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  
  const [editingItem, setEditingItem] = useState<any>(null);
  const [itemToDelete, setItemToDelete] = useState<any>(null);

  // Form States
  const [formData, setFormData] = useState({ numero_criterio: '', enunciado: '', criterio: '', ponderacao: '', orientacao: '' });
  const [secaoName, setSecaoName] = useState('');
  const [expandedOrientacoes, setExpandedOrientacoes] = useState<Record<string, boolean>>({});

  const toggleOrientacao = (id: string) => {
    setExpandedOrientacoes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  useEffect(() => {
    fetchPerguntas();
  }, []);

  async function fetchPerguntas() {
    setLoading(true);
    const { data, error: fetchErr } = await supabase.from('perguntas_rtrs').select('*');
    if (!fetchErr && data) {
      // Ordenação lógica natural
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
        const orderA = a.ordem || 0;
        const orderB = b.ordem || 0;
        
        if (a.criterio === b.criterio && orderA !== orderB) {
          return orderA - orderB;
        }

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
      
      // Seções oficiais vindas diretamente do banco de dados
      const uniqueSecoes = Array.from(new Set(sorted.map((p: any) => p.secao)));
      
      // Limpeza de seções obsoletas mockadas salvas no localStorage do navegador
      const defaultMockSecoes = ['Direitos Trabalhistas', 'Práticas Agrícolas', 'Meio Ambiente', 'Relações Comunitárias'];
      const saved = localStorage.getItem('ms_sustentavel_custom_secoes');
      let customSecoes: string[] = [];
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            customSecoes = parsed.filter(s => !defaultMockSecoes.includes(s));
          }
        } catch (e) {}
      }
      localStorage.setItem('ms_sustentavel_custom_secoes', JSON.stringify(customSecoes));

      const merged = Array.from(new Set([...uniqueSecoes, ...customSecoes]));
      setSecoes(merged);
      if (merged.length > 0) {
        setSecaoAtiva(prev => prev && merged.includes(prev) ? prev : merged[0]);
      }
    }
    setLoading(false);
  }

  // Handlers para Secão
  const handleAddSecao = (e: React.FormEvent) => {
    e.preventDefault();
    if (secaoName && !secoes.includes(secaoName)) {
      const newSecoes = [...secoes, secaoName];
      setSecoes(newSecoes);
      
      const defaultMockSecoes = ['Direitos Trabalhistas', 'Práticas Agrícolas', 'Meio Ambiente', 'Relações Comunitárias'];
      const customOnly = newSecoes.filter(s => !defaultMockSecoes.includes(s) && !s.startsWith('Princípio'));
      localStorage.setItem('ms_sustentavel_custom_secoes', JSON.stringify(customOnly));
      
      setSecaoAtiva(secaoName);
      success('Nova seção adicionada!');
    }
    setIsSecaoOpen(false);
    setSecaoName('');
  };

  // Handlers para Critérios
  const handleOpenCreate = () => {
    setEditingItem(null);
    const filteredCount = perguntas.filter(p => p.secao === secaoAtiva).length;
    const principleNum = secaoAtiva.startsWith('Princípio') ? secaoAtiva.split(' ')[1].replace(':', '') : '1';
    setFormData({ 
      numero_criterio: `${principleNum}.1.${filteredCount + 1}`, 
      enunciado: '',
      criterio: '',
      ponderacao: 'Imediata',
      orientacao: ''
    });
    setIsFormOpen(true);
  };

  const handleOpenEdit = (item: any) => {
    setEditingItem(item);
    setFormData({ 
      numero_criterio: item.numero_criterio, 
      enunciado: item.enunciado,
      criterio: item.criterio || '',
      ponderacao: item.ponderacao || 'Imediata',
      orientacao: item.orientacao || ''
    });
    setIsFormOpen(true);
  };

  const handleOpenDelete = (item: any) => {
    setItemToDelete(item);
    setIsDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    
    const { error: err } = await supabase
      .from('perguntas_rtrs')
      .delete()
      .eq('id', itemToDelete.id);

    if (err) {
      error('Erro ao excluir critério: ' + err.message);
    } else {
      setPerguntas(prev => prev.filter(p => p.id !== itemToDelete.id));
      success('Critério removido com sucesso!');
    }
    setIsDeleteOpen(false);
    setItemToDelete(null);
  };

  const toggleAtivo = async (id: string, currentAtivo: boolean) => {
    const nextAtivo = !currentAtivo;
    setPerguntas(prev => prev.map(p => p.id === id ? { ...p, ativo: nextAtivo } : p));

    const { error: err } = await supabase
      .from('perguntas_rtrs')
      .update({ ativo: nextAtivo })
      .eq('id', id);

    if (err) {
      setPerguntas(prev => prev.map(p => p.id === id ? { ...p, ativo: currentAtivo } : p));
      error('Erro ao atualizar status: ' + err.message);
    } else {
      success(nextAtivo ? 'Critério ativado!' : 'Critério desativado!');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingItem) {
      const { error: err } = await supabase
        .from('perguntas_rtrs')
        .update({
          numero_criterio: formData.numero_criterio,
          enunciado: formData.enunciado,
          criterio: formData.criterio,
          ponderacao: formData.ponderacao,
          orientacao: formData.orientacao,
          secao: secaoAtiva
        })
        .eq('id', editingItem.id);

      if (err) {
        error('Erro ao salvar alterações: ' + err.message);
      } else {
        setPerguntas(prev => prev.map(p => p.id === editingItem.id ? { 
          ...p, 
          numero_criterio: formData.numero_criterio,
          enunciado: formData.enunciado,
          criterio: formData.criterio,
          ponderacao: formData.ponderacao,
          orientacao: formData.orientacao
        } : p));
        success('Critério atualizado!');
      }
    } else {
      const newOrder = perguntas.length + 1;
      const { data, error: err } = await supabase
        .from('perguntas_rtrs')
        .insert([{
          secao: secaoAtiva,
          numero_criterio: formData.numero_criterio,
          enunciado: formData.enunciado,
          criterio: formData.criterio,
          ponderacao: formData.ponderacao,
          orientacao: formData.orientacao,
          ativo: true,
          ordem: newOrder
        }])
        .select();

      if (err) {
        error('Erro ao adicionar critério: ' + err.message);
      } else if (data) {
        setPerguntas(prev => [...prev, data[0]]);
        success('Novo critério adicionado!');
      }
    }
    setIsFormOpen(false);
  };

  // Handler de reordenação por Drag & Drop dentro do mesmo Critério Pai
  const handleDragEnd = async (result: any) => {
    if (!result.destination) return;
    const { source, destination, droppableId } = result;

    if (source.index === destination.index) return;

    const groupPerguntas = perguntasDaSecao.filter(p => (p.criterio || 'OUTROS CRITÉRIOS') === droppableId);
    const reorderedGroup = Array.from(groupPerguntas);
    const [movedItem] = reorderedGroup.splice(source.index, 1);
    reorderedGroup.splice(destination.index, 0, movedItem);

    const updatedPerguntas = perguntas.map(p => {
      if ((p.criterio || 'OUTROS CRITÉRIOS') === droppableId) {
        const newIdx = reorderedGroup.findIndex(item => item.id === p.id);
        return { ...p, ordem: newIdx + 1 };
      }
      return p;
    });

    setPerguntas(updatedPerguntas);

    try {
      const updates = reorderedGroup.map((item, idx) => 
        supabase
          .from('perguntas_rtrs')
          .update({ ordem: idx + 1 })
          .eq('id', item.id)
      );
      await Promise.all(updates);
      success('Ordem dos indicadores atualizada!');
    } catch (e) {
      error('Erro ao salvar reordenação no banco de dados.');
    }
  };

  const perguntasDaSecao = perguntas.filter(p => {
    const matchesSecao = p.secao === secaoAtiva;
    const matchesSearch = searchQuery === '' || 
      p.enunciado?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.numero_criterio?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.criterio?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSecao && matchesSearch;
  });

  const criteriaGroups = perguntasDaSecao.reduce((groups: Record<string, any[]>, p) => {
    const key = p.criterio || 'OUTROS CRITÉRIOS';
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
    return groups;
  }, {});

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-emerald-800 animate-fade-in">
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-4 border-emerald-200 border-t-emerald-700 animate-spin"></div>
          <Sparkles className="w-5 h-5 text-emerald-600 absolute top-3 left-3 animate-pulse" />
        </div>
        <p className="font-semibold text-sm tracking-wide">Carregando Matriz de Certificação RTRS...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/70 backdrop-blur-md p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-100/80 text-emerald-800">
              <ClipboardList className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Matriz RTRS</h1>
          </div>
          <p className="text-slate-500 text-sm mt-1 font-medium">
            Gerencie os 5 Princípios da certificação e seus respectivos critérios avaliados em campo.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button 
            onClick={() => setIsSecaoOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200/80 text-slate-800 text-sm font-semibold rounded-xl transition-all duration-200 active:scale-95 shadow-xs"
          >
            <Plus className="w-4 h-4 text-slate-600" />
            <span>Nova Seção</span>
          </button>
          <button 
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-700 to-teal-800 hover:from-emerald-800 hover:to-teal-900 text-white text-sm font-semibold rounded-xl transition-all duration-200 active:scale-95 shadow-md shadow-emerald-900/15"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Critério</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Menu Lateral de Seções (Princípios RTRS) */}
        <div className="w-full lg:w-72 bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200/80 p-3 shadow-xs space-y-1 shrink-0">
          <div className="px-3 py-2 text-[11px] font-black text-slate-400 uppercase tracking-wider">
            Seções do Questionário ({secoes.length})
          </div>
          {secoes.map((secao) => {
            const isActive = secaoAtiva === secao;
            const count = perguntas.filter(p => p.secao === secao).length;
            return (
              <button
                key={secao}
                onClick={() => setSecaoAtiva(secao)}
                className={`w-full flex items-start justify-between gap-2.5 px-3.5 py-3 rounded-xl text-left text-xs font-bold transition-all duration-200 group active:scale-[0.98] ${
                  isActive 
                    ? 'bg-gradient-to-r from-emerald-800 to-teal-900 text-white shadow-md shadow-emerald-950/20' 
                    : 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900'
                }`}
              >
                <span className="leading-snug flex-1">{secao}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold shrink-0 transition-colors ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Lista Principal de Critérios */}
        <div className="flex-1 w-full space-y-4">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input 
              type="text" 
              placeholder={`Buscar critérios em "${secaoAtiva}"...`}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 shadow-xs text-sm transition-all"
            />
          </div>

          <div className="bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h2 className="font-extrabold text-slate-900 text-sm leading-snug">{secaoAtiva}</h2>
              <span className="text-xs font-bold text-slate-500 bg-white px-3 py-1 rounded-full border border-slate-200 shadow-2xs">
                {Object.keys(criteriaGroups).length} critérios • {perguntasDaSecao.length} indicadores cadastrados
              </span>
            </div>
            
            <div className="p-4 space-y-4">
              <DragDropContext onDragEnd={handleDragEnd}>
              {perguntasDaSecao.length === 0 ? (
                <div className="p-12 text-center text-slate-400 font-medium text-sm">
                  Nenhum critério encontrado nesta seção.
                </div>
              ) : (
                Object.entries(criteriaGroups).map(([criterionName, groupPerguntas]) => (
                  <Droppable droppableId={criterionName} key={criterionName}>
                    {(provided) => (
                      <div 
                        className="p-5 space-y-4 bg-slate-50/50 rounded-2xl border border-slate-200/60 transition-all hover:bg-slate-50/80"
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                      >
                        {/* Cabeçalho do Critério Pai */}
                        <div className="bg-white border-l-4 border-emerald-600 border-r border-t border-b border-slate-200 px-4 py-3 rounded-xl shadow-2xs">
                          <h4 className="text-xs font-black text-slate-900 leading-relaxed uppercase tracking-wider">
                            {criterionName}
                          </h4>
                        </div>
                        
                        {/* Lista de Indicadores */}
                        <div className="space-y-3 pl-1">
                          {groupPerguntas.map((p, index) => {
                            const isAtivo = p.ativo !== false;
                            let ponderacaoBadge = null;
                            if (p.ponderacao) {
                              let badgeColor = 'bg-slate-100 text-slate-700 border-slate-200';
                              if (p.ponderacao.toLowerCase().includes('imediata')) {
                                badgeColor = 'bg-rose-50 text-rose-700 border-rose-200 font-black';
                              } else if (p.ponderacao.toLowerCase().includes('curto')) {
                                badgeColor = 'bg-amber-50 text-amber-800 border-amber-200 font-black';
                              } else if (p.ponderacao.toLowerCase().includes('médio') || p.ponderacao.toLowerCase().includes('medio')) {
                                badgeColor = 'bg-sky-50 text-sky-800 border-sky-200 font-bold';
                              }
                              ponderacaoBadge = (
                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase border tracking-wider ${badgeColor}`}>
                                  {p.ponderacao}
                                </span>
                              );
                            }

                            const isExpanded = expandedOrientacoes[p.id];

                            return (
                              <Draggable key={p.id} draggableId={p.id} index={index}>
                                {(provided, snapshot) => (
                                  <div 
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    style={provided.draggableProps.style}
                                    className={`p-4 bg-white rounded-xl border flex items-start gap-3 group transition-all duration-200 ${
                                      snapshot.isDragging 
                                        ? 'shadow-2xl ring-2 ring-emerald-500/40 bg-slate-50 scale-[1.01] z-50 border-emerald-400' 
                                        : 'border-slate-200/80 shadow-2xs ' + (isAtivo ? 'hover:border-emerald-300 hover:shadow-md' : 'bg-slate-50/60 opacity-70')
                                    }`}
                                  >
                                    <div 
                                      {...provided.dragHandleProps}
                                      title="Arrastar para reordenar"
                                      className="mt-1 p-1.5 -ml-1 rounded-lg cursor-grab active:cursor-grabbing text-slate-300 hover:text-emerald-700 hover:bg-emerald-50 transition-all shrink-0"
                                    >
                                      <GripVertical className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 space-y-2.5 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-extrabold text-emerald-800 text-[10px] bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200 tracking-wider">
                                          Indicador {p.numero_criterio}
                                        </span>
                                        {ponderacaoBadge}
                                        {!isAtivo && (
                                          <span className="font-bold text-rose-600 text-[10px] bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200 tracking-wider uppercase">
                                            Inativo
                                          </span>
                                        )}
                                      </div>
                                      <p className={`text-sm font-bold leading-relaxed ${isAtivo ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
                                        {p.enunciado}
                                      </p>

                                      {/* Accordion de Orientação com Animação Fluida via CSS Grid */}
                                      {p.orientacao && (
                                        <div className="border border-slate-200/70 rounded-xl overflow-hidden bg-slate-50/70 transition-colors">
                                          <button 
                                            type="button"
                                            onClick={() => toggleOrientacao(p.id)}
                                            className="w-full flex items-center justify-between text-[11px] font-bold text-emerald-800 uppercase tracking-wider cursor-pointer px-3.5 py-2.5 hover:bg-emerald-50/50 transition-colors"
                                          >
                                            <span>{isExpanded ? 'Ocultar Orientação' : 'Ver Orientação / Diretrizes'}</span>
                                            <ChevronDown className={`w-4 h-4 text-emerald-700 transition-transform duration-300 ease-out ${isExpanded ? 'rotate-180' : ''}`} />
                                          </button>
                                          <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                                            <div className="overflow-hidden">
                                              <div className="p-3.5 pt-1 border-t border-slate-200/60">
                                                <p className="leading-relaxed font-medium whitespace-pre-line text-slate-600 text-[11px] bg-white p-3 rounded-lg border border-slate-200/60 shadow-2xs">
                                                  {p.orientacao}
                                                </p>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                    
                                    {/* Botões de Ação */}
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shrink-0">
                                      <button 
                                        type="button"
                                        onClick={() => toggleAtivo(p.id, isAtivo)}
                                        className={`p-2 rounded-lg transition-all active:scale-90 shadow-2xs hover:shadow-xs ${
                                          isAtivo ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'
                                        }`}
                                        title={isAtivo ? "Desativar Critério" : "Ativar Critério"}
                                      >
                                        {isAtivo ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                                      </button>
                                      <button 
                                        type="button"
                                        onClick={() => handleOpenEdit(p)}
                                        className="p-2 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-all active:scale-90 shadow-2xs hover:shadow-xs"
                                        title="Editar Critério"
                                      >
                                        <Edit3 className="w-4 h-4" />
                                      </button>
                                      <button 
                                        type="button"
                                        onClick={() => handleOpenDelete(p)}
                                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all active:scale-90 shadow-2xs hover:shadow-xs"
                                        title="Excluir Critério"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </Draggable>
                            );
                          })}
                          {provided.placeholder}
                        </div>
                      </div>
                    )}
                  </Droppable>
                ))
              )}
              </DragDropContext>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Nova Seção */}
      <Modal 
        isOpen={isSecaoOpen} 
        onClose={() => setIsSecaoOpen(false)} 
        title="Nova Seção RTRS"
      >
        <form onSubmit={handleAddSecao} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-800">Nome da Seção</label>
            <input 
              required
              value={secaoName}
              onChange={e => setSecaoName(e.target.value)}
              placeholder="Ex: Princípio 6: Governança e Compliance"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 text-sm transition-all"
            />
          </div>
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
            <button 
              type="button"
              onClick={() => setIsSecaoOpen(false)}
              className="px-4 py-2.5 font-semibold text-sm rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              className="px-4 py-2.5 font-semibold text-sm rounded-xl bg-emerald-700 text-white hover:bg-emerald-800 transition-colors shadow-sm"
            >
              Criar Seção
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Critério */}
      <Modal 
        isOpen={isFormOpen} 
        onClose={() => setIsFormOpen(false)} 
        title={editingItem ? "Editar Critério RTRS" : "Novo Critério RTRS"}
      >
        <form onSubmit={handleSubmit} className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Código do Indicador</label>
            <input 
              required
              value={formData.numero_criterio}
              onChange={e => setFormData({...formData, numero_criterio: e.target.value})}
              placeholder="Ex: 1.1.1"
              className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 text-sm font-semibold transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Critério Pai</label>
            <textarea 
              required
              value={formData.criterio}
              onChange={e => setFormData({...formData, criterio: e.target.value})}
              rows={2}
              placeholder="Ex: 1.1 Toda a legislação aplicável é conhecida e cumprida..."
              className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 text-sm font-medium resize-none transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Ponderação (Classificação)</label>
            <select
              value={formData.ponderacao}
              onChange={e => setFormData({...formData, ponderacao: e.target.value})}
              className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 text-sm font-semibold text-slate-800 transition-all"
            >
              <option value="Imediata">Imediata</option>
              <option value="Curto prazo">Curto prazo</option>
              <option value="Médio prazo">Médio prazo</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Enunciado da Pergunta (Indicador)</label>
            <textarea 
              required
              value={formData.enunciado}
              onChange={e => setFormData({...formData, enunciado: e.target.value})}
              rows={3}
              placeholder="Enunciado da verificação em campo..."
              className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 text-sm font-medium resize-none transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Orientação de Auditoria (Instruções)</label>
            <textarea 
              value={formData.orientacao}
              onChange={e => setFormData({...formData, orientacao: e.target.value})}
              rows={3}
              placeholder="Instruções para verificação de evidências na propriedade..."
              className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 text-sm font-medium resize-none transition-all"
            />
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
            <button 
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="px-4 py-2.5 font-semibold text-sm rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              className="px-4 py-2.5 font-semibold text-sm rounded-xl bg-emerald-700 text-white hover:bg-emerald-800 transition-colors shadow-sm"
            >
              {editingItem ? "Salvar Alterações" : "Adicionar Critério"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Deleção */}
      <ConfirmDelete 
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Excluir Critério RTRS"
        description={`Tem certeza que deseja apagar o indicador "${itemToDelete?.numero_criterio}" permanentemente?`}
      />
    </div>
  );
}
