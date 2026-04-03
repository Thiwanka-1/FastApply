import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import { User, MapPin, Briefcase, GraduationCap, Copy, Check, ExternalLink, Loader2, AlertTriangle } from 'lucide-react';
import './index.css';

const API_URL = import.meta.env.VITE_API_BASE_URL;
axios.defaults.withCredentials = true;

// --- REUSABLE CLICK-TO-COPY COMPONENT ---
const CopyField = ({ label, value, isLink = false }) => {
  const [copied, setCopied] = useState(false);

  if (!value) return null; // Don't render empty fields

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div 
      onClick={isLink ? null : handleCopy}
      className={`group flex items-start justify-between py-2 border-b border-slate-800/50 last:border-0 ${isLink ? '' : 'cursor-pointer hover:bg-slate-800/30'} -mx-2 px-2 rounded-lg transition-colors`}
      title={isLink ? '' : 'Click to copy'}
    >
      <div className="flex-1 pr-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">{label}</p>
        {isLink ? (
          <a href={value} target="_blank" rel="noopener noreferrer" className="text-sm text-cyan-400 hover:underline flex items-center">
            {value} <ExternalLink className="w-3 h-3 ml-1 inline" />
          </a>
        ) : (
          <p className="text-sm text-slate-200 break-all">{value}</p>
        )}
      </div>
      {!isLink && (
        <div className="shrink-0 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-500" />}
        </div>
      )}
    </div>
  );
};

// --- MAIN SIDE PANEL COMPONENT ---
function SidePanel() {
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data } = await axios.get(`${API_URL}/api/profile`);
        setProfileData(data);
      } catch (err) {
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-950">
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mb-4" />
        <p className="text-cyan-400 text-xs uppercase tracking-widest">Loading Profile Core...</p>
      </div>
    );
  }

  if (error || !profileData) {
    return (
      <div className="p-6 h-screen bg-slate-950 text-center flex flex-col items-center justify-center">
        <AlertTriangle className="w-10 h-10 text-amber-500 mb-4" />
        <p className="text-slate-300 text-sm">Please log in to your FastApply dashboard to access your profile data.</p>
      </div>
    );
  }

  const pInfo = profileData.personalInfo || {};
  const cInfo = profileData.contactInfo || {};

  return (
    <div className="bg-slate-950 min-h-screen text-slate-100 font-sans custom-scrollbar overflow-y-auto pb-10">
      
      {/* Sticky Header */}
      <div className="sticky top-0 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 p-4 z-20">
        <h2 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-400">
          FastApply Assistant
        </h2>
        <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Click any field to copy to clipboard</p>
      </div>

      <div className="p-4 space-y-6">
        
        {/* Personal Info Section */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
          <h3 className="text-sm font-bold text-white flex items-center mb-3 pb-2 border-b border-slate-800">
            <User className="w-4 h-4 mr-2 text-cyan-400" /> Personal Information
          </h3>
          <CopyField label="First Name" value={pInfo.firstName} />
          <CopyField label="Last Name" value={pInfo.lastName} />
          <CopyField label="Preferred Name" value={pInfo.preferredName} />
          <CopyField label="Pronouns" value={pInfo.pronouns} />
        </div>

        {/* Contact Info Section */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
          <h3 className="text-sm font-bold text-white flex items-center mb-3 pb-2 border-b border-slate-800">
            <MapPin className="w-4 h-4 mr-2 text-indigo-400" /> Contact Information
          </h3>
          <CopyField label="Email" value={cInfo.email} />
          <CopyField label="Phone" value={cInfo.phone} />
          <CopyField label="Address Line 1" value={cInfo.addressLine1} />
          <CopyField label="City" value={cInfo.city} />
          <CopyField label="State/Province" value={cInfo.state} />
          <CopyField label="Postal Code" value={cInfo.postalCode} />
        </div>

        {/* Work History Section */}
        {profileData.workHistory && profileData.workHistory.length > 0 && (
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
            <h3 className="text-sm font-bold text-white flex items-center mb-3 pb-2 border-b border-slate-800">
              <Briefcase className="w-4 h-4 mr-2 text-fuchsia-400" /> Work History
            </h3>
            {profileData.workHistory.map((job, idx) => (
              <div key={idx} className="mb-4 last:mb-0">
                <p className="text-xs font-bold text-fuchsia-400 mb-1">Position {idx + 1}</p>
                <CopyField label="Job Title" value={job.jobTitle} />
                <CopyField label="Company" value={job.company} />
                <CopyField label="Location" value={job.location} />
                <CopyField label="Start Date" value={job.startDate} />
                <CopyField label="End Date" value={job.currentlyWorkHere ? "Present" : job.endDate} />
                <CopyField label="Description" value={job.description} />
              </div>
            ))}
          </div>
        )}

        {/* Education History Section */}
        {profileData.educationHistory && profileData.educationHistory.length > 0 && (
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
            <h3 className="text-sm font-bold text-white flex items-center mb-3 pb-2 border-b border-slate-800">
              <GraduationCap className="w-4 h-4 mr-2 text-amber-400" /> Education
            </h3>
            {profileData.educationHistory.map((edu, idx) => (
              <div key={idx} className="mb-4 last:mb-0">
                <p className="text-xs font-bold text-amber-400 mb-1">Institution {idx + 1}</p>
                <CopyField label="School/University" value={edu.school} />
                <CopyField label="Degree" value={edu.degree} />
                <CopyField label="Major" value={edu.major} />
                <CopyField label="GPA" value={edu.gpa ? `${edu.gpa} / ${edu.gpaScale}` : null} />
                <CopyField label="Start Date" value={edu.startDate} />
                <CopyField label="End Date" value={edu.endDate} />
              </div>
            ))}
          </div>
        )}

        {/* Links Section */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
          <h3 className="text-sm font-bold text-white flex items-center mb-3 pb-2 border-b border-slate-800">
            <ExternalLink className="w-4 h-4 mr-2 text-emerald-400" /> Web Links
          </h3>
          <CopyField label="LinkedIn" value={profileData.websitesAndSkills?.linkedin} />
          <CopyField label="GitHub" value={profileData.websitesAndSkills?.github} />
          <CopyField label="Portfolio" value={profileData.websitesAndSkills?.portfolio} />
          <CopyField label="Resume Link" value={profileData.resume?.fileUrl} isLink={true} />
        </div>

      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('sidepanel-root')).render(
  <React.StrictMode>
    <SidePanel />
  </React.StrictMode>
);