import { useState } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { 
  Menu, 
  X, 
  LogOut, 
  User as UserIcon, 
  Settings, 
  ArrowLeft,
  LayoutDashboard,
  Building2,
  FileCheck2,
  FolderOpen,
  Map as MapIcon,
  Users,
  ClipboardList
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import siteContent from '../../config/site_content.json';
import NetworkStatusIndicator from '../ui/NetworkStatusIndicator';
import OfflineBanner from '../ui/OfflineBanner';

export default function BaseLayout() {
  const content = siteContent.geral;
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const rootPaths = [
    '/',
    '/login',
    '/app/produtor',
    '/app/tecnico',
    '/app/gestor',
    '/app/gestor/visao-geral',
    '/app/gestor/propriedades',
    '/app/gestor/usuarios',
    '/app/gestor/auditorias',
    '/app/gestor/questionario',
    '/app/gestor/mapa'
  ];

  // Mostra o botão Voltar APENAS se a rota atual NÃO for uma das rotas principais de navegação
  const showBackButton = !rootPaths.includes(location.pathname);

  const getHomePath = () => {
    if (!user) return '/';
    if (role === 'gestor') return '/app/gestor';
    if (role === 'tecnico') return '/app/tecnico';
    if (role === 'produtor') return '/app/produtor';
    return '/';
  };

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans text-foreground selection:bg-primary/20">
      {/* Header Premium Shadcn/Tremor Style */}
      <header className="sticky top-0 z-40 bg-card/80 backdrop-blur-md border-b border-border shadow-sm transition-all h-16 flex items-center">
        <div className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          
          {/* Esquerda: Logo e Controle de Navegação */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="p-1.5 -ml-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg md:hidden transition-colors cursor-pointer"
              aria-label="Abrir menu de navegação"
            >
              <Menu className="w-5 h-5" />
            </button>
            
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
          
          {/* Direita: Perfil do Usuário */}
          <div className="flex items-center gap-4">
            <NetworkStatusIndicator />
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
                  to="/app/perfil"
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

      {/* Drawer Mobile Navigation */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity animate-fade-in cursor-pointer"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer Content */}
          <div className="fixed inset-y-0 left-0 w-[84%] max-w-xs bg-white shadow-2xl flex flex-col justify-between z-10 border-r border-border animate-slide-in-right">
            <div className="overflow-y-auto">
              {/* Header Drawer */}
              <div className="p-4 border-b border-border flex items-center justify-between">
                <Link 
                  to={getHomePath()} 
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-lg font-extrabold tracking-tight text-foreground flex items-center gap-2"
                >
                  <div className="w-2 h-5 bg-primary rounded-sm"></div>
                  {content.nome_plataforma}
                </Link>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg cursor-pointer"
                  aria-label="Fechar menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Informações do Usuário no Mobile */}
              {user && (
                <div className="p-4 bg-muted/40 border-b border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold">
                      <UserIcon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-foreground truncate">{user.email}</p>
                      <span className="inline-block mt-0.5 text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full uppercase tracking-wider font-extrabold border border-emerald-300">
                        {role || content.usuario_anonimo}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Links Rápidos por Perfil */}
              <nav className="p-3 space-y-1">
                {role === 'gestor' && (
                  <>
                    <p className="px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Navegação Gestor</p>
                    <Link
                      to="/app/gestor"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                    >
                      <LayoutDashboard className="w-4 h-4 text-emerald-600" />
                      Visão Geral
                    </Link>
                    <Link
                      to="/app/gestor/propriedades"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                    >
                      <Building2 className="w-4 h-4 text-emerald-600" />
                      Propriedades
                    </Link>
                    <Link
                      to="/app/gestor/auditorias"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                    >
                      <FileCheck2 className="w-4 h-4 text-emerald-600" />
                      Auditorias
                    </Link>
                    <Link
                      to="/app/gestor/documentos"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                    >
                      <FolderOpen className="w-4 h-4 text-emerald-600" />
                      Documentação & Evidências
                    </Link>
                    <Link
                      to="/app/gestor/mapa"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                    >
                      <MapIcon className="w-4 h-4 text-emerald-600" />
                      Mapa e Cruzamento
                    </Link>
                    <Link
                      to="/app/gestor/usuarios"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                    >
                      <Users className="w-4 h-4 text-emerald-600" />
                      Usuários
                    </Link>
                    <Link
                      to="/app/gestor/questionario"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                    >
                      <ClipboardList className="w-4 h-4 text-emerald-600" />
                      Questionário RTRS
                    </Link>
                  </>
                )}

                {role === 'tecnico' && (
                  <>
                    <p className="px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Portal do Técnico</p>
                    <Link
                      to="/app/tecnico?tab=mapa"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                    >
                      <MapIcon className="w-4 h-4 text-emerald-600" />
                      Mapa & Propriedades
                    </Link>
                    <Link
                      to="/app/tecnico?tab=auditorias"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                    >
                      <FileCheck2 className="w-4 h-4 text-emerald-600" />
                      Auditorias & Visitas
                    </Link>
                    <Link
                      to="/app/tecnico?tab=documentacao"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                    >
                      <FolderOpen className="w-4 h-4 text-emerald-600" />
                      Histórico de Documentação
                    </Link>
                  </>
                )}

                {role === 'produtor' && (
                  <>
                    <p className="px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Portal do Produtor</p>
                    <Link
                      to="/app/produtor?tab=mapa"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                    >
                      <MapIcon className="w-4 h-4 text-emerald-600" />
                      Minha Fazenda & Mapa
                    </Link>
                    <Link
                      to="/app/produtor?tab=pendencias"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                    >
                      <ClipboardList className="w-4 h-4 text-emerald-600" />
                      Pendências & Adequação (IA)
                    </Link>
                    <Link
                      to="/app/produtor?tab=documentacao"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                    >
                      <FolderOpen className="w-4 h-4 text-emerald-600" />
                      Documentação & Evidências
                    </Link>
                  </>
                )}
              </nav>
            </div>

            {/* Rodapé Drawer */}
            <div className="p-4 border-t border-border space-y-2 bg-slate-50">
              <Link
                to="/app/perfil"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-white hover:shadow-xs transition-all"
              >
                <Settings className="w-4 h-4 text-slate-500" />
                Meu Perfil & Configurações
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleLogout();
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                Sair da Plataforma
              </button>
            </div>
          </div>
        </div>
      )}

      <OfflineBanner />

      {/* Conteúdo Principal com Animação Fluida */}
      <main key={location.pathname} className="flex-1 w-full max-w-[1920px] mx-auto p-4 sm:p-6 lg:p-8 pb-safe animate-fade-in-up duration-300">
        <Outlet />
      </main>
    </div>
  );
}