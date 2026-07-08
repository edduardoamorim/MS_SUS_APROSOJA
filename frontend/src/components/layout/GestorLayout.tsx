import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Building2, 
  Users, 
  FileCheck2, 
  ClipboardList,
  Map as MapIcon
} from 'lucide-react';

export default function GestorLayout() {
  const location = useLocation();

  const navigation = [
    { name: 'Visão Geral', href: '/gestor', icon: LayoutDashboard, exact: true },
    { name: 'Propriedades', href: '/gestor/propriedades', icon: Building2 },
    { name: 'Auditorias', href: '/gestor/auditorias', icon: FileCheck2 },
    { name: 'Mapa e Cruzamento', href: '/gestor/mapa', icon: MapIcon },
    { name: 'Usuários', href: '/gestor/usuarios', icon: Users },
    { name: 'Questionário RTRS', href: '/gestor/questionario', icon: ClipboardList },
  ];

  return (
    <div className="flex flex-col md:flex-row gap-8">
      {/* Sidebar de Navegação */}
      <aside className="w-full md:w-64 flex-shrink-0">
        <nav className="flex flex-row md:flex-col gap-1.5 overflow-x-auto md:overflow-visible pb-2 md:pb-0 sticky top-24">
          {navigation.map((item) => {
            const isActive = item.exact 
              ? location.pathname === item.href 
              : location.pathname.startsWith(item.href);
              
            return (
              <NavLink
                key={item.name}
                to={item.href}
                className={`
                  flex items-center gap-3 px-4 py-2.5 rounded-lg font-bold text-sm transition-all duration-250 ease-out whitespace-nowrap active:scale-97
                  ${isActive 
                    ? 'bg-secondary text-secondary-foreground shadow-sm scale-102 border-l-2 border-primary pl-3.5' 
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground md:hover:translate-x-1'
                  }
                `}
              >
                <item.icon className={`w-4 h-4 transition-colors duration-200 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                {item.name}
              </NavLink>
            )
          })}
        </nav>
      </aside>

      {/* Área de Conteúdo */}
      <main className="flex-1 min-w-0 animate-fade-in-up">
        <div className="bg-card rounded-2xl p-6 lg:p-8 min-h-[calc(100vh-8rem)] border border-border shadow-sm">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
