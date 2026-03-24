import { useContext } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';

const ProtectedRoute = ({ requireAdmin = false }) => {
  const { user, loading } = useContext(AuthContext);

  // Show a futuristic loading spinner while checking the session
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center">
        <Loader2 className="w-12 h-12 text-cyan-500 animate-spin mb-4" />
        <p className="text-cyan-400 tracking-widest text-sm uppercase animate-pulse">
          Verifying Clearance...
        </p>
      </div>
    );
  }

  // If no user is logged in, kick them back to the login page
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If this route requires an admin, but the user is not an admin, kick them to the dashboard
  if (requireAdmin && user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  // If they pass all checks, render the child route
  return <Outlet />;
};

export default ProtectedRoute;