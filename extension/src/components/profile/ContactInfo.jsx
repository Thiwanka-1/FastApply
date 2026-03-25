export default function ContactInfo({ data, updateSection }) {
  
  const handleChange = (e) => {
    updateSection('contactInfo', e.target.name, e.target.value);
  };

  return (
    <div className="bg-slate-900/30 p-6 md:p-8 rounded-3xl border border-slate-800/50">
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-8">
        
        {/* Core Contact */}
        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 pb-8 border-b border-slate-800/50">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Primary Email</label>
            <input 
              type="email" name="email" value={data?.email || ''} onChange={handleChange}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 transition-all placeholder-slate-700"
              placeholder="operator@system.com"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Phone Number</label>
            <input 
              type="text" name="phone" value={data?.phone || ''} onChange={handleChange}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 transition-all placeholder-slate-700"
              placeholder="+1 (555) 000-0000"
            />
          </div>
        </div>

        {/* Address Block */}
        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Address Line 1</label>
          <input 
            type="text" name="addressLine1" value={data?.addressLine1 || ''} onChange={handleChange}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 transition-all placeholder-slate-700"
            placeholder="123 Sector Area"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Address Line 2 (Optional)</label>
          <input 
            type="text" name="addressLine2" value={data?.addressLine2 || ''} onChange={handleChange}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 transition-all placeholder-slate-700"
            placeholder="Apt, Suite, Unit"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">City</label>
          <input 
            type="text" name="city" value={data?.city || ''} onChange={handleChange}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 transition-all placeholder-slate-700"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">State / Province</label>
          <input 
            type="text" name="state" value={data?.state || ''} onChange={handleChange}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 transition-all placeholder-slate-700"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Postal / Zip Code</label>
          <input 
            type="text" name="postalCode" value={data?.postalCode || ''} onChange={handleChange}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 transition-all placeholder-slate-700"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Country</label>
          <input 
            type="text" name="country" value={data?.country || ''} onChange={handleChange}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 transition-all placeholder-slate-700"
            placeholder="e.g. United States"
          />
        </div>

      </div>
    </div>
  );
}