import { useState, useEffect } from 'react';
import axios from 'axios';
import { User, MapPin, Globe, Briefcase, GraduationCap, Shield, FileText, Save, Loader2, CheckCircle2 } from 'lucide-react';

// Import our new sub-components
import PersonalInfo from '../components/profile/PersonalInfo';
import ContactInfo from '../components/profile/ContactInfo';
import WorkHistory from '../components/profile/WorkHistory';
import EducationHistory from '../components/profile/EducationHistory';
import WebsitesSkills from '../components/profile/WebsitesSkills';
import EEOInfo from '../components/profile/EEOInfo';
import ResumeUpload from '../components/profile/ResumeUpload';
export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('personal');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState('');
  
  // The master state holding the EXACT structure of your Mongoose Profile.js model
  const [profileData, setProfileData] = useState(null);

  const API_URL = import.meta.env.VITE_API_BASE_URL;
  axios.defaults.withCredentials = true;

  // 1. Fetch Profile on Load
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data } = await axios.get(`${API_URL}/api/profile`);
        setProfileData(data);
      } catch (err) {
        console.error('Failed to load profile');
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [API_URL]);

  // 2. Global Save Function
  const handleSave = async () => {
    setSaving(true);
    try {
      const { data } = await axios.put(`${API_URL}/api/profile`, profileData);
      setProfileData(data);
      const now = new Date();
      setLastSaved(`Saved at ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    } catch (err) {
      console.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // 3. The Universal State Updater for Child Components
  // Function for standard Object sections (personalInfo, contactInfo, etc.)
const updateSection = (section, field, value) => {
  setProfileData(prev => ({
    ...prev,
    [section]: { ...prev[section], [field]: value }
  }));
};

// ADD THIS: Specific function for Array sections (workHistory, educationHistory, etc.)
const updateArraySection = (section, value) => {
  setProfileData(prev => ({
    ...prev,
    [section]: value // We replace the whole array directly
  }));
};

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
        <p className="text-indigo-400 tracking-widest text-sm uppercase animate-pulse">Initializing Data Core...</p>
      </div>
    );
  }

  const navItems = [
    { id: 'personal', label: 'Personal Info', icon: User },
    { id: 'contact', label: 'Contact', icon: MapPin },
    { id: 'websites', label: 'Websites & Skills', icon: Globe },
    { id: 'work', label: 'Work History', icon: Briefcase },
    { id: 'education', label: 'Education', icon: GraduationCap },
    { id: 'eeo', label: 'Equal Opportunity', icon: Shield },
    { id: 'resume', label: 'Resume Upload', icon: FileText },
  ];

  return (
    <div className="max-w-7xl mx-auto h-full flex flex-col lg:flex-row gap-8 pb-10">
      
      {/* MODERN FLOATING SIDEBAR */}
      <div className="lg:w-72 shrink-0">
        <div className="sticky top-0 bg-slate-900/40 backdrop-blur-xl border border-slate-800/50 rounded-3xl p-4 shadow-2xl">
          
          <div className="mb-6 px-4 pt-2">
            <h3 className="text-white font-bold text-lg">Profile Completion</h3>
            <div className="w-full bg-slate-800 rounded-full h-2 mt-3 overflow-hidden">
              <div className="bg-gradient-to-r from-indigo-500 to-cyan-400 h-2 rounded-full w-1/3"></div>
            </div>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-300 ${
                    isActive 
                      ? 'bg-indigo-500/10 text-indigo-400 shadow-[inset_0_0_20px_rgba(99,102,241,0.1)]' 
                      : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-indigo-400' : 'text-slate-500'}`} />
                  <span className="font-semibold tracking-wide">{item.label}</span>
                  {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.8)]"></div>}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* MODERN GLASS CONTENT AREA */}
      <div className="flex-1 flex flex-col min-h-[600px]">
        
        {/* Sticky Action Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between bg-slate-950/80 backdrop-blur-md pb-4 mb-6 border-b border-slate-800/50">
          <h2 className="text-2xl font-black text-white capitalize flex items-center">
            <span className="text-indigo-500 mr-3">///</span> 
            {navItems.find(i => i.id === activeTab)?.label}
          </h2>

          <div className="flex items-center space-x-4">
            {lastSaved && <span className="text-xs font-medium text-slate-500 flex items-center"><CheckCircle2 className="w-3 h-3 mr-1 text-green-500"/> {lastSaved}</span>}
            <button 
              onClick={handleSave}
              disabled={saving}
              className="flex items-center space-x-2 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold py-2.5 px-6 rounded-xl shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all transform hover:-translate-y-0.5 disabled:opacity-50 disabled:transform-none"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              <span>{saving ? 'Syncing...' : 'Save Progress'}</span>
            </button>
          </div>
        </div>

        {/* Dynamic Form Injection */}
        <div className="animate-in slide-in-from-right-4 fade-in duration-500">
          {activeTab === 'personal' && <PersonalInfo data={profileData.personalInfo} updateSection={updateSection} />}
          {activeTab === 'contact' && <ContactInfo data={profileData.contactInfo} updateSection={updateSection} />}
          {activeTab === 'work' && (
            <WorkHistory 
              data={profileData.workHistory} 
              updateSection={updateArraySection} // Change this
            />
          )}
          {activeTab === 'education' && (
            <EducationHistory 
              data={profileData.educationHistory} 
              updateSection={updateArraySection} // Change this
            />
          )}
          {activeTab === 'websites' && <WebsitesSkills data={profileData.websitesAndSkills} updateSection={updateSection} />}
          {activeTab === 'eeo' && <EEOInfo data={profileData.eeo} updateSection={updateSection} />}
          {activeTab === 'resume' && <ResumeUpload data={profileData.resume} updateSection={updateSection} />}        </div>

      </div>
    </div>
  );
}