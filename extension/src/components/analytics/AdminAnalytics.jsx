import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  ShieldAlert, Users, Zap, TrendingUp, Building2, Globe, Loader2, Clock, Filter, Search
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from 'recharts';

export default function AdminAnalytics() {
  const [adminData, setAdminData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Global Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [timeFilter, setTimeFilter] = useState('7D'); // 'TODAY', '7D', '30D', 'ALL'

  const API_URL = import.meta.env.VITE_API_BASE_URL;

  useEffect(() => {
    const fetchGlobalData = async () => {
      try {
        const { data } = await axios.get(`${API_URL}/api/analytics/admin/global`, { withCredentials: true });
        setAdminData(data);
      } catch (err) {
        console.error('Failed to load admin data');
      } finally {
        setLoading(false);
      }
    };
    fetchGlobalData();
  }, [API_URL]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <Loader2 className="w-12 h-12 text-rose-500 animate-spin mb-4" />
        <p className="text-rose-400 tracking-widest text-sm uppercase animate-pulse">Decrypting Global Telemetry...</p>
      </div>
    );
  }

  const { platformStats, topCompanies, history } = adminData;

  // --- 1. DYNAMIC CHART DATA PROCESSOR ---
  const processChartData = () => {
    if (!history) return [];
    const now = new Date();

    if (timeFilter === 'TODAY') {
      const chartData = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now);
        d.setHours(now.getHours() - i);
        const hourStr = d.toLocaleTimeString([], { hour: 'numeric' });
        
        const count = history.filter(log => {
           const logD = new Date(log.dateLogged);
           return logD.getHours() === d.getHours() && logD.getDate() === d.getDate();
        }).length;
        chartData.push({ date: hourStr, applications: count });
      }
      return chartData;
    }

    if (timeFilter === '7D' || timeFilter === '30D') {
      const days = timeFilter === '7D' ? 7 : 30;
      const chartData = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const displayDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        
        const count = history.filter(log => log.dateLogged.startsWith(dateStr)).length;
        chartData.push({ date: displayDate, applications: count });
      }
      return chartData;
    }

    if (timeFilter === 'ALL') {
       const chartData = [];
       for (let i = 11; i >= 0; i--) {
         const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
         const monthStr = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
         
         const count = history.filter(log => {
           const logD = new Date(log.dateLogged);
           return logD.getMonth() === d.getMonth() && logD.getFullYear() === d.getFullYear();
         }).length;
         chartData.push({ date: monthStr, applications: count });
       }
       return chartData;
    }
  };

  const lineChartData = processChartData();

  // --- 2. DYNAMIC TABLE FILTER ---
  const filteredHistory = history.filter(log => {
    // Check Search Term (Search by Company, Job, or User Name)
    const matchesSearch = log.jobTitle.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          log.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (log.user?.name && log.user.name.toLowerCase().includes(searchTerm.toLowerCase()));
    if (!matchesSearch) return false;

    // Check Time Filter
    const logDate = new Date(log.dateLogged);
    const now = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;
    const diffDays = (now - logDate) / msPerDay;

    if (timeFilter === 'TODAY' && diffDays > 1) return false;
    if (timeFilter === '7D' && diffDays > 7) return false;
    if (timeFilter === '30D' && diffDays > 30) return false;
    
    return true;
  });

  const barColors = ['#f43f5e', '#f97316', '#eab308', '#84cc16', '#06b6d4'];

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500 pb-10">
      
      {/* Header & Global Time Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-rose-500/20 pb-4 gap-4">
        <div>
          <h2 className="text-3xl font-black text-white tracking-wide flex items-center">
            <ShieldAlert className="w-8 h-8 mr-3 text-rose-500" />
            Command Center
          </h2>
          <p className="text-slate-400 mt-1">Global platform statistics and real-time monitoring.</p>
        </div>
        
        {/* The Toggle Buttons */}
        <div className="flex bg-slate-900/80 border border-slate-700/50 p-1 rounded-xl shadow-lg">
          {['TODAY', '7D', '30D', 'ALL'].map(filter => (
            <button
              key={filter}
              onClick={() => setTimeFilter(filter)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all duration-200 ${
                timeFilter === filter 
                  ? 'bg-rose-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              {filter === '7D' ? '1 Week' : filter === '30D' ? '1 Month' : filter === 'ALL' ? 'All Time' : 'Today'}
            </button>
          ))}
        </div>
      </div>

      {/* TOP ROW: Global Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900/40 backdrop-blur-xl p-6 rounded-2xl border border-rose-900/50 shadow-lg relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 w-32 h-32 bg-rose-500/10 rounded-full blur-[40px]"></div>
          <div className="flex justify-between items-start mb-2 relative z-10">
            <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">Total Active Users</p>
            <div className="p-2 bg-rose-500/20 text-rose-400 rounded-lg"><Users className="w-5 h-5" /></div>
          </div>
          <h3 className="text-4xl font-black text-white relative z-10">{platformStats.totalUsers}</h3>
        </div>

        <div className="bg-slate-900/40 backdrop-blur-xl p-6 rounded-2xl border border-orange-900/50 shadow-lg relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 w-32 h-32 bg-orange-500/10 rounded-full blur-[40px]"></div>
          <div className="flex justify-between items-start mb-2 relative z-10">
            <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">Total Autofills</p>
            <div className="p-2 bg-orange-500/20 text-orange-400 rounded-lg"><Zap className="w-5 h-5" /></div>
          </div>
          <h3 className="text-4xl font-black text-white relative z-10">{platformStats.totalAutofills}</h3>
        </div>

        <div className="bg-slate-900/40 backdrop-blur-xl p-6 rounded-2xl border border-amber-900/50 shadow-lg relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 w-32 h-32 bg-amber-500/10 rounded-full blur-[40px]"></div>
          <div className="flex justify-between items-start mb-2 relative z-10">
            <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">Avg Apps / User</p>
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg"><TrendingUp className="w-5 h-5" /></div>
          </div>
          <h3 className="text-4xl font-black text-white relative z-10">
            {platformStats.totalUsers > 0 ? (platformStats.totalAutofills / platformStats.totalUsers).toFixed(1) : 0}
          </h3>
        </div>
      </div>

      {/* MIDDLE ROW: Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Global Activity Timeline */}
        <div className="lg:col-span-2 bg-slate-900/40 backdrop-blur-xl p-6 rounded-2xl border border-slate-700/50 shadow-lg flex flex-col">
          <h3 className="text-slate-300 font-bold mb-6 flex justify-between">
            <span className="flex items-center"><Globe className="w-5 h-5 mr-2 text-rose-500" /> Global Platform Traffic</span>
            <span className="text-rose-400 text-sm">
              {timeFilter === '7D' ? 'Last 7 Days' : timeFilter === '30D' ? 'Last 30 Days' : timeFilter === 'ALL' ? 'Last 12 Months' : 'Last 12 Hours'}
            </span>
          </h3>
          <div className="flex-1 min-h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={lineChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorAdminApps" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                  itemStyle={{ color: '#f43f5e', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="applications" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorAdminApps)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Target Companies */}
        <div className="lg:col-span-1 bg-slate-900/40 backdrop-blur-xl p-6 rounded-2xl border border-slate-700/50 shadow-lg flex flex-col">
          <h3 className="text-slate-300 font-bold mb-6 flex items-center">
            <Building2 className="w-5 h-5 mr-2 text-orange-400" /> Top Target ATS (All Time)
          </h3>
          <div className="flex-1 min-h-[300px] w-full">
            {topCompanies.length === 0 ? (
              <div className="flex items-center justify-center h-full text-slate-500">No data available yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topCompanies} layout="vertical" margin={{ top: 0, right: 30, left: 20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                  <XAxis type="number" stroke="#94a3b8" fontSize={11} hide />
                  <YAxis dataKey="_id" type="category" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} width={80} />
                  <RechartsTooltip 
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={25}>
                    {topCompanies.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={barColors[index % barColors.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

      </div>

      {/* BOTTOM ROW: Live System Feed (Filtered dynamically) */}
      <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-700/50 rounded-2xl overflow-hidden shadow-lg mt-6">
        
        {/* Table Toolbar */}
        <div className="p-4 border-b border-slate-700/50 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-900/80">
          <div className="flex items-center">
            <Clock className="w-5 h-5 mr-2 text-rose-400" />
            <h3 className="text-white font-bold">Live Application Feed</h3>
          </div>
          
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Search User, Job, or Company..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-slate-200 focus:outline-none focus:border-rose-500 transition-colors"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-black/20 text-slate-400 border-b border-slate-700/50">
                <th className="p-4 font-semibold text-sm">Operator (User)</th>
                <th className="p-4 font-semibold text-sm">Target Company</th>
                <th className="p-4 font-semibold text-sm">Job Designation</th>
                <th className="p-4 font-semibold text-sm">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan="4" className="p-8 text-center text-slate-500">System idle. No applications matched this filter.</td>
                </tr>
              ) : (
                filteredHistory.map((log) => (
                  <tr key={log._id} className="hover:bg-white/5 transition-colors">
                    <td className="p-4">
                      <div className="flex flex-col">
                        <span className="text-slate-200 font-medium">{log.user?.name || 'Unknown User'}</span>
                        <span className="text-slate-500 text-xs">{log.user?.email || 'N/A'}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="px-3 py-1 bg-slate-800 text-orange-400 border border-slate-700 rounded-lg text-xs font-bold uppercase tracking-wider">
                        {log.company}
                      </span>
                    </td>
                    <td className="p-4 text-slate-300 font-medium">{log.jobTitle}</td>
                    <td className="p-4 text-slate-400 text-sm">
                      {new Date(log.dateLogged).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}