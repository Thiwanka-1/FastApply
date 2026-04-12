import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import { BarChart3, User, Settings, Zap, AlertTriangle, PanelRightOpen } from 'lucide-react';
import './index.css';

// The Backend URL for fetching stats
const API_URL = import.meta.env.VITE_API_BASE_URL;
// The Frontend URL for opening dashboard tabs (using your new env variable)
const FRONTEND_URL = import.meta.env.VITE_API_BASE_URL1 || 'http://localhost:5173';

axios.defaults.withCredentials = true;

function Popup() {
  const [stats, setStats] = useState({ today: 0, goal: 10 });
  const [autofillEnabled, setAutofillEnabled] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const fetchSystemData = async () => {
      try {
        // Fetch BOTH Stats and Profile Data simultaneously
        const [statsRes, profileRes] = await Promise.all([
          axios.get(`${API_URL}/api/analytics`),
          axios.get(`${API_URL}/api/profile`)
        ]);
        
        setStats({ today: statsRes.data.stats.today, goal: 10 }); 
        setIsLoggedIn(true);

        // CACHE THE PROFILE DATA INTO CHROME STORAGE
        if (window.chrome && chrome.storage) {
          chrome.storage.local.set({ 
            profileData: profileRes.data 
          });
        }

      } catch (err) {
        setIsLoggedIn(false);
      }
    };
    
    fetchSystemData();

    // Load the toggle state
    if (window.chrome && chrome.storage) {
      chrome.storage.local.get(['autofillEnabled'], (res) => {
        if (res.autofillEnabled !== undefined) {
          setAutofillEnabled(res.autofillEnabled);
        }
      });
    }
  }, []);

  // 3. Handle the toggle click to update state AND Chrome Storage
  const toggleAutofill = () => {
    const newState = !autofillEnabled;
    setAutofillEnabled(newState); // Update UI
    if (window.chrome && chrome.storage) {
      chrome.storage.local.set({ autofillEnabled: newState }); // Update Browser Memory
    }
  };

  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(stats.today / stats.goal, 1);
  const strokeDashoffset = circumference - progress * circumference;

  const openDashboard = (hash) => {
    window.open(`${FRONTEND_URL}/#${hash}`, '_blank');
  };

  const handleQuickAccess = async () => {
    // If running inside an actual Chrome Extension, use the native API
    if (window.chrome && chrome.sidePanel) {
      try {
        // Gets the current active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        // Opens the side panel for that specific tab natively in Chrome
        await chrome.sidePanel.open({ windowId: tab.windowId });
      } catch (err) {
        console.error("Failed to open side panel:", err);
      }
    } else {
      // Fallback for local web testing
      window.open(`${FRONTEND_URL}/sidepanel.html`, 'FastApply Quick Access', 'width=400,height=800');
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 bg-slate-950 text-center">
        <AlertTriangle className="w-12 h-12 text-rose-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Not Authenticated</h2>
        <p className="text-slate-400 text-sm mb-6">Please log in to your FastApply dashboard to enable the extension.</p>
        <button onClick={() => openDashboard('/login')} className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-6 rounded-xl transition-colors">
          Open Login
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 p-5 relative overflow-hidden font-sans">
      <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-cyan-500/20 rounded-full blur-[60px] pointer-events-none"></div>

      {/* Header */}
      <div className="flex items-center justify-center mb-6 relative z-10">
        <div className="p-1.5 bg-gradient-to-br from-cyan-400 to-indigo-500 rounded-lg mr-2">
          <Zap className="w-4 h-4 text-slate-950" />
        </div>
        <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-400 tracking-wide">
          FastApply
        </h1>
      </div>

      {/* Circular Progress */}
      <div className="flex flex-col items-center mb-6 relative z-10">
        <div className="relative w-40 h-40 flex items-center justify-center">
          <svg className="absolute inset-0 w-full h-full transform -rotate-90">
            <circle cx="80" cy="80" r={radius} stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-800" />
            <circle 
              cx="80" cy="80" r={radius} stroke="currentColor" strokeWidth="8" fill="transparent" 
              className="text-cyan-400 transition-all duration-1000 ease-out"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
            />
          </svg>
          <div className="text-center z-10">
            <span className="text-5xl font-black text-white block leading-none">{stats.today}</span>
            <span className="text-[10px] uppercase tracking-widest text-cyan-400 font-bold">Apps Today</span>
          </div>
        </div>
        <p className="text-slate-500 text-xs mt-3 font-medium tracking-widest uppercase">Goal: {stats.goal}</p>
      </div>

      {/* Circular Quick Action Buttons */}
      <div className="flex justify-center space-x-4 mb-6 relative z-10">
        <button onClick={() => openDashboard('/analytics')} className="p-3 bg-slate-800 hover:bg-indigo-500/20 hover:text-indigo-400 text-slate-300 rounded-full transition-all group" title="Analytics">
          <BarChart3 className="w-5 h-5 group-hover:scale-110 transition-transform" />
        </button>
        <button onClick={() => openDashboard('/')} className="p-3 bg-slate-800 hover:bg-cyan-500/20 hover:text-cyan-400 text-slate-300 rounded-full transition-all group" title="Profile">
          <User className="w-5 h-5 group-hover:scale-110 transition-transform" />
        </button>
        <button onClick={() => openDashboard('/settings')} className="p-3 bg-slate-800 hover:bg-fuchsia-500/20 hover:text-fuchsia-400 text-slate-300 rounded-full transition-all group" title="Settings">
          <Settings className="w-5 h-5 group-hover:scale-110 transition-transform" />
        </button>
      </div>

      {/* Quick Access Button */}
      <div className="flex justify-center mb-4 relative z-10">
        <button 
          onClick={handleQuickAccess}
          className="flex items-center space-x-2 text-slate-300 hover:text-cyan-400 font-medium transition-colors group"
        >
          <PanelRightOpen className="w-4 h-4 group-hover:scale-110 transition-transform" />
          <span>Quick Access</span>
        </button>
      </div>

      {/* Autofill Toggle */}
      <div className="mt-auto bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between relative z-10">
        <div className="flex items-center space-x-3">
          <Zap className={`w-5 h-5 ${autofillEnabled ? 'text-amber-400' : 'text-slate-600'}`} />
          <div>
            <p className="text-sm font-bold text-white">Autofill Enabled</p>
          </div>
        </div>
        
        {/* Toggle Switch UI connected to toggleAutofill function */}
        <button 
          onClick={toggleAutofill}
          className={`w-12 h-6 rounded-full transition-colors relative flex items-center px-1 focus:outline-none ${autofillEnabled ? 'bg-cyan-500' : 'bg-slate-700'}`}
        >
          <div className={`w-4 h-4 bg-white rounded-full transition-transform transform shadow-md ${autofillEnabled ? 'translate-x-6' : 'translate-x-0'}`}></div>
        </button>
      </div>

    </div>
  );
}

ReactDOM.createRoot(document.getElementById('popup-root')).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
);