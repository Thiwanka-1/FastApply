import { useState, useContext } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { 
  LayoutDashboard, 
  BarChart3, 
  ShieldAlert, 
  LogOut, 
  Menu, 
  X, 
  Zap,
  User,
  Settings
} from 'lucide-react';

const Layout = () => {
  const { user, logout } = useContext(AuthContext);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navLinks = [
    { path: '/', name: 'Profile Engine', icon: LayoutDashboard },
    { path: '/analytics', name: 'Telemetry', icon: BarChart3 },
    { path: '/settings', name: 'Account Settings', icon: Settings }, // ADD THIS LINE
  ];

  // Add Admin panel only if the user is an admin
  if (user?.role === 'admin') {
    navLinks.push({ path: '/admin', name: 'Command Center', icon: ShieldAlert });
  }

  const getPageTitle = () => {
    const currentRoute = navLinks.find(link => link.path === location.pathname);
    return currentRoute ? currentRoute.name : 'Dashboard';
  };

  return (
    <div className="min-h-screen bg-slate-950 flex font-sans text-slate-100 overflow-hidden selection:bg-cyan-500/30">
      
      {/* Global Background Glow */}
      <div className="fixed top-0 left-1/4 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-900/20 via-slate-950 to-slate-950 -z-10 pointer-events-none"></div>

      {/* --- MOBILE OVERLAY --- */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        ></div>
      )}

      {/* --- SIDEBAR NAVIGATION --- */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-72 bg-slate-900/80 backdrop-blur-2xl border-r border-white/5 shadow-2xl transition-transform duration-300 ease-in-out flex flex-col
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Sidebar Header */}
        <div className="h-20 flex items-center px-6 border-b border-white/5">
          <div className="p-2 bg-gradient-to-br from-cyan-400 to-indigo-500 rounded-lg shadow-[0_0_15px_rgba(34,211,238,0.3)] mr-3">
            <Zap className="w-6 h-6 text-slate-950" />
          </div>
          <span className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-400 tracking-wide">
            FastApply
          </span>
          <button 
            className="ml-auto lg:hidden text-slate-400 hover:text-white"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <X size={24} />
          </button>
        </div>

        {/* User Badge */}
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shadow-inner">
              <User className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <p className="font-bold text-sm truncate w-40">{user?.name}</p>
              <p className="text-xs text-slate-400 uppercase tracking-widest mt-0.5">{user?.role}</p>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 py-6 px-4 space-y-2 overflow-y-auto custom-scrollbar">
          <p className="px-4 text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Core Systems</p>
          {navLinks.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.path}
                to={link.path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) => `
                  flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 group
                  ${isActive 
                    ? 'bg-gradient-to-r from-cyan-500/10 to-indigo-500/10 border-l-2 border-cyan-400 text-cyan-300' 
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}
                `}
              >
                <Icon className={`w-5 h-5 transition-colors ${location.pathname === link.path ? 'text-cyan-400' : 'text-slate-500 group-hover:text-cyan-400'}`} />
                <span className="font-medium tracking-wide">{link.name}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Logout Button */}
        <div className="p-4 border-t border-white/5">
          <button
            onClick={handleLogout}
            className="flex items-center space-x-3 w-full px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors group"
          >
            <LogOut className="w-5 h-5 text-red-500/70 group-hover:text-red-400" />
            <span className="font-medium">Disconnect</span>
          </button>
        </div>
      </aside>

      {/* --- MAIN CONTENT AREA --- */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        
        {/* Top Mobile/Desktop Header */}
        <header className="h-20 flex items-center justify-between px-6 lg:px-10 bg-slate-900/50 backdrop-blur-md border-b border-white/5 shrink-0 z-30">
          <div className="flex items-center">
            <button 
              className="lg:hidden text-slate-400 hover:text-white mr-4 focus:outline-none"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu size={28} />
            </button>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-wide">
              {getPageTitle()}
            </h1>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="hidden sm:flex items-center px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-full">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse mr-2"></span>
              <span className="text-xs font-semibold text-green-400 uppercase tracking-widest">System Online</span>
            </div>
          </div>
        </header>

        {/* Dynamic Page Content (This is where Dashboard.jsx and Analytics.jsx load) */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-10 custom-scrollbar relative">
          <Outlet />
        </div>

      </main>
    </div>
  );
};

export default Layout;