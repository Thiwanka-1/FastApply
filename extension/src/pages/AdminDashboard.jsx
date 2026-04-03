import { useState } from 'react';
import { ShieldAlert, Users, UserPlus } from 'lucide-react';
import UserManagement from '../components/admin/UserManagement';
import AdminRegistration from '../components/admin/AdminRegistration';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('users');

  return (
    <div className="max-w-7xl mx-auto h-full flex flex-col lg:flex-row gap-8 pb-10 animate-in fade-in duration-500">
      
      {/* SIDEBAR NAVIGATION FOR COMMAND CENTER */}
      <div className="lg:w-72 shrink-0">
        <div className="sticky top-0 bg-slate-900/40 backdrop-blur-xl border border-slate-800/50 rounded-3xl p-4 shadow-2xl">
          
          <div className="mb-6 px-4 pt-2 flex items-center space-x-3">
            <ShieldAlert className="w-6 h-6 text-rose-500" />
            <h3 className="text-white font-bold text-lg">Command Center</h3>
          </div>

          <nav className="space-y-2">
            <button
              onClick={() => setActiveTab('users')}
              className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-300 ${
                activeTab === 'users' 
                  ? 'bg-rose-500/10 text-rose-400 shadow-[inset_0_0_20px_rgba(244,63,94,0.1)]' 
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
              }`}
            >
              <Users className={`w-5 h-5 ${activeTab === 'users' ? 'text-rose-400' : 'text-slate-500'}`} />
              <span className="font-semibold tracking-wide">User Directory</span>
            </button>

            <button
              onClick={() => setActiveTab('register')}
              className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-300 ${
                activeTab === 'register' 
                  ? 'bg-orange-500/10 text-orange-400 shadow-[inset_0_0_20px_rgba(249,115,22,0.1)]' 
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
              }`}
            >
              <UserPlus className={`w-5 h-5 ${activeTab === 'register' ? 'text-orange-400' : 'text-slate-500'}`} />
              <span className="font-semibold tracking-wide">Provision Admin</span>
            </button>
          </nav>
        </div>
      </div>

      {/* CONTENT AREA */}
      <div className="flex-1 flex flex-col min-h-[600px]">
        <div className="animate-in slide-in-from-right-4 fade-in duration-500">
          {activeTab === 'users' && <UserManagement />}
          {activeTab === 'register' && <AdminRegistration />}
        </div>
      </div>

    </div>
  );
}