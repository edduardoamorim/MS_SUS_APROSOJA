import { useState, useEffect } from 'react';
import { FileCheck2, Search, Calendar, FileSearch, CheckCircle2, XCircle, AlertTriangle, Edit3, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { TableRowSkeleton } from '../../components/ui/Skeleton';
import RevisaoAuditoria from '../../components/auditoria/RevisaoAuditoria';
import Modal from '../../components/ui/Modal';
import ConfirmDelete from '../../components/ui/ConfirmDelete';
import { useToast } from '../../context/ToastContext';

export default function GestorAuditorias() {
  const { success, error } = useToast();
  const [loading, setLoading] = useState(true);
  const [auditorias, setAuditorias] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [revisaoAuditoria, setRevisaoAuditoria] = useState<{ id: string, nome: string } | null>(null);

  // Modal States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingAudit, setEditingAudit] = useState<any>(null);
  const [auditToDelete, setAuditToDelete] = useState<any>(null);

  // Form State
  const [formData, setFormData] = useState({ 
    propriedade_id: '', 
    tecnico_responsavel_id: '', 
    data_agendamento: '' 
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  async function fetchInitialData() {
    setLoading(true);
    try {
      // 1. Buscar auditorias do banco
      const { data: auditsData, error: auditsError } = await supabase
        .from('auditorias')
        .select(`
          id,
          data_agendamento,
          status,
          propriedade_id,
          tecnico_responsavel_id,
          propriedades (
            nome_fazenda
          )
        `)
        .order('created_at', { ascending: false });
      if (auditsError) throw auditsError;

      // 2. Buscar propriedades para o dropdown
      const { data: propsData, error: propsError } = await supabase
        .from('propriedades')
        .select('id, nome_fazenda');
      if (propsError) throw propsError;

      // 3. Buscar técnicos para o dropdown
      const { data: techsData, error: techsError } = await supabase
        .from('perfis')
        .select('id, nome')
        .eq('role', 'tecnico');
      if (techsError) throw techsError;

      setAuditorias(auditsData || []);
      setProperties(propsData || []);
      setTechnicians(techsData || []);
    } catch (err: any) {
      console.error('Erro ao buscar dados:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleOpenCreate = () => {
    setEditingAudit(null);
    setFormData({ 
      propriedade_id: properties[0]?.id || '', 
      tecnico_responsavel_id: technicians[0]?.id || '', 
      data_agendamento: new Date().toISOString().split('T')[0] 
    });
    setIsFormOpen(true);
  };

  const handleOpenEdit = (audit: any) => {
    setEditingAudit(audit);
    setFormData({ 
      propriedade_id: audit.propriedade_id || '', 
      tecnico_responsavel_id: audit.tecnico_responsavel_id || '', 
      data_agendamento: audit.data_agendamento ? new Date(audit.data_agendamento).toISOString().split('T')[0] : ''
    });
    setIsFormOpen(true);
  };

  const handleOpenDelete = (audit: any) => {
    setAuditToDelete(audit);
    setIsDeleteOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const payload = {
        propriedade_id: formData.propriedade_id,
        tecnico_responsavel_id: formData.tecnico_responsavel_id || null,
        data_agendamento: formData.data_agendamento || null,
        status: editingAudit ? editingAudit.status : 'Visita de Campo' // Visita de Campo como padrão para agendados pelo gestor
      };

      if (editingAudit) {
        // Update
        const { error } = await supabase
          .from('auditorias')
          .update(payload)
          .eq('id', editingAudit.id);
        if (error) throw error;
      } else {
        // Create
        const { error } = await supabase
          .from('auditorias')
          .insert([payload]);
        if (error) throw error;
      }

      setIsFormOpen(false);
      await fetchInitialData();
      success('Auditoria salva com sucesso!');
    } catch (err: any) {
      console.error('Erro ao salvar auditoria:', err);
      error('Erro ao salvar no banco de dados: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!auditToDelete) return;
    try {
      const { error: err } = await supabase
        .from('auditorias')
        .delete()
        .eq('id', auditToDelete.id);
      if (err) throw err;

      setAuditorias(auditorias.filter(a => a.id !== auditToDelete.id));
      setIsDeleteOpen(false);
      success('Auditoria excluída com sucesso!');
    } catch (err: any) {
      console.error('Erro ao deletar auditoria:', err);
      error('Erro ao excluir no banco de dados: ' + err.message);
    }
  };

  const handleApprove = async () => {
    if (!revisaoAuditoria) return;
    try {
      const { error: err } = await supabase
        .from('auditorias')
        .update({ status: 'Certificada' })
        .eq('id', revisaoAuditoria.id);
      if (err) throw err;

      setAuditorias(auditorias.map(a => a.id === revisaoAuditoria.id ? { ...a, status: 'Certificada' } : a));
      success('Auditoria aprovada e certificada com sucesso!');
    } catch (err: any) {
      console.error(err);
      error('Erro ao aprovar auditoria: ' + err.message);
    }
    setRevisaoAuditoria(null);
  };

  const handleReject = async () => {
    if (!revisaoAuditoria) return;
    try {
      const { error } = await supabase
        .from('auditorias')
        .update({ status: 'Visita de Campo' }) // retorna para visita de campo
        .eq('id', revisaoAuditoria.id);
      if (error) throw error;

      setAuditorias(auditorias.map(a => a.id === revisaoAuditoria.id ? { ...a, status: 'Visita de Campo' } : a));
    } catch (err: any) {
      console.error(err);
    }
    setRevisaoAuditoria(null);
  };

  const getTecnicoName = (id: string) => {
    const tech = technicians.find(t => t.id === id);
    return tech ? tech.nome : 'Sem atribuição';
  };

  const getFazendaName = (audit: any) => {
    return audit.propriedades?.nome_fazenda || 'Sem fazenda';
  };

  const filteredAudits = auditorias.filter(a => {
    const farmName = getFazendaName(a);
    const techName = getTecnicoName(a.tecnico_responsavel_id);
    return farmName.toLowerCase().includes(searchQuery.toLowerCase()) ||
           techName.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <FileCheck2 className="w-5 h-5 text-primary" />
            Gestão de Auditorias
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">Monitore cronogramas, atribua técnicos e aprove certificações.</p>
        </div>
        <button 
          onClick={handleOpenCreate}
          className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md font-medium text-sm transition-all shadow-sm active:scale-[0.98] cursor-pointer"
        >
          <Calendar className="w-4 h-4" />
          Novo Agendamento
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5" />
          <input 
            type="text" 
            placeholder="Buscar por fazenda ou técnico..."
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
                  <th className="px-5 py-3 font-semibold text-muted-foreground">Propriedade</th>
                  <th className="px-5 py-3 font-semibold text-muted-foreground">Técnico</th>
                  <th className="px-5 py-3 font-semibold text-muted-foreground">Data Agendada</th>
                  <th className="px-5 py-3 font-semibold text-muted-foreground">Status</th>
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
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-5 py-3 font-semibold text-muted-foreground whitespace-nowrap">Propriedade</th>
                  <th className="px-5 py-3 font-semibold text-muted-foreground whitespace-nowrap">Técnico Atribuído</th>
                  <th className="px-5 py-3 font-semibold text-muted-foreground whitespace-nowrap">Data Alvo/Visita</th>
                  <th className="px-5 py-3 font-semibold text-muted-foreground whitespace-nowrap">Status</th>
                  <th className="px-5 py-3 font-semibold text-muted-foreground text-right min-w-[120px] whitespace-nowrap">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredAudits.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">Nenhuma auditoria cadastrada.</td>
                  </tr>
                ) : (
                  filteredAudits.map((auditoria: any) => (
                    <tr key={auditoria.id} className="hover:bg-primary/[0.03] transition-colors group cursor-pointer">
                      <td className="px-5 py-4 font-medium text-foreground whitespace-nowrap">{getFazendaName(auditoria)}</td>
                      <td className="px-5 py-4 text-muted-foreground whitespace-nowrap">
                        {auditoria.tecnico_responsavel_id ? (
                          getTecnicoName(auditoria.tecnico_responsavel_id)
                        ) : (
                          <span className="text-amber-600 font-medium text-[10px] bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md uppercase tracking-wider">Sem atribuição</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-muted-foreground whitespace-nowrap">
                        {auditoria.data_agendamento ? new Date(auditoria.data_agendamento).toLocaleDateString('pt-BR') : '-'}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        {auditoria.status === 'Certificada' && (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-100/50 border border-emerald-200 px-2.5 py-1 rounded-md uppercase tracking-wider">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Certificada
                          </span>
                        )}
                        {auditoria.status === 'Em Análise' && (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 bg-amber-100/50 border border-amber-200 px-2.5 py-1 rounded-md uppercase tracking-wider">
                            <AlertTriangle className="w-3.5 h-3.5" /> Em Análise
                          </span>
                        )}
                        {auditoria.status === 'Visita de Campo' && (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-700 bg-blue-100/50 border border-blue-200 px-2.5 py-1 rounded-md uppercase tracking-wider">
                            <Calendar className="w-3.5 h-3.5" /> Agendada
                          </span>
                        )}
                        {auditoria.status === 'Autoavaliação' && (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md uppercase tracking-wider">
                            <Calendar className="w-3.5 h-3.5" /> Autoavaliação
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right min-w-[120px] whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          {auditoria.status === 'Em Análise' ? (
                            <button 
                              onClick={() => setRevisaoAuditoria({ id: auditoria.id, nome: getFazendaName(auditoria) })}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary/90 px-3 py-1.5 rounded-md transition-colors shadow-sm active:scale-[0.98] cursor-pointer"
                            >
                              <FileSearch className="w-3.5 h-3.5" /> Avaliar
                            </button>
                          ) : (
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => handleOpenEdit(auditoria)}
                                className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-all hover:scale-110 hover:-translate-y-0.5 active:scale-95 cursor-pointer"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleOpenDelete(auditoria)}
                                className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-all hover:scale-110 hover:-translate-y-0.5 active:scale-95 cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
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

      {/* Modal Agendamento */}
      <Modal 
        isOpen={isFormOpen} 
        onClose={() => setIsFormOpen(false)} 
        title={editingAudit ? "Remarcar Auditoria" : "Novo Agendamento"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Fazenda Alvo</label>
            <select
              required
              value={formData.propriedade_id}
              onChange={e => setFormData({...formData, propriedade_id: e.target.value})}
              className="w-full px-3 py-2 bg-background border border-input rounded-md focus:ring-2 focus:ring-primary text-sm text-foreground"
              disabled={!!editingAudit}
            >
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.nome_fazenda}</option>
              ))}
              {properties.length === 0 && (
                <option value="">Nenhuma fazenda cadastrada</option>
              )}
            </select>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Técnico Responsável</label>
            <select 
              value={formData.tecnico_responsavel_id}
              onChange={e => setFormData({...formData, tecnico_responsavel_id: e.target.value})}
              className="w-full px-3 py-2 bg-background border border-input rounded-md focus:ring-2 focus:ring-primary text-sm text-foreground"
            >
              <option value="">Aguardar atribuição</option>
              {technicians.map(t => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Data da Visita</label>
            <input 
              required
              type="date"
              value={formData.data_agendamento}
              onChange={e => setFormData({...formData, data_agendamento: e.target.value})}
              className="w-full px-3 py-2 bg-background border border-input rounded-md focus:ring-2 focus:ring-primary text-sm text-foreground"
            />
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
            <button 
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="px-4 py-2 font-medium text-sm rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              disabled={isSubmitting || properties.length === 0}
              className="px-4 py-2 font-medium text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? "Gravando..." : editingAudit ? "Salvar Alterações" : "Confirmar Agendamento"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Deleção */}
      <ConfirmDelete 
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Cancelar Auditoria"
        description={`Tem certeza que deseja cancelar a auditoria agendada? Esta ação não pode ser desfeita.`}
      />

      {revisaoAuditoria && (
        <RevisaoAuditoria 
          propriedadeNome={revisaoAuditoria.nome}
          onClose={() => setRevisaoAuditoria(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          auditoriaId={revisaoAuditoria.id}
        />
      )}
    </div>
  );
}
