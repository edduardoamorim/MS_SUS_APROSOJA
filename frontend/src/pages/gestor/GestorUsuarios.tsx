import { useState, useEffect } from 'react';
import { Users, Search, Plus, Shield, UserCog, UserCheck, Edit3, Trash2, LayoutGrid, Table } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import ConfirmDelete from '../../components/ui/ConfirmDelete';
import { TableRowSkeleton } from '../../components/ui/Skeleton';
import { supabase, createIsolatedAuthClient } from '../../lib/supabase';
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
  const [viewMode, setViewMode] = useState<'auto' | 'cards' | 'table'>('auto');

  const [loading, setLoading] = useState(true);
  const [usuarios, setUsuarios] = useState<any[]>([]);

  // Modal States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [userToDelete, setUserToDelete] = useState<any>(null);

  // Form State
  const [formData, setFormData] = useState({ nome: '', email: '', telefone: '', whatsapp: '', regiao: '', fazendas_vinculadas: 1, status: 'Ativo' });

  useEffect(() => {
    fetchUsuarios();
  }, []);

  async function fetchUsuarios() {
    setLoading(true);
    try {
      const [perfisRes, propsRes, auditsRes] = await Promise.all([
        supabase.from('perfis').select('*').order('created_at', { ascending: false }),
        supabase.from('propriedades').select('produtor_id'),
        supabase.from('auditorias').select('tecnico_responsavel_id')
      ]);

      if (!perfisRes.error && perfisRes.data) {
        const prodCountMap = new Map<string, number>();
        (propsRes.data || []).forEach((p: any) => {
          if (p.produtor_id) {
            prodCountMap.set(p.produtor_id, (prodCountMap.get(p.produtor_id) || 0) + 1);
          }
        });

        const techCountMap = new Map<string, number>();
        (auditsRes.data || []).forEach((a: any) => {
          if (a.tecnico_responsavel_id) {
            techCountMap.set(a.tecnico_responsavel_id, (techCountMap.get(a.tecnico_responsavel_id) || 0) + 1);
          }
        });

        const enriched = perfisRes.data.map((u: any) => {
          const realCount = u.role === 'tecnico' 
            ? (techCountMap.get(u.id) || u.fazendas_vinculadas || 0)
            : (prodCountMap.get(u.id) || u.fazendas_vinculadas || 0);
          return {
            ...u,
            fazendas_vinculadas: realCount
          };
        });

        setUsuarios(enriched);
      }
    } catch (err) {
      console.warn('Erro ao carregar usuários e contagens:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleOpenCreate = () => {
    setEditingUser(null);
    setFormData({ nome: '', email: '', telefone: '', whatsapp: '', regiao: '', fazendas_vinculadas: 1, status: 'Ativo' });
    setIsFormOpen(true);
  };

  const handleOpenEdit = (user: any) => {
    setEditingUser(user);
    setFormData({ 
      nome: user.nome, 
      email: user.email, 
      telefone: user.telefone || user.whatsapp || '',
      whatsapp: user.whatsapp || user.telefone || '',
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
      const telFormatado = (formData.telefone || formData.whatsapp || '').trim() || null;
      const cleanRole = activeTab === 'tecnicos' ? 'tecnico' : 'produtor';
      const cleanNome = formData.nome?.trim() || '';
      const cleanEmail = formData.email?.trim().toLowerCase() || '';

      if (!cleanNome || !cleanEmail) {
        error('Informe o nome completo e o e-mail do usuário.');
        return;
      }

      if (editingUser) {
        const updatePayload: any = {
          nome: cleanNome,
          email: cleanEmail,
          telefone: telFormatado,
          regiao: formData.regiao || 'Geral, MS',
          status: formData.status || 'Ativo',
          role: cleanRole
        };

        const { error: err } = await supabase
          .from('perfis')
          .update(updatePayload)
          .eq('id', editingUser.id);

        if (err) throw err;

        // Reconciliar conta Auth, propriedades vinculadas e contagem real de fazendas
        try {
          await supabase.rpc('reconciliar_perfil_produtor', {
            p_auth_id: editingUser.id,
            p_email: cleanEmail,
            p_nome: cleanNome,
            p_telefone: telFormatado,
            p_regiao: formData.regiao || 'Geral, MS',
            p_role: cleanRole
          });
        } catch (recErr) {
          console.warn('Aviso ao reconciliar perfil editado:', recErr);
        }

        await fetchUsuarios();
        success('Usuário atualizado e vínculos sincronizados com sucesso!');
      } else {
        // 1. Tentar reconciliar/criar de forma atômica via RPC reconciliar_perfil_produtor (cria auth.users + perfis sem duplicar)
        let reconciledId: string | null = null;
        try {
          const { data: recData, error: recErr } = await supabase.rpc('reconciliar_perfil_produtor', {
            p_auth_id: null,
            p_email: cleanEmail,
            p_nome: cleanNome,
            p_telefone: telFormatado,
            p_regiao: formData.regiao || 'Geral, MS',
            p_role: cleanRole
          });
          if (!recErr && recData?.id) {
            reconciledId = recData.id;
          }
        } catch (recErr) {
          console.warn('Aviso na RPC reconciliar_perfil_produtor:', recErr);
        }

        // 2. Fallback caso a RPC não tenha retornado ID
        if (!reconciledId) {
          let authUserId: string | null = null;
          try {
            const isolatedAuth = createIsolatedAuthClient();
            const { data: signUpData, error: signUpErr } = await isolatedAuth.auth.signUp({
              email: cleanEmail,
              password: 'Senha@123',
              options: {
                data: {
                  full_name: cleanNome,
                  role: cleanRole
                }
              }
            });
            if (signUpData?.user?.id) {
              authUserId = signUpData.user.id;
            }
            if (signUpErr) {
              console.warn('Aviso no signUp Auth do Gestor:', signUpErr.message);
            }
          } catch (e) {
            console.warn('Aviso ao criar conta Auth:', e);
          }

          // Verificar se já existe perfil por e-mail antes de criar duplicata
          const { data: existingProf } = await supabase
            .from('perfis')
            .select('id')
            .ilike('email', cleanEmail)
            .maybeSingle();

          const targetId = existingProf?.id || authUserId;
          const profilePayload: any = {
            nome: cleanNome,
            email: cleanEmail,
            role: cleanRole,
            telefone: telFormatado,
            regiao: formData.regiao || 'Geral, MS',
            status: formData.status || 'Ativo'
          };
          if (targetId) {
            profilePayload.id = targetId;
          }

          const { data: savedProf, error: profileErr } = await supabase
            .from('perfis')
            .upsert([profilePayload])
            .select('id')
            .single();

          if (profileErr) throw profileErr;
          reconciledId = savedProf?.id || targetId || null;
        }

        if (reconciledId && formData.status && formData.status !== 'Ativo') {
          await supabase.from('perfis').update({ status: formData.status }).eq('id', reconciledId);
        }

        await fetchUsuarios();
        success('Usuário cadastrado e sincronizado com sucesso! Senha padrão: Senha@123');
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
    <div className="space-y-6 animate-fade-in-up">
      {/* Cabeçalho da Seção */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200/80 pb-6">
        <div>
          <div className="inline-flex items-center gap-2 bg-[#1B7547]/10 text-[#1B7547] px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider mb-2">
            <Users className="w-3.5 h-3.5" />
            <span>Gestão de Acessos & Perfis</span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            Controle de Usuários
          </h1>
          <p className="text-slate-500 mt-1 text-sm">Gerencie permissões e perfis de Técnicos de Campo e Produtores Rurais.</p>
        </div>
        <button 
          onClick={handleOpenCreate}
          className="group relative flex items-center gap-2 bg-gradient-to-r from-[#1B7547] to-[#15613a] hover:from-[#15613a] hover:to-[#0B3B23] text-white px-5 py-3 rounded-2xl font-extrabold text-xs transition-all duration-300 shadow-md shadow-[#1B7547]/20 hover:shadow-xl hover:scale-105 active:scale-95 cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4 transition-transform group-hover:rotate-90 duration-300" />
          <span>Convidar {activeTab === 'tecnicos' ? 'Técnico' : 'Produtor'}</span>
        </button>
      </div>

      {/* Selector de Abas de Role com Motion */}
      <div className="flex gap-3 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 w-fit">
        <button
          onClick={() => setActiveTab('tecnicos')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-extrabold transition-all duration-300 cursor-pointer ${
            activeTab === 'tecnicos'
              ? 'bg-[#1B7547] text-white shadow-md shadow-[#1B7547]/20 scale-102'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <UserCog className="w-4 h-4" />
          <span>Técnicos de Campo ({tecnicos.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('produtores')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-extrabold transition-all duration-300 cursor-pointer ${
            activeTab === 'produtores'
              ? 'bg-[#1B7547] text-white shadow-md shadow-[#1B7547]/20 scale-102'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>Produtores Rurais ({produtores.length})</span>
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
          <input 
            type="text" 
            placeholder={`Buscar por nome ou e-mail...`}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#1B7547]/15 focus:border-[#1B7547] shadow-xs text-xs font-medium transition-all"
          />
        </div>

        {/* Seletor de Modo: Cards | Tabela */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 self-end sm:self-auto">
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'cards' || (viewMode === 'auto' && typeof window !== 'undefined' && window.innerWidth < 768)
                ? 'bg-white text-[#1B7547] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Exibir em Cards"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Cards</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'table' || (viewMode === 'auto' && typeof window !== 'undefined' && window.innerWidth >= 768)
                ? 'bg-white text-[#1B7547] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Exibir em Tabela"
          >
            <Table className="w-3.5 h-3.5" />
            <span>Tabela</span>
          </button>
        </div>
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        {currentList.length === 0 ? (
          <div className="px-5 py-12 text-center text-muted-foreground">
            Nenhum usuário encontrado.
          </div>
        ) : (
          <>
            {/* Modo Cards (Mobile por padrão, ou quando selecionado) */}
            <div className={viewMode === 'cards' ? 'block' : viewMode === 'table' ? 'hidden' : 'block md:hidden'}>
              <div className="divide-y divide-border">
                {currentList.map((user: any) => {
                  const phoneStr = user.telefone || user.whatsapp || 'Não informado';
                  return (
                    <div key={user.id} className="p-4 bg-white space-y-3">
                      {/* Topo: Nome, Email, Status */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5 flex-1 min-w-0">
                          <h3 className="font-extrabold text-slate-900 text-sm truncate">
                            {user.nome}
                          </h3>
                          <p className="text-xs text-slate-500 font-medium truncate">
                            {user.email}
                          </p>
                        </div>

                        <span className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                          user.status === 'Ativo' ? 'bg-emerald-100/60 text-emerald-800 border-emerald-200' : 'bg-muted text-muted-foreground border-border'
                        }`}>
                          {user.status === 'Ativo' && <UserCheck className="w-3 h-3" />}
                          {user.status}
                        </span>
                      </div>

                      {/* Detalhes: Telefone/WhatsApp e Perfil/Fazendas */}
                      <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        <div>
                          <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">Telefone / WhatsApp</span>
                          <span className="text-emerald-900 font-bold text-xs truncate block mt-0.5">
                            {phoneStr}
                          </span>
                        </div>

                        <div>
                          <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">
                            {activeTab === 'tecnicos' ? 'Perfil' : 'Fazendas'}
                          </span>
                          <span className="inline-block mt-0.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-200/70 text-slate-700">
                            {activeTab === 'tecnicos' ? `${user.fazendas_vinculadas || 0} vistoria(s)` : `${user.fazendas_vinculadas || 0} fazenda(s)`}
                          </span>
                        </div>
                      </div>

                      {/* Ações */}
                      <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                        <button 
                          onClick={() => handleOpenEdit(user)}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[#1B7547] font-bold text-xs bg-[#1B7547]/10 hover:bg-[#1B7547]/20 rounded-xl transition-all active:scale-95 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Editar Usuário</span>
                        </button>

                        <button 
                          onClick={() => handleOpenDelete(user)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl border border-slate-200 transition-all active:scale-90 cursor-pointer"
                          title="Excluir Usuário"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modo Tabela (Desktop por padrão, ou quando selecionado) */}
            <div className={viewMode === 'table' ? 'block overflow-x-auto' : viewMode === 'cards' ? 'hidden' : 'hidden md:block overflow-x-auto'}>
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-5 py-3 font-semibold text-muted-foreground">Nome</th>
                    <th className="px-5 py-3 font-semibold text-muted-foreground">Email / Contato</th>
                    <th className="px-5 py-3 font-semibold text-muted-foreground">Telefone / WhatsApp</th>
                    <th className="px-5 py-3 font-semibold text-muted-foreground">
                      {activeTab === 'tecnicos' ? 'Perfil' : 'Fazendas Vinculadas'}
                    </th>
                    <th className="px-5 py-3 font-semibold text-muted-foreground">Status</th>
                    <th className="px-5 py-3 font-semibold text-muted-foreground text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {currentList.map((user: any) => {
                    const phoneStr = user.telefone || user.whatsapp || 'Não informado';
                    return (
                      <tr key={user.id} className="hover:bg-primary/[0.03] transition-colors group cursor-pointer">
                        <td className="px-5 py-3 font-medium text-foreground">{user.nome}</td>
                        <td className="px-5 py-3 text-muted-foreground font-medium">{user.email}</td>
                        <td className="px-5 py-3 text-emerald-900 font-bold">
                          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded text-xs">
                            {phoneStr}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">
                          {activeTab === 'tecnicos' ? `${user.fazendas_vinculadas || 0} vistoria(s)` : `${user.fazendas_vinculadas || 0} fazenda(s)`}
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
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => handleOpenEdit(user)}
                              className="p-2 text-slate-400 hover:text-[#1B7547] hover:bg-[#1B7547]/10 rounded-xl transition-all duration-300 hover:scale-110 active:scale-90 cursor-pointer"
                              title="Editar Usuário"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleOpenDelete(user)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all duration-300 hover:scale-110 active:scale-90 cursor-pointer"
                              title="Excluir Usuário"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
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
              placeholder="Ex: Edward Amorim"
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
              placeholder="Ex: edward@aprosojams.org.br"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Telefone / WhatsApp</label>
            <input 
              type="text"
              value={formData.telefone || ''}
              onChange={e => {
                let v = e.target.value.replace(/\D/g, '');
                if (v.length > 11) v = v.slice(0, 11);
                if (v.length > 6) v = `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
                else if (v.length > 2) v = `(${v.slice(0, 2)}) ${v.slice(2)}`;
                else if (v.length > 0) v = `(${v}`;
                setFormData({...formData, telefone: v, whatsapp: v});
              }}
              placeholder="(67) 99881-2233"
              className="w-full px-3 py-2 bg-background border border-input rounded-md focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
            />
          </div>
          
          {activeTab === 'produtores' && (
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
