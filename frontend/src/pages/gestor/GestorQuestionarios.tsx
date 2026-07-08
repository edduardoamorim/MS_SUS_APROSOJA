import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { ClipboardList, Plus, Search, Edit3, Trash2, GripVertical, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import ConfirmDelete from '../../components/ui/ConfirmDelete';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';

export default function GestorQuestionarios() {
  const { success, error } = useToast();
  const [secaoAtiva, setSecaoAtiva] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Mock data states with localStorage persistence for custom sections
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

  useEffect(() => {
    fetchPerguntas();
  }, []);

  async function fetchPerguntas() {
    setLoading(true);
    const { data, error } = await supabase.from('perguntas_rtrs').select('*');
    if (!error && data) {
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
        
        // Se pertencerem ao mesmo critério e a ordem for diferente, aplica-se a ordem explícita
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
      // Extrair seções únicas do banco de dados (Princípios oficiais)
      const uniqueSecoes = Array.from(new Set(sorted.map((p: any) => p.secao)));
      // Carregar seções customizadas do localStorage
      const saved = localStorage.getItem('ms_sustentavel_custom_secoes');
      let customSecoes: string[] = [];
      if (saved) {
        try {
          customSecoes = JSON.parse(saved);
        } catch (e) {}
      }
      // Mesclar apenas as seções que de fato contêm perguntas, limpando as seções antigas mockadas vazias
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
      
      const defaultSecoes = ['Direitos Trabalhistas', 'Práticas Agrícolas', 'Meio Ambiente', 'Relações Comunitárias'];
      const customOnly = newSecoes.filter(s => !defaultSecoes.includes(s));
      localStorage.setItem('ms_sustentavel_custom_secoes', JSON.stringify(customOnly));
      
      setSecaoAtiva(secaoName);
    }
    setIsSecaoOpen(false);
    setSecaoName('');
  };

  // Handlers para Critérios
  const handleOpenCreate = () => {
    setEditingItem(null);
    const filteredCount = perguntas.filter(p => p.secao === secaoAtiva).length;
    setFormData({ 
      numero_criterio: `${secaoAtiva.startsWith('Princípio') ? secaoAtiva.split(' ')[1].replace(':', '') : '1'}.1.${filteredCount + 1}`, 
      enunciado: '',
      criterio: '',
      ponderacao: '',
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
      ponderacao: item.ponderacao || '',
      orientacao: item.orientacao || ''
    });
    setIsFormOpen(true);
  };

  const handleOpenDelete = (item: any) => {
    setItemToDelete(item);
    setIsDeleteOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingItem) {
        const { error } = await supabase.from('perguntas_rtrs').update(formData).eq('id', editingItem.id);
        if (error) throw error;
        setPerguntas(perguntas.map(p => p.id === editingItem.id ? { ...p, ...formData } : p));
      } else {
        const novoItem = { ...formData, secao: secaoAtiva };
        const { data, error } = await supabase.from('perguntas_rtrs').insert([novoItem]).select().single();
        if (error) throw error;
        if (data) setPerguntas([...perguntas, data]);
      }
      setIsFormOpen(false);
      success('Pergunta salva com sucesso!');
    } catch (err: any) {
      console.error('Erro ao salvar no Supabase:', err);
      error('Erro ao salvar no banco: ' + err.message);
    }
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    try {
      const { error: err } = await supabase.from('perguntas_rtrs').delete().eq('id', itemToDelete.id);
      if (err) throw err;
      setPerguntas(perguntas.filter(p => p.id !== itemToDelete.id));
      setIsDeleteOpen(false);
      success('Pergunta excluída com sucesso!');
    } catch (err: any) {
      console.error('Erro ao excluir no Supabase:', err);
      error('Erro ao excluir no banco: ' + err.message);
    }
  };

  const toggleAtivo = async (id: string, currentAtivo: boolean) => {
    try {
      const { error: err } = await supabase.from('perguntas_rtrs').update({ ativo: !currentAtivo }).eq('id', id);
      if (err) throw err;
      setPerguntas(perguntas.map(p => p.id === id ? { ...p, ativo: !currentAtivo } : p));
      success('Status do critério atualizado!');
    } catch (err: any) {
      console.error('Erro ao alternar status do critério:', err);
      error('Erro ao alternar status: ' + err.message);
    }
  };

  const perguntasDaSecao = perguntas.filter(p => 
    p.secao === secaoAtiva && 
    (p.numero_criterio.toLowerCase().includes(searchQuery.toLowerCase()) || 
     p.enunciado.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Agrupamento por Critério
  const criteriaGroups: Record<string, any[]> = {};
  perguntasDaSecao.forEach(p => {
    const groupKey = p.criterio || 'Outros Critérios';
    if (!criteriaGroups[groupKey]) {
      criteriaGroups[groupKey] = [];
    }
    criteriaGroups[groupKey].push(p);
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleDragEnd = async (result: any) => {
    if (!result.destination) return;
    const { source, destination } = result;

    if (source.droppableId !== destination.droppableId || source.index === destination.index) return;

    const groupKey = source.droppableId;
    const groupList = Array.from(criteriaGroups[groupKey]);
    const [reorderedItem] = groupList.splice(source.index, 1);
    groupList.splice(destination.index, 0, reorderedItem);

    // Reassign ordem
    const updatedItems = groupList.map((item, index) => ({ ...item, ordem: index }));

    // Atualização otimista
    setPerguntas(prev => {
      const next = [...prev];
      updatedItems.forEach(uItem => {
        const idx = next.findIndex(p => p.id === uItem.id);
        if (idx !== -1) next[idx] = uItem;
      });
      return next;
    });

    try {
      // Salva no banco em background
      updatedItems.forEach(async (item) => {
        await supabase.from('perguntas_rtrs').update({ ordem: item.ordem }).eq('id', item.id);
      });
    } catch (err) {
      console.error('Erro reordenando:', err);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" />
            Matriz RTRS
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">Configure as seções e os critérios avaliados em campo.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setIsSecaoOpen(true)}
            className="flex items-center gap-2 bg-background border border-input text-foreground hover:bg-muted px-4 py-2 rounded-md font-medium text-sm transition-all shadow-sm active:scale-95 hover:shadow-md hover:-translate-y-0.5"
          >
            Nova Seção
          </button>
          <button 
            onClick={handleOpenCreate}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md font-medium text-sm transition-all shadow-sm active:scale-95 hover:shadow-md hover:-translate-y-0.5"
          >
            <Plus className="w-4 h-4" />
            Novo Critério
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar Interna de Seções */}
        <div className="w-full lg:w-64 flex-shrink-0 space-y-1">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2">Seções do Questionário</h3>
          {secoes.map(secao => (
            <button
              key={secao}
              onClick={() => setSecaoAtiva(secao)}
              className={`w-full text-left px-3 py-2 rounded-md font-medium text-sm transition-all ${
                secaoAtiva === secao 
                ? 'bg-primary/10 text-primary font-semibold' 
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {secao}
            </button>
          ))}
        </div>

        {/* Lista de Critérios */}
        <div className="flex-1 space-y-4">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5" />
            <input 
              type="text" 
              placeholder={`Buscar critérios em "${secaoAtiva}"...`}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent shadow-sm text-sm"
            />
          </div>

          <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
            <div className="px-5 py-3 bg-muted/50 border-b border-border flex justify-between items-center">
              <h2 className="font-semibold text-foreground text-sm">{secaoAtiva}</h2>
              <span className="text-xs font-semibold text-muted-foreground">
                {Object.keys(criteriaGroups).length} critérios e {perguntasDaSecao.length} indicadores cadastrados
              </span>
            </div>
            <div className="divide-y divide-border">
              <DragDropContext onDragEnd={handleDragEnd}>
              {perguntasDaSecao.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">Nenhum critério cadastrado nesta seção.</div>
              ) : (
                Object.entries(criteriaGroups).map(([criterionName, groupPerguntas]) => (
                  <Droppable droppableId={criterionName} key={criterionName}>
                    {(provided) => (
                    <div 
                      className="p-5 space-y-4 bg-white/40 border-b border-border last:border-b-0"
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                    >
                      {/* Cabeçalho do Critério Pai */}
                    <div className="bg-slate-100 border border-slate-200/80 px-4 py-3 rounded-xl shadow-xs">
                      <h4 className="text-xs font-black text-slate-800 leading-relaxed uppercase tracking-wider">
                        {criterionName}
                      </h4>
                    </div>
                    
                    {/* Lista de Indicadores internos */}
                    <div className="space-y-4 pl-2">
                      {groupPerguntas.map((p, index) => {
                        const isAtivo = p.ativo !== false;
                        let ponderacaoBadge = null;
                        if (p.ponderacao) {
                          let badgeColor = 'bg-slate-100 text-slate-700 border-slate-200';
                          if (p.ponderacao.toLowerCase().includes('imediata')) {
                            badgeColor = 'bg-red-50 text-red-700 border-red-200 font-extrabold';
                          } else if (p.ponderacao.toLowerCase().includes('curto')) {
                            badgeColor = 'bg-amber-50 text-amber-700 border-amber-200 font-extrabold';
                          } else if (p.ponderacao.toLowerCase().includes('médio') || p.ponderacao.toLowerCase().includes('medio')) {
                            badgeColor = 'bg-blue-50 text-blue-700 border-blue-200 font-bold';
                          }
                          ponderacaoBadge = (
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase border tracking-wider ${badgeColor}`}>
                              {p.ponderacao}
                            </span>
                          );
                        }

                        return (
                          <Draggable key={p.id} draggableId={p.id} index={index}>
                            {(provided, snapshot) => (
                            <div 
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`p-4 bg-white rounded-xl border border-slate-200/80 shadow-xs transition-all flex items-start gap-4 group ${
                                snapshot.isDragging ? 'shadow-xl ring-2 ring-primary/30 bg-slate-50 scale-[1.02] z-50' : (isAtivo ? 'hover:bg-slate-50/40 hover:shadow-md' : 'bg-slate-50/50 opacity-75')
                              }`}
                            >
                              <div 
                                {...provided.dragHandleProps}
                                className="mt-1 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-primary transition-colors shrink-0"
                              >
                                <GripVertical className="w-4 h-4" />
                              </div>
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-primary text-[10px] bg-primary/10 px-2 py-0.5 rounded border border-primary/20 tracking-wider">
                                    Indicador {p.numero_criterio}
                                </span>
                                {ponderacaoBadge}
                                {!isAtivo && (
                                  <span className="font-semibold text-destructive text-[10px] bg-destructive/10 px-2 py-0.5 rounded border border-destructive/20 tracking-wider uppercase">
                                    Inativo
                                  </span>
                                )}
                              </div>
                              <p className={`text-sm font-bold leading-relaxed ${isAtivo ? 'text-slate-800' : 'text-muted-foreground line-through'}`}>{p.enunciado}</p>
                              {p.orientacao && (
                                <details className="text-xs text-muted-foreground bg-slate-50/80 p-3 rounded-xl border border-slate-200/60 cursor-pointer">
                                  <summary className="font-bold select-none text-[10px] text-emerald-800 uppercase tracking-wider">Ver Orientação / Diretrizes</summary>
                                  <p className="mt-2 leading-relaxed font-medium whitespace-pre-line text-slate-600">{p.orientacao}</p>
                                </details>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              <button 
                                type="button"
                                onClick={() => toggleAtivo(p.id, isAtivo)}
                                className={`p-2 rounded-lg transition-all active:scale-90 shadow-sm hover:shadow-md ${isAtivo ? 'text-amber-600 hover:bg-amber-100' : 'text-emerald-600 hover:bg-emerald-100'}`}
                                title={isAtivo ? "Desativar Critério" : "Ativar Critério"}
                              >
                                {isAtivo ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                              </button>
                              <button 
                                type="button"
                                onClick={() => handleOpenEdit(p)}
                                className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all active:scale-90 shadow-sm hover:shadow-md"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button 
                                type="button"
                                onClick={() => handleOpenDelete(p)}
                                className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all active:scale-90 shadow-sm hover:shadow-md"
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
            <label className="text-sm font-medium text-foreground">Nome da Seção</label>
            <input 
              required
              value={secaoName}
              onChange={e => setSecaoName(e.target.value)}
              placeholder="Ex: Saúde e Segurança"
              className="w-full px-3 py-2 bg-background border border-input rounded-md focus:ring-2 focus:ring-primary text-sm"
            />
          </div>
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
            <button 
              type="button"
              onClick={() => setIsSecaoOpen(false)}
              className="px-4 py-2 font-medium text-sm rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              className="px-4 py-2 font-medium text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
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
        title={editingItem ? "Editar Critério" : "Novo Critério"}
      >
        <form onSubmit={handleSubmit} className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Código do Indicador</label>
            <input 
              required
              value={formData.numero_criterio}
              onChange={e => setFormData({...formData, numero_criterio: e.target.value})}
              placeholder="Ex: 1.1.1"
              className="w-full px-3 py-2 bg-background border border-input rounded-md focus:ring-2 focus:ring-primary text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Critério Pai</label>
            <textarea 
              required
              value={formData.criterio}
              onChange={e => setFormData({...formData, criterio: e.target.value})}
              rows={2}
              placeholder="Ex: 1.1 Toda a legislação aplicável..."
              className="w-full px-3 py-2 bg-background border border-input rounded-md focus:ring-2 focus:ring-primary text-sm resize-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Ponderação (Classificação)</label>
            <select
              value={formData.ponderacao}
              onChange={e => setFormData({...formData, ponderacao: e.target.value})}
              className="w-full px-3 py-2 bg-background border border-input rounded-md focus:ring-2 focus:ring-primary text-sm text-foreground"
            >
              <option value="">Selecione a classificação...</option>
              <option value="Imediata">Imediata</option>
              <option value="Curto prazo">Curto prazo</option>
              <option value="Médio prazo">Médio prazo</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Enunciado da Pergunta (Indicador)</label>
            <textarea 
              required
              value={formData.enunciado}
              onChange={e => setFormData({...formData, enunciado: e.target.value})}
              rows={3}
              placeholder="Qual a pergunta que o auditor deve responder?"
              className="w-full px-3 py-2 bg-background border border-input rounded-md focus:ring-2 focus:ring-primary text-sm resize-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Orientação de Auditoria (Instruções)</label>
            <textarea 
              value={formData.orientacao}
              onChange={e => setFormData({...formData, orientacao: e.target.value})}
              rows={3}
              placeholder="Ex: Devem ser verificados comprovantes de dados pessoais..."
              className="w-full px-3 py-2 bg-background border border-input rounded-md focus:ring-2 focus:ring-primary text-sm resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
            <button 
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="px-4 py-2 font-medium text-sm rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              className="px-4 py-2 font-medium text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
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
        title="Excluir Critério"
        description={`Tem certeza que deseja apagar o "${itemToDelete?.numero_criterio}" permanentemente? Auditorias que já utilizaram este critério poderão perder histórico.`}
      />
    </div>
  );
}
