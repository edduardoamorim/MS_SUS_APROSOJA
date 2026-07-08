import { useState, useEffect } from 'react';
import { MapPin, ClipboardList, CheckCircle2, CalendarDays, Clock, Plus, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import QuestionarioRTRS from '../../components/auditoria/QuestionarioRTRS';
import Modal from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import { getRemainingTimeLabel } from '../../lib/dateUtils';
import PropertyCodeInput from '../../components/form/PropertyCodeInput';
import CityInput from '../../components/form/CityInput';
import { ListSkeleton } from '../../components/ui/Skeleton';
import ConfirmAction from '../../components/ui/ConfirmAction';

export default function DashboardTecnico() {
  const { success, error, warning } = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [auditorias, setAuditorias] = useState<any[]>([]);
  const [showQuestionario, setShowQuestionario] = useState(false);
  const [activeAuditoria, setActiveAuditoria] = useState<any>(null);

  // Pendencies States
  const [selectedPropForPends, setSelectedPropForPends] = useState<any>(null);
  const [propPendencias, setPropPendencias] = useState<any[]>([]);
  const [loadingPends, setLoadingPends] = useState(false);
  const [isNewPendFormOpen, setIsNewPendFormOpen] = useState(false);
  const [newPendData, setNewPendData] = useState({ titulo: '', descricao: '', prazo: '' });

  // Autonomy States
  const [properties, setProperties] = useState<any[]>([]);
  const [producers, setProducers] = useState<any[]>([]);
  const [showCreateFarmModal, setShowCreateFarmModal] = useState(false);
  const [showScheduleAuditModal, setShowScheduleAuditModal] = useState(false);
  const [certifyConfirmId, setCertifyConfirmId] = useState<string | null>(null);
  const [deletePendConfirmId, setDeletePendConfirmId] = useState<string | null>(null);

  // Prospecção States
  const [produtorOption, setProdutorOption] = useState<'existente' | 'novo'>('existente');
  const [selectedProdutorId, setSelectedProdutorId] = useState<string>('');
  const [novoProdutorData, setNovoProdutorData] = useState({ nome: '', email: '', regiao: '' });
  const [propertiesList, setPropertiesList] = useState<{
    nome_fazenda: string;
    codigo_car: string;
    codigo_sigef: string;
    origem: string;
    geom: any | null;
    errorCar: string;
  }[]>([
    { nome_fazenda: '', codigo_car: '', codigo_sigef: '', origem: 'CAR', geom: null, errorCar: '' }
  ]);
  const [autoScheduleAudit, setAutoScheduleAudit] = useState(true);

  const handleOpenCreateFarmModal = () => {
    setProdutorOption('existente');
    setSelectedProdutorId('');
    setNovoProdutorData({ nome: '', email: '', regiao: '' });
    setPropertiesList([{ nome_fazenda: '', codigo_car: '', codigo_sigef: '', origem: 'CAR', geom: null, errorCar: '' }]);
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
        nome_fazenda: 'Fazenda Sol Nascente (Demonstração)',
        nome_produtor: 'Pedro Souza (Mock)',
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
        nome_produtor: 'Maria Oliveira (Mock)',
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
    if (user) {
      fetchAudits();
      fetchAuxiliaryData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function fetchAuxiliaryData() {
    try {
      // 1. Fetch properties
      const { data: propsData } = await supabase
        .from('propriedades')
        .select('id, nome_fazenda, nome_produtor, codigo_car');
      if (propsData) setProperties(propsData);

      // 2. Fetch producers
      const { data: prodsData } = await supabase
        .from('perfis')
        .select('id, nome')
        .eq('role', 'produtor');
      if (prodsData) setProducers(prodsData);
    } catch (err) {
      console.error('Erro ao carregar dados auxiliares:', err);
    }
  }

  const handleCreateFarm = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 1. Validar CAR / SIGEF
    const CAR_REGEX = /^[A-Z]{2}-\d{7}-[0-9A-Z]+$/;
    let hasError = false;
    const updatedList = propertiesList.map(p => {
      if (p.origem === 'CAR') {
        const isValid = CAR_REGEX.test(p.codigo_car);
        if (!isValid) {
          hasError = true;
          return { ...p, errorCar: 'Formato inválido. Use o padrão UF-1234567-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' };
        }
      } else if (p.origem === 'SIGEF') {
        if (!p.codigo_sigef) {
          hasError = true;
          return { ...p, errorCar: 'Obrigatório selecionar uma parcela do SIGEF.' };
        }
      } else if (p.origem === 'KML') {
        if (!p.geom) {
          hasError = true;
          return { ...p, errorCar: 'Obrigatório fazer upload de um arquivo KML/KMZ com geometria.' };
        }
      }
      return { ...p, errorCar: '' };
    });
    setPropertiesList(updatedList);
    if (hasError) {
      return;
    }

    setLoading(true);
    try {
      const payload = {
        produtor_option: produtorOption,
        produtor_id: produtorOption === 'existente' ? selectedProdutorId : null,
        novo_produtor: produtorOption === 'novo' ? novoProdutorData : null,
        propriedades_list: propertiesList.map(p => ({
          nome_fazenda: p.nome_fazenda,
          codigo_car: p.codigo_car,
          codigo_sigef: p.codigo_sigef,
          origem: p.origem,
          geom: p.geom
        })),
        tecnico_id: user?.id || null,
        auto_schedule: autoScheduleAudit
      };

      const { error: rpcError } = await supabase.rpc('cadastrar_prospeccao_completa', payload);

      if (rpcError) throw rpcError;

      success('Cadastro de prospecção e fazendas realizado com sucesso!');
      setShowCreateFarmModal(false);
      
      // Resetar states
      setPropertiesList([{ nome_fazenda: '', codigo_car: '', codigo_sigef: '', origem: 'CAR', geom: null, errorCar: '' }]);
      setNovoProdutorData({ nome: '', email: '', regiao: '' });
      setSelectedProdutorId('');
      
      // Refresh
      fetchAuxiliaryData();
      fetchAudits();
    } catch (err: any) {
      console.error('Erro ao cadastrar:', err);
      error('Erro ao cadastrar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleScheduleAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auditFormData.propriedade_id) {
      warning('Selecione uma fazenda!');
      return;
    }

    try {
      const payload = {
        propriedade_id: auditFormData.propriedade_id,
        tecnico_responsavel_id: user?.id,
        data_agendamento: auditFormData.data_agendamento,
        status: 'Visita de Campo'
      };

      const { error: err } = await supabase
        .from('auditorias')
        .insert([payload]);

      if (err) throw err;

      success('Vistoria agendada e atribuída com sucesso!');
      setShowScheduleAuditModal(false);
      
      fetchAudits();
    } catch (err: any) {
      console.error('Erro ao agendar vistoria:', err);
      error('Erro ao agendar vistoria: ' + err.message);
    }
  };

  const handleLiberarAuditoria = async (auditoriaId: string) => {
    setCertifyConfirmId(auditoriaId);
  };

  const executeCertify = async () => {
    const auditoriaId = certifyConfirmId;
    if (!auditoriaId) return;

    if (auditoriaId.startsWith('mock-')) {
      setAuditorias(auditorias.map(a => a.id === auditoriaId ? { ...a, status: 'Certificada' } : a));
      return;
    }

    try {
      const { error: err } = await supabase
        .from('auditorias')
        .update({ status: 'Certificada' })
        .eq('id', auditoriaId);
      if (err) throw err;
      
      setAuditorias(auditorias.map(a => a.id === auditoriaId ? { ...a, status: 'Certificada' } : a));
      success('Auditoria liberada e certificada com sucesso!');
    } catch (err: any) {
      console.error('Erro ao certificar auditoria:', err);
      error('Erro ao certificar: ' + err.message);
    } finally {
      setCertifyConfirmId(null);
    }
  };

  async function fetchAudits() {
    setLoading(true);
    try {
      const { data: auditsData, error: auditsError } = await supabase
        .from('auditorias')
        .select(`
          id,
          data_agendamento,
          status,
          propriedade_id,
          propriedades (
            id,
            nome_fazenda,
            nome_produtor,
            codigo_car
          )
        `)
        .eq('tecnico_responsavel_id', user?.id);

      if (auditsError) throw auditsError;

      // Buscar pendências atribuídas a este técnico
      let pendsProperties: any[] = [];
      try {
        const { data: pendsData, error: pendsError } = await supabase
          .from('pendencias')
          .select(`
            propriedade_id,
            propriedades:propriedade_id (
              id,
              nome_fazenda,
              nome_produtor,
              codigo_car
            )
          `)
          .eq('tecnico_responsavel_id', user?.id);
        
        if (!pendsError && pendsData) {
          pendsProperties = pendsData;
        }
      } catch (e) {
        console.warn('Erro ao carregar pendências atribuídas:', e);
      }

      // Criar pseudo-auditorias para as propriedades de pendência que não tenham auditoria agendada
      const existingPropIds = new Set((auditsData || []).map((a: any) => a.propriedade_id));
      const pseudoAudits: any[] = [];

      pendsProperties.forEach((p: any) => {
        if (p.propriedades && !existingPropIds.has(p.propriedade_id)) {
          existingPropIds.add(p.propriedade_id);
          pseudoAudits.push({
            id: `assigned-pend-${p.propriedade_id}`,
            data_agendamento: new Date().toISOString(),
            status: 'Acompanhamento',
            propriedade_id: p.propriedade_id,
            propriedades: p.propriedades
          });
        }
      });

      const finalAudits = [...(auditsData || []), ...pseudoAudits];

      if (finalAudits.length === 0) {
        // Se não houver auditorias, tenta atribuir a propriedade padrão do seed
        const { error: insertError } = await supabase
          .from('auditorias')
          .insert([
            {
              propriedade_id: '22222222-2222-2222-2222-222222222222',
              tecnico_responsavel_id: user?.id,
              status: 'Visita de Campo',
              data_agendamento: new Date().toISOString()
            }
          ]);

        if (!insertError) {
          const { data: refetchedData, error: refetchError } = await supabase
            .from('auditorias')
            .select(`
              id,
              data_agendamento,
              status,
              propriedade_id,
              propriedades (
                id,
                nome_fazenda,
                nome_produtor,
                codigo_car
              )
            `)
            .eq('tecnico_responsavel_id', user?.id);

          if (!refetchError && refetchedData && refetchedData.length > 0) {
            setAuditorias(refetchedData);
            setLoading(false);
            return;
          }
        }
      }

      setAuditorias(finalAudits.length > 0 ? finalAudits : mockAuditorias);
    } catch (err: any) {
      console.error('Erro ao carregar auditorias do banco, usando demonstração:', err);
      setAuditorias(mockAuditorias);
    } finally {
      setLoading(false);
    }
  }

  const handleStartAuditoria = (auditoria: any) => {
    setActiveAuditoria(auditoria);
    setShowQuestionario(true);
  };

  const handleComplete = async (auditoriaId: string) => {
    if (auditoriaId.startsWith('mock-')) {
      setAuditorias(auditorias.map(a => a.id === auditoriaId ? { ...a, status: 'Em Análise' } : a));
      setShowQuestionario(false);
      return;
    }

    try {
      const { error: err } = await supabase
        .from('auditorias')
        .update({ status: 'Em Análise' })
        .eq('id', auditoriaId);
      if (err) throw err;
      
      setAuditorias(auditorias.map(a => a.id === auditoriaId ? { ...a, status: 'Em Análise' } : a));
      setShowQuestionario(false);
      success('Relatório de auditoria salvo com sucesso!');
    } catch (err: any) {
      console.error('Erro ao atualizar auditoria:', err);
      error('Erro ao salvar relatório de auditoria: ' + err.message);
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
      const payload = {
        propriedade_id: selectedPropForPends.id,
        titulo: newPendData.titulo,
        descricao: newPendData.descricao,
        prazo: newPendData.prazo || null,
        status: 'Pendente',
        criado_por: user?.id || null,
        tecnico_responsavel_id: user?.id || null
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
      setNewPendData({ titulo: '', descricao: '', prazo: '' });
      success('Pendência criada com sucesso!');
    } catch (err: any) {
      console.error('Erro ao criar pendência:', err);
      error('Erro ao criar pendência: ' + err.message);
    }
  };

  const handleUpdatePendencyStatus = async (id: string, newStatus: 'Resolvida' | 'Pendente') => {
    if (id.startsWith('mock-')) {
      setMockPendencias(mockPendencias.map(p => p.id === id ? { ...p, status: newStatus } : p));
      setPropPendencias(propPendencias.map(p => p.id === id ? { ...p, status: newStatus } : p));
      return;
    }

    try {
      const payload: any = { status: newStatus };
      if (newStatus === 'Resolvida') {
        payload.resolucao_descricao = 'Resolvido in loco pelo técnico.';
      }
      const { error: err } = await supabase
        .from('pendencias')
        .update(payload)
        .eq('id', id);
      if (err) throw err;

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

  return (
    <div className="space-y-8 max-w-5xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Portal do Técnico</h1>
          <p className="text-muted-foreground mt-1 text-lg">Suas auditorias agendadas e execução in loco.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleOpenCreateFarmModal}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm rounded-lg shadow-md transition-all cursor-pointer active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            Cadastrar Fazenda
          </button>
          <button
            onClick={() => {
              setAuditFormData({ propriedade_id: properties[0]?.id || '', data_agendamento: new Date().toISOString().split('T')[0] });
              setShowScheduleAuditModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-lg shadow-md transition-all cursor-pointer active:scale-[0.98]"
          >
            <CalendarDays className="w-4 h-4" />
            Iniciar Vistoria
          </button>
          <div className="flex items-center gap-2 bg-secondary text-secondary-foreground px-4 py-2 rounded-lg text-sm font-semibold border border-border shadow-sm">
            <CalendarDays className="w-4 h-4 text-primary" />
            <span>Hoje, {new Date().toLocaleDateString('pt-BR')}</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ListSkeleton />
          <ListSkeleton />
          <ListSkeleton />
          <ListSkeleton />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {auditorias.map((auditoria, index) => {
            const prop = Array.isArray(auditoria.propriedades) ? auditoria.propriedades[0] : auditoria.propriedades;
            const isMock = auditoria.id.startsWith('mock-');
            return (
              <div 
                key={auditoria.id} 
                className="bg-card rounded-xl shadow-sm border border-border overflow-hidden hover:-translate-y-1 hover:shadow-xl hover:border-primary/20 transition-all duration-300 ease-out group flex flex-col justify-between animate-fade-in-up opacity-0"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div>
                  <div className="px-5 py-4 bg-muted/50 border-b border-border flex justify-between items-center">
                    <div className="flex items-center gap-2 text-muted-foreground font-medium text-sm">
                      <MapPin className="w-4 h-4 text-primary" />
                      <span>{isMock ? 'Maracaju, MS' : 'Geral, MS'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border ${
                        auditoria.status === 'Autoavaliação' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                        auditoria.status === 'Visita de Campo' ? 'bg-indigo-100 text-indigo-800 border-indigo-200' :
                        auditoria.status === 'Em Análise' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                        auditoria.status === 'Acompanhamento' ? 'bg-purple-100 text-purple-800 border-purple-200 font-semibold shadow-sm' :
                        'bg-emerald-100 text-emerald-800 border-emerald-200'
                      }`}>
                        {auditoria.status}
                      </span>
                      {isMock && (
                        <span className="text-[9px] font-bold bg-slate-100 text-slate-800 border border-slate-200 px-1.5 py-0.5 rounded uppercase">
                          Demo
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="p-6">
                    <h3 className="font-bold text-xl text-foreground mb-1">{prop?.nome_fazenda || 'Fazenda'}</h3>
                    <p className="text-sm text-muted-foreground mb-3">Produtor: {prop?.nome_produtor || 'N/A'}</p>
                    <p className="text-xs text-muted-foreground font-mono bg-muted/50 py-1 px-2.5 rounded border border-border/60 inline-block">
                      CAR: {prop?.codigo_car || 'Não informado'}
                    </p>
                  </div>
                </div>

                <div className="p-6 pt-0 border-t border-border/30 mt-4 flex flex-col gap-2">
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleOpenPendencias(prop)}
                        className="flex-1 py-2 bg-amber-50 hover:bg-amber-100/80 text-amber-950 border border-amber-200 rounded-lg flex items-center justify-center gap-1.5 font-bold text-sm transition-all cursor-pointer shadow-sm"
                      >
                        <ClipboardList className="w-4 h-4 text-amber-800" />
                        Pendências
                      </button>

                      {auditoria.status === 'Visita de Campo' ? (
                        <button 
                          onClick={() => handleStartAuditoria(auditoria)}
                          className="flex-1 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg flex items-center justify-center gap-1.5 font-bold text-sm transition-all cursor-pointer shadow-sm active:scale-[0.98]"
                        >
                          <ClipboardList className="w-4 h-4" />
                          Realizar Visita
                        </button>
                      ) : auditoria.status === 'Acompanhamento' ? (
                        <div className="flex-1 py-2 bg-purple-50 border border-purple-200 text-purple-800 rounded-lg flex items-center justify-center gap-1.5 font-bold text-sm shadow-sm">
                          <Clock className="w-4 h-4 text-purple-600 animate-pulse" />
                          Acompanhamento de Pendência
                        </div>
                      ) : auditoria.status === 'Certificada' ? (
                        <div className="flex-1 py-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center justify-center gap-1.5 font-bold text-sm shadow-sm">
                          <CheckCircle2 className="w-4 h-4" />
                          Certificada
                        </div>
                      ) : (
                        <div className="flex-1 py-2 bg-slate-50 border border-slate-200 text-slate-500 rounded-lg flex items-center justify-center gap-1.5 font-bold text-sm shadow-sm">
                          <Clock className="w-4 h-4 text-slate-400 animate-pulse" />
                          {auditoria.status === 'Autoavaliação' ? 'Autoavaliação' : 'Em Análise'}
                        </div>
                      )}
                    </div>

                    {(auditoria.status === 'Visita de Campo' || auditoria.status === 'Em Análise') && (
                      <button 
                        onClick={() => handleLiberarAuditoria(auditoria.id)}
                        className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center justify-center gap-1.5 font-bold text-sm transition-all cursor-pointer shadow-sm active:scale-[0.98]"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Liberar (Certificar)
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showQuestionario && activeAuditoria && (
        <QuestionarioRTRS 
          modo="auditoria"
          propriedadeNome={activeAuditoria.propriedades?.nome_fazenda || "Fazenda Sol Nascente"}
          onClose={() => setShowQuestionario(false)}
          onComplete={() => handleComplete(activeAuditoria.id)}
          auditoriaId={activeAuditoria.id}
        />
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
              <form onSubmit={handleAddPendency} className="p-3 bg-muted/40 border border-border rounded-xl space-y-3 animate-in slide-in-from-top-2 duration-200">
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
                  <select
                    value={selectedProdutorId}
                    onChange={e => setSelectedProdutorId(e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-input rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-transparent focus:outline-none text-foreground"
                    required
                  >
                    <option value="">Selecione um produtor...</option>
                    {producers.map(p => (
                      <option key={p.id} value={p.id}>{p.nome} ({p.email})</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-3 animate-in fade-in duration-250">
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">E-mail</label>
                      <input
                        required={produtorOption === 'novo'}
                        type="email"
                        placeholder="produtor@email.com"
                        value={novoProdutorData.email}
                        onChange={e => setNovoProdutorData({...novoProdutorData, email: e.target.value})}
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
                {properties.map(p => (
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
    </div>
  );
}
