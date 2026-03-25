import { Plus, Trash2 } from 'lucide-react';

export default function PersonalInfo({ data, updateSection }) {
  
  // Helper to handle the standard fields
  const handleChange = (e) => {
    updateSection('personalInfo', e.target.name, e.target.value);
  };

  // --- Logic for the Languages Array ---
  const addLanguage = () => {
    const newLangs = [...(data.languages || []), { language: '', proficiency: 'Beginner', fluent: false }];
    updateSection('personalInfo', 'languages', newLangs);
  };

  const updateLanguage = (index, field, value) => {
    const updated = [...data.languages];
    updated[index][field] = value;
    updateSection('personalInfo', 'languages', updated);
  };

  const removeLanguage = (index) => {
    const updated = data.languages.filter((_, i) => i !== index);
    updateSection('personalInfo', 'languages', updated);
  };

  return (
    <div className="space-y-8">
      {/* Standard Fields Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-900/30 p-6 rounded-3xl border border-slate-800/50">
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Legal First Name</label>
          <input 
            type="text" name="firstName" value={data?.firstName || ''} onChange={handleChange}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 transition-all placeholder-slate-700"
            placeholder="e.g. Gamithu"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Legal Last Name</label>
          <input 
            type="text" name="lastName" value={data?.lastName || ''} onChange={handleChange}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 transition-all placeholder-slate-700"
            placeholder="e.g. Arunod"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Preferred Name (Optional)</label>
          <input 
            type="text" name="preferredName" value={data?.preferredName || ''} onChange={handleChange}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 transition-all placeholder-slate-700"
            placeholder="e.g. Gam"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Pronouns</label>
          <input 
            type="text" name="pronouns" value={data?.pronouns || ''} onChange={handleChange}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 transition-all placeholder-slate-700"
            placeholder="e.g. He/Him, They/Them"
          />
        </div>
      </div>

      {/* Languages Section */}
      <div className="bg-slate-900/30 p-6 rounded-3xl border border-slate-800/50">
        <h3 className="text-lg font-bold text-white mb-4">Languages</h3>
        
        <div className="space-y-4">
          {data?.languages?.map((lang, index) => (
            <div key={index} className="flex flex-col sm:flex-row gap-4 items-start sm:items-center p-4 bg-slate-950 border border-slate-800 rounded-2xl relative group">
              
              <div className="flex-1 w-full">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Language</label>
                <input 
                  type="text" value={lang.language} onChange={(e) => updateLanguage(index, 'language', e.target.value)}
                  className="w-full bg-transparent border-b border-slate-700 focus:border-indigo-400 px-2 py-1.5 text-slate-200 outline-none transition-colors"
                  placeholder="e.g. English"
                />
              </div>

              <div className="flex-1 w-full">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Proficiency</label>
                <select 
                  value={lang.proficiency} onChange={(e) => updateLanguage(index, 'proficiency', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 outline-none focus:border-indigo-400"
                >
                  <option value="Beginner">Beginner</option>
                  <option value="Conversational">Conversational</option>
                  <option value="Advanced">Advanced</option>
                  <option value="Fluent">Fluent</option>
                  <option value="Native">Native</option>
                </select>
              </div>

              <label className="flex items-center space-x-2 cursor-pointer mt-4 sm:mt-0">
                <input 
                  type="checkbox" checked={lang.fluent} onChange={(e) => updateLanguage(index, 'fluent', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-700 text-indigo-500 focus:ring-indigo-500 bg-slate-900"
                />
                <span className="text-sm text-slate-300 font-medium">Fluent</span>
              </label>

              <button 
                onClick={() => removeLanguage(index)}
                className="absolute top-2 right-2 sm:static p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                title="Remove Language"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <button 
          onClick={addLanguage}
          className="mt-4 flex items-center space-x-2 text-indigo-400 hover:text-indigo-300 font-bold text-sm bg-indigo-500/10 hover:bg-indigo-500/20 px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Add Language</span>
        </button>
      </div>
    </div>
  );
}