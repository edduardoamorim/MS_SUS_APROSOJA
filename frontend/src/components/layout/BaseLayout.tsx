import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { Menu, LogOut, User as UserIcon, Settings, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import siteContent from '../../config/site_content.json';

export default function BaseLayout() {
  const content = siteContent.geral;
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const isDashboardRoot = ['/produtor', '/tecnico', '/gestor'].includes(location.pathname);
  const showBackButton = !isDashboardRoot && location.pathname !== '/';

  const getHomePath = () => {
    if (!user) return '/';
    if (role === 'gestor') return '/gestor';
    if (role === 'tecnico') return '/tecnico';
    if (role === 'produtor') return '/produtor';
    return '/';
  };

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans text-foreground selection:bg-primary/20">
      {/* Header Premium Shadcn/Tremor Style */}
      <header className="sticky top-0 z-40 bg-card/80 backdrop-blur-md border-b border-border shadow-sm transition-all h-16 flex items-center">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          
          {/* Esquerda: Logo e Controle de Navegação */}
          <div className="flex items-center gap-3">
            <Menu className="w-5 h-5 text-muted-foreground md:hidden cursor-pointer hover:text-foreground transition-colors" />
            
            <Link to={getHomePath()} className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2 hover:opacity-90 transition-opacity">
              <div className="w-2 h-6 bg-primary rounded-sm"></div>
              {content.nome_plataforma}
            </Link>

            {showBackButton && (
              <>
                <div className="w-px h-4 bg-border hidden sm:block"></div>
                <button 
                  onClick={() => navigate(-1)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted px-2.5 py-1.5 rounded-md transition-all duration-200 border border-transparent hover:border-border cursor-pointer animate-in fade-in slide-in-from-left-2 duration-300"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  {content.botao_voltar}
                </button>
              </>
            )}
          </div>
          
          {/* Direita: Status e Perfil */}
          <div className="flex items-center gap-4">
            
            {/* Status Indicators */}
            <div className="hidden sm:flex items-center gap-3 bg-secondary/50 px-3 py-1.5 rounded-full border border-border">
              <div className="flex items-center gap-1.5" title="Supabase Database">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse"></div>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">DB</span>
              </div>
              <div className="w-px h-3 bg-border"></div>
              <div className="flex items-center gap-1.5" title="Google Gemini AI Studio">
                <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)] animate-pulse"></div>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">AI</span>
              </div>
            </div>

            {user && (
              <div className="flex items-center gap-3 ml-2">
                {/* Badges de Identificação */}
                <div className="hidden md:flex flex-col items-end mr-2">
                  <span className="text-sm font-medium text-foreground">{user.email}</span>
                  <span className="text-[10px] bg-accent/10 text-accent px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold border border-accent/20">
                    {role || content.usuario_anonimo}
                  </span>
                </div>
                
                <div className="md:hidden flex items-center justify-center bg-muted w-8 h-8 rounded-full border border-border">
                  <UserIcon className="w-4 h-4 text-muted-foreground" />
                </div>

                <div className="h-5 w-px bg-border hidden sm:block mx-1"></div>

                {/* Botões de Ação */}
                <Link
                  to="/perfil"
                  className="flex items-center justify-center w-9 h-9 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-all duration-200"
                  title="Meu Perfil"
                >
                  <Settings className="w-4 h-4" />
                </Link>

                <button
                  onClick={handleLogout}
                  className="flex items-center justify-center w-9 h-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-all duration-200"
                  title="Sair"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 animate-fade-in-up">
        <Outlet />
      </main>
    </div>
  );
}
