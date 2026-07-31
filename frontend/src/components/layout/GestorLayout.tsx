import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Building2, 
  Users, 
  FileCheck2, 
  ClipboardList,
  Map as MapIcon,
  FolderOpen,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';

export default function GestorLayout() {
  const location = useLocation();

  const navigation = [
    { name: 'Visão Geral', href: '/app/gestor', icon: LayoutDashboard, exact: true },
    { name: 'Propriedades', href: '/app/gestor/propriedades', icon: Building2 },
    { name: 'Auditorias', href: '/app/gestor/auditorias', icon: FileCheck2 },
    { name: 'Documentação & Evidências', href: '/app/gestor/documentos', icon: FolderOpen },
    { name: 'Mapa e Cruzamento', href: '/app/gestor/mapa', icon: MapIcon },
    { name: 'Usuários', href: '/app/gestor/usuarios', icon: Users },
    { name: 'Questionário RTRS', href: '/app/gestor/questionario', icon: ClipboardList },
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-8 min-h-[calc(100vh-6rem)]">
      
      {/* Sidebar de Navegação Premium com Motion Design */}
      <aside className="w-full lg:w-72 flex-shrink-0">
        <div className="sticky top-20 space-y-4">
          
          {/* Header Card da Sidebar */}
          <div className="bg-gradient-to-r from-[#0F172A] to-slate-900 p-4.5 rounded-2xl border border-slate-800 text-white shadow-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#1B7547]/20 text-[#7CB324] rounded-xl border border-[#1B7547]/30">
                <ShieldCheck className="w-5 h-5 animate-pulse-glow" />
              </div>
              <div>
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-200">Painel do Gestor</h3>
                <p className="text-[11px] text-[#C59B27] font-semibold">APROSOJA / MS</p>
              </div>
            </div>
            <span className="h-2 w-2 rounded-full bg-[#7CB324] animate-ping" />
          </div>

          {/* NavLinks com Micro-Interações */}
          <nav className="bg-white/80 backdrop-blur-md p-2 rounded-2xl border border-slate-200 shadow-sm flex flex-row lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible scrollbar-none">
            {navigation.map((item) => {
              const isActive = item.exact 
                ? location.pathname === item.href 
                : location.pathname.startsWith(item.href);
                
              return (
                <NavLink
                  key={item.name}
                  to={item.href}
                  className={`
                    group relative flex items-center justify-between px-4 py-3 rounded-xl font-bold text-xs transition-all duration-300 whitespace-nowrap active:scale-98
                    ${isActive 
                      ? 'bg-gradient-to-r from-[#1B7547] to-[#15613a] text-white shadow-md shadow-[#1B7547]/25 font-extrabold translate-x-1' 
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 lg:hover:translate-x-1'
                    }
                  `}
                >
                  <div className="flex items-center gap-3">
                    <item.icon 
                      className={`w-4 h-4 transition-all duration-300 ${
                        isActive 
                          ? 'text-white scale-110 rotate-3' 
                          : 'text-slate-400 group-hover:text-[#1B7547] group-hover:scale-110'
                      }`} 
                    />
                    <span>{item.name}</span>
                  </div>

                  {isActive && (
                    <ChevronRight className="w-4 h-4 text-emerald-200 animate-slide-in-right hidden lg:block" />
                  )}
                </NavLink>
              )
            })}
          </nav>
        </div>
      </aside>

      {/* Área de Conteúdo Principal com Animação de Entrada */}
      <main className="flex-1 min-w-0">
        <div key={location.pathname} className="bg-white rounded-3xl p-6 sm:p-8 min-h-[calc(100vh-8rem)] border border-slate-200 shadow-sm animate-fade-in-up transition-all">
          <Outlet />
        </div>
      </main>

    </div>
  );
}
