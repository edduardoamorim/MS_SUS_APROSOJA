import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  ShieldCheck, 
  Leaf, 
  Award, 
  CheckCircle2, 
  Users, 
  Building2, 
  ArrowRight, 
  X, 
  Send, 
  Loader2, 
  Sparkles,
  FileCheck,
  TreePine,
  TrendingUp,
  MapPin,
  Mail,
  UserCheck,
  Check,
  ChevronRight,
  Globe2,
  Calendar,
  Lock
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';

export default function LandingPage() {
  const { success, error: toastError } = useToast();

  // Estado do Modal de Lead
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);

  // Efeito de Contador Animado no Hero
  const [countHectares, setCountHectares] = useState(0);
  const [countPropriedades, setCountPropriedades] = useState(0);

  useEffect(() => {
    const duration = 2000; // 2 segundos
    const stepTime = 30;
    const steps = duration / stepTime;
    
    const maxHectares = 150000;
    const maxProp = 120;
    
    let currentStep = 0;
    const timer = setInterval(() => {
      currentStep++;
      const progress = currentStep / steps;
      
      // Easing out cubic
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      
      setCountHectares(Math.floor(easeProgress * maxHectares));
      setCountPropriedades(Math.floor(easeProgress * maxProp));
      
      if (currentStep >= steps) {
        clearInterval(timer);
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, []);

  // Formulário State
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    telefone: '',
    nome_propriedade: '',
    municipio: '',
    mensagem: ''
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleOpenModal = () => {
    setSubmittedSuccess(false);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!formData.nome.trim() || !formData.email.trim()) {
        throw new Error('Por favor, preencha o seu Nome Completo e E-mail.');
      }

      // 1. Salvar os dados na tabela `prospectos` do Supabase
      const { error: dbError } = await supabase
        .from('prospectos')
        .insert([
          {
            nome: formData.nome.trim(),
            email: formData.email.trim(),
            telefone: formData.telefone.trim() || null,
            nome_propriedade: formData.nome_propriedade.trim() || null,
            municipio: formData.municipio.trim() || null,
            mensagem: formData.mensagem.trim() || null,
            status: 'novo'
          }
        ]);

      if (dbError) {
        console.warn('Aviso no Supabase ao salvar prospecto:', dbError);
      }

      // 2. Acionar a Edge Function `send-interest-email`
      try {
        await supabase.functions.invoke('send-interest-email', {
          body: {
            nome: formData.nome.trim(),
            email: formData.email.trim(),
            telefone: formData.telefone.trim(),
            nome_propriedade: formData.nome_propriedade.trim(),
            municipio: formData.municipio.trim(),
            mensagem: formData.mensagem.trim()
          }
        });
      } catch (fnErr) {
        console.warn('Notificação via Edge Function:', fnErr);
      }

      setSubmittedSuccess(true);
      success('Demonstração de interesse cadastrada com sucesso! Nossa equipe entrará em contato.');
      
      // Limpa formulário
      setFormData({
        nome: '',
        email: '',
        telefone: '',
        nome_propriedade: '',
        municipio: '',
        mensagem: ''
      });
    } catch (err: any) {
      console.error('Erro ao enviar interesse:', err);
      toastError(err.message || 'Ocorreu um erro ao registrar seu interesse. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#F8FAFC] min-h-screen text-slate-900 overflow-hidden">
      
      {/* ------------------------------------------------------------------ */}
      {/* SEÇÃO HERO DYNÂMICA COM MOTION DESIGN                             */}
      {/* ------------------------------------------------------------------ */}
      <section id="inicio" className="relative overflow-hidden bg-gradient-to-b from-[#0B3B23] via-[#1B7547] to-[#15613a] text-white pt-12 pb-28 lg:pt-20 lg:pb-36">
        
        {/* Elementos Orbs animados em background */}
        <div className="absolute top-10 left-10 w-96 h-96 bg-[#7CB324]/20 rounded-full blur-3xl animate-float-slow pointer-events-none" />
        <div className="absolute bottom-10 right-10 w-[500px] h-[500px] bg-[#C59B27]/20 rounded-full blur-3xl animate-float-slow delay-300 pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(#7CB324_1px,transparent_1px)] [background-size:32px_32px] opacity-10 pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            
            {/* Coluna Esquerda: Textos & Motion CTAs */}
            <div className="lg:col-span-7 space-y-8 text-center lg:text-left animate-fade-in-up">
              
              {/* Badge RTRS Shimmering */}
              <div className="inline-flex items-center gap-2.5 bg-white/10 backdrop-blur-md px-4 py-2 rounded-full border border-white/20 text-xs font-semibold text-white shadow-xl transition-all duration-300 hover:scale-105 hover:bg-white/15 hover:border-[#C59B27]/60">
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#7CB324] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#7CB324]"></span>
                </span>
                <span className="font-bold text-white">Programa Oficial APROSOJA/MS</span>
                <span className="text-white/40">•</span>
                <span className="text-[#C59B27] font-extrabold flex items-center gap-1">
                  <Award className="w-3.5 h-3.5" />
                  Certificação RTRS
                </span>
              </div>

              {/* Título Principal de Impacto */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1] text-white">
                Sustentabilidade, Rigor e <br className="hidden sm:inline" />
                <span className="bg-gradient-to-r from-[#C59B27] via-amber-200 to-[#C59B27] bg-clip-text text-transparent animate-gradient-flow">
                  Valorização Safra
                </span> em MS
              </h1>

              {/* Subtítulo */}
              <p className="text-base sm:text-lg lg:text-xl text-emerald-100/90 max-w-2xl font-normal leading-relaxed">
                A plataforma institucional da <strong className="text-white font-bold">APROSOJA/MS</strong> para gestão, auditoria socioambiental e homologação da certificação internacional <strong className="text-[#C59B27] font-bold">RTRS</strong> nas propriedades rurais de Mato Grosso do Sul.
              </p>

              {/* Botões CTA Animados */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start pt-2">
                
                {/* Botão Principal com Ripple e Glow */}
                <button
                  onClick={handleOpenModal}
                  className="group relative flex items-center justify-center gap-3 bg-gradient-to-r from-[#C59B27] to-[#b0881f] text-white px-8 py-4 rounded-2xl font-extrabold text-base transition-all duration-300 shadow-2xl shadow-[#C59B27]/40 hover:shadow-amber-500/50 hover:scale-105 active:scale-95 cursor-pointer overflow-hidden"
                >
                  <span className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out" />
                  <Leaf className="w-5 h-5 text-emerald-100 transition-transform group-hover:rotate-12 duration-300" />
                  <span>Demonstrar Interesse</span>
                  <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1 duration-300" />
                </button>

                {/* Botão Secundário Glassmorphism */}
                <Link
                  to="/login"
                  className="group flex items-center justify-center gap-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/25 backdrop-blur-md px-8 py-4 rounded-2xl font-bold text-base transition-all duration-300 hover:border-white/40 active:scale-95 cursor-pointer shadow-lg"
                >
                  <Lock className="w-5 h-5 text-[#7CB324] transition-transform group-hover:scale-110 duration-300" />
                  <span>Portal do Produtor / Login</span>
                </Link>
              </div>

              {/* Indicadores numéricos animados */}
              <div className="pt-8 border-t border-emerald-800/60 grid grid-cols-3 gap-6 text-center lg:text-left">
                <div className="space-y-1">
                  <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                    +{countHectares.toLocaleString('pt-BR')} ha
                  </div>
                  <div className="text-xs font-medium text-emerald-200/90">Área em Auditoria MS</div>
                </div>

                <div className="space-y-1">
                  <div className="text-2xl sm:text-3xl font-extrabold text-[#C59B27] tracking-tight">
                    +{countPropriedades} Fazendas
                  </div>
                  <div className="text-xs font-medium text-emerald-200/90">Em Processo RTRS</div>
                </div>

                <div className="space-y-1">
                  <div className="text-2xl sm:text-3xl font-extrabold text-[#7CB324] tracking-tight">
                    100%
                  </div>
                  <div className="text-xs font-medium text-emerald-200/90">Zero Desmatamento</div>
                </div>
              </div>

            </div>

            {/* Coluna Direita: Card Preview 3D Interativo */}
            <div className="lg:col-span-5 flex justify-center animate-fade-in-up delay-200">
              <div className="relative w-full max-w-md bg-white/10 backdrop-blur-xl border border-white/20 p-8 rounded-3xl shadow-2xl space-y-6 transition-all duration-500 hover:rotate-1 hover:scale-102 hover:border-[#7CB324]/50 group">
                
                {/* Glow decorativo no hover do card */}
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-[#7CB324]/0 via-[#7CB324]/10 to-[#C59B27]/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                {/* Header Card com Logo PNG Transparente */}
                <div className="flex items-center gap-4 border-b border-white/15 pb-5">
                  <div className="p-2.5 bg-white/15 backdrop-blur-md rounded-2xl border border-white/20 shadow-md">
                    <img 
                      src="/logo_emblem.png" 
                      alt="Símbolo MS Sustentável" 
                      className="h-10 w-auto object-contain filter drop-shadow-md transition-transform duration-300 group-hover:scale-110" 
                    />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-white text-lg tracking-tight">MS Sustentável</h3>
                    <p className="text-xs font-medium text-emerald-200">Certificação de Soja Responsável</p>
                  </div>
                </div>

                {/* Status Lista */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3 bg-white/5 p-3.5 rounded-2xl border border-white/10 text-xs text-white font-medium transition-all group-hover:bg-white/10">
                    <CheckCircle2 className="w-5 h-5 text-[#7CB324] flex-shrink-0" />
                    <span>Diagnóstico de Conformidade Socioambiental</span>
                  </div>
                  <div className="flex items-center gap-3 bg-white/5 p-3.5 rounded-2xl border border-white/10 text-xs text-white font-medium transition-all group-hover:bg-white/10">
                    <CheckCircle2 className="w-5 h-5 text-[#7CB324] flex-shrink-0" />
                    <span>Geoprocessamento e Cruzamento CAR / SIGEF</span>
                  </div>
                  <div className="flex items-center gap-3 bg-white/5 p-3.5 rounded-2xl border border-white/10 text-xs text-white font-medium transition-all group-hover:bg-white/10">
                    <CheckCircle2 className="w-5 h-5 text-[#7CB324] flex-shrink-0" />
                    <span>Emissão de Créditos de Soja Sustentável</span>
                  </div>
                </div>

                {/* Badge de Destaque RTRS */}
                <div className="bg-gradient-to-r from-[#C59B27]/30 to-amber-500/20 border border-[#C59B27]/50 p-4 rounded-2xl text-center space-y-1 backdrop-blur-md">
                  <span className="text-[11px] font-bold text-amber-200 uppercase tracking-wider block">Status da Propriedade</span>
                  <span className="text-sm font-extrabold text-white flex items-center justify-center gap-2">
                    <Award className="w-4 h-4 text-[#C59B27] animate-bounce-soft" />
                    Pronto para Auditoria RTRS
                  </span>
                </div>

              </div>
            </div>

          </div>
        </div>
      </section>


      {/* ------------------------------------------------------------------ */}
      {/* SEÇÃO QUEM SOMOS                                                   */}
      {/* ------------------------------------------------------------------ */}
      <section id="sobre" className="py-24 bg-white relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            
            {/* Texto de Apresentação */}
            <div className="lg:col-span-6 space-y-6">
              <div className="inline-flex items-center gap-2 bg-[#1B7547]/10 text-[#1B7547] px-4 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wider">
                <Building2 className="w-4 h-4" />
                <span>Quem Somos</span>
              </div>

              <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
                A Força da Sojicultura Sustentável em Mato Grosso do Sul
              </h2>

              <p className="text-slate-600 leading-relaxed text-base">
                O <strong className="text-slate-900">Programa MS Sustentável</strong> é uma iniciativa estratégica liderada pela <strong className="text-[#1B7547]">APROSOJA/MS</strong> para estruturar, capacitar e auditar propriedades rurais em Mato Grosso do Sul rumo ao selo global <strong className="text-[#C59B27]">RTRS (Round Table on Responsible Soy)</strong>.
              </p>

              <p className="text-slate-600 leading-relaxed text-base">
                Nossa missão é aliar a produtividade agrícola sul-mato-grossense à responsabilidade socioambiental, preservando recursos naturais, garantindo o bem-estar dos trabalhadores e promovendo o acesso a mercados internacionais exigentes.
              </p>

              <div className="grid sm:grid-cols-2 gap-4 pt-4">
                <div className="flex items-start gap-3 bg-[#F8FAFC] p-4 rounded-2xl border border-slate-200 transition-all duration-300 hover:shadow-md hover:border-[#1B7547]/40">
                  <ShieldCheck className="w-6 h-6 text-[#1B7547] flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">Garantia Socioambiental</h4>
                    <p className="text-xs text-slate-500 mt-1">Conformidade estrita com o Código Florestal e leis trabalhistas.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-[#F8FAFC] p-4 rounded-2xl border border-slate-200 transition-all duration-300 hover:shadow-md hover:border-[#C59B27]/40">
                  <TrendingUp className="w-6 h-6 text-[#C59B27] flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">Valor Agregado</h4>
                    <p className="text-xs text-slate-500 mt-1">Comercialização de créditos RTRS e bonificação da safra.</p>
                  </div>
                </div>
              </div>

            </div>

            {/* Card com Logo Transparente e Métricas */}
            <div className="lg:col-span-6 bg-[#0F172A] text-white rounded-3xl p-8 lg:p-10 shadow-2xl relative overflow-hidden group">
              <div className="absolute -right-10 -bottom-10 w-72 h-72 bg-[#1B7547]/30 rounded-full blur-3xl transition-transform duration-700 group-hover:scale-125" />
              
              <div className="relative z-10 space-y-8">
                
                {/* Logo da Marca PNG sem fundo */}
                <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-slate-800 w-fit">
                  <img 
                    src="/logo_ms_sus.png" 
                    alt="Logo MS Sustentável APROSOJA" 
                    className="h-12 w-auto object-contain filter drop-shadow-md" 
                  />
                </div>

                <div className="border-t border-slate-800 pt-6 grid grid-cols-2 gap-6">
                  <div>
                    <span className="text-3xl lg:text-4xl font-extrabold text-[#7CB324]">5 Princípios</span>
                    <p className="text-xs text-slate-400 mt-1">RTRS Internacionais de Produção Responsável</p>
                  </div>

                  <div>
                    <span className="text-3xl lg:text-4xl font-extrabold text-[#C59B27]">106 Critérios</span>
                    <p className="text-xs text-slate-400 mt-1">De verificação de compliance agrícola e social</p>
                  </div>
                </div>

                <div className="bg-slate-800/80 p-5 rounded-2xl border border-slate-700 space-y-2 backdrop-blur-md">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-[#7CB324]" />
                    Suporte Especializado APROSOJA/MS
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Nossa equipe técnica acompanha o produtor rural em cada etapa do processo: desde o diagnóstico preliminar até a visita de auditoria em campo e emissão do certificado.
                  </p>
                </div>

                <button
                  onClick={handleOpenModal}
                  className="w-full bg-[#1B7547] hover:bg-[#15613a] text-white py-4 rounded-2xl font-extrabold text-sm transition-all duration-300 flex items-center justify-center gap-2 shadow-xl shadow-[#1B7547]/30 hover:scale-[1.02] active:scale-95 cursor-pointer"
                >
                  <span>Quero Certificar Minha Propriedade</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

          </div>

        </div>
      </section>


      {/* ------------------------------------------------------------------ */}
      {/* SEÇÃO PILARES DE SUSTENTABILIDADE (CARDS ANIMADOS)                  */}
      {/* ------------------------------------------------------------------ */}
      <section id="pilares" className="py-24 bg-[#F8FAFC] border-t border-slate-200/80 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <div className="inline-flex items-center gap-2 bg-[#C59B27]/10 text-[#C59B27] px-4 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wider">
              <Leaf className="w-4 h-4" />
              <span>Pilares do Programa</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Os 4 Pilares da Certificação RTRS em MS
            </h2>
            <p className="text-slate-600 text-base">
              Conheça as diretrizes que tornam a sojicultura de Mato Grosso do Sul uma referência em sustentabilidade e governança.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            
            {/* Pilar 1 */}
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xs hover:shadow-2xl transition-all duration-500 group hover:-translate-y-2 relative overflow-hidden">
              <div className="w-14 h-14 bg-[#1B7547]/10 text-[#1B7547] rounded-2xl flex items-center justify-center mb-6 transition-all duration-500 group-hover:bg-[#1B7547] group-hover:text-white group-hover:scale-110 group-hover:rotate-6">
                <Users className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-extrabold text-slate-900 mb-3 group-hover:text-[#1B7547] transition-colors">
                1. Responsabilidade Social e Trabalhista
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Respeito aos direitos dos trabalhadores, condições dignas de alojamento e saúde, além do cumprimento rigoroso da legislação trabalhista nacional.
              </p>
            </div>

            {/* Pilar 2 */}
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xs hover:shadow-2xl transition-all duration-500 group hover:-translate-y-2 relative overflow-hidden">
              <div className="w-14 h-14 bg-[#7CB324]/15 text-[#5c8a18] rounded-2xl flex items-center justify-center mb-6 transition-all duration-500 group-hover:bg-[#7CB324] group-hover:text-white group-hover:scale-110 group-hover:rotate-6">
                <TreePine className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-extrabold text-slate-900 mb-3 group-hover:text-[#7CB324] transition-colors">
                2. Preservação Ambiental e Biodiversidade
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Proteção de Áreas de Preservação Permanente (APP), Reserva Legal, conservação do solo, manejo correto da água e desmatamento zero.
              </p>
            </div>

            {/* Pilar 3 */}
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xs hover:shadow-2xl transition-all duration-500 group hover:-translate-y-2 relative overflow-hidden">
              <div className="w-14 h-14 bg-[#C59B27]/15 text-[#C59B27] rounded-2xl flex items-center justify-center mb-6 transition-all duration-500 group-hover:bg-[#C59B27] group-hover:text-white group-hover:scale-110 group-hover:rotate-6">
                <FileCheck className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-extrabold text-slate-900 mb-3 group-hover:text-[#C59B27] transition-colors">
                3. Boas Práticas Agrícolas (BPA)
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Uso racional de insumos, destinação adequada de embalagens vazias de defensivos, rotação de culturas e monitoramento de pragas.
              </p>
            </div>

            {/* Pilar 4 */}
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xs hover:shadow-2xl transition-all duration-500 group hover:-translate-y-2 relative overflow-hidden">
              <div className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center mb-6 transition-all duration-500 group-hover:bg-[#1B7547] group-hover:scale-110 group-hover:rotate-6">
                <Award className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-extrabold text-slate-900 mb-3 group-hover:text-[#1B7547] transition-colors">
                4. Rastreabilidade e Créditos RTRS
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Certificação de origem da safra, transparência documental no SIGEF/CAR e oportunidade de monetização com créditos de soja responsável.
              </p>
            </div>

          </div>

        </div>
      </section>


      {/* ------------------------------------------------------------------ */}
      {/* SEÇÃO EQUIPE TÉCNICA                                               */}
      {/* ------------------------------------------------------------------ */}
      <section id="equipe" className="py-24 bg-white border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <div className="inline-flex items-center gap-2 bg-[#1B7547]/10 text-[#1B7547] px-4 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wider">
              <Users className="w-4 h-4" />
              <span>Corpo Técnico APROSOJA/MS</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Equipe Técnica Especializada do Projeto
            </h2>
            <p className="text-slate-600 text-base">
              Profissionais capacitados para orientar e conduzir a sua fazenda em todo o processo de adequação socioambiental e auditoria RTRS.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            
            {/* Membro 1 */}
            <div className="bg-[#F8FAFC] border border-slate-200/80 rounded-3xl p-8 text-center space-y-4 hover:shadow-xl transition-all duration-300 group hover:-translate-y-1">
              <div className="w-20 h-20 bg-gradient-to-tr from-[#1B7547] to-[#15613a] text-white rounded-full flex items-center justify-center mx-auto text-2xl font-extrabold shadow-lg group-hover:scale-110 transition-transform duration-300">
                PV
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-lg">Patrícia Vilela Soares</h3>
                <p className="text-xs font-bold text-[#1B7547] mt-1">Analista Técnica de Campo — APROSOJA/MS</p>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Engenheira Agrônoma especialista em diagnósticos socioambientais, auditoria de campo RTRS e conformidade do Código Florestal em Mato Grosso do Sul.
              </p>
              <div className="pt-3 border-t border-slate-200/80 flex justify-center items-center gap-2 text-xs text-slate-600 font-medium">
                <Mail className="w-4 h-4 text-[#C59B27]" />
                <span>Campo Grande & Regiões MS</span>
              </div>
            </div>

            {/* Membro 2 */}
            <div className="bg-[#F8FAFC] border border-slate-200/80 rounded-3xl p-8 text-center space-y-4 hover:shadow-xl transition-all duration-300 group hover:-translate-y-1">
              <div className="w-20 h-20 bg-gradient-to-tr from-[#C59B27] to-amber-600 text-white rounded-full flex items-center justify-center mx-auto text-2xl font-extrabold shadow-lg group-hover:scale-110 transition-transform duration-300">
                AS
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-lg">Alexandre Santos Soares</h3>
                <p className="text-xs font-bold text-[#C59B27] mt-1">Analista Técnico de Campo — APROSOJA/MS</p>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Especialista em geoprocessamento agrícola, verificação de limites do CAR/SIGEF e implementação de boas práticas agrícolas sustentáveis.
              </p>
              <div className="pt-3 border-t border-slate-200/80 flex justify-center items-center gap-2 text-xs text-slate-600 font-medium">
                <Mail className="w-4 h-4 text-[#C59B27]" />
                <span>Auditorias no Campo MS</span>
              </div>
            </div>

            {/* Membro 3 */}
            <div className="bg-[#F8FAFC] border border-slate-200/80 rounded-3xl p-8 text-center space-y-4 hover:shadow-xl transition-all duration-300 group hover:-translate-y-1">
              <div className="w-20 h-20 bg-gradient-to-tr from-slate-800 to-slate-900 text-white rounded-full flex items-center justify-center mx-auto text-2xl font-extrabold shadow-lg group-hover:scale-110 transition-transform duration-300">
                MS
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-lg">Gestão Socioambiental</h3>
                <p className="text-xs font-bold text-slate-700 mt-1">Coordenação de Projetos APROSOJA/MS</p>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Equipe responsável pela homologação de diagnósticos, articulação com órgãos certificadores e suporte contínuo aos produtores rurais cadastrados.
              </p>
              <div className="pt-3 border-t border-slate-200/80 flex justify-center items-center gap-2 text-xs text-slate-600 font-medium">
                <Mail className="w-4 h-4 text-[#C59B27]" />
                <span>analistatecnico@aprosojams.org.br</span>
              </div>
            </div>

          </div>

          {/* Banner CTA Final com Gradiente Flow */}
          <div className="mt-20 text-center bg-gradient-to-r from-[#1B7547] via-[#15613a] to-[#0B3B23] text-white p-10 lg:p-14 rounded-3xl shadow-2xl space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-80 bg-[#7CB324]/20 rounded-full blur-3xl pointer-events-none animate-float-slow" />

            <h3 className="text-2xl sm:text-4xl font-extrabold tracking-tight relative z-10">
              Quer levar a Certificação RTRS para a sua fazenda?
            </h3>
            <p className="text-emerald-100 max-w-2xl mx-auto text-sm sm:text-base relative z-10 leading-relaxed">
              Demonstre interesse hoje mesmo. A equipe técnica da APROSOJA/MS entrará em contato para agendar o diagnóstico inicial da sua propriedade.
            </p>
            <div className="pt-2 relative z-10">
              <button
                onClick={handleOpenModal}
                className="group inline-flex items-center gap-3 bg-[#C59B27] hover:bg-[#b0881f] text-white font-extrabold px-9 py-4.5 rounded-2xl text-base transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-amber-500/30 active:scale-95 cursor-pointer"
              >
                <Leaf className="w-5 h-5 text-amber-100 group-hover:rotate-12 transition-transform duration-300" />
                <span>Demonstrar Interesse Agora</span>
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" />
              </button>
            </div>
          </div>

        </div>
      </section>


      {/* ------------------------------------------------------------------ */}
      {/* MODAL POPUP ANIMADO: FORMULÁRIO "DEMONSTRAR INTERESSE"              */}
      {/* ------------------------------------------------------------------ */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative max-h-[92vh] overflow-y-auto animate-zoom-in">
            
            {/* Botão Fechar */}
            <button
              onClick={handleCloseModal}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 p-2.5 rounded-full transition-all duration-200 cursor-pointer active:scale-90"
            >
              <X className="w-5 h-5" />
            </button>

            {submittedSuccess ? (
              /* Modal de Agradecimento / Sucesso com Motion */
              <div className="text-center py-6 space-y-6 animate-fade-in-up">
                <div className="w-20 h-20 bg-emerald-100 text-[#1B7547] rounded-full flex items-center justify-center mx-auto shadow-inner animate-soft-pulse">
                  <CheckCircle2 className="w-12 h-12" />
                </div>

                <div className="space-y-2">
                  <h3 className="text-2xl font-extrabold text-slate-900">Interesse Registrado!</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Obrigado por demonstrar interesse no <strong>Programa MS Sustentável</strong>.
                  </p>
                  <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    Os seus dados foram encaminhados com sucesso para a equipe técnica da APROSOJA/MS (<code>analistatecnico@aprosojams.org.br</code>). Em breve entraremos em contato.
                  </p>
                </div>

                <button
                  onClick={handleCloseModal}
                  className="w-full bg-[#1B7547] hover:bg-[#15613a] text-white py-4 rounded-2xl font-extrabold text-sm transition-all shadow-lg hover:shadow-emerald-900/20 active:scale-95 cursor-pointer"
                >
                  Concluir e Voltar
                </button>
              </div>
            ) : (
              /* Form de Demonstração de Interesse */
              <div className="space-y-6">
                
                <div className="flex items-center gap-3.5 border-b border-slate-100 pb-4">
                  <div className="w-11 h-11 bg-[#1B7547]/10 text-[#1B7547] rounded-2xl flex items-center justify-center flex-shrink-0">
                    <Leaf className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-xl text-slate-900 tracking-tight">Demonstrar Interesse</h3>
                    <p className="text-xs font-semibold text-slate-500">Programa MS Sustentável / APROSOJA-MS</p>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  
                  {/* Nome Completo */}
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                      Nome Completo *
                    </label>
                    <input
                      type="text"
                      name="nome"
                      required
                      value={formData.nome}
                      onChange={handleInputChange}
                      placeholder="Ex: João da Silva"
                      className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-[#1B7547]/15 focus:border-[#1B7547] text-sm bg-slate-50 transition-all font-medium"
                    />
                  </div>

                  {/* E-mail e Telefone */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                        E-mail *
                      </label>
                      <input
                        type="email"
                        name="email"
                        required
                        value={formData.email}
                        onChange={handleInputChange}
                        placeholder="seu@email.com"
                        className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-[#1B7547]/15 focus:border-[#1B7547] text-sm bg-slate-50 transition-all font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                        Telefone / WhatsApp
                      </label>
                      <input
                        type="tel"
                        name="telefone"
                        value={formData.telefone}
                        onChange={handleInputChange}
                        placeholder="(67) 99999-9999"
                        className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-[#1B7547]/15 focus:border-[#1B7547] text-sm bg-slate-50 transition-all font-medium"
                      />
                    </div>
                  </div>

                  {/* Propriedade e Município */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                        Nome da Propriedade
                      </label>
                      <input
                        type="text"
                        name="nome_propriedade"
                        value={formData.nome_propriedade}
                        onChange={handleInputChange}
                        placeholder="Ex: Fazenda Boa Esperança"
                        className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-[#1B7547]/15 focus:border-[#1B7547] text-sm bg-slate-50 transition-all font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                        Município (MS)
                      </label>
                      <input
                        type="text"
                        name="municipio"
                        value={formData.municipio}
                        onChange={handleInputChange}
                        placeholder="Ex: Maracaju"
                        className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-[#1B7547]/15 focus:border-[#1B7547] text-sm bg-slate-50 transition-all font-medium"
                      />
                    </div>
                  </div>

                  {/* Mensagem */}
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                      Mensagem / Observações
                    </label>
                    <textarea
                      name="mensagem"
                      rows={3}
                      value={formData.mensagem}
                      onChange={handleInputChange}
                      placeholder="Descreva detalhes sobre sua propriedade ou dúvidas..."
                      className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-[#1B7547]/15 focus:border-[#1B7547] text-sm bg-slate-50 transition-all resize-none font-medium"
                    />
                  </div>

                  {/* Botão de Envio */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-[#1B7547] hover:bg-[#15613a] disabled:bg-slate-300 text-white py-4 rounded-2xl font-extrabold text-sm transition-all shadow-xl shadow-[#1B7547]/20 flex items-center justify-center gap-2 cursor-pointer mt-2 active:scale-95"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Enviando dados...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Enviar Demonstração de Interesse</span>
                      </>
                    )}
                  </button>

                </form>

              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
