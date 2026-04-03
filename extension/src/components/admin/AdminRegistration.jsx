import { useState } from 'react';
import axios from 'axios';
import { ShieldPlus, CheckCircle2, AlertTriangle, Eye, EyeOff, Loader2 } from 'lucide-react';

export default function AdminRegistration() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const API_URL = import.meta.env.VITE_API_BASE_URL;

  const handleRegisterAdmin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    if (password.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
      setLoading(false);
      return;
    }

    try {
      // FIXED: URL updated to match /api/auth/admin/register
      await axios.post(`${API_URL}/api/auth/admin/register`, 
        { name, email, password },
        { withCredentials: true }
      );
      
      setMessage({ type: 'success', text: `Admin account for ${name} successfully provisioned.` });
      setName('');
      setEmail('');
      setPassword('');
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to create admin account.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900/40 backdrop-blur-xl p-6 md:p-8 rounded-3xl border border-slate-700/50 shadow-lg relative overflow-hidden max-w-2xl">
      <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/5 rounded-full blur-[80px] pointer-events-none"></div>

      <div className="flex items-center space-x-4 mb-6 pb-6 border-b border-slate-800">
        <div className="p-3 bg-gradient-to-br from-orange-500 to-rose-600 rounded-xl shadow-lg">
          <ShieldPlus className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">Provision Administrator</h2>
          <p className="text-slate-400 text-sm">Create a new user with root system access.</p>
        </div>
      </div>

      {message.text && (
        <div className={`mb-6 p-4 rounded-xl border flex items-center space-x-3 ${message.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'}`}>
          {message.type === 'error' ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
          <span className="font-medium text-sm">{message.text}</span>
        </div>
      )}

      <form onSubmit={handleRegisterAdmin} className="space-y-5 relative z-10">
        <div>
          <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-2">Designation (Full Name)</label>
          <input 
            type="text" 
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-slate-950/60 border border-slate-700 rounded-xl px-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-400 transition-all placeholder-slate-600"
            placeholder="Jane Doe"
            required
          />
        </div>
        <div>
          <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-2">Secure Email</label>
          <input 
            type="email" 
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-slate-950/60 border border-slate-700 rounded-xl px-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-400 transition-all placeholder-slate-600"
            placeholder="admin@system.com"
            required
          />
        </div>
        <div>
          <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-2">Initial Passcode</label>
          <div className="relative">
            <input 
              type={showPassword ? "text" : "password"} 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-950/60 border border-slate-700 rounded-xl pl-4 pr-12 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-400 transition-all placeholder-slate-600"
              placeholder="••••••••"
              required
            />
            <button 
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-500 hover:text-orange-400 transition-colors"
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>
        
        <button 
          type="submit" 
          disabled={loading}
          className="w-full mt-2 bg-gradient-to-r from-orange-600 to-rose-600 hover:from-orange-500 hover:to-rose-500 text-white font-bold py-3.5 px-4 rounded-xl shadow-[0_0_20px_rgba(249,115,22,0.3)] transition-all duration-300 transform hover:-translate-y-0.5 disabled:opacity-50 disabled:transform-none flex justify-center items-center"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'AUTHORIZE NEW ADMIN'}
        </button>
      </form>
    </div>
  );
}