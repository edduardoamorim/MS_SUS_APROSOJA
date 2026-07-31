import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ShieldAlert, CheckCircle2, AlertTriangle, HelpCircle, Users, Building2, Award, ChevronRight, ChevronLeft, Sparkles, FileText, Check, ArrowRight, ShieldCheck, Leaf } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';

export interface OnboardingAnswers {
  q1_conversao_vegetacao: string; // 'nao' | 'sim_autorizado' | 'sim_sem_licenca' | 'nao_certeza'
  q2_status_car: string; // 'ativo' | 'em_analise' | 'cancelado'
  q3_passivo_ambiental: string; // 'conforme' | 'com_pra' | 'sem_pra'
  q4_qtd_trabalhadores_clt: number;
  q4_qtd_trabalhadores_terceirizados: number;
  q5_alojamento_epi: string; // 'sim_conforme' | 'parcialmente' | 'nao_se_aplica'
  q6_deposito_defensivos: string; // 'sim_adequado' | 'em_adequacao' | 'nao_adequado'
  q7_outras_certificacoes: string; // 'sim' | 'nao'
  q7_quais_certificacoes?: string;
}

interface Props {
  isOpen: boolean;
  onComplete: (answers: OnboardingAnswers, generatedAlerts: string[]) => void;
  producerName?: string;
}

export default function OnboardingQuestionarioModal({ isOpen, onComplete, producerName = 'Produtor Rural' }: Props) {
  const { success, warning, error: toastError } = useToast();
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
  const [submitting, setSubmitting] = useState(false);

  // Estado com as 7 respostas
  const [answers, setAnswers] = useState<OnboardingAnswers>({
    q1_conversao_vegetacao: '',
    q2_status_car: '',
    q3_passivo_ambiental: '',
    q4_qtd_trabalhadores_clt: 0,
    q4_qtd_trabalhadores_terceirizados: 0,
    q5_alojamento_epi: '',
    q6_deposito_defensivos: '',
    q7_outras_certificacoes: '',
    q7_quais_certificacoes: ''
  });

  if (!isOpen) return null;

  // Validação por passo
  const isStep1Valid = !!answers.q1_conversao_vegetacao && !!answers.q2_status_car && !!answers.q3_passivo_ambiental;
  const isStep2Valid = (answers.q4_qtd_trabalhadores_clt >= 0 && answers.q4_qtd_trabalhadores_terceirizados >= 0) && !!answers.q5_alojamento_epi;
  const isStep3Valid = !!answers.q6_deposito_defensivos && !!answers.q7_outras_certificacoes && (answers.q7_outras_certificacoes !== 'sim' || !!answers.q7_quais_certificacoes?.trim());

  // Calcular alertas gerados automaticamente
  const calculateAlerts = () => {
    const alerts: string[] = [];

    if (answers.q1_conversao_vegetacao === 'sim_sem_licenca') {
      alerts.push('🚨 ALERTA VERMELHO CRÍTICO: Risco de incompatibilidade com o Marco Temporal RTRS 2016 (Conversão sem licença declarada).');
    }
    if (answers.q2_status_car === 'cancelado') {
      alerts.push('⚠️ ALERTA AMBIENTAL: Cadastro Ambiental Rural (CAR) consta como Cancelado/Suspenso no IMASUL.');
    }
    if (answers.q3_passivo_ambiental === 'sem_pra') {
      alerts.push('📋 PENDÊNCIA PRÉVIA: Passivo ambiental em Reserva Legal/APP sem Plano de Recuperação (PRA) formalizado.');
    }
    if (answers.q5_alojamento_epi === 'parcialmente') {
      alerts.push('👷 ALERTA TRABALHISTA (NR-31): Entrega de EPIs ou alojamento necessitam de adequação para conformidade RTRS.');
    }
    if (answers.q6_deposito_defensivos === 'nao_adequado') {
      alerts.push('📦 ALERTA OPERACIONAL: Depósito de defensivos necessita de padronização (Princípio 5 RTRS).');
    }

    return alerts;
  };

  const handleNextStep = () => {
    if (currentStep === 1 && !isStep1Valid) {
      warning('Por favor, responda todas as perguntas da seção ambiental antes de avançar.');
      return;
    }
    if (currentStep === 2 && !isStep2Valid) {
      warning('Por favor, responda o formulário trabalhista e de trabalhadores antes de avançar.');
      return;
    }
    if (currentStep === 3 && !isStep3Valid) {
      warning('Por favor, responda as perguntas operacionais e agrícolas antes de ver o resultado.');
      return;
    }
    setCurrentStep((prev) => (prev + 1) as any);
  };

  const handlePrevStep = () => {
    setCurrentStep((prev) => (prev - 1) as any);
  };

  const handleSubmitFinal = async () => {
    setSubmitting(true);
    const alerts = calculateAlerts();

    // 1. Marcar flag no localStorage imediatamente para evitar que o modal reabra ou trave a tela
    localStorage.setItem('ms_onboarding_completed', 'true');

    try {
      const authRes = await supabase.auth.getUser();
      const user = authRes?.data?.user;
      const nowIso = new Date().toISOString();

      if (user?.id) {
        localStorage.setItem(`ms_onboarding_${user.id}`, JSON.stringify({ answers, alerts, completedAt: nowIso }));

        // 2. Atualizar user_metadata de forma isolada
        try {
          await supabase.auth.updateUser({
            data: { onboarding_concluido: true }
          });
        } catch (e) {
          console.warn('Aviso auth updateUser:', e);
        }

        // 3. Atualizar tabela perfis se a estrutura existir
        try {
          await supabase.from('perfis').upsert([{
            id: user.id,
            onboarding_concluido: true,
            onboarding_respostas: answers,
            onboarding_alertas: alerts,
            updated_at: nowIso
          }]);
        } catch (e) {
          console.warn('Aviso perfis upsert:', e);
        }

        // 4. Se houver alertas críticos (como EPI parcial ou depósito), criar pendências automáticas no sistema
        if (answers.q5_alojamento_epi === 'parcialmente' || answers.q6_deposito_defensivos === 'nao_adequado') {
          try {
            const { data: props } = await supabase.from('propriedades').select('id').eq('produtor_id', user.id).limit(1);
            const propId = props?.[0]?.id;

            if (propId) {
              if (answers.q5_alojamento_epi === 'parcialmente') {
                await supabase.from('pendencias').insert([{
                  propriedade_id: propId,
                  titulo: 'Comprovação de 100% dos EPIs e Fichas Assinadas (NR-31)',
                  descricao: 'Anexar recibos de entrega de EPIs com assinatura dos trabalhadores para adequação ao Princípio 2 RTRS.',
                  status: 'Pendente',
                  created_at: nowIso
                }]);
              }
              if (answers.q6_deposito_defensivos === 'nao_adequado') {
                await supabase.from('pendencias').insert([{
                  propriedade_id: propId,
                  titulo: 'Padronização do Depósito de Defensivos e Resíduos',
                  descricao: 'Apresentar plano de adequação do depósito e guardas das notas de devolução de embalagens vazias.',
                  status: 'Pendente',
                  created_at: nowIso
                }]);
              }
            }
          } catch (e) {
            console.warn('Aviso inserção pendências:', e);
          }
        }
      }

      success('Diagnóstico inicial preenchido com sucesso! Bem-vindo ao Portal do Produtor.');
    } catch (err: any) {
      console.warn('Aviso no salvamento remoto do onboarding:', err);
      success('Diagnóstico preenchido com sucesso!');
    } finally {
      setSubmitting(false);
      setTimeout(() => {
        onComplete(answers, alerts);
      }, 50);
    }
  };

  const alertsList = calculateAlerts();

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fadeIn">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[92vh]">
        
        {/* CABEÇALHO DO ONBOARDING */}
        <div className="bg-gradient-to-r from-[#1B7547] via-[#16633b] to-[#0f4d2c] text-white p-5 sm:p-6 relative">
          <div className="flex justify-between items-start gap-4">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/20 text-white px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider backdrop-blur-sm mb-2 border border-white/20">
                <ShieldCheck className="w-3.5 h-3.5 text-[#C59B27]" />
                <span>Primeiro Acesso — Filtro Obrigatório RTRS</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                Diagnóstico Socioambiental & Operacional
              </h2>
              <p className="text-xs text-emerald-100 mt-1 font-medium leading-relaxed">
                Olá, <strong className="text-white">{producerName}</strong>! Responda aos 7 filtros para mapear o grau de maturidade RTRS da sua fazenda.
              </p>
            </div>

            <div className="bg-white/10 px-3 py-1.5 rounded-2xl border border-white/20 text-right shrink-0">
              <span className="text-[10px] font-bold text-emerald-200 uppercase block">Etapa</span>
              <span className="text-sm font-black text-white">{currentStep} de 4</span>
            </div>
          </div>

          {/* BARRA DE PROGRESSO */}
          <div className="mt-5 grid grid-cols-4 gap-2">
            {[
              { num: 1, label: 'Filtro Ambiental' },
              { num: 2, label: 'Trabalhista & Social' },
              { num: 3, label: 'Operacional & Agrícola' },
              { num: 4, label: 'Diagnóstico Final' }
            ].map((step) => (
              <div key={step.num} className="space-y-1">
                <div className={`h-1.5 rounded-full transition-all duration-500 ${
                  currentStep >= step.num ? 'bg-[#C59B27]' : 'bg-white/20'
                }`} />
                <span className={`text-[9px] font-extrabold truncate block hidden sm:block ${
                  currentStep >= step.num ? 'text-white' : 'text-emerald-300/60'
                }`}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* CORPO DO FORMULÁRIO */}
        <div className="p-5 sm:p-8 overflow-y-auto flex-1 space-y-6">

          {/* PASSO 1: FILTRO AMBIENTAL */}
          {currentStep === 1 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Leaf className="w-5 h-5 text-[#1B7547]" />
                <h3 className="text-base font-extrabold text-slate-900">
                  Seção 1: Filtro Ambiental (Marco Temporal & CAR)
                </h3>
              </div>

              {/* PERGUNTA 1 */}
              <div className="space-y-3 bg-slate-50/80 p-4 sm:p-5 rounded-2xl border border-slate-200/80">
                <div className="flex items-start gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-[#1B7547] text-white font-extrabold text-xs flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </span>
                  <div>
                    <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 leading-snug">
                      Houve abertura de novas áreas ou conversão de vegetação nativa na propriedade após junho de 2016?
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-1 font-medium">
                      Filtro crítico do marco temporal RTRS (tolerância zero para desmatamento ilegal pós-2016).
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                  {[
                    { value: 'nao', label: 'Não (Sem Abertura pós-2016)', badge: '100% Conforme', color: 'emerald' },
                    { value: 'sim_autorizado', label: 'Sim (com Autorização de Supressão / Licença)', badge: 'Com Licença Ambiental', color: 'blue' },
                    { value: 'sim_sem_licenca', label: 'Sim (sem licença ambiental)', badge: '🚨 Risco Crítico', color: 'red' },
                    { value: 'nao_certeza', label: 'Não tenho certeza', badge: 'Requer Análise', color: 'amber' }
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAnswers({ ...answers, q1_conversao_vegetacao: opt.value })}
                      className={`p-3.5 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer flex items-center justify-between gap-2 ${
                        answers.q1_conversao_vegetacao === opt.value
                          ? 'border-[#1B7547] bg-emerald-50/80 text-[#1B7547] ring-2 ring-[#1B7547]/20 shadow-xs'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <span className="leading-snug">{opt.label}</span>
                      {answers.q1_conversao_vegetacao === opt.value && <CheckCircle2 className="w-4 h-4 text-[#1B7547] shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* PERGUNTA 2 */}
              <div className="space-y-3 bg-slate-50/80 p-4 sm:p-5 rounded-2xl border border-slate-200/80">
                <div className="flex items-start gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-[#1B7547] text-white font-extrabold text-xs flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </span>
                  <div>
                    <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 leading-snug">
                      Qual o status atual do Cadastro Ambiental Rural (CAR) da propriedade no órgão ambiental (IMASUL)?
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-1 font-medium">
                      Validação fundiária e ambiental no sistema oficial do Estado de MS.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
                  {[
                    { value: 'ativo', label: 'Inscrito / Ativo', badge: 'Regular' },
                    { value: 'em_analise', label: 'Em Análise / Pendente de Retificação', badge: 'Pendente' },
                    { value: 'cancelado', label: 'Cancelado / Suspenso', badge: 'Irregular' }
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAnswers({ ...answers, q2_status_car: opt.value })}
                      className={`p-3.5 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer flex items-center justify-between gap-2 ${
                        answers.q2_status_car === opt.value
                          ? 'border-[#1B7547] bg-emerald-50/80 text-[#1B7547] ring-2 ring-[#1B7547]/20 shadow-xs'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <span>{opt.label}</span>
                      {answers.q2_status_car === opt.value && <CheckCircle2 className="w-4 h-4 text-[#1B7547] shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* PERGUNTA 3 */}
              <div className="space-y-3 bg-slate-50/80 p-4 sm:p-5 rounded-2xl border border-slate-200/80">
                <div className="flex items-start gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-[#1B7547] text-white font-extrabold text-xs flex items-center justify-center shrink-0 mt-0.5">
                    3
                  </span>
                  <div>
                    <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 leading-snug">
                      A propriedade possui passivo ambiental declarado no CAR referente a Reserva Legal (RL) ou Áreas de Preservação Permanente (APP)?
                    </h4>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
                  {[
                    { value: 'conforme', label: 'Não (100% conforme / sem passivo)' },
                    { value: 'com_pra', label: 'Sim (com Termo de Compromisso / PRA assinado)' },
                    { value: 'sem_pra', label: 'Sim (sem plano de recuperação formalizado)' }
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAnswers({ ...answers, q3_passivo_ambiental: opt.value })}
                      className={`p-3.5 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer flex items-center justify-between gap-2 ${
                        answers.q3_passivo_ambiental === opt.value
                          ? 'border-[#1B7547] bg-emerald-50/80 text-[#1B7547] ring-2 ring-[#1B7547]/20 shadow-xs'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <span className="leading-snug">{opt.label}</span>
                      {answers.q3_passivo_ambiental === opt.value && <CheckCircle2 className="w-4 h-4 text-[#1B7547] shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* PASSO 2: FILTRO TRABALHISTA E SOCIAL */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Users className="w-5 h-5 text-[#1B7547]" />
                <h3 className="text-base font-extrabold text-slate-900">
                  Seção 2: Filtro Trabalhista e Social (NR-31 & EPIs)
                </h3>
              </div>

              {/* PERGUNTA 4 */}
              <div className="space-y-3 bg-slate-50/80 p-4 sm:p-5 rounded-2xl border border-slate-200/80">
                <div className="flex items-start gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-[#1B7547] text-white font-extrabold text-xs flex items-center justify-center shrink-0 mt-0.5">
                    4
                  </span>
                  <div>
                    <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 leading-snug">
                      Quantos trabalhadores atuam na propriedade rural durante o período de safra?
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-1 font-medium">
                      Dimensionamento do escopo da auditoria trabalhista e checagem de conformidade com a NR-31.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                    <label className="text-xs font-extrabold text-slate-700 uppercase block">
                      Funcionários com Carteira Assinada (CLT)
                    </label>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setAnswers({ ...answers, q4_qtd_trabalhadores_clt: Math.max(0, answers.q4_qtd_trabalhadores_clt - 1) })}
                        className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-lg flex items-center justify-center transition-colors cursor-pointer"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="0"
                        value={answers.q4_qtd_trabalhadores_clt}
                        onChange={(e) => setAnswers({ ...answers, q4_qtd_trabalhadores_clt: Math.max(0, parseInt(e.target.value) || 0) })}
                        className="w-full py-2 px-3 border border-slate-300 rounded-xl text-center text-base font-extrabold text-slate-900 focus:ring-2 focus:ring-[#1B7547] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setAnswers({ ...answers, q4_qtd_trabalhadores_clt: answers.q4_qtd_trabalhadores_clt + 1 })}
                        className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-lg flex items-center justify-center transition-colors cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                    <label className="text-xs font-extrabold text-slate-700 uppercase block">
                      Trabalhadores Terceirizados / Temporários
                    </label>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setAnswers({ ...answers, q4_qtd_trabalhadores_terceirizados: Math.max(0, answers.q4_qtd_trabalhadores_terceirizados - 1) })}
                        className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-lg flex items-center justify-center transition-colors cursor-pointer"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="0"
                        value={answers.q4_qtd_trabalhadores_terceirizados}
                        onChange={(e) => setAnswers({ ...answers, q4_qtd_trabalhadores_terceirizados: Math.max(0, parseInt(e.target.value) || 0) })}
                        className="w-full py-2 px-3 border border-slate-300 rounded-xl text-center text-base font-extrabold text-slate-900 focus:ring-2 focus:ring-[#1B7547] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setAnswers({ ...answers, q4_qtd_trabalhadores_terceirizados: answers.q4_qtd_trabalhadores_terceirizados + 1 })}
                        className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-lg flex items-center justify-center transition-colors cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* PERGUNTA 5 */}
              <div className="space-y-3 bg-slate-50/80 p-4 sm:p-5 rounded-2xl border border-slate-200/80">
                <div className="flex items-start gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-[#1B7547] text-white font-extrabold text-xs flex items-center justify-center shrink-0 mt-0.5">
                    5
                  </span>
                  <div>
                    <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 leading-snug">
                      A propriedade disponibiliza instalações/alojamentos para trabalhadores e fornece 100% dos EPIs com comprovante de entrega assinado?
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-1 font-medium">
                      Diagnóstico do Princípio 2 da RTRS (Condições Humanas de Trabalho e NR-31).
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
                  {[
                    { value: 'sim_conforme', label: 'Sim (Totalmente Conforme)' },
                    { value: 'parcialmente', label: 'Parcialmente (Faltam fichas assinadas ou adequações)' },
                    { value: 'nao_se_aplica', label: 'Não se aplica (sem trabalhadores alojados)' }
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAnswers({ ...answers, q5_alojamento_epi: opt.value })}
                      className={`p-3.5 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer flex items-center justify-between gap-2 ${
                        answers.q5_alojamento_epi === opt.value
                          ? 'border-[#1B7547] bg-emerald-50/80 text-[#1B7547] ring-2 ring-[#1B7547]/20 shadow-xs'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <span className="leading-snug">{opt.label}</span>
                      {answers.q5_alojamento_epi === opt.value && <CheckCircle2 className="w-4 h-4 text-[#1B7547] shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* PASSO 3: FILTRO OPERACIONAL E AGRÍCOLA */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Building2 className="w-5 h-5 text-[#1B7547]" />
                <h3 className="text-base font-extrabold text-slate-900">
                  Seção 3: Filtro Operacional e Agrícola (Resíduos & Certificações)
                </h3>
              </div>

              {/* PERGUNTA 6 */}
              <div className="space-y-3 bg-slate-50/80 p-4 sm:p-5 rounded-2xl border border-slate-200/80">
                <div className="flex items-start gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-[#1B7547] text-white font-extrabold text-xs flex items-center justify-center shrink-0 mt-0.5">
                    6
                  </span>
                  <div>
                    <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 leading-snug">
                      A fazenda possui depósito específico de defensivos agrícolas padronizado e guarda comprovantes de devolução de embalagens vazias?
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-1 font-medium">
                      Averiguação do Princípio 5 da RTRS (Boas Práticas Agrícolas e gestão de resíduos perigosos).
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
                  {[
                    { value: 'sim_adequado', label: 'Sim (depósito adequado e comprovantes guardados)' },
                    { value: 'em_adequacao', label: 'Em fase de adequação' },
                    { value: 'nao_adequado', label: 'Não possui depósito adequado no momento' }
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAnswers({ ...answers, q6_deposito_defensivos: opt.value })}
                      className={`p-3.5 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer flex items-center justify-between gap-2 ${
                        answers.q6_deposito_defensivos === opt.value
                          ? 'border-[#1B7547] bg-emerald-50/80 text-[#1B7547] ring-2 ring-[#1B7547]/20 shadow-xs'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <span className="leading-snug">{opt.label}</span>
                      {answers.q6_deposito_defensivos === opt.value && <CheckCircle2 className="w-4 h-4 text-[#1B7547] shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* PERGUNTA 7 */}
              <div className="space-y-3 bg-slate-50/80 p-4 sm:p-5 rounded-2xl border border-slate-200/80">
                <div className="flex items-start gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-[#1B7547] text-white font-extrabold text-xs flex items-center justify-center shrink-0 mt-0.5">
                    7
                  </span>
                  <div>
                    <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 leading-snug">
                      A propriedade já participou ou possui alguma outra certificação socioambiental (ex: Soja Plus, ABR, ISO, Rainforest)?
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-1 font-medium">
                      Identificar maturidade prévia. Produtores do Soja Plus possuem curva de aprendizado acelerada.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setAnswers({ ...answers, q7_outras_certificacoes: 'sim' })}
                    className={`p-3.5 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer flex items-center justify-between gap-2 ${
                      answers.q7_outras_certificacoes === 'sim'
                        ? 'border-[#1B7547] bg-emerald-50/80 text-[#1B7547] ring-2 ring-[#1B7547]/20 shadow-xs'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span>Sim (Já possui ou participou de programa)</span>
                    {answers.q7_outras_certificacoes === 'sim' && <CheckCircle2 className="w-4 h-4 text-[#1B7547] shrink-0" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setAnswers({ ...answers, q7_outras_certificacoes: 'nao', q7_quais_certificacoes: '' })}
                    className={`p-3.5 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer flex items-center justify-between gap-2 ${
                      answers.q7_outras_certificacoes === 'nao'
                        ? 'border-[#1B7547] bg-emerald-50/80 text-[#1B7547] ring-2 ring-[#1B7547]/20 shadow-xs'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span>Não (Primeira experiência em certificação)</span>
                    {answers.q7_outras_certificacoes === 'nao' && <CheckCircle2 className="w-4 h-4 text-[#1B7547] shrink-0" />}
                  </button>
                </div>

                {answers.q7_outras_certificacoes === 'sim' && (
                  <div className="pt-2 animate-fadeIn">
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Especifique quais certificações ou programas (ex: Soja Plus, ABR, ISO):
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Soja Plus e Algodão ABR"
                      value={answers.q7_quais_certificacoes || ''}
                      onChange={(e) => setAnswers({ ...answers, q7_quais_certificacoes: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-[#1B7547] focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PASSO 4: RESULTADO DO DIAGNÓSTICO DE ONBOARDING */}
          {currentStep === 4 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="bg-emerald-50 p-5 rounded-2xl border border-emerald-200 text-center space-y-3">
                <div className="w-14 h-14 bg-[#1B7547] text-[#C59B27] rounded-full flex items-center justify-center mx-auto shadow-md">
                  <Award className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-extrabold text-emerald-950">
                  Diagnóstico Preliminar RTRS Concluído!
                </h3>
                <p className="text-xs text-emerald-800 max-w-md mx-auto font-medium">
                  Com base nas suas 7 respostas, o sistema estruturou a matriz de conformidade da sua propriedade.
                </p>
              </div>

              {/* ALERTAS GERADOS AUTOMATICAMENTE */}
              <div className="space-y-3">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-[#C59B27]" />
                  Ações & Diagnóstico Automático Gerado:
                </h4>

                {alertsList.length === 0 ? (
                  <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl text-xs font-bold text-emerald-900 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <span>Excelente! Sua propriedade apresentou respostas compatíveis com o perfil inicial RTRS de alta conformidade.</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {alertsList.map((alert, i) => (
                      <div key={i} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-extrabold text-slate-800 flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <span className="leading-snug">{alert}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* RODAPÉ E NAVEGAÇÃO DE PASSOS */}
        <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between gap-3">
          {currentStep > 1 && currentStep < 4 ? (
            <button
              type="button"
              onClick={handlePrevStep}
              className="px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-extrabold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Voltar</span>
            </button>
          ) : (
            <div />
          )}

          {currentStep < 4 ? (
            <button
              type="button"
              onClick={handleNextStep}
              className="px-6 py-2.5 bg-gradient-to-r from-[#1B7547] to-[#16633b] hover:from-[#16633b] hover:to-[#0f4d2c] text-white font-extrabold text-xs rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer"
            >
              <span>Avançar</span>
              <ChevronRight className="w-4 h-4 text-[#C59B27]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmitFinal}
              disabled={submitting}
              className="w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-[#1B7547] via-[#16633b] to-[#0f4d2c] text-white font-black text-sm rounded-2xl shadow-lg hover:scale-105 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5 text-[#C59B27]" />
                  <span>Concluir Diagnóstico e Acessar Meu Painel</span>
                </>
              )}
            </button>
          )}
        </div>

      </div>
    </div>,
    document.body
  );
}
