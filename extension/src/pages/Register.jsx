import { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { Briefcase, FileText, CheckCircle, Eye, EyeOff } from 'lucide-react';

const Register = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  
  const { user, register } = useContext(AuthContext);
  const navigate = useNavigate();

  if (user) {
    return <Navigate to="/" replace />;
  }

  // Strictly enforce Letters, Spaces, and Periods for Name
  const handleNameChange = (e) => {
    const val = e.target.value;
    if (/^[a-zA-Z\s.]*$/.test(val)) {
      setName(val);
    }
  };

  const validateForm = () => {
    if (name.trim().length < 2) {
      setError('Please enter your full name.');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address.');
      return false;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return false;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!validateForm()) return;

    try {
      await register(name, email, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to register account.');
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-slate-950 font-sans selection:bg-indigo-500/30 overflow-hidden">
      
      {/* LEFT SIDE: Product Visuals (Hidden on Mobile) */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-slate-900 border-r border-slate-800 items-center justify-center">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-[100px] animate-pulse"></div>
        <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-cyan-600/10 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }}></div>
        
        <div className="relative z-10 max-w-lg p-12">
          <div className="flex items-center space-x-4 mb-6">
            <Briefcase className="w-12 h-12 text-indigo-400" />
            <h1 className="text-5xl font-black text-white">FastApply</h1>
          </div>
          <p className="text-slate-400 text-lg leading-relaxed mb-8">
            Create your master application profile. Upload your resume, add your history, and stop doing repetitive data entry.
          </p>
          
          <div className="space-y-4">
            <div className="flex items-center space-x-4 text-slate-300 bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 backdrop-blur-sm">
              <FileText className="w-6 h-6 text-cyan-400" />
              <span>Centralized Work & Education History</span>
            </div>
            <div className="flex items-center space-x-4 text-slate-300 bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 backdrop-blur-sm">
              <CheckCircle className="w-6 h-6 text-indigo-400" />
              <span>Apply to hundreds of roles effortlessly</span>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE: The Form Container */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 lg:p-12 relative">
        <div className="absolute lg:hidden top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full h-full bg-indigo-500/5 rounded-full blur-[120px]"></div>

        <div className="relative z-10 w-full max-w-md bg-white/5 backdrop-blur-2xl border border-white/10 p-8 sm:p-10 rounded-3xl shadow-2xl">
          
          <div className="flex flex-col items-center mb-6 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-wide">
              Create Account
            </h2>
            <p className="text-slate-400 mt-2 text-sm">Set up your application profile</p>
          </div>

          {error && <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm text-center font-medium">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-2">Full Name</label>
              <input 
                type="text" 
                value={name}
                onChange={handleNameChange}
                className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 transition-all placeholder-slate-600"
                placeholder="John Doe"
                required
              />
            </div>
            <div>
              <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-2">Email Address</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 transition-all placeholder-slate-600"
                placeholder="you@example.com"
                required
              />
            </div>
            
            {/* Passwords Side-by-Side on Desktop, Stacked on Mobile */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="w-full sm:w-1/2">
                <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-2">Password</label>
                <div className="relative">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-900/60 border border-slate-700 rounded-xl pl-4 pr-10 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 transition-all placeholder-slate-600"
                    placeholder="Min. 6 chars"
                    required
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-500 hover:text-indigo-400 transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div className="w-full sm:w-1/2">
                <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-2">Confirm</label>
                <div className="relative">
                  <input 
                    type={showConfirmPassword ? "text" : "password"} 
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-slate-900/60 border border-slate-700 rounded-xl pl-4 pr-10 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 transition-all placeholder-slate-600"
                    placeholder="Match password"
                    required
                  />
                  <button 
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-500 hover:text-indigo-400 transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>
            
            <button 
              type="submit" 
              className="w-full mt-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 px-4 rounded-xl shadow-[0_0_15px_rgba(79,70,229,0.4)] transition-all duration-300 transform hover:-translate-y-0.5"
            >
              Register
            </button>
          </form>

          <p className="mt-8 text-center text-slate-400 text-sm">
            Already have an account? <Link to="/login" className="text-indigo-400 hover:text-indigo-300 font-semibold transition-colors">Login here</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;