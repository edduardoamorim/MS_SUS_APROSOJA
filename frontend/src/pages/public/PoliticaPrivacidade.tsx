import { Link } from 'react-router-dom';
import { ShieldCheck, Lock, ArrowLeft, CheckCircle } from 'lucide-react';

export default function PoliticaPrivacidade() {
  return (
    <div className="bg-[#F8FAFC] min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white p-8 sm:p-12 rounded-3xl shadow-xl border border-slate-200 space-y-8 animate-fade-in-up">
        
        {/* Voltar */}
        <Link 
          to="/" 
          className="inline-flex items-center gap-2 text-xs font-bold text-[#1B7547] hover:text-[#15613a] bg-[#1B7547]/10 hover:bg-[#1B7547]/20 px-3.5 py-2 rounded-xl transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar para a Landing Page</span>
        </Link>

        {/* Cabeçalho */}
        <div className="border-b border-slate-200 pb-6 space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[#C59B27]/10 text-[#C59B27] rounded-2xl">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Política de Privacidade & Proteção de Dados (LGPD)
              </h1>
              <p className="text-xs font-semibold text-slate-500">
                Programa MS Sustentável — APROSOJA/MS (Conformidade Lei nº 13.709/2018)
              </p>
            </div>
          </div>
        </div>

        {/* Conteúdo Institucional da Privacidade */}
        <div className="space-y-6 text-slate-600 text-sm leading-relaxed">
          <section className="space-y-2">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-[#C59B27]" />
              1. Coleta e Tratamento de Dados Pessoais
            </h2>
            <p>
              A <strong>APROSOJA/MS</strong> coleta dados estritamente necessários para a condução do <strong>Programa MS Sustentável</strong>, incluindo nome completo, e-mail, telefone/WhatsApp, município e dados cadastrais da propriedade rural (inscrição estadual, CAR e SIGEF).
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-[#C59B27]" />
              2. Finalidade do Tratamento
            </h2>
            <p>
              Os dados coletados destinam-se única e exclusivamente a:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs text-slate-500">
              <li>Avaliação e diagnóstico socioambiental da propriedade rural;</li>
              <li>Agendamento de auditorias técnicas de campo conduzidas pela APROSOJA/MS;</li>
              <li>Emissão e homologação da certificação RTRS e negociação de créditos sustentáveis;</li>
              <li>Comunicação institucional sobre o andamento dos diagnósticos.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-[#C59B27]" />
              3. Segurança da Informação e Criptografia
            </h2>
            <p>
              Todas as informações são armazenadas em servidores seguros com controle de acesso por privilégios (Row Level Security - RLS) e criptografia de ponta a ponta. Garantimos que seus dados não serão comercializados com terceiros não autorizados.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-[#C59B27]" />
              4. Direitos do Titular de Dados
            </h2>
            <p>
              Em conformidade com a LGPD, o titular dos dados pode solicitar o acesso, correção, anonimização ou exclusão de suas informações através do e-mail oficial: <code>analistatecnico@aprosojams.org.br</code>.
            </p>
          </section>
        </div>

        {/* Rodapé Interno */}
        <div className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-slate-500">
          <p>&copy; {new Date().getFullYear()} APROSOJA/MS — Programa MS Sustentável.</p>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#7CB324]" />
            <span>LGPD Conformidade Garantida</span>
          </div>
        </div>

      </div>
    </div>
  );
}
