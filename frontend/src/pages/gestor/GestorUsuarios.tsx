import { useState, useEffect } from 'react';
import { Users, Search, Plus, Shield, UserCog, UserCheck, Edit3, Trash2 } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import ConfirmDelete from '../../components/ui/ConfirmDelete';
import { TableRowSkeleton } from '../../components/ui/Skeleton';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';
import CityInput from '../../components/form/CityInput';
import { useSearchParams } from 'react-router-dom';

export default function GestorUsuarios() {
  const { success, error } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab = (rawTab === 'tecnicos' || rawTab === 'produtores') 
    ? rawTab 
    : 'tecnicos';
  
  const setActiveTab = (tab: 'tecnicos' | 'produtores') => {
    setSearchParams({ tab });
  };
  const [searchQuery, setSearchQuery] = useState('');

  const [loading, setLoading] = useState(true);
  const [usuarios, setUsuarios] = useState<any[]>([]);

  // Modal States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [userToDelete, setUserToDelete] = useState<any>(null);

  // Form State
  const [formData, setFormData] = useState({ nome: '', email: '', regiao: '', fazendas_vinculadas: 1, status: 'Ativo' });

  useEffect(() => {
    fetchUsuarios();
  }, []);

  async function fetchUsuarios() {
    setLoading(true);
    const { data, error } = await supabase.from('perfis').select('*').order('created_at', { ascending: false });
    if (!error && data) {
      setUsuarios(data);
    }
    setLoading(false);
  }

  const handleOpenCreate = () => {
    setEditingUser(null);
    setFormData({ nome: '', email: '', regiao: '', fazendas_vinculadas: 1, status: 'Ativo' });
    setIsFormOpen(true);
  };

  const handleOpenEdit = (user: any) => {
    setEditingUser(user);
    setFormData({ 
      nome: user.nome, 
      email: user.email, 
      regiao: user.regiao || '', 
      fazendas_vinculadas: user.fazendas_vinculadas || 0, 
      status: user.status 
    });
    setIsFormOpen(true);
  };

  const handleOpenDelete = (user: any) => {
    setUserToDelete(user);
    setIsDeleteOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        role: activeTab === 'tecnicos' ? 'tecnico' : 'produtor'
      };

      if (editingUser) {
        const { error } = await supabase.from('perfis').update(payload).eq('id', editingUser.id);
        if (error) throw error;
        setUsuarios(usuarios.map(u => u.id === editingUser.id ? { ...u, ...payload } : u));
        success('Usuário atualizado com sucesso!');
      } else {
        // Usa a Edge Function para convidar o usuário, o que dispara o envio de email bonitinho do Auth
        const { data, error } = await supabase.functions.invoke('invite-user', {
          body: {
            email: formData.email,
            nome: formData.nome,
            role: payload.role,
            regiao: formData.regiao
          }
        });

        if (error) throw error;
        if (data && data.error) throw new Error(data.error);

        // Atualizar lista local: Note que o trigger vai popular a tabela perfis
        // Para uma atualização limpa, fazemos um leve refetch ou inserimos no state provisoriamente
        fetchUsuarios();
        success('Convite enviado com sucesso para o e-mail do usuário!');
      }
      setIsFormOpen(false);
    } catch (err: any) {
      console.error('Erro ao salvar no Supabase:', err);
      error('Erro ao processar usuário: ' + err.message);
    }
  };

  const handleDelete = async () => {
    if (!userToDelete) return;
    try {
      const { error: err } = await supabase.from('perfis').delete().eq('id', userToDelete.id);
      if (err) throw err;
      setUsuarios(usuarios.filter(u => u.id !== userToDelete.id));
      setIsDeleteOpen(false);
      success('Usuário excluído com sucesso!');
    } catch (err: any) {
      console.error('Erro ao excluir no Supabase:', err);
      error('Erro ao excluir usuário: ' + err.message);
    }
  };

  const filteredUsuarios = usuarios.filter(u => 
    (u.nome || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
    (u.email || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const tecnicos = filteredUsuarios.filter(u => u.role === 'tecnico');
  const produtores = filteredUsuarios.filter(u => u.role === 'produtor');
  const currentList = activeTab === 'tecnicos' ? tecnicos : produtores;

  if (loading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto p-6">
        <div className="flex justify-between items-end border-b border-border pb-6 mb-8">
          <div className="w-1/3 h-10 bg-muted/50 rounded-lg animate-pulse"></div>
          <div className="w-1/4 h-10 bg-muted/50 rounded-lg animate-pulse"></div>
        </div>
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="p-4 border-b border-border bg-muted/50 flex justify-between">
             <div className="w-1/4 h-8 bg-muted rounded animate-pulse"></div>
             <div className="w-1/4 h-8 bg-muted rounded animate-pulse"></div>
          </div>
          <table className="w-full">
            <tbody>
              <TableRowSkeleton />
              <TableRowSkeleton />
              <TableRowSkeleton />
              <TableRowSkeleton />
              <TableRowSkeleton />
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Controle de Usuários
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">Gerencie acessos de Técnicos de Campo e Produtores Rurais.</p>
        </div>
        <button 
          onClick={handleOpenCreate}
          className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md font-medium text-sm transition-all shadow-sm active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          Convidar {activeTab === 'tecnicos' ? 'Técnico' : 'Produtor'}
        </button>
      </div>

      <div className="flex gap-6 border-b border-border">
        <button 
          onClick={() => setActiveTab('tecnicos')}
          className={`pb-3 px-1 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'tecnicos' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          <Shield className="w-4 h-4" /> Equipe de Campo
        </button>
        <button 
          onClick={() => setActiveTab('produtores')}
          className={`pb-3 px-1 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'produtores' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          <UserCog className="w-4 h-4" /> Produtores Rurais
        </button>
      </div>

      <div className="relative w-full sm:w-96">
        <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5" />
        <input 
          type="text" 
          placeholder="Buscar por nome ou email..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent shadow-sm text-sm"
        />
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-5 py-3 font-semibold text-muted-foreground">Nome</th>
                <th className="px-5 py-3 font-semibold text-muted-foreground">Email</th>
                <th className="px-5 py-3 font-semibold text-muted-foreground">
                  {activeTab === 'tecnicos' ? 'Região Atendida' : 'Fazendas Vinculadas'}
                </th>
                <th className="px-5 py-3 font-semibold text-muted-foreground">Status</th>
                <th className="px-5 py-3 font-semibold text-muted-foreground text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {currentList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              ) : (
                currentList.map((user: any) => (
                  <tr key={user.id} className="hover:bg-primary/[0.03] transition-colors group cursor-pointer">
                    <td className="px-5 py-3 font-medium text-foreground">{user.nome}</td>
                    <td className="px-5 py-3 text-muted-foreground">{user.email}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {activeTab === 'tecnicos' ? user.regiao : `${user.fazendas_vinculadas} fazenda(s)`}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wider border ${
                        user.status === 'Ativo' ? 'bg-emerald-100/50 text-emerald-800 border-emerald-200' : 'bg-muted text-muted-foreground border-border'
                      }`}>
                        {user.status === 'Ativo' && <UserCheck className="w-3.5 h-3.5" />}
                        {user.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleOpenEdit(user)}
                          className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-all hover:scale-110 hover:-translate-y-0.5 active:scale-95"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleOpenDelete(user)}
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

      {/* Modal Formulário */}
      <Modal 
        isOpen={isFormOpen} 
        onClose={() => setIsFormOpen(false)} 
        title={editingUser ? `Editar ${activeTab === 'tecnicos' ? 'Técnico' : 'Produtor'}` : `Novo ${activeTab === 'tecnicos' ? 'Técnico' : 'Produtor'}`}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Nome Completo</label>
            <input 
              required
              value={formData.nome}
              onChange={e => setFormData({...formData, nome: e.target.value})}
              className="w-full px-3 py-2 bg-background border border-input rounded-md focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Endereço de E-mail</label>
            <input 
              required
              type="email"
              value={formData.email}
              onChange={e => setFormData({...formData, email: e.target.value})}
              className="w-full px-3 py-2 bg-background border border-input rounded-md focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
            />
          </div>
          
          {activeTab === 'tecnicos' ? (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Região / Cidade</label>
              <CityInput 
                value={formData.regiao}
                onChange={val => setFormData({...formData, regiao: val})}
                className="w-full px-3 py-2 bg-background border border-input rounded-md focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Quantidade de Fazendas</label>
              <input 
                type="number"
                min="0"
                value={formData.fazendas_vinculadas}
                onChange={e => setFormData({...formData, fazendas_vinculadas: parseInt(e.target.value) || 0})}
                className="w-full px-3 py-2 bg-background border border-input rounded-md focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
              />
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Status do Acesso</label>
            <select 
              value={formData.status}
              onChange={e => setFormData({...formData, status: e.target.value})}
              className="w-full px-3 py-2 bg-background border border-input rounded-md focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
            >
              <option value="Ativo">Ativo</option>
              <option value="Inativo">Inativo</option>
            </select>
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
              {editingUser ? "Salvar Alterações" : "Enviar Convite"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Deleção */}
      <ConfirmDelete 
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Desvincular Usuário"
        description={`Tem certeza que deseja remover o usuário "${userToDelete?.nome}"? Ele perderá imediatamente o acesso à plataforma.`}
      />
    </div>
  );
}
