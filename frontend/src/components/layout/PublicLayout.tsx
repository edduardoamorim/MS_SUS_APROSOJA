import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { LogIn, ShieldCheck, Mail, MapPin, ExternalLink, ChevronUp } from 'lucide-react';

export default function PublicLayout() {
  const location = useLocation();
  const isLandingPage = location.pathname === '/';
  const [scrolled, setScrolled] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 30) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }

      if (window.scrollY > 400) {
        setShowBackToTop(true);
      } else {
        setShowBackToTop(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans text-slate-900 selection:bg-[#1B7547]/20 selection:text-[#1B7547]">
      
      {/* Header Institucional Público com Scroll Motion */}
      <header 
        className={`sticky top-0 z-50 transition-all duration-500 ${
          scrolled 
            ? 'bg-white/95 backdrop-blur-xl shadow-lg border-b border-[#1B7547]/20 py-3' 
            : 'bg-white/80 backdrop-blur-md border-b border-slate-200/80 py-4'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            
            {/* Logo da Aplicação (PNG com fundo transparente) */}
            <Link to="/" className="flex items-center gap-3 group focus:outline-none">
              <div className="relative overflow-hidden transition-transform duration-300 group-hover:scale-105">
                <img 
                  src="/logo_ms_sus.png" 
                  alt="MS Sustentável - APROSOJA/MS" 
                  className="h-11 sm:h-12 w-auto object-contain filter drop-shadow-xs"
                />
              </div>
            </Link>
            
            {/* Navegação e Botão de Acesso ao Portal */}
            <nav className="flex items-center gap-3 sm:gap-8">
              {isLandingPage && (
                <div className="hidden md:flex items-center gap-7 text-sm font-semibold text-slate-600">
                  <a 
                    href="#sobre" 
                    className="relative py-1 hover:text-[#1B7547] transition-colors after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-0 after:h-0.5 after:bg-[#1B7547] hover:after:w-full after:transition-all after:duration-300"
                  >
                    Quem Somos
                  </a>
                  <a 
                    href="#pilares" 
                    className="relative py-1 hover:text-[#1B7547] transition-colors after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-0 after:h-0.5 after:bg-[#1B7547] hover:after:w-full after:transition-all after:duration-300"
                  >
                    Pilares RTRS
                  </a>
                  <a 
                    href="#equipe" 
                    className="relative py-1 hover:text-[#1B7547] transition-colors after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-0 after:h-0.5 after:bg-[#1B7547] hover:after:w-full after:transition-all after:duration-300"
                  >
                    Equipe Técnica
                  </a>
                </div>
              )}

              <Link 
                to="/login" 
                className="group relative inline-flex items-center justify-center gap-2 bg-[#1B7547] hover:bg-[#15613a] text-white px-5 py-2.5 rounded-xl font-extrabold text-sm transition-all duration-300 shadow-md shadow-[#1B7547]/20 hover:shadow-xl hover:shadow-[#1B7547]/30 hover:-translate-y-0.5 active:scale-95 overflow-hidden"
              >
                {/* Glow de fundo no hover */}
                <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out" />
                <LogIn className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                <span>Acessar Portal</span>
              </Link>
            </nav>

          </div>
        </div>
      </header>

      {/* Conteúdo Principal com Animação Fluida */}
      <main key={location.pathname} className="flex-1 w-full animate-fade-in-up duration-300">
        <Outlet />
      </main>

      {/* Botão de Voltar ao Topo com Animação */}
      <button
        onClick={scrollToTop}
        className={`fixed bottom-6 right-6 z-40 p-3 bg-[#1B7547] text-white rounded-full shadow-2xl transition-all duration-300 hover:bg-[#15613a] hover:scale-110 active:scale-95 ${
          showBackToTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'
        }`}
        title="Voltar ao topo"
      >
        <ChevronUp className="w-5 h-5 animate-bounce-soft" />
      </button>

      {/* Footer Corporativo APROSOJA / MS com Motion */}
      <footer className="bg-[#0F172A] text-slate-300 border-t border-slate-800 relative overflow-hidden">
        {/* Glow suave no background do footer */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#1B7547]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
            
            {/* Coluna 1: Logo e Descrição */}
            <div className="space-y-4 md:col-span-1">
              <div className="inline-block p-3 bg-white/5 rounded-2xl border border-slate-800 backdrop-blur-md transition-transform duration-300 hover:scale-105">
                <img 
                  src="/logo_ms_sus.png" 
                  alt="Logo MS Sustentável" 
                  className="h-12 w-auto object-contain"
                />
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Programa oficial de certificação RTRS e boas práticas socioambientais da APROSOJA/MS para a sojicultura de Mato Grosso do Sul.
              </p>
            </div>

            {/* Coluna 2: Navegação Rápida */}
            <div>
              <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-4 border-l-2 border-[#C59B27] pl-3">
                Navegação
              </h4>
              <ul className="space-y-2.5 text-xs">
                <li><Link to="/" className="hover:text-[#7CB324] transition-colors flex items-center gap-1.5"><span className="text-[#C59B27]">›</span> Início</Link></li>
                <li><a href="#sobre" className="hover:text-[#7CB324] transition-colors flex items-center gap-1.5"><span className="text-[#C59B27]">›</span> Sobre o Programa</a></li>
                <li><a href="#pilares" className="hover:text-[#7CB324] transition-colors flex items-center gap-1.5"><span className="text-[#C59B27]">›</span> Pilares de Sustentabilidade</a></li>
                <li><a href="#equipe" className="hover:text-[#7CB324] transition-colors flex items-center gap-1.5"><span className="text-[#C59B27]">›</span> Equipe Técnica</a></li>
                <li><Link to="/login" className="hover:text-[#7CB324] transition-colors flex items-center gap-1.5"><span className="text-[#C59B27]">›</span> Portal Privado / Intranet</Link></li>
              </ul>
            </div>

            {/* Coluna 3: Certificação RTRS */}
            <div>
              <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-4 border-l-2 border-[#7CB324] pl-3">
                Certificação RTRS
              </h4>
              <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                A Round Table on Responsible Soy garante produção socioambientalmente responsável, zero desmatamento e rastreabilidade total.
              </p>
              <a 
                href="https://responsiblesoy.org/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs text-[#C59B27] hover:text-amber-300 font-bold group transition-colors"
              >
                <span>Saiba mais sobre a RTRS</span>
                <ExternalLink className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-0.5" />
              </a>
            </div>

            {/* Coluna 4: Contato Institucional */}
            <div>
              <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-4 border-l-2 border-[#1B7547] pl-3">
                Contato Técnico
              </h4>
              <ul className="space-y-3 text-xs">
                <li className="flex items-center gap-2.5 group">
                  <Mail className="w-4 h-4 text-[#C59B27] transition-transform duration-300 group-hover:scale-110" />
                  <a href="mailto:analistatecnico@aprosojams.org.br" className="hover:text-white transition-colors">
                    analistatecnico@aprosojams.org.br
                  </a>
                </li>
                <li className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-[#C59B27] mt-0.5 flex-shrink-0" />
                  <span>Campo Grande - MS, Brasil</span>
                </li>
                <li className="flex items-center gap-2.5 pt-2">
                  <ShieldCheck className="w-4 h-4 text-[#7CB324]" />
                  <span className="text-slate-400 font-medium">APROSOJA / MS — Sistema Sustentável</span>
                </li>
              </ul>
            </div>

          </div>

          <div className="border-t border-slate-800 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-slate-500">
            <p>&copy; {new Date().getFullYear()} Programa MS Sustentável — APROSOJA/MS. Todos os direitos reservados.</p>
            <div className="flex gap-4">
              <Link to="/termos" className="hover:text-[#7CB324] transition-colors">Termos de Uso</Link>
              <span>•</span>
              <Link to="/privacidade" className="hover:text-[#7CB324] transition-colors">Política de Privacidade</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
