import { useState, useContext, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { User, Mail, Lock, Shield, AlertTriangle, Trash2, Eye, EyeOff, Save } from 'lucide-react';

const AccountSettings = () => {
  const { user, updateProfile, deleteProfile } = useContext(AuthContext);
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isDeleting, setIsDeleting] = useState(false);

  // Pre-fill the form with the user's current data when the page loads
  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
    }
  }, [user]);

  const handleUpdate = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    if (password && password !== confirmPassword) {
      return setMessage({ type: 'error', text: 'Passwords do not match.' });
    }
    if (password && password.length < 6) {
      return setMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
    }

    try {
      await updateProfile({ name, email, password });
      setMessage({ type: 'success', text: 'System profile updated successfully.' });
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to update profile.' });
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(
      "WARNING: This will permanently delete your account, all saved application data, and telemetry logs. This cannot be undone. Proceed?"
    );
    if (confirmed) {
      try {
        await deleteProfile();
        navigate('/login');
      } catch (err) {
        setMessage({ type: 'error', text: 'Failed to delete account.' });
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      
      {/* Page Header */}
      <div className="flex items-center space-x-4 mb-8">
        <div className="p-3 bg-gradient-to-br from-cyan-400 to-indigo-500 rounded-xl shadow-[0_0_15px_rgba(34,211,238,0.3)]">
          <Shield className="w-8 h-8 text-slate-950" />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-white tracking-wide">Account Settings</h2>
          <p className="text-slate-400 text-sm mt-1 uppercase tracking-widest">Manage your operator credentials</p>
        </div>
      </div>

      {message.text && (
        <div className={`p-4 rounded-xl border backdrop-blur-sm flex items-center space-x-3 ${message.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-green-500/10 border-green-500/30 text-green-400'}`}>
          {message.type === 'error' ? <AlertTriangle size={20} /> : <Save size={20} />}
          <span className="font-medium">{message.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Update Form */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
            {/* Ambient Background Glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-[80px] pointer-events-none"></div>

            <h3 className="text-xl font-semibold text-white mb-6 border-b border-white/10 pb-4">Profile Credentials</h3>
            
            <form onSubmit={handleUpdate} className="space-y-5 relative z-10">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-2">Display Name</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-500 w-5 h-5" />
                    <input 
                      type="text" value={name} onChange={(e) => setName(e.target.value)}
                      className="w-full bg-slate-900/60 border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-slate-100 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 transition-all"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-2">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-500 w-5 h-5" />
                    <input 
                      type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-slate-900/60 border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-slate-100 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 transition-all"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-white/5">
                <h4 className="text-sm font-semibold text-cyan-400 uppercase tracking-widest mb-4">Security Override (Optional)</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-2">New Password</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-500 w-5 h-5" />
                      <input 
                        type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-slate-900/60 border border-slate-700 rounded-xl pl-12 pr-10 py-3 text-slate-100 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 transition-all"
                        placeholder="Leave blank to keep current"
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-500 hover:text-cyan-400">
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-2">Confirm New Password</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-500 w-5 h-5" />
                      <input 
                        type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full bg-slate-900/60 border border-slate-700 rounded-xl pl-12 pr-10 py-3 text-slate-100 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 transition-all"
                        placeholder="Match new password"
                      />
                      <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-500 hover:text-cyan-400">
                        {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <button type="submit" className="mt-6 flex items-center justify-center space-x-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3.5 px-6 rounded-xl shadow-[0_0_15px_rgba(8,145,178,0.4)] transition-all duration-300">
                <Save className="w-5 h-5" />
                <span>Save Configuration</span>
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Danger Zone */}
        <div className="lg:col-span-1">
          <div className="bg-red-500/5 backdrop-blur-xl border border-red-500/20 rounded-3xl p-6 sm:p-8 shadow-2xl">
            <div className="flex items-center space-x-3 text-red-400 mb-4 border-b border-red-500/20 pb-4">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-bold uppercase tracking-wider">Danger Zone</h3>
            </div>
            <p className="text-slate-400 text-sm mb-6 leading-relaxed">
              Erasing your profile will permanently destroy all saved application data, resumes, and telemetry records. This action cannot be reversed.
            </p>
            
            {isDeleting ? (
              <div className="space-y-3">
                <p className="text-red-400 text-sm font-bold">Are you absolutely sure?</p>
                <div className="flex space-x-3">
                  <button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                    Yes, Delete
                  </button>
                  <button onClick={() => setIsDeleting(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-2 px-4 rounded-lg transition-colors border border-slate-600">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setIsDeleting(true)} className="w-full flex items-center justify-center space-x-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/50 text-red-400 font-bold py-3 px-4 rounded-xl transition-all duration-300">
                <Trash2 className="w-5 h-5" />
                <span>Terminate Account</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default AccountSettings;