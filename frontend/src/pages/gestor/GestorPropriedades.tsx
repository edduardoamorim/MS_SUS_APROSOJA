import { useState, useEffect } from 'react';
import { Building2, Search, MapPin, Plus, Loader2, Edit3, Trash2, ClipboardList, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Modal from '../../components/ui/Modal';
import ConfirmDelete from '../../components/ui/ConfirmDelete';
import ConfirmAction from '../../components/ui/ConfirmAction';
import { useToast } from '../../context/ToastContext';
import { getRemainingTimeLabel } from '../../lib/dateUtils';
import PropertyCodeInput from '../../components/form/PropertyCodeInput';
import type { PropertyOrigin } from '../../components/form/PropertyCodeInput';
import { TableRowSkeleton } from '../../components/ui/Skeleton';

export default function GestorPropriedades() {
  const { success, error, warning } = useToast();
  const [loading, setLoading] = useState(true);
  const [propriedades, setPropriedades] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingProp, setEditingProp] = useState<any>(null);
  const [itemToDelete, setItemToDelete] = useState<any>(null);

  // Form State
  const [formData, setFormData] = useState({ 
    nome_fazenda: '', 
    nome_produtor: '', 
    codigo_car: '', 
    codigo_sigef: '', 
    origem_cadastro: 'CAR' as PropertyOrigin, 
    geom: null as any 
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pendencies States
  const [selectedPropForPends, setSelectedPropForPends] = useState<any>(null);
  const [propPendencias, setPropPendencias] = useState<any[]>([]);
  const [loadingPends, setLoadingPends] = useState(false);
  const [isNewPendFormOpen, setIsNewPendFormOpen] = useState(false);
  const [newPendData, setNewPendData] = useState({ titulo: '', descricao: '', prazo: '', tecnico_responsavel_id: '' });
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [deletePendConfirmId, setDeletePendConfirmId] = useState<string | null>(null);

  useEffect(() => {
    fetchPropriedades();
    fetchTechnicians();
  }, []);

  async function fetchTechnicians() {
    try {
      const { data, error } = await supabase
        .from('perfis')
        .select('id, nome, email')
        .eq('role', 'tecnico');
      if (error) throw error;
      setTechnicians(data || []);
    } catch (err: any) {
      console.error('Erro ao buscar técnicos:', err);
    }
  }

  async function fetchPropriedades() {
    setLoading(true);
    const { data, error } = await supabase.from('propriedades').select('*');
    if (!error && data) {
      setPropriedades(data);
    }
    setLoading(false);
  }

  const handleOpenCreate = () => {
    setEditingProp(null);
    setFormData({ 
      nome_fazenda: '', 
      nome_produtor: '', 
      codigo_car: '', 
      codigo_sigef: '', 
      origem_cadastro: 'CAR', 
      geom: null 
    });
    setIsFormOpen(true);
  };

  const handleOpenEdit = (prop: any) => {
    setEditingProp(prop);
    setFormData({ 
      nome_fazenda: prop.nome_fazenda, 
      nome_produtor: prop.nome_produtor, 
      codigo_car: prop.codigo_car || '',
      codigo_sigef: prop.codigo_sigef || '',
      origem_cadastro: prop.origem_cadastro || 'CAR',
      geom: prop.geom || null
    });
    setIsFormOpen(true);
  };

  const handleOpenDelete = (prop: any) => {
    setItemToDelete(prop);
    setIsDeleteOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    if (formData.origem_cadastro === 'CAR' && formData.codigo_car) {
      const CAR_REGEX = /^[A-Z]{2}-\d{7}-[0-9A-Z]+$/;
      if (!CAR_REGEX.test(formData.codigo_car)) {
        warning('Formato de CAR inválido. Use o padrão UF-1234567-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
        setIsSubmitting(false);
        return;
      }
    } else if (formData.origem_cadastro === 'SIGEF' && !formData.codigo_sigef) {
      warning('Selecione uma parcela do SIGEF.');
      setIsSubmitting(false);
      return;
    } else if (formData.origem_cadastro === 'KML' && !formData.geom) {
      warning('Faça upload de um arquivo KML/KMZ contendo geometria.');
      setIsSubmitting(false);
      return;
    }
    
    try {
      if (editingProp) {
        // Update
        const { error } = await supabase.from('propriedades').update(formData).eq('id', editingProp.id);
        if (error) throw error;
        setPropriedades(propriedades.map(p => p.id === editingProp.id ? { ...p, ...formData } : p));
      } else {
        // Create
        // Pegar o ID do produtor logado ou associar a um produtor teste
        const { data: { user } } = await supabase.auth.getUser();
        
        const payload = {
          ...formData,
          produtor_id: user?.id || null
        };
        const { data, error } = await supabase.from('propriedades').insert([payload]).select().single();
        if (error) throw error;
        if (data) setPropriedades([...propriedades, data]);
      }
      setIsFormOpen(false);
      success('Propriedade salva com sucesso!');
    } catch (err: any) {
      console.error('Erro ao salvar no Supabase:', err);
      error('Erro ao salvar no banco de dados: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    
    try {
      const { error: err } = await supabase.from('propriedades').delete().eq('id', itemToDelete.id);
      if (err) throw err;
      setPropriedades(propriedades.filter(p => p.id !== itemToDelete.id));
      setIsDeleteOpen(false);
      success('Propriedade excluída com sucesso!');
    } catch (err: any) {
      console.error('Erro ao deletar no Supabase:', err);
      error('Erro ao excluir no banco de dados: ' + err.message);
    }
  };

  // Funções de Pendências
  const handleOpenPendencias = async (prop: any) => {
    setSelectedPropForPends(prop);
    setLoadingPends(true);
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

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const payload = {
        propriedade_id: selectedPropForPends.id,
        titulo: newPendData.titulo,
        descricao: newPendData.descricao,
        prazo: newPendData.prazo || null,
        status: 'Pendente',
        criado_por: user?.id || null,
        tecnico_responsavel_id: newPendData.tecnico_responsavel_id || null
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
      setNewPendData({ titulo: '', descricao: '', prazo: '', tecnico_responsavel_id: '' });
      success('Pendência criada com sucesso!');
    } catch (err: any) {
      console.error('Erro ao criar pendência:', err);
      error('Erro ao criar pendência: ' + err.message);
    }
  };

  const handleUpdatePendencyStatus = async (id: string, newStatus: 'Resolvida' | 'Pendente') => {
    try {
      const { error: err } = await supabase
        .from('pendencias')
        .update({ status: newStatus })
        .eq('id', id);
      if (err) throw err;

      setPropPendencias(propPendencias.map(p => p.id === id ? { ...p, status: newStatus } : p));
      success('Status da pendência atualizado!');
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
    try {
      const { error: err } = await supabase
        .from('pendencias')
        .delete().eq('id', id);
      if (err) throw err;

      setPropPendencias(propPendencias.filter(p => p.id !== id));
      success('Pendência excluída!');
    } catch (err: any) {
      console.error('Erro ao deletar pendência:', err);
      error('Erro ao deletar pendência: ' + err.message);
    } finally {
      setDeletePendConfirmId(null);
    }
  };

  const filteredProperties = propriedades.filter(p => 
    (p.nome_fazenda || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
    (p.nome_produtor || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
    (p.codigo_car || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            Gestão de Propriedades
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">Gerencie as fazendas cadastradas e seus limites geográficos.</p>
        </div>
        <button 
          onClick={handleOpenCreate}
          className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md font-medium text-sm transition-all shadow-sm active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          Nova Propriedade
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5" />
          <input 
            type="text" 
            placeholder="Buscar por nome, CAR ou produtor..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent shadow-sm text-sm"
          />
        </div>
      </div>

      {loading ? (
        <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-5 py-3 font-semibold text-muted-foreground">Fazenda</th>
                  <th className="px-5 py-3 font-semibold text-muted-foreground">Produtor Responsável</th>
                  <th className="px-5 py-3 font-semibold text-muted-foreground">CAR</th>
                  <th className="px-5 py-3 font-semibold text-muted-foreground text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <TableRowSkeleton />
                <TableRowSkeleton />
                <TableRowSkeleton />
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-5 py-3 font-semibold text-muted-foreground">Fazenda</th>
                  <th className="px-5 py-3 font-semibold text-muted-foreground">Produtor Responsável</th>
                  <th className="px-5 py-3 font-semibold text-muted-foreground">CAR</th>
                  <th className="px-5 py-3 font-semibold text-muted-foreground text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredProperties.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">
                      Nenhuma propriedade encontrada.
                    </td>
                  </tr>
                ) : (
                  filteredProperties.map((prop: any) => (
                    <tr key={prop.id} className="hover:bg-primary/[0.03] transition-colors group cursor-pointer">
                      <td className="px-5 py-3 font-medium text-foreground">{prop.nome_fazenda}</td>
                      <td className="px-5 py-3 text-muted-foreground">{prop.nome_produtor}</td>
                      <td className="px-5 py-3 text-muted-foreground font-mono text-xs">
                        {prop.origem_cadastro === 'SIGEF' ? (
                          <span className="text-[10px] bg-purple-50 text-purple-855 border border-purple-200 px-2 py-0.5 rounded font-bold uppercase">
                            SIGEF: {prop.codigo_sigef?.substring(0, 8)}...
                          </span>
                        ) : prop.origem_cadastro === 'KML' ? (
                          <span className="text-[10px] bg-sky-50 text-sky-855 border border-sky-200 px-2 py-0.5 rounded font-bold uppercase">
                            KML / KMZ
                          </span>
                        ) : (
                          prop.codigo_car || 'N/A'
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => handleOpenPendencias(prop)}
                            className="text-amber-700 hover:text-amber-800 font-semibold text-xs bg-amber-50 hover:bg-amber-100/80 px-2.5 py-1.5 rounded-md flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 border border-amber-200 cursor-pointer"
                          >
                            <ClipboardList className="w-3.5 h-3.5" /> Pendências
                          </button>
                          <button className="text-primary hover:text-primary/80 font-medium text-xs bg-primary/10 hover:bg-primary/20 px-2 py-1.5 rounded-md flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 cursor-pointer">
                            <MapPin className="w-3.5 h-3.5" /> Mapa
                          </button>
                          <button 
                            onClick={() => handleOpenEdit(prop)}
                            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-all hover:scale-110 hover:-translate-y-0.5 active:scale-95"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleOpenDelete(prop)}
                            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-all hover:scale-110 hover:-translate-y-0.5 active:scale-95"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Formulário */}
      <Modal 
        isOpen={isFormOpen} 
        onClose={() => setIsFormOpen(false)} 
        title={editingProp ? "Editar Propriedade" : "Nova Propriedade"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Produtor Responsável</label>
            <input 
              required
              value={formData.nome_produtor}
              onChange={e => setFormData({...formData, nome_produtor: e.target.value})}
              className="w-full px-3 py-2 bg-background border border-input rounded-md focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
            />
          </div>

          <PropertyCodeInput
            initialNomeFazenda={formData.nome_fazenda}
            initialCodigoCar={formData.codigo_car}
            onChange={(data) => {
              setFormData(prev => ({
                ...prev,
                nome_fazenda: data.nome_fazenda,
                codigo_car: data.codigo_car,
                codigo_sigef: data.codigo_sigef,
                origem_cadastro: data.origem,
                geom: data.geom
              }));
            }}
          />
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
              disabled={isSubmitting}
              className="px-4 py-2 font-medium text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-2 cursor-pointer"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingProp ? "Salvar Alterações" : "Criar Propriedade"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Deleção */}
      <ConfirmDelete 
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Excluir Propriedade"
        description={`Tem certeza que deseja excluir a propriedade "${itemToDelete?.nome_fazenda}"? Esta ação não pode ser desfeita e removerá todos os dados vinculados a ela.`}
      />

      {/* Modal Controle de Pendências */}
      {selectedPropForPends && (
        <Modal
          isOpen={!!selectedPropForPends}
          onClose={() => setSelectedPropForPends(null)}
          title={`Pendências: ${selectedPropForPends.nome_fazenda}`}
        >
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <span className="text-xs text-muted-foreground font-semibold">
                Gestão de exigências e conformidades.
              </span>
              <button
                onClick={() => setIsNewPendFormOpen(true)}
                className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-md text-xs transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Nova Exigência
              </button>
            </div>

            {isNewPendFormOpen && (
              <form onSubmit={handleAddPendency} className="bg-muted/40 p-4 rounded-xl border border-border space-y-3 animate-fade-in-down">
                <div className="font-bold text-xs text-foreground uppercase tracking-wider">Nova Pendência</div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-muted-foreground">Título</label>
                  <input
                    required
                    type="text"
                    placeholder="Ex: Apresentar comprovante de EPI"
                    value={newPendData.titulo}
                    onChange={e => setNewPendData({...newPendData, titulo: e.target.value})}
                    className="w-full px-2.5 py-1.5 bg-background border border-input rounded-md text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-muted-foreground">Descrição</label>
                  <textarea
                    required
                    placeholder="Descreva detalhadamente o que o produtor precisa corrigir..."
                    value={newPendData.descricao}
                    onChange={e => setNewPendData({...newPendData, descricao: e.target.value})}
                    rows={3}
                    className="w-full px-2.5 py-1.5 bg-background border border-input rounded-md text-xs resize-none focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-muted-foreground">Prazo Limite</label>
                  <input
                    type="date"
                    min={new Date().toISOString().split('T')[0]}
                    value={newPendData.prazo}
                    onChange={e => setNewPendData({...newPendData, prazo: e.target.value})}
                    className="w-full px-2.5 py-1.5 bg-background border border-input rounded-md text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-muted-foreground">Técnico Acompanhante</label>
                  <select
                    value={newPendData.tecnico_responsavel_id}
                    onChange={e => setNewPendData({...newPendData, tecnico_responsavel_id: e.target.value})}
                    className="w-full px-2.5 py-1.5 bg-background border border-input rounded-md text-xs focus:ring-1 focus:ring-primary focus:outline-none text-foreground"
                  >
                    <option value="">Nenhum (Sem atribuição)</option>
                    {technicians.map(t => (
                      <option key={t.id} value={t.id}>{t.nome} ({t.email})</option>
                    ))}
                  </select>
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
                      <div className="space-y-1">
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
                        {pend.tecnico_responsavel_id && (
                          <div className="text-[10px] text-primary/80 font-bold mt-1.5 flex items-center gap-1">
                            <span className="bg-primary/10 px-2 py-0.5 rounded">
                              Técnico Acompanhante: {technicians.find(t => t.id === pend.tecnico_responsavel_id)?.nome || 'Carregando...'}
                            </span>
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
                        <div className="flex gap-2 pt-1.5 justify-end">
                          <button
                            onClick={() => handleUpdatePendencyStatus(pend.id, 'Pendente')}
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
