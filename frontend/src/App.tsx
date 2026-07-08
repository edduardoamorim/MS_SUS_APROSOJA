
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/security/ProtectedRoute';

import PublicLayout from './components/layout/PublicLayout';
import BaseLayout from './components/layout/BaseLayout';

import LandingPage from './pages/public/LandingPage';
import Login from './pages/Login';
import Register from './pages/auth/Register';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import Unauthorized from './pages/Unauthorized';

import DashboardProdutor from './pages/produtor/DashboardProdutor';
import DashboardTecnico from './pages/tecnico/DashboardTecnico';
import DashboardGestor from './pages/gestor/DashboardGestor';
import GestorLayout from './components/layout/GestorLayout';
import GestorPropriedades from './pages/gestor/GestorPropriedades';
import GestorUsuarios from './pages/gestor/GestorUsuarios';
import GestorAuditorias from './pages/gestor/GestorAuditorias';
import GestorQuestionarios from './pages/gestor/GestorQuestionarios';
import GestorMapa from './pages/gestor/GestorMapa';
import ProfileSettings from './pages/profile/ProfileSettings';
import { ToastProvider } from './context/ToastContext';

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Rotas Abertas / Públicas */}
            <Route element={<PublicLayout />}>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<Login />} />
              <Route path="/cadastro" element={<Register />} />
              <Route path="/esqueci-a-senha" element={<ForgotPassword />} />
              <Route path="/redefinir-senha" element={<ResetPassword />} />
              <Route path="/unauthorized" element={<Unauthorized />} />
            </Route>

            {/* Rotas Privadas */}
            <Route element={<BaseLayout />}>
              
              {/* O perfil pode ser acessado por qualquer role logada */}
              <Route element={<ProtectedRoute allowedRoles={['produtor', 'tecnico', 'gestor']} />}>
                <Route path="/perfil" element={<ProfileSettings />} />
              </Route>

              {/* Portal do Produtor */}
              <Route element={<ProtectedRoute allowedRoles={['produtor']} />}>
                <Route path="/produtor" element={<DashboardProdutor />} />
              </Route>

              {/* Portal do Técnico */}
              <Route element={<ProtectedRoute allowedRoles={['tecnico']} />}>
                <Route path="/tecnico" element={<DashboardTecnico />} />
              </Route>

              {/* Portal do Gestor */}
              <Route element={<ProtectedRoute allowedRoles={['gestor']} />}>
                <Route path="/gestor" element={<GestorLayout />}>
                  <Route index element={<DashboardGestor />} />
                  <Route path="propriedades" element={<GestorPropriedades />} />
                  <Route path="auditorias" element={<GestorAuditorias />} />
                  <Route path="mapa" element={<GestorMapa />} />
                  <Route path="usuarios" element={<GestorUsuarios />} />
                  <Route path="questionario" element={<GestorQuestionarios />} />
                </Route>
              </Route>
              
            </Route>

            {/* Fallback Geral */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
