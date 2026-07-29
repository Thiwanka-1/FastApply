import { useEffect, useState } from 'react';
import axios from 'axios';
import {
  User,
  MapPin,
  Globe,
  Briefcase,
  GraduationCap,
  Shield,
  FileText,
  Save,
  Loader2,
  CheckCircle2
} from 'lucide-react';

import PersonalInfo from '../components/profile/PersonalInfo';
import ContactInfo from '../components/profile/ContactInfo';
import WorkHistory from '../components/profile/WorkHistory';
import EducationHistory from '../components/profile/EducationHistory';
import WebsitesSkills from '../components/profile/WebsitesSkills';
import EEOInfo from '../components/profile/EEOInfo';
import ResumeUpload from '../components/profile/ResumeUpload';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

const normalizeProfile = profile => ({
  ...profile,

  personalInfo: {
    firstName: '',
    lastName: '',
    preferredName: '',
    pronouns: '',
    ...(profile?.personalInfo || {}),
    languages: Array.isArray(profile?.personalInfo?.languages)
      ? profile.personalInfo.languages
      : []
  },

  contactInfo: {
    email: '',
    phone: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    country: '',
    postalCode: '',
    ...(profile?.contactInfo || {})
  },

  websitesAndSkills: {
    linkedin: '',
    github: '',
    twitter: '',
    portfolio: '',
    ...(profile?.websitesAndSkills || {}),
    skills: Array.isArray(profile?.websitesAndSkills?.skills)
      ? profile.websitesAndSkills.skills
      : []
  },

  workHistory: Array.isArray(profile?.workHistory)
    ? profile.workHistory.map(job => ({
        jobTitle: '',
        company: '',
        location: '',
        employmentType: '',
        currentlyWorkHere: false,
        startDate: '',
        endDate: '',
        description: '',
        ...job,
        currentlyWorkHere: job?.currentlyWorkHere === true
      }))
    : [],

  educationHistory: Array.isArray(profile?.educationHistory)
    ? profile.educationHistory.map(education => ({
        school: '',
        institutionLocation: '',
        degree: '',
        major: '',
        minor: '',
        gpa: '',
        gpaScale: '',
        startDate: '',
        endDate: '',
        ...education
      }))
    : [],

  eeo: {
    optOut: false,
    authorizedToWork: '',
    requireVisaNow: '',
    requireVisaFuture: '',
    disability: '',
    veteran: '',
    gender: '',
    ethnicity: '',
    race: '',
    age: '',
    ...(profile?.eeo || {}),
    optOut: profile?.eeo?.optOut === true
  },

  resume: profile?.resume || {},
  cqfo: profile?.cqfo || {},
  coverLetter: profile?.coverLetter || {}
});

const buildProfileSavePayload = profile => ({
  personalInfo: profile.personalInfo,
  contactInfo: profile.contactInfo,
  websitesAndSkills: profile.websitesAndSkills,
  workHistory: profile.workHistory,
  educationHistory: profile.educationHistory,
  eeo: profile.eeo
});

const syncExtensionProfileCache = profile => {
  try {
    globalThis.chrome?.storage?.local?.set({
      profileData: profile,
      profileFetchedAt: new Date().toISOString()
    });
  } catch (error) {
    console.warn('Could not refresh the extension profile cache:', error);
  }
};

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('personal');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState('');
  const [profileData, setProfileData] = useState(() => normalizeProfile({}));

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data } = await axios.get(`${API_URL}/api/profile`, {
          withCredentials: true
        });

        const normalizedProfile = normalizeProfile(data);
        setProfileData(normalizedProfile);
        syncExtensionProfileCache(normalizedProfile);
      } catch (error) {
        console.error(
          'Failed to load profile:',
          error.response?.data?.message || error.message
        );

        setProfileData(normalizeProfile({}));
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  const handleSave = async () => {
    setSaving(true);

    try {
      const payload = buildProfileSavePayload(profileData);

      const { data } = await axios.put(`${API_URL}/api/profile`, payload, {
        withCredentials: true
      });

      const normalizedProfile = normalizeProfile(data);
      setProfileData(normalizedProfile);
      syncExtensionProfileCache(normalizedProfile);

      const now = new Date();
      setLastSaved(
        `Saved at ${now.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        })}`
      );
    } catch (error) {
      console.error(
        'Failed to save profile:',
        error.response?.data?.message || error.message
      );
    } finally {
      setSaving(false);
    }
  };

  const handleProfileRebuilt = rebuiltProfile => {
    const normalizedProfile = normalizeProfile(rebuiltProfile);

    setProfileData(normalizedProfile);
    syncExtensionProfileCache(normalizedProfile);

    const now = new Date();
    setLastSaved(
      `Extracted at ${now.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      })}`
    );
  };

  const updateSection = (section, field, value) => {
    setProfileData(previous => ({
      ...previous,
      [section]: {
        ...(previous?.[section] || {}),
        [field]: value
      }
    }));
  };

  const updateArraySection = (section, value) => {
    setProfileData(previous => ({
      ...previous,
      [section]: Array.isArray(value) ? value : []
    }));
  };

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <Loader2 className="mb-4 h-12 w-12 animate-spin text-indigo-500" />
        <p className="animate-pulse text-sm uppercase tracking-widest text-indigo-400">
          Initializing Data Core...
        </p>
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
    { id: 'documents', label: 'AI Documents', icon: FileText }
  ];

  const activeNavigationItem = navItems.find(item => item.id === activeTab);

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col gap-8 pb-10 lg:flex-row">
      <div className="shrink-0 lg:w-72">
        <div className="sticky top-0 rounded-3xl border border-slate-800/50 bg-slate-900/40 p-4 shadow-2xl backdrop-blur-xl">
          <div className="mb-6 px-4 pt-2">
            <h3 className="text-lg font-bold text-white">Profile Completion</h3>

            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div className="h-2 w-1/3 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400" />
            </div>
          </div>

          <nav className="space-y-1">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex w-full items-center space-x-3 rounded-2xl px-4 py-3.5 transition-all duration-300 ${
                    isActive
                      ? 'bg-indigo-500/10 text-indigo-400 shadow-[inset_0_0_20px_rgba(99,102,241,0.1)]'
                      : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                  }`}
                >
                  <Icon
                    className={`h-5 w-5 ${
                      isActive ? 'text-indigo-400' : 'text-slate-500'
                    }`}
                  />

                  <span className="font-semibold tracking-wide">{item.label}</span>

                  {isActive && (
                    <div className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="flex min-h-[600px] flex-1 flex-col">
        <div className="sticky top-0 z-20 mb-6 flex items-center justify-between border-b border-slate-800/50 bg-slate-950/80 pb-4 backdrop-blur-md">
          <h2 className="flex items-center text-2xl font-black capitalize text-white">
            <span className="mr-3 text-indigo-500">///</span>
            {activeNavigationItem?.label}
          </h2>

          <div className="flex items-center space-x-4">
            {lastSaved && (
              <span className="flex items-center text-xs font-medium text-slate-500">
                <CheckCircle2 className="mr-1 h-3 w-3 text-green-500" />
                {lastSaved}
              </span>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex transform items-center space-x-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-6 py-2.5 font-bold text-white shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all hover:-translate-y-0.5 hover:from-indigo-500 hover:to-cyan-500 disabled:transform-none disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Save className="h-5 w-5" />
              )}

              <span>{saving ? 'Syncing...' : 'Save Progress'}</span>
            </button>
          </div>
        </div>

        <div className="animate-in fade-in slide-in-from-right-4 duration-500">
          {activeTab === 'personal' && (
            <PersonalInfo
              data={profileData.personalInfo}
              updateSection={updateSection}
            />
          )}

          {activeTab === 'contact' && (
            <ContactInfo
              data={profileData.contactInfo}
              updateSection={updateSection}
            />
          )}

          {activeTab === 'work' && (
            <WorkHistory
              data={profileData.workHistory}
              updateSection={updateArraySection}
            />
          )}

          {activeTab === 'education' && (
            <EducationHistory
              data={profileData.educationHistory}
              updateSection={updateArraySection}
            />
          )}

          {activeTab === 'websites' && (
            <WebsitesSkills
              data={profileData.websitesAndSkills}
              updateSection={updateSection}
            />
          )}

          {activeTab === 'eeo' && (
            <EEOInfo
              data={profileData.eeo}
              updateSection={updateSection}
            />
          )}

          {activeTab === 'documents' && (
            <ResumeUpload
              documents={{
                resume: profileData.resume,
                cqfo: profileData.cqfo,
                coverLetter: profileData.coverLetter
              }}
              onProfileRebuilt={handleProfileRebuilt}
            />
          )}
        </div>
      </div>
    </div>
  );
}