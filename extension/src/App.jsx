import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout'; // <-- Import the new Layout

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Analytics = lazy(() => import('./pages/Analytics'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AccountSettings = lazy(() => import('./pages/AccountSettings'));
const SystemConsole = lazy(() => import('./pages/SystemConsole'));

function App() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm font-semibold text-cyan-400">
          Loading FastApply…
        </div>
      }
    >
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        {/* Standalone restricted console — never linked from any menu; the
            page itself bounces anyone who is not authorized. */}
        <Route element={<ProtectedRoute />}>
          <Route path="/system-console" element={<SystemConsole />} />
        </Route>

        {/* Wrap protected routes in the Layout component */}
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/settings" element={<AccountSettings />} />
            {/* Admin routes can also live inside the Layout for consistent navigation */}
            <Route element={<ProtectedRoute requireAdmin={true} />}>
              <Route path="/admin" element={<AdminDashboard />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}

export default App;
