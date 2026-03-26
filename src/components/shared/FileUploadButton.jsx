import { useState, useRef } from 'react';
import { Upload, CheckCircle, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import { api } from '../../lib/apiClient';

/**
 * FileUploadButton — reusable inline file-upload button.
 *
 * Props:
 *   category      — 'contracts' | 'invoices' | 'payment-proofs' | 'links' | 'cast-photos'
 *   subfolder     — e.g. "2026/PRD26-01 Production Name"
 *   fileName      — suggested file name (auto-renamed on server if duplicate)
 *   accept        — file input accept string (e.g. "application/pdf" or "image/*")
 *   onUploaded    — callback({ drive, dropbox }) with link objects
 *   label         — button text (default: "Upload")
 *   size          — 'sm' | 'md' (default: 'sm')
 *   className     — extra classes on wrapper
 */
export default function FileUploadButton({
  category = 'links',
  subfolder = '',
  fileName: suggestedName,
  accept,
  onUploaded,
  label = 'Upload',
  size = 'sm',
  className = '',
}) {
  const [status, setStatus] = useState('idle');   // idle | uploading | done | error
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const inputRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // 10 MB limit
    if (file.size > 10 * 1024 * 1024) {
      setStatus('error');
      setErrorMsg('File must be under 10 MB');
      return;
    }

    setStatus('uploading');
    setErrorMsg('');

    try {
      const base64 = await fileToBase64(file);
      const finalName = suggestedName || file.name;

      const token = localStorage.getItem('cp_auth_token');
      const res = await fetch('/api/drive/upload-dual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          fileName: finalName,
          fileContent: base64,
          mimeType: file.type || 'application/octet-stream',
          subfolder,
          category,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Upload failed (${res.status})`);
      }

      const data = await res.json();
      setResult(data);
      setStatus('done');
      onUploaded?.(data);
    } catch (err) {
      console.error('FileUploadButton error:', err);
      setStatus('error');
      setErrorMsg(err.message || 'Upload failed');
    }

    // Reset input so re-selecting the same file works
    if (inputRef.current) inputRef.current.value = '';
  }

  const isSm = size === 'sm';

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleFile}
      />

      {status === 'idle' && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={`inline-flex items-center gap-1.5 font-semibold border border-gray-200 rounded-lg
            text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors
            ${isSm ? 'text-xs px-2.5 py-1.5' : 'text-sm px-3 py-2'}`}
        >
          <Upload size={isSm ? 12 : 14} />
          {label}
        </button>
      )}

      {status === 'uploading' && (
        <span className={`inline-flex items-center gap-1.5 text-blue-600 ${isSm ? 'text-xs' : 'text-sm'}`}>
          <Loader2 size={isSm ? 12 : 14} className="animate-spin" />
          Uploading…
        </span>
      )}

      {status === 'done' && (
        <span className={`inline-flex items-center gap-1.5 text-green-600 ${isSm ? 'text-xs' : 'text-sm'}`}>
          <CheckCircle size={isSm ? 12 : 14} />
          Uploaded
          {result?.drive?.viewLink && (
            <a
              href={result.drive.viewLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline inline-flex items-center gap-0.5"
              title="Open in Google Drive"
            >
              Drive <ExternalLink size={10} />
            </a>
          )}
          {result?.dropbox?.link && (
            <a
              href={result.dropbox.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline inline-flex items-center gap-0.5"
              title="Open in Dropbox"
            >
              Dropbox <ExternalLink size={10} />
            </a>
          )}
          <button
            type="button"
            onClick={() => { setStatus('idle'); setResult(null); }}
            className="text-gray-400 hover:text-gray-600 ml-1 text-[10px] underline"
          >
            re-upload
          </button>
        </span>
      )}

      {status === 'error' && (
        <span className={`inline-flex items-center gap-1.5 text-red-500 ${isSm ? 'text-xs' : 'text-sm'}`}>
          <AlertCircle size={isSm ? 12 : 14} />
          {errorMsg || 'Upload failed'}
          <button
            type="button"
            onClick={() => { setStatus('idle'); setErrorMsg(''); }}
            className="text-gray-400 hover:text-gray-600 ml-1 text-[10px] underline"
          >
            retry
          </button>
        </span>
      )}
    </div>
  );
}

/** Read a File as base64 (without the data:… prefix) */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      // Strip "data:<mime>;base64," prefix
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
