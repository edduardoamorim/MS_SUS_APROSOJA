
import { Outlet, Link } from 'react-router-dom';
import { Leaf } from 'lucide-react';

export default function PublicLayout() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header Público */}
      <header className="border-b border-gray-100 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link to="/" className="flex items-center gap-2 text-emerald-700">
              <Leaf className="w-6 h-6" />
              <span className="text-xl font-bold tracking-tight">MS Sustentável</span>
            </Link>
            
            <nav className="flex items-center gap-4">
              <Link to="/login" className="text-gray-600 hover:text-emerald-700 font-medium text-sm transition-colors">
                Entrar
              </Link>
              <Link to="/cadastro" className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-md font-medium text-sm transition-colors shadow-sm">
                Cadastre-se
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content (onde as páginas públicas injetarão conteúdo) */}
      <main className="flex-1 w-full">
        <Outlet />
      </main>

      {/* Footer Público */}
      <footer className="bg-gray-50 border-t border-gray-200 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-500 text-sm">
          <p>&copy; {new Date().getFullYear()} Programa MS Sustentável - RTRS. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
