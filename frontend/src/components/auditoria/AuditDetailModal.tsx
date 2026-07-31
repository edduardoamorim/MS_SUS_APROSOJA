import { useState, useEffect } from 'react';
import { 
  X, 
  MapPin, 
  Calendar, 
  User, 
  Phone, 
  Mail, 
  CheckCircle2, 
  Clock, 
  ClipboardList, 
  AlertTriangle, 
  FileText, 
  Building2, 
  ChevronRight,
  ShieldCheck,
  Layers,
  Sparkles
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Modal from '../ui/Modal';
import { resolveMunicipioFromCarOrName } from '../../lib/geoUtils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  auditoria: any;
  onStartVisita: (auditoria: any) => void;
  onOpenPendencias: (propriedade: any) => void;
}

export default function AuditDetailModal({ isOpen, onClose, auditoria, onStartVisita, onOpenPendencias }: Props) {
  const [loading, setLoading] = useState(true);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [pendenciasCount, setPendenciasCount] = useState(0);
  const [producerInfo, setProducerInfo] = useState<any>(null);
  const [farmDetails, setFarmDetails] = useState<any>(null);

  const totalQuestions = 115;
  const prop = Array.isArray(auditoria?.propriedades) ? auditoria.propriedades[0] : auditoria?.propriedades;
  const propId = auditoria?.propriedade_id || prop?.id;

  useEffect(() => {
    if (isOpen && auditoria) {
      fetchAuditDetails();
    }
  }, [isOpen, auditoria]);

  async function fetchAuditDetails() {
    setLoading(true);
    try {
      const isMockAudit = typeof auditoria?.id === 'string' && auditoria.id.startsWith('mock-');

      // 1. Contar respostas registradas no questionário RTRS
      if (auditoria?.id && !isMockAudit) {
        const { count, error: ansErr } = await supabase
          .from('respostas_auditoria')
          .select('id', { count: 'exact', head: true })
          .eq('auditoria_id', auditoria.id);
        
        if (!ansErr && count !== null) {
          setAnsweredCount(count);
        }
      } else {
        setAnsweredCount(0);
      }

      // 2. Contar pendências ativas da propriedade
      if (propId && typeof propId === 'string' && !propId.startsWith('mock-')) {
        const { count: pCount } = await supabase
          .from('pendencias')
          .select('id', { count: 'exact', head: true })
          .eq('propriedade_id', propId);
        
        setPendenciasCount(pCount || 0);

        // 3. Buscar informações completas da propriedade
        const { data: propData } = await supabase
          .from('propriedades')
          .select('*')
          .eq('id', propId)
          .single();

        if (propData) {
          setFarmDetails(propData);
        }

        // 4. Buscar dados do produtor responsável com segurança
        if (propData?.produtor_id) {
          const { data: prodData } = await supabase
            .from('perfis')
            .select('nome, email, telefone, regiao')
            .eq('id', propData.produtor_id)
            .maybeSingle();

          if (prodData) {
            setProducerInfo(prodData);
          }
        } else if (propData?.nome_produtor) {
          const { data: prodData } = await supabase
            .from('perfis')
            .select('nome, email, telefone, regiao')
            .eq('nome', propData.nome_produtor)
            .maybeSingle();

          if (prodData) {
            setProducerInfo(prodData);
          }
        }
      }
    } catch (err) {
      console.warn('Aviso ao buscar detalhes da auditoria:', err);
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen || !auditoria) return null;

  const farmName = prop?.nome_fazenda || farmDetails?.nome_fazenda || 'Fazenda MS';
  const rawProducerName = producerInfo?.nome || prop?.nome_produtor || farmDetails?.nome_produtor;
  const producerName = typeof rawProducerName === 'string' && rawProducerName.trim() ? rawProducerName : 'Produtor Rural';
  
  const rawEmail = producerInfo?.email || farmDetails?.email_produtor || prop?.email;
  const producerEmail = rawEmail && typeof rawEmail === 'string' && rawEmail.trim().length > 0 && !rawEmail.includes('edward.produtor@aprosojams.org.br') 
    ? rawEmail.trim() 
    : 'Não informado';

  const rawPhone = producerInfo?.telefone || producerInfo?.whatsapp || farmDetails?.telefone_produtor || prop?.telefone;
  const producerPhone = rawPhone && typeof rawPhone === 'string' && rawPhone.trim().length > 0 
    ? rawPhone.trim() 
    : 'Não informado';
  const hasValidPhone = producerPhone !== 'Não informado';

  const carCode = prop?.codigo_car || farmDetails?.codigo_car || null;
  const sigefCode = prop?.codigo_sigef || farmDetails?.codigo_sigef || null;
  const origemCadastro = prop?.origem_cadastro || farmDetails?.origem_cadastro || (sigefCode ? 'SIGEF' : carCode ? 'CAR' : 'Manual');

  const municipioName = resolveMunicipioFromCarOrName(carCode, farmName, prop?.municipio || farmDetails?.municipio);
  const etapaName = auditoria.etapa || prop?.etapa || farmDetails?.etapa || 'Prospecção';
  
  const progressPercent = Math.min(100, Math.round((answeredCount / totalQuestions) * 100));

  const formattedDate = auditoria.data_agendamento
    ? new Date(auditoria.data_agendamento).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      maxWidth="max-w-3xl"
    >
      <div className="space-y-6">
        {/* Header do Card com gradiente corporativo APROSOJA */}
        <div className="relative -mx-6 -mt-6 p-6 bg-gradient-to-r from-[#1B7547] via-[#16633b] to-[#0f4d2c] text-white rounded-t-xl overflow-hidden shadow-sm">
          <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-white/5 skew-x-12 transform origin-top-right pointer-events-none" />
          
          <div className="flex justify-between items-start gap-4 relative z-10">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 text-white px-2.5 py-0.5 rounded-full backdrop-blur-sm border border-white/20">
                  Ficha Técnica da Auditoria RTRS
                </span>
                <span className="text-[10px] font-semibold bg-[#C59B27] text-white px-2.5 py-0.5 rounded-full shadow-sm">
                  {auditoria.status || 'Visita de Campo'}
                </span>
              </div>
              <h2 className="text-2xl font-extrabold text-white tracking-tight mt-1">{farmName}</h2>
              <p className="text-xs text-emerald-100 flex items-center gap-1.5 mt-1 font-medium">
                <MapPin className="w-3.5 h-3.5 text-[#C59B27]" />
                <span>{municipioName}</span>
                <span>•</span>
                <span>Produtor: <strong>{producerName}</strong></span>
              </p>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Grid de Métricas Principais */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Progresso RTRS */}
          <div className="bg-gradient-to-br from-emerald-50/70 to-emerald-100/30 p-4 rounded-xl border border-emerald-200/60 shadow-xs">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-800 mb-2">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#1B7547]" />
                Questionário RTRS
              </span>
              <span className="font-mono text-sm text-[#1B7547]">{progressPercent}%</span>
            </div>
            <div className="w-full bg-emerald-200/60 h-2.5 rounded-full overflow-hidden mb-2">
              <div 
                className="bg-[#1B7547] h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.max(5, progressPercent)}%` }}
              />
            </div>
            <p className="text-[11px] text-emerald-700 font-medium flex justify-between">
              <span>Respondidos:</span>
              <strong className="font-mono">{answeredCount} / {totalQuestions} critérios</strong>
            </p>
          </div>

          {/* Card 2: Agendamento */}
          <div className="bg-gradient-to-br from-amber-50/70 to-amber-100/30 p-4 rounded-xl border border-amber-200/60 shadow-xs">
            <div className="flex items-center justify-between text-xs font-bold text-amber-900 mb-2">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-[#C59B27]" />
                Agendamento
              </span>
              <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold shadow-xs text-white ${
                etapaName === 'Prospecção' ? 'bg-amber-600' :
                etapaName === 'Auditoria Prévia' ? 'bg-blue-600' :
                'bg-emerald-600'
              }`}>
                {etapaName}
              </span>
            </div>
            <p className="text-sm font-extrabold text-amber-950 mt-1">{formattedDate}</p>
            <p className="text-[11px] text-amber-800/80 mt-1 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-[#C59B27]" />
              Status: <strong>{auditoria.status || 'Agendado'}</strong>
            </p>
          </div>

          {/* Card 3: Pendências Abertas */}
          <div className="bg-gradient-to-br from-slate-50 to-slate-100/80 p-4 rounded-xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800 mb-2">
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Pendências
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                pendenciasCount > 0 ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
              }`}>
                {pendenciasCount} ativas
              </span>
            </div>
            <p className="text-sm font-extrabold text-slate-900 mt-1">
              {pendenciasCount === 0 ? 'Nenhuma pendência' : `${pendenciasCount} pendência(s)`}
            </p>
            <p className="text-[11px] text-slate-600 mt-1">
              {pendenciasCount === 0 ? 'Imóvel em conformidade' : 'Requer atenção do produtor'}
            </p>
          </div>
        </div>

        {/* Seções de Detalhamento */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          {/* Seção 1: Dados do Imóvel Rural */}
          <div className="bg-card p-5 rounded-xl border border-border space-y-3 shadow-xs">
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2 border-b border-border pb-2">
              <Building2 className="w-4 h-4 text-[#1B7547]" />
              Dados do Imóvel Rural
            </h4>
            
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground font-medium">Nome da Fazenda:</span>
                <span className="font-bold text-foreground">{farmName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground font-medium">Município / Estado:</span>
                <span className="font-bold text-foreground">{municipioName}</span>
              </div>

              {/* Exibir estritamente a fonte de dados ativa */}
              {origemCadastro === 'SIGEF' || sigefCode ? (
                <div className="flex justify-between py-1 border-b border-border/40">
                  <span className="text-muted-foreground font-medium">Parcela SIGEF:</span>
                  <span className="font-mono font-bold text-purple-700 text-[11px] truncate max-w-[220px]" title={sigefCode || ''}>
                    {sigefCode || 'Cadastrado via SIGEF'}
                  </span>
                </div>
              ) : origemCadastro === 'KML' ? (
                <div className="flex justify-between py-1 border-b border-border/40">
                  <span className="text-muted-foreground font-medium">Polígono KML / Desenho:</span>
                  <span className="font-mono font-bold text-emerald-700 text-[11px]">Geometria KML Vistoriada</span>
                </div>
              ) : (
                <div className="flex justify-between py-1 border-b border-border/40">
                  <span className="text-muted-foreground font-medium">Código CAR (SICAR):</span>
                  <span className="font-mono font-bold text-[#1B7547] text-[11px] truncate max-w-[220px]" title={carCode || ''}>
                    {carCode || 'Não informado'}
                  </span>
                </div>
              )}

              <div className="flex justify-between py-1">
                <span className="text-muted-foreground font-medium">Fonte dos Dados:</span>
                <span className="font-extrabold text-emerald-900 uppercase bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 rounded text-[10px]">
                  {origemCadastro === 'SIGEF' || sigefCode ? 'SIGEF (INCRA)' : origemCadastro === 'KML' ? 'KML / Desenho' : 'CAR (SICAR)'}
                </span>
              </div>
            </div>
          </div>

          {/* Seção 2: Contato do Produtor Rural */}
          <div className="bg-card p-5 rounded-xl border border-border space-y-3 shadow-xs">
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2 border-b border-border pb-2">
              <User className="w-4 h-4 text-[#C59B27]" />
              Contato do Produtor Responsável
            </h4>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center gap-2.5 py-1">
                <User className="w-4 h-4 text-slate-400 shrink-0" />
                <div>
                  <p className="text-[10px] text-muted-foreground">Nome Completo</p>
                  <p className="font-bold text-foreground text-sm">{producerName}</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 py-1 border-t border-border/40">
                <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground">E-mail de Contato</p>
                  <p className="font-semibold text-foreground truncate">{producerEmail}</p>
                </div>
              </div>

              <div className="flex items-center justify-between py-1 border-t border-border/40">
                <div className="flex items-center gap-2.5">
                  <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Telefone / WhatsApp</p>
                    <p className="font-bold text-foreground">{producerPhone}</p>
                  </div>
                </div>
                {hasValidPhone && (
                  <a
                    href={`https://wa.me/55${producerPhone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-[#1B7547] border border-emerald-200 rounded-lg text-[10px] font-bold transition-all"
                  >
                    WhatsApp
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé com Botões de Ação Direta */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-4 border-t border-border mt-4">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenPendencias(prop || farmDetails);
            }}
            className="w-full sm:w-auto px-4 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
          >
            <ClipboardList className="w-4 h-4 text-[#C59B27]" />
            Gerenciar Pendências ({pendenciasCount})
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial px-4 py-2.5 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-xl font-bold text-xs transition-all cursor-pointer"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onStartVisita(auditoria);
              }}
              className="flex-1 sm:flex-initial px-5 py-2.5 bg-[#1B7547] hover:bg-[#16633b] text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md active:scale-[0.98]"
            >
              <Sparkles className="w-4 h-4" />
              {answeredCount > 0 ? 'Continuar Questionário RTRS' : 'Iniciar Vistoria RTRS'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
