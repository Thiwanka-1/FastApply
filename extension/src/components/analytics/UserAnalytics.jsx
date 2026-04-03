import { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../../context/AuthContext';
import { 
  Activity, Briefcase, Calendar, CheckCircle2, Search, Trash2, 
  ExternalLink, Loader2, AlertTriangle, Building2, Filter
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis 
} from 'recharts';

export default function UserAnalytics() {
  const { user } = useContext(AuthContext);
  const [profileData, setProfileData] = useState(null);
  const [analyticsData, setAnalyticsData] = useState({ stats: { today: 0, monthly: 0, total: 0 }, history: [] });
  const [loading, setLoading] = useState(true);
  
  // NEW: Global Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [timeFilter, setTimeFilter] = useState('7D'); // 'TODAY', '7D', '30D', 'ALL'

  const API_URL = import.meta.env.VITE_API_BASE_URL;

  // Fetch BOTH Profile Completeness AND Autofill History
  useEffect(() => {
    const fetchAllData = async () => {
      try {
        const [profileRes, analyticsRes] = await Promise.all([
          axios.get(`${API_URL}/api/profile`, { withCredentials: true }),
          axios.get(`${API_URL}/api/analytics`, { withCredentials: true })
        ]);
        
        setProfileData(profileRes.data);
        setAnalyticsData(analyticsRes.data);
      } catch (err) {
        console.error('Failed to load analytics data');
      } finally {
        setLoading(false);
      }
    };
    fetchAllData();
  }, [API_URL]);

  const handleDeleteLog = async (id) => {
    if (!window.confirm("Remove this application log?")) return;
    try {
      await axios.delete(`${API_URL}/api/analytics/${id}`, { withCredentials: true });
      setAnalyticsData(prev => ({
        ...prev,
        stats: { ...prev.stats, total: prev.stats.total - 1 },
        history: prev.history.filter(log => log._id !== id)
      }));
    } catch (err) {
      console.error("Failed to delete log");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <Loader2 className="w-12 h-12 text-cyan-500 animate-spin mb-4" />
        <p className="text-cyan-400 tracking-widest text-sm uppercase animate-pulse">Syncing Telemetry...</p>
      </div>
    );
  }

  // --- 1. PREPARE PROFILE RADAR DATA (Static Completeness) ---
  const calcScore = (condition, max) => (condition ? max : 0);
  const personalScore = calcScore(profileData?.personalInfo?.firstName, 50) + calcScore(profileData?.personalInfo?.lastName, 50);
  const contactScore = calcScore(profileData?.contactInfo?.email, 50) + calcScore(profileData?.contactInfo?.phone, 50);
  const workScore = Math.min((profileData?.workHistory?.length || 0) * 34, 100);
  const eduScore = Math.min((profileData?.educationHistory?.length || 0) * 50, 100);
  const skillScore = Math.min((profileData?.websitesAndSkills?.skills?.length || 0) * 10, 100);
  const resumeScore = profileData?.resume?.fileUrl ? 100 : 0;

  const radarData = [
    { subject: 'Personal', A: personalScore },
    { subject: 'Contact', A: contactScore },
    { subject: 'Work', A: workScore },
    { subject: 'Edu', A: eduScore },
    { subject: 'Skills', A: skillScore },
    { subject: 'Resume', A: resumeScore },
  ];

  // --- 2. DYNAMIC CHART DATA PROCESSOR ---
  const processChartData = () => {
    if (!analyticsData.history) return [];
    const now = new Date();
    const logs = analyticsData.history;

    // TODAY: Show last 12 hours
    if (timeFilter === 'TODAY') {
      const chartData = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now);
        d.setHours(now.getHours() - i);
        const hourStr = d.toLocaleTimeString([], { hour: 'numeric' });
        
        const count = logs.filter(log => {
           const logD = new Date(log.dateLogged);
           return logD.getHours() === d.getHours() && logD.getDate() === d.getDate();
        }).length;
        chartData.push({ date: hourStr, applications: count });
      }
      return chartData;
    }

    // 7 DAYS or 30 DAYS: Show daily counts
    if (timeFilter === '7D' || timeFilter === '30D') {
      const days = timeFilter === '7D' ? 7 : 30;
      const chartData = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD
        const displayDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        
        const count = logs.filter(log => log.dateLogged.startsWith(dateStr)).length;
        chartData.push({ date: displayDate, applications: count });
      }
      return chartData;
    }

    // ALL TIME: Show monthly counts (Last 12 Months)
    if (timeFilter === 'ALL') {
       const chartData = [];
       for (let i = 11; i >= 0; i--) {
         const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
         const monthStr = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
         
         const count = logs.filter(log => {
           const logD = new Date(log.dateLogged);
           return logD.getMonth() === d.getMonth() && logD.getFullYear() === d.getFullYear();
         }).length;
         chartData.push({ date: monthStr, applications: count });
       }
       return chartData;
    }
  };

  const lineChartData = processChartData();

  // --- 3. DYNAMIC TABLE FILTER ---
  const filteredHistory = analyticsData.history.filter(log => {
    // 1. Check Search Term
    const matchesSearch = log.jobTitle.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          log.company.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    // 2. Check Time Filter
    const logDate = new Date(log.dateLogged);
    const now = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;
    const diffDays = (now - logDate) / msPerDay;

    if (timeFilter === 'TODAY' && diffDays > 1) return false;
    if (timeFilter === '7D' && diffDays > 7) return false;
    if (timeFilter === '30D' && diffDays > 30) return false;
    
    return true; // 'ALL' keeps everything
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500 pb-10">
      
      {/* Header & Global Time Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-white tracking-wide flex items-center">
            Analytics
          </h2>
          <p className="text-slate-400 mt-1">Application telemetry for <span className="text-cyan-400 font-semibold">{user?.name}</span></p>
        </div>
        
        {/* The Toggle Buttons */}
        <div className="flex bg-slate-900/80 border border-slate-700/50 p-1 rounded-xl shadow-lg">
          {['TODAY', '7D', '30D', 'ALL'].map(filter => (
            <button
              key={filter}
              onClick={() => setTimeFilter(filter)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all duration-200 ${
                timeFilter === filter 
                  ? 'bg-indigo-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              {filter === '7D' ? '1 Week' : filter === '30D' ? '1 Month' : filter === 'ALL' ? 'All Time' : 'Today'}
            </button>
          ))}
        </div>
      </div>

      {/* TOP ROW: Stats & Radar Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Col: Static Global Stat Cards */}
        <div className="space-y-6 flex flex-col justify-between">
          <div className="bg-slate-900/40 backdrop-blur-xl p-6 rounded-2xl border border-slate-700/50 shadow-lg">
            <p className="text-slate-400 font-bold mb-2">Today's Applications</p>
            <h3 className="text-4xl font-black text-indigo-400">{analyticsData.stats.today}</h3>
          </div>

          <div className="bg-slate-900/40 backdrop-blur-xl p-6 rounded-2xl border border-slate-700/50 shadow-lg">
            <p className="text-slate-400 font-bold mb-2">Monthly Applications</p>
            <div className="flex items-end space-x-2">
              <h3 className="text-4xl font-black text-cyan-400">{analyticsData.stats.monthly}</h3>
              <span className="text-xs text-slate-500 mb-1">(Last 30 days)</span>
            </div>
          </div>

          <div className="bg-slate-900/40 backdrop-blur-xl p-6 rounded-2xl border border-slate-700/50 shadow-lg">
            <p className="text-slate-400 font-bold mb-2">Total Applications</p>
            <h3 className="text-4xl font-black text-fuchsia-400">{analyticsData.stats.total}</h3>
          </div>
        </div>

        {/* Middle Col: Application Timeline Chart */}
        <div className="lg:col-span-1 bg-slate-900/40 backdrop-blur-xl p-6 rounded-2xl border border-slate-700/50 shadow-lg flex flex-col">
          <h3 className="text-slate-400 font-bold mb-6 flex justify-between">
            <span>Activity</span>
            <span className="text-indigo-400 text-sm">
              {timeFilter === '7D' ? 'Last 7 Days' : timeFilter === '30D' ? 'Last 30 Days' : timeFilter === 'ALL' ? 'Last 12 Months' : 'Last 12 Hours'}
            </span>
          </h3>
          <div className="flex-1 min-h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={lineChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorApps" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                  itemStyle={{ color: '#818cf8', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="applications" stroke="#818cf8" strokeWidth={3} fillOpacity={1} fill="url(#colorApps)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right Col: Data Core Radar */}
        <div className="lg:col-span-1 bg-slate-900/40 backdrop-blur-xl p-6 rounded-2xl border border-slate-700/50 shadow-lg flex flex-col">
          <h3 className="text-slate-400 font-bold mb-2">Profile Completeness</h3>
          <div className="flex-1 min-h-[250px] w-full -ml-4">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="65%" data={radarData}>
                <PolarGrid stroke="#334155" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#cbd5e1', fontSize: 11 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar name="Completeness" dataKey="A" stroke="#06b6d4" strokeWidth={2} fill="#06b6d4" fillOpacity={0.3} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* BOTTOM ROW: Application Data Table */}
      <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-700/50 rounded-2xl overflow-hidden shadow-lg mt-6">
        
        {/* Table Toolbar */}
        <div className="p-4 border-b border-slate-700/50 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-900/80">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Search by Job or Company..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <div className="flex items-center text-slate-400 text-sm font-medium">
            <Filter className="w-4 h-4 mr-2" />
            Showing results for: <span className="text-indigo-400 ml-1">{timeFilter === '7D' ? 'Last 7 Days' : timeFilter === '30D' ? 'Last 30 Days' : timeFilter === 'ALL' ? 'All Time' : 'Today'}</span>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-indigo-600/10 text-indigo-300 border-b border-indigo-500/30">
                <th className="p-4 font-semibold text-sm">Job Title</th>
                <th className="p-4 font-semibold text-sm">Company</th>
                <th className="p-4 font-semibold text-sm">Status</th>
                <th className="p-4 font-semibold text-sm">Date Applied</th>
                <th className="p-4 font-semibold text-sm text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-10 text-center text-slate-500">
                    <Briefcase className="w-8 h-8 mx-auto mb-3 opacity-50" />
                    No applications found for this time period.
                  </td>
                </tr>
              ) : (
                filteredHistory.map((log) => (
                  <tr key={log._id} className="hover:bg-white/5 transition-colors group">
                    <td className="p-4">
                      <div className="flex items-center space-x-3">
                        <Briefcase className="w-5 h-5 text-slate-500" />
                        <span className="font-medium text-slate-200">{log.jobTitle}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center space-x-3">
                        <Building2 className="w-5 h-5 text-slate-500" />
                        <span className="text-slate-300">{log.company}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-bold uppercase tracking-wider flex items-center w-max">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Autofilled
                      </span>
                    </td>
                    <td className="p-4 text-slate-400 text-sm">
                      <div className="flex items-center space-x-2">
                        <Calendar className="w-4 h-4" />
                        <span>{new Date(log.dateLogged).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </div>
                    </td>
                    <td className="p-4 text-right space-x-2">
                      {log.jobUrl && (
                        <a 
                          href={log.jobUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex p-2 bg-slate-800 text-slate-300 hover:text-cyan-400 hover:bg-cyan-500/20 rounded-lg transition-colors"
                          title="View Job Post"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                      <button 
                        onClick={() => handleDeleteLog(log._id)}
                        className="inline-flex p-2 bg-slate-800 text-slate-300 hover:text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                        title="Remove Log"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
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