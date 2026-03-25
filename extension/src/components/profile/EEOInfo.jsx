import { Shield, EyeOff, AlertCircle } from 'lucide-react';

export default function EEOInfo({ data, updateSection }) {
  
  const handleChange = (e) => {
    updateSection('eeo', e.target.name, e.target.value);
  };

  const handleOptOutToggle = (e) => {
    updateSection('eeo', 'optOut', e.target.checked);
  };

  const isOptedOut = data?.optOut;

  // Standard ATS Dropdown Options
  const yesNoOptions = ["", "Yes", "No", "Decline to Self-Identify"];
  const genderOptions = ["", "Male", "Female", "Non-Binary", "Prefer not to say"];
  const veteranOptions = ["", "I am a protected veteran", "I am not a protected veteran", "Decline to Self-Identify"];
  const disabilityOptions = ["", "Yes, I have a disability", "No, I don't have a disability", "Decline to Self-Identify"];
  const ethnicityOptions = ["", "Hispanic or Latino", "White (Not Hispanic or Latino)", "Black or African American", "Asian", "Native Hawaiian or Other Pacific Islander", "Two or More Races", "Decline to Self-Identify"];

  return (
    <div className="bg-slate-900/30 p-6 md:p-8 rounded-3xl border border-slate-800/50 space-y-8 relative overflow-hidden">
      
      {/* Opt Out Master Toggle */}
      <div className={`p-5 rounded-2xl border transition-all duration-300 ${isOptedOut ? 'bg-amber-500/10 border-amber-500/30' : 'bg-slate-950 border-slate-800'}`}>
        <div className="flex items-start sm:items-center justify-between flex-col sm:flex-row gap-4">
          <div className="flex items-center space-x-4">
            <div className={`p-2 rounded-xl ${isOptedOut ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-400'}`}>
              {isOptedOut ? <EyeOff className="w-6 h-6" /> : <Shield className="w-6 h-6" />}
            </div>
            <div>
              <h3 className={`font-bold ${isOptedOut ? 'text-amber-400' : 'text-white'}`}>I choose not to disclose</h3>
              <p className="text-slate-400 text-sm mt-0.5">Toggle this to automatically skip EEO questions on applications.</p>
            </div>
          </div>
          
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input type="checkbox" checked={isOptedOut || false} onChange={handleOptOutToggle} className="sr-only peer" />
            <div className="w-14 h-7 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-amber-500"></div>
          </label>
        </div>
      </div>

      {/* The Form Fields (Visual dimming if opted out) */}
      <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 transition-all duration-300 ${isOptedOut ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
        
        {/* Work Authorization */}
        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-slate-800/50">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Authorized to work in country?</label>
            <select name="authorizedToWork" value={data?.authorizedToWork || ''} onChange={handleChange} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all appearance-none">
              {yesNoOptions.map(opt => <option key={opt} value={opt}>{opt || "Select..."}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Require Visa Sponsorship Now?</label>
            <select name="requireVisaNow" value={data?.requireVisaNow || ''} onChange={handleChange} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all appearance-none">
              {yesNoOptions.map(opt => <option key={opt} value={opt}>{opt || "Select..."}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Require Visa Sponsorship Future?</label>
            <select name="requireVisaFuture" value={data?.requireVisaFuture || ''} onChange={handleChange} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all appearance-none">
              {yesNoOptions.map(opt => <option key={opt} value={opt}>{opt || "Select..."}</option>)}
            </select>
          </div>
        </div>

        {/* Demographics */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Disability Status</label>
          <select name="disability" value={data?.disability || ''} onChange={handleChange} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all appearance-none">
            {disabilityOptions.map(opt => <option key={opt} value={opt}>{opt || "Select..."}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Veteran Status</label>
          <select name="veteran" value={data?.veteran || ''} onChange={handleChange} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all appearance-none">
            {veteranOptions.map(opt => <option key={opt} value={opt}>{opt || "Select..."}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Gender</label>
          <select name="gender" value={data?.gender || ''} onChange={handleChange} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all appearance-none">
            {genderOptions.map(opt => <option key={opt} value={opt}>{opt || "Select..."}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Ethnicity</label>
          <select name="ethnicity" value={data?.ethnicity || ''} onChange={handleChange} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all appearance-none">
            {ethnicityOptions.map(opt => <option key={opt} value={opt}>{opt || "Select..."}</option>)}
          </select>
        </div>

      </div>
      
      {/* Information Disclaimer */}
      <div className="flex items-start space-x-3 text-slate-500 text-xs mt-6 bg-slate-950/50 p-4 rounded-xl border border-slate-800">
        <AlertCircle className="w-5 h-5 shrink-0 text-slate-400" />
        <p>Equal Employment Opportunity data is strictly separated from your application by employers for compliance purposes. Filling this out in FastApply prevents you from having to click these dropdowns manually on every single application.</p>
      </div>

    </div>
  );
}