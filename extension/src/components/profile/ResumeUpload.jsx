import { useState } from 'react';
import axios from 'axios';
import { UploadCloud, FileText, Loader2, CheckCircle2, AlertTriangle, ExternalLink, ShieldCheck } from 'lucide-react';

export default function ResumeUpload({ data, updateSection }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const API_URL = import.meta.env.VITE_API_BASE_URL;

  // Handle file selection from the user's computer
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        setMessage({ type: 'error', text: 'System Error: Only PDF files are accepted.' });
        setSelectedFile(null);
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setMessage({ type: 'error', text: 'System Error: File exceeds 5MB limit.' });
        setSelectedFile(null);
        return;
      }
      setSelectedFile(file);
      setMessage({ type: '', text: '' }); // Clear any errors
    }
  };

  // Push the file to the backend
  const handleUpload = async () => {
    if (!selectedFile) return;
    
    setUploading(true);
    setMessage({ type: '', text: '' });

    const formData = new FormData();
    // This MUST match the string we used in upload.single('resumeFile') in the backend
    formData.append('resumeFile', selectedFile); 

    try {
      const response = await axios.post(`${API_URL}/api/profile/upload-resume`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        withCredentials: true,
      });

      // Update the local dashboard state with the new Firebase URL and filename
      updateSection('resume', 'fileName', response.data.resume.fileName);
      updateSection('resume', 'fileUrl', response.data.resume.fileUrl);
      
      setMessage({ type: 'success', text: 'Resume uploaded and secured in the cloud.' });
      setSelectedFile(null); // Clear the input
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to upload resume.' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Current Active Resume Status */}
      <div className="bg-slate-900/40 p-6 md:p-8 rounded-3xl border border-slate-700/50 shadow-lg relative overflow-hidden">
        {/* Ambient Glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-[80px] pointer-events-none"></div>

        <h3 className="text-lg font-bold text-white mb-6 flex items-center">
          <ShieldCheck className="w-5 h-5 mr-3 text-emerald-400" />
          Active Document Protocol
        </h3>

        {data?.fileUrl ? (
          <div className="flex flex-col sm:flex-row items-center justify-between p-5 bg-slate-950/80 border border-emerald-500/30 rounded-2xl">
            <div className="flex items-center space-x-4 mb-4 sm:mb-0">
              <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-xl">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-200">{data.fileName}</p>
                <p className="text-xs text-emerald-400/80 uppercase tracking-widest mt-1">Status: Operational</p>
              </div>
            </div>
            <a 
              href={data.fileUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center space-x-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 font-bold py-2.5 px-5 rounded-xl transition-colors"
            >
              <span>View Document</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        ) : (
          <div className="flex items-center space-x-3 text-amber-400 bg-amber-500/10 p-4 rounded-xl border border-amber-500/30">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p className="text-sm font-medium">No resume detected. Upload a document to complete your profile.</p>
          </div>
        )}
      </div>

      {/* Upload Interface */}
      <div className="bg-slate-900/40 p-6 md:p-8 rounded-3xl border border-slate-700/50 shadow-lg">
        <h3 className="text-lg font-bold text-white mb-2">Upload New Resume</h3>
        <p className="text-slate-400 text-sm mb-6">Upload a PDF file (Max 5MB). This will replace your currently active document.</p>

        {message.text && (
          <div className={`mb-6 p-4 rounded-xl border flex items-center space-x-3 ${message.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'}`}>
            {message.type === 'error' ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
            <span className="font-medium text-sm">{message.text}</span>
          </div>
        )}

        <div className="border-2 border-dashed border-slate-700 hover:border-cyan-500/50 bg-slate-950/50 rounded-2xl p-8 transition-colors text-center relative group">
          
          <input 
            type="file" 
            accept="application/pdf"
            onChange={handleFileChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            disabled={uploading}
          />
          
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className={`p-4 rounded-full transition-colors ${selectedFile ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800 text-slate-500 group-hover:bg-cyan-500/10 group-hover:text-cyan-400'}`}>
              <UploadCloud className="w-10 h-10" />
            </div>
            
            {selectedFile ? (
              <div className="text-center">
                <p className="text-cyan-400 font-bold mb-1">{selectedFile.name}</p>
                <p className="text-slate-500 text-xs uppercase tracking-widest">Ready for uplink</p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-slate-300 font-bold mb-1">Click or drag PDF here</p>
                <p className="text-slate-500 text-xs uppercase tracking-widest">Max file size: 5MB</p>
              </div>
            )}
          </div>
        </div>

        {selectedFile && (
          <button 
            onClick={handleUpload}
            disabled={uploading}
            className="w-full mt-6 flex items-center justify-center space-x-2 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold py-3.5 px-4 rounded-xl shadow-[0_0_20px_rgba(34,211,238,0.3)] transition-all duration-300 disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Encrypting & Uploading...</span>
              </>
            ) : (
              <>
                <UploadCloud className="w-5 h-5" />
                <span>Initialize Upload</span>
              </>
            )}
          </button>
        )}

      </div>
    </div>
  );
}