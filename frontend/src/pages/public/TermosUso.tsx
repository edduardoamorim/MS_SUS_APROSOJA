import { Link } from 'react-router-dom';
import { ShieldCheck, FileText, ArrowLeft, CheckCircle } from 'lucide-react';

export default function TermosUso() {
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
            <div className="p-3 bg-[#1B7547]/10 text-[#1B7547] rounded-2xl">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Termos e Condições de Uso
              </h1>
              <p className="text-xs font-semibold text-slate-500">
                Programa MS Sustentável — APROSOJA/MS (Versão 1.0)
              </p>
            </div>
          </div>
        </div>

        {/* Conteúdo Institucional dos Termos */}
        <div className="space-y-6 text-slate-600 text-sm leading-relaxed">
          <section className="space-y-2">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-[#1B7547]" />
              1. Aceitação dos Termos
            </h2>
            <p>
              Ao utilizar o Portal e a plataforma oficial do <strong>Programa MS Sustentável</strong>, mantido pela <strong>APROSOJA/MS</strong>, você concorda expressamente em cumprir e estar vinculado aos seguintes Termos e Condições de Uso. Caso não concorde com qualquer disposição aqui apresentada, solicitamos que não continue a utilização da plataforma.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-[#1B7547]" />
              2. Objeto e Finalidade do Sistema
            </h2>
            <p>
              O sistema destina-se à gestão, cadastramento, diagnóstico preliminar, verificação socioambiental, geoprocessamento e auditoria técnica para homologação da certificação internacional <strong>RTRS (Round Table on Responsible Soy)</strong> para produtores rurais do Estado de Mato Grosso do Sul.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-[#1B7547]" />
              3. Responsabilidades do Usuário
            </h2>
            <p>
              O produtor rural ou usuário cadastrado compromete-se a fornecer informações verídicas, exatas e atualizadas referente à propriedade rural, documentação fundiária (CAR/SIGEF), declarações trabalhistas e evidências ambientais.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-[#1B7547]" />
              4. Propriedade Intelectual e Sigilo
            </h2>
            <p>
              Todos os materiais gráficos, marcas, logotipos, marcas d'água, layouts e código-fonte são de propriedade exclusiva da <strong>APROSOJA/MS</strong> e protegidos pela legislação brasileira de direitos autorais e propriedade industrial.
            </p>
          </section>
        </div>

        {/* Rodapé Interno */}
        <div className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-slate-500">
          <p>&copy; {new Date().getFullYear()} APROSOJA/MS — Programa MS Sustentável.</p>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#7CB324]" />
            <span>Documento Institucional Oficial</span>
          </div>
        </div>

      </div>
    </div>
  );
}
