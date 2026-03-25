import { useState } from 'react';
import { Link2  , Link, Globe, Code, X, Plus } from 'lucide-react';
import { Computer } from 'lucide-react';

export default function WebsitesSkills({ data, updateSection }) {
  const [skillInput, setSkillInput] = useState('');

  const handleChange = (e) => {
    updateSection('websitesAndSkills', e.target.name, e.target.value);
  };

  // --- Skills Array Logic ---
  const handleAddSkill = (e) => {
    // Add skill if user presses Enter or clicks the Add button
    if ((e.key === 'Enter' || e.type === 'click') && skillInput.trim() !== '') {
      e.preventDefault(); // Prevent form submission if inside a form
      
      const currentSkills = data?.skills || [];
      // Prevent duplicates
      if (!currentSkills.includes(skillInput.trim())) {
        updateSection('websitesAndSkills', 'skills', [...currentSkills, skillInput.trim()]);
      }
      setSkillInput('');
    }
  };

  const removeSkill = (skillToRemove) => {
    const updatedSkills = data.skills.filter(skill => skill !== skillToRemove);
    updateSection('websitesAndSkills', 'skills', updatedSkills);
  };

  return (
    <div className="space-y-8">
      
      {/* Websites Grid */}
      <div className="bg-slate-900/30 p-6 md:p-8 rounded-3xl border border-slate-800/50">
        <h3 className="text-lg font-bold text-white mb-6 flex items-center">
          <Globe className="w-5 h-5 mr-3 text-fuchsia-400" />
          Professional Links
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">LinkedIn Profile</label>
            <div className="relative">
              <Link2  className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-500 w-5 h-5" />
              <input 
                type="url" name="linkedin" value={data?.linkedin || ''} onChange={handleChange}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-12 pr-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50 focus:border-fuchsia-400 transition-all placeholder-slate-700"
                placeholder="https://linkedin.com/in/username"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">GitHub Profile</label>
            <div className="relative">
              <Computer className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-500 w-5 h-5" />
              <input 
                type="url" name="github" value={data?.github || ''} onChange={handleChange}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-12 pr-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50 focus:border-fuchsia-400 transition-all placeholder-slate-700"
                placeholder="https://github.com/username"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">X (Twitter)</label>
            <div className="relative">
              <Link className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-500 w-5 h-5" />
              <input 
                type="url" name="twitter" value={data?.twitter || ''} onChange={handleChange}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-12 pr-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50 focus:border-fuchsia-400 transition-all placeholder-slate-700"
                placeholder="https://twitter.com/username"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Personal Portfolio / Website</label>
            <div className="relative">
              <Globe className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-500 w-5 h-5" />
              <input 
                type="url" name="portfolio" value={data?.portfolio || ''} onChange={handleChange}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-12 pr-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50 focus:border-fuchsia-400 transition-all placeholder-slate-700"
                placeholder="https://yourwebsite.com"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Skills Tag System */}
      <div className="bg-slate-900/30 p-6 md:p-8 rounded-3xl border border-slate-800/50">
        <h3 className="text-lg font-bold text-white mb-2 flex items-center">
          <Code className="w-5 h-5 mr-3 text-fuchsia-400" />
          Technical & Soft Skills
        </h3>
        <p className="text-slate-400 text-sm mb-6">Type a skill and press <kbd className="bg-slate-800 px-2 py-0.5 rounded text-slate-300 mx-1 border border-slate-700">Enter</kbd> to add it to your profile.</p>
        
        <div className="relative mb-6">
          <input 
            type="text" value={skillInput} 
            onChange={(e) => setSkillInput(e.target.value)}
            onKeyDown={handleAddSkill}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-4 pr-12 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50 focus:border-fuchsia-400 transition-all placeholder-slate-700"
            placeholder="e.g. React.js, Project Management, Python..."
          />
          <button 
            onClick={handleAddSkill}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white p-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Render the Skill Pills */}
        <div className="flex flex-wrap gap-3">
          {data?.skills?.length === 0 && (
            <p className="text-slate-500 italic text-sm">No skills added yet.</p>
          )}
          {data?.skills?.map((skill, index) => (
            <div 
              key={index} 
              className="flex items-center bg-fuchsia-500/10 border border-fuchsia-500/30 text-fuchsia-300 px-3 py-1.5 rounded-lg text-sm font-medium animate-in zoom-in duration-200"
            >
              <span>{skill}</span>
              <button 
                onClick={() => removeSkill(skill)}
                className="ml-2 text-fuchsia-400 hover:text-fuchsia-200 focus:outline-none"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}