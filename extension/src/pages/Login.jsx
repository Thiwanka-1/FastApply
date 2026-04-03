import { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { Briefcase, Zap, ShieldCheck, Eye, EyeOff } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  
  const { user, login } = useContext(AuthContext);
  const navigate = useNavigate();

  // DYNAMIC REDIRECT: Routes admins to /admin and normal users to /
  if (user) {
    return <Navigate to={user.role === 'admin' ? '/admin' : '/'} replace />;
  }

  const validateForm = () => {
    // Basic Email Regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address.');
      return false;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); // Clear previous errors
    
    if (!validateForm()) return;

    try {
      await login(email, password);
      // We removed navigate('/') here. 
      // Once login() finishes, the global 'user' state updates, 
      // and the 'if (user)' block above automatically handles the correct routing!
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid email or password.');
    }
  };

  return (
    // 'flex' on the root ensures perfect vertical centering on all screens
    <div className="min-h-screen w-full flex bg-slate-950 font-sans selection:bg-cyan-500/30 overflow-hidden">
      
      {/* LEFT SIDE: Product Visuals (Hidden on Mobile) */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-slate-900 border-r border-slate-800 items-center justify-center">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-600/10 rounded-full blur-[100px] animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }}></div>
        
        <div className="relative z-10 max-w-lg p-12">
          <div className="flex items-center space-x-4 mb-6">
            <Briefcase className="w-12 h-12 text-cyan-400" />
            <h1 className="text-5xl font-black text-white">FastApply</h1>
          </div>
          <p className="text-slate-400 text-lg leading-relaxed mb-8">
            Your job search, automated. Map your professional data once and autofill applications across Workday, Greenhouse, and Lever instantly.
          </p>
          
          <div className="space-y-4">
            <div className="flex items-center space-x-4 text-slate-300 bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 backdrop-blur-sm">
              <Zap className="w-6 h-6 text-indigo-400" />
              <span>One-click smart form filling</span>
            </div>
            <div className="flex items-center space-x-4 text-slate-300 bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 backdrop-blur-sm">
              <ShieldCheck className="w-6 h-6 text-cyan-400" />
              <span>Your data stays secure and encrypted</span>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE: The Form Container */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 lg:p-12 relative">
        <div className="absolute lg:hidden top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full h-full bg-cyan-500/5 rounded-full blur-[120px]"></div>

        <div className="relative z-10 w-full max-w-md bg-white/5 backdrop-blur-2xl border border-white/10 p-8 sm:p-10 rounded-3xl shadow-2xl">
          
          <div className="flex flex-col items-center mb-8 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-wide">
              Welcome Back
            </h2>
            <p className="text-slate-400 mt-2 text-sm">Login to access your application profile</p>
          </div>

          {error && <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm text-center font-medium">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-2">Email Address</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 transition-all placeholder-slate-600"
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-2">Password</label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"} 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-900/60 border border-slate-700 rounded-xl pl-4 pr-12 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 transition-all placeholder-slate-600"
                  placeholder="••••••••"
                  required
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-500 hover:text-cyan-400 transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
            
            <button 
              type="submit" 
              className="w-full mt-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3.5 px-4 rounded-xl shadow-[0_0_15px_rgba(8,145,178,0.4)] transition-all duration-300 transform hover:-translate-y-0.5"
            >
              Login
            </button>
          </form>

          <p className="mt-8 text-center text-slate-400 text-sm">
            Don't have an account? <Link to="/register" className="text-cyan-400 hover:text-cyan-300 font-semibold transition-colors">Register here</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;