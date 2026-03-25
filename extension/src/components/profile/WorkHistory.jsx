import { Plus, Trash2, Briefcase, Building2, MapPin, Calendar, FileText } from 'lucide-react';

export default function WorkHistory({ data = [], updateSection }) {
  
  // 1. Add a new empty job object to the array
  const addJob = () => {
    const newJob = {
      jobTitle: '', company: '', location: '', employmentType: 'Full-time',
      currentlyWorkHere: false, startDate: '', endDate: '', description: ''
    };
    // FIX: Added 'workHistory' back as the first argument!
    updateSection('workHistory', [...data, newJob]); 
  };

  const updateJob = (index, field, value) => {
    const updatedJobs = [...data];
    updatedJobs[index][field] = value;
    // FIX: Added 'workHistory' back
    updateSection('workHistory', updatedJobs);
  };

  const removeJob = (index) => {
    const updatedJobs = data.filter((_, i) => i !== index);
    // FIX: Added 'workHistory' back
    updateSection('workHistory', updatedJobs);
  };

  return (
    <div className="space-y-6">
      
      {data.length === 0 && (
        <div className="text-center py-10 bg-slate-900/30 border border-slate-800/50 rounded-3xl border-dashed">
          <Briefcase className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No work history added yet.</p>
        </div>
      )}

      {data.map((job, index) => (
        <div key={index} className="bg-slate-900/40 p-6 md:p-8 rounded-3xl border border-slate-700/50 shadow-lg relative group transition-all hover:border-indigo-500/50">
          
          {/* Card Header & Delete Button */}
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-800/80">
            <h3 className="text-lg font-bold text-white flex items-center">
              <span className="bg-indigo-500/20 text-indigo-400 py-1 px-3 rounded-lg mr-3 text-sm">Experience {index + 1}</span>
              {job.jobTitle || 'New Position'}
            </h3>
            <button 
              onClick={() => removeJob(index)}
              className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-colors"
              title="Remove this job"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Job Title */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Job Title</label>
              <div className="relative">
                <Briefcase className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-500 w-4 h-4" />
                <input 
                  type="text" value={job.jobTitle} onChange={(e) => updateJob(index, 'jobTitle', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 transition-all placeholder-slate-700"
                  placeholder="e.g. Frontend Developer"
                />
              </div>
            </div>

            {/* Company */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Company Name</label>
              <div className="relative">
                <Building2 className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-500 w-4 h-4" />
                <input 
                  type="text" value={job.company} onChange={(e) => updateJob(index, 'company', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 transition-all placeholder-slate-700"
                  placeholder="e.g. Google"
                />
              </div>
            </div>

            {/* Location */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Location</label>
              <div className="relative">
                <MapPin className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-500 w-4 h-4" />
                <input 
                  type="text" value={job.location} onChange={(e) => updateJob(index, 'location', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 transition-all placeholder-slate-700"
                  placeholder="e.g. San Francisco, CA"
                />
              </div>
            </div>

            {/* Employment Type */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Employment Type</label>
              <select 
                value={job.employmentType} onChange={(e) => updateJob(index, 'employmentType', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 transition-all appearance-none"
              >
                <option value="Full-time">Full-time</option>
                <option value="Part-time">Part-time</option>
                <option value="Contract">Contract</option>
                <option value="Internship">Internship</option>
                <option value="Freelance">Freelance</option>
              </select>
            </div>

            {/* Dates */}
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50 mt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Start Date</label>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-500 w-4 h-4" />
                  <input 
                    type="month" value={job.startDate} onChange={(e) => updateJob(index, 'startDate', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-end mb-2">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest">End Date</label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input 
                      type="checkbox" checked={job.currentlyWorkHere} onChange={(e) => updateJob(index, 'currentlyWorkHere', e.target.checked)}
                      className="w-4 h-4 rounded border-slate-700 text-indigo-500 focus:ring-indigo-500 bg-slate-900"
                    />
                    <span className="text-xs font-medium text-indigo-400">I currently work here</span>
                  </label>
                </div>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-500 w-4 h-4" />
                  <input 
                    type="month" value={job.endDate} onChange={(e) => updateJob(index, 'endDate', e.target.value)}
                    disabled={job.currentlyWorkHere}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="md:col-span-2 mt-2">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Description / Achievements</label>
              <div className="relative">
                <FileText className="absolute left-4 top-4 text-slate-500 w-4 h-4" />
                <textarea 
                  value={job.description} onChange={(e) => updateJob(index, 'description', e.target.value)}
                  rows="4"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 transition-all placeholder-slate-700 resize-y"
                  placeholder="Managed a team of 5, increased revenue by 20%, etc."
                ></textarea>
              </div>
            </div>

          </div>
        </div>
      ))}

      <button 
        onClick={addJob}
        className="w-full flex items-center justify-center space-x-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/50 text-indigo-400 font-bold py-4 rounded-2xl transition-all duration-300 border-dashed"
      >
        <Plus className="w-5 h-5" />
        <span>Add Work Experience</span>
      </button>

    </div>
  );
}