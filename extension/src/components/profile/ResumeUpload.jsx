import { useState } from 'react';
import axios from 'axios';
import {
  UploadCloud,
  FileText,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  X,
  Sparkles
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const DOCUMENT_TYPES = [
  {
    key: 'resume',
    title: 'Resume',
    description: 'Primary source for work history, education, skills and contact information.',
    acceptedText: 'PDF or DOCX',
    accept: '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  },
  {
    key: 'cqfo',
    title: 'Common Questions Form',
    description: 'Source for salary, authorization, sponsorship, EEO, references and legal answers.',
    acceptedText: 'PDF only',
    accept: '.pdf,application/pdf'
  },
  {
    key: 'coverLetter',
    title: 'Cover Letter',
    description: 'Additional evidence for experience, motivation and customized application answers.',
    acceptedText: 'PDF or DOCX',
    accept: '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
];

const createEmptyFiles = () => ({
  resume: null,
  cqfo: null,
  coverLetter: null
});

const createInputKeys = () => ({
  resume: 0,
  cqfo: 0,
  coverLetter: 0
});

const formatFileSize = bytes => {
  if (!Number.isFinite(bytes)) return '';
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

const formatUploadDate = value => {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

const validateFile = (type, file) => {
  if (!file) return 'No file was selected.';

  if (file.size > MAX_FILE_SIZE) {
    return `${file.name} exceeds the 5 MB file limit.`;
  }

  const extension = file.name.split('.').pop()?.toLowerCase();
  const isPdf = file.type === 'application/pdf' || extension === 'pdf';
  const isDocx = file.type === DOCX_MIME || extension === 'docx';

  if (type === 'cqfo' && !isPdf) {
    return 'The Common Questions Form must be uploaded as a PDF so highlighted answers can be read.';
  }

  if (!isPdf && !isDocx) {
    return `${file.name} must be a PDF or DOCX file.`;
  }

  return '';
};

export default function ResumeUpload({ documents = {}, onProfileRebuilt }) {
  const [selectedFiles, setSelectedFiles] = useState(createEmptyFiles);
  const [inputKeys, setInputKeys] = useState(createInputKeys);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [phase, setPhase] = useState('idle');
  const [message, setMessage] = useState({ type: '', text: '' });

  const selectedCount = Object.values(selectedFiles).filter(Boolean).length;

  const resetInput = type => {
    setInputKeys(previous => ({
      ...previous,
      [type]: previous[type] + 1
    }));
  };

  const selectFile = (type, file) => {
    const validationError = validateFile(type, file);

    if (validationError) {
      setSelectedFiles(previous => ({ ...previous, [type]: null }));
      setMessage({ type: 'error', text: validationError });
      resetInput(type);
      return;
    }

    setSelectedFiles(previous => ({ ...previous, [type]: file }));
    setMessage({ type: '', text: '' });
  };

  const handleFileChange = (type, event) => {
    const file = event.target.files?.[0];
    if (file) selectFile(type, file);
  };

  const handleDrop = (type, event) => {
    event.preventDefault();
    if (uploading) return;

    const file = event.dataTransfer.files?.[0];
    if (file) selectFile(type, file);
  };

  const clearSelectedFile = type => {
    setSelectedFiles(previous => ({ ...previous, [type]: null }));
    resetInput(type);
  };

  const clearAllSelectedFiles = () => {
    setSelectedFiles(createEmptyFiles());
    setInputKeys(previous => ({
      resume: previous.resume + 1,
      cqfo: previous.cqfo + 1,
      coverLetter: previous.coverLetter + 1
    }));
  };

  const handleUpload = async () => {
    if (selectedCount === 0 || uploading) return;

    const formData = new FormData();

    Object.entries(selectedFiles).forEach(([type, file]) => {
      if (file) formData.append(type, file);
    });

    setUploading(true);
    setUploadProgress(0);
    setPhase('uploading');
    setMessage({ type: '', text: '' });

    try {
      const response = await axios.post(`${API_URL}/api/profile/parse-docs`, formData, {
        withCredentials: true,
        onUploadProgress: progressEvent => {
          if (!progressEvent.total) return;

          const percentage = Math.min(
            100,
            Math.round((progressEvent.loaded * 100) / progressEvent.total)
          );

          setUploadProgress(percentage);

          if (percentage >= 100) {
            setPhase('extracting');
          }
        }
      });

      if (!response.data?.profile) {
        throw new Error('The backend did not return the rebuilt profile.');
      }

      onProfileRebuilt?.(response.data.profile);

      const replacedDocuments = Array.isArray(response.data.replacedDocuments)
        ? response.data.replacedDocuments
            .map(type => DOCUMENT_TYPES.find(document => document.key === type)?.title || type)
            .join(', ')
        : 'documents';

      setPhase('complete');
      setUploadProgress(100);
      setMessage({
        type: 'success',
        text: `${replacedDocuments} processed successfully. Your profile has been rebuilt with the extracted information.`
      });

      clearAllSelectedFiles();
    } catch (error) {
      setPhase('idle');
      setUploadProgress(0);
      setMessage({
        type: 'error',
        text: error.response?.data?.message || error.message || 'Document processing failed.'
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-start gap-4 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-5">
        <Sparkles className="mt-0.5 h-6 w-6 shrink-0 text-indigo-400" />
        <div>
          <h3 className="font-bold text-white">Agent 1 Profile Extraction</h3>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Upload all three documents during initial setup. Later, you can replace only one
            document and FastApply will reuse the other stored documents while rebuilding the
            profile.
          </p>
        </div>
      </div>

      {message.text && (
        <div
          className={`flex items-start gap-3 rounded-xl border p-4 ${
            message.type === 'error'
              ? 'border-red-500/30 bg-red-500/10 text-red-400'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
          }`}
        >
          {message.type === 'error' ? (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          )}
          <span className="text-sm font-medium">{message.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {DOCUMENT_TYPES.map(documentType => {
          const currentDocument = documents?.[documentType.key] || {};
          const selectedFile = selectedFiles[documentType.key];
          const uploadedDate = formatUploadDate(currentDocument.uploadedAt);

          return (
            <div
              key={documentType.key}
              className="flex flex-col rounded-3xl border border-slate-700/50 bg-slate-900/40 p-6 shadow-lg"
            >
              <div className="mb-5 flex items-start gap-3">
                <div className="rounded-xl bg-cyan-500/15 p-3 text-cyan-400">
                  <FileText className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-white">{documentType.title}</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {documentType.description}
                  </p>
                </div>
              </div>

              <div className="mb-5 min-h-[92px] rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                {currentDocument.fileName ? (
                  <div className="flex h-full items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-emerald-400">
                        <ShieldCheck className="h-4 w-4 shrink-0" />
                        <span className="text-xs font-bold uppercase tracking-wider">
                          Active
                        </span>
                      </div>
                      <p className="mt-2 truncate text-sm font-semibold text-slate-200">
                        {currentDocument.fileName}
                      </p>
                      {uploadedDate && (
                        <p className="mt-1 text-xs text-slate-500">Uploaded {uploadedDate}</p>
                      )}
                    </div>

                    {currentDocument.fileUrl && (
                      <a
                        href={currentDocument.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-slate-800 hover:text-cyan-400"
                        title={`View ${documentType.title}`}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="flex h-full items-center gap-3 text-amber-400">
                    <AlertTriangle className="h-5 w-5 shrink-0" />
                    <p className="text-sm font-medium">No active document stored.</p>
                  </div>
                )}
              </div>

              <label
                onDragOver={event => event.preventDefault()}
                onDrop={event => handleDrop(documentType.key, event)}
                className={`relative flex min-h-[150px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-5 text-center transition ${
                  selectedFile
                    ? 'border-cyan-500/60 bg-cyan-500/10'
                    : 'border-slate-700 bg-slate-950/50 hover:border-cyan-500/50'
                } ${uploading ? 'pointer-events-none opacity-50' : ''}`}
              >
                <input
                  key={`${documentType.key}-${inputKeys[documentType.key]}`}
                  type="file"
                  accept={documentType.accept}
                  onChange={event => handleFileChange(documentType.key, event)}
                  disabled={uploading}
                  className="sr-only"
                />

                <UploadCloud
                  className={`mb-3 h-9 w-9 ${
                    selectedFile ? 'text-cyan-400' : 'text-slate-600'
                  }`}
                />

                <p className="text-sm font-bold text-slate-300">
                  {currentDocument.fileName ? `Replace ${documentType.title}` : `Upload ${documentType.title}`}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Click or drag a file here
                </p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
                  {documentType.acceptedText} · Maximum 5 MB
                </p>
              </label>

              {selectedFile && (
                <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-cyan-300">
                      {selectedFile.name}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatFileSize(selectedFile.size)}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => clearSelectedFile(documentType.key)}
                    disabled={uploading}
                    className="shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-red-500/10 hover:text-red-400"
                    title="Remove selected file"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {(uploading || selectedCount > 0) && (
        <div className="rounded-3xl border border-slate-700/50 bg-slate-900/40 p-6">
          {uploading && (
            <div className="mb-5">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-300">
                  {phase === 'extracting'
                    ? 'Upload complete — Agent 1 is extracting and validating your profile...'
                    : `Uploading documents... ${uploadProgress}%`}
                </span>
                <span className="text-slate-500">{uploadProgress}%</span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>

              {phase === 'extracting' && (
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Visual CQFO extraction and profile validation may take several minutes. Keep
                  this page open until processing completes.
                </p>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading || selectedCount === 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 px-5 py-4 font-bold text-white shadow-[0_0_20px_rgba(34,211,238,0.25)] transition hover:from-cyan-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>
                  {phase === 'extracting' ? 'Extracting Profile Data...' : 'Uploading Documents...'}
                </span>
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5" />
                <span>
                  Extract and Rebuild Profile ({selectedCount} {selectedCount === 1 ? 'Document' : 'Documents'})
                </span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}