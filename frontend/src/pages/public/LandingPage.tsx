
import { Link } from 'react-router-dom';
import { CheckCircle, Leaf, Award } from 'lucide-react';

export default function LandingPage() {
  return (
    <div>
      {/* Hero Section */}
      <section className="bg-emerald-50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 tracking-tight mb-6">
            Sustentabilidade e <span className="text-emerald-600">Certificação</span> no Campo
          </h1>
          <p className="max-w-2xl mx-auto text-lg text-gray-600 mb-10">
            A plataforma oficial para gestão, auditoria e aprovação da certificação RTRS para propriedades rurais em Mato Grosso do Sul.
          </p>
          <div className="flex justify-center gap-4">
            <Link to="/cadastro" className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-lg font-bold text-lg transition-colors shadow-lg shadow-emerald-200">
              Sou Produtor Rural
            </Link>
            <Link to="/login" className="bg-white hover:bg-gray-50 text-emerald-700 border border-emerald-200 px-8 py-3 rounded-lg font-bold text-lg transition-colors shadow-sm">
              Já tenho acesso
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900">Como funciona o processo?</h2>
          </div>
          
          <div className="grid md:grid-cols-3 gap-10">
            <div className="text-center">
              <div className="bg-emerald-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 text-emerald-700">
                <CheckCircle className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">1. Autoavaliação</h3>
              <p className="text-gray-600">O produtor cadastra a fazenda e preenche um diagnóstico preliminar pelo portal.</p>
            </div>
            
            <div className="text-center">
              <div className="bg-emerald-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 text-emerald-700">
                <Leaf className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">2. Visita Técnica</h3>
              <p className="text-gray-600">Técnicos especializados vão a campo para coleta de evidências utilizando o app mobile.</p>
            </div>

            <div className="text-center">
              <div className="bg-emerald-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 text-emerald-700">
                <Award className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">3. Certificação RTRS</h3>
              <p className="text-gray-600">A equipe gestora avalia o relatório e emite o selo de certificação sustentável.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
