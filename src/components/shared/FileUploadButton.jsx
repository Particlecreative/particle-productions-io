import { useState, useRef } from 'react';
import { Upload, CheckCircle, Loader2, AlertCircle, Download } from 'lucide-react';
import { getDownloadUrl } from '../../lib/invoiceUtils';

/* Brand SVG icons for Google Drive and Dropbox */
const DriveIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
    <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L29 52.2H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066DA"/>
    <path d="M43.65 25.15L29 1.2C27.65 2 26.5 3.1 25.7 4.5l-24.5 42.4c-.8 1.4-1.2 2.95-1.2 4.5H29z" fill="#00AC47"/>
    <path d="M58.3 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L73.7 52.2H58.3L43.65 25.15 29 52.2z" fill="#EA4335"/>
    <path d="M43.65 25.15L58.3 52.2h15.4l-16-27.7-3.55-6.15c-.8-1.4-1.95-2.5-3.3-3.3z" fill="#00832D"/>
    <path d="M73.55 52.2H58.3l14.9 25.8c1.35-.8 2.5-1.9 3.3-3.3l6.15-10.65c.8-1.4 1.2-2.95 1.2-4.5 0-1.55-.4-3.1-1.2-4.5z" fill="#2684FC"/>
    <path d="M61.6 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25.15 58.3 52.2h15.4z" fill="#FFBA00"/>
  </svg>
);

const DropboxIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 43.35 40.3" xmlns="http://www.w3.org/2000/svg">
    <path d="M12.88 0L0 8.14l8.8 7.07L21.68 8zm17.6 0l-8.8 7.08 8.8 7.06 12.87-8.13zm-17.6 22.28L0 15.21l8.8-7.07 12.88 7.07zm17.6 0l12.87-7.07-8.8-7.07-12.87 7.07zM12.95 24.1l8.73 5.4 8.72-5.4-8.72-5.56z" fill="#0061FF"/>
  </svg>
);


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
      // Pass back the data + original filename for auto-fill
      onUploaded?.({ ...data, originalFileName: file.name, originalFileNameNoExt: file.name.replace(/\.[^/.]+$/, '') });
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
        <span className={`inline-flex items-center gap-2 ${isSm ? 'text-xs' : 'text-sm'}`}>
          <CheckCircle size={isSm ? 12 : 14} className="text-green-500 flex-shrink-0" />
          <span className="text-green-600 font-medium">Uploaded</span>
          <span className="inline-flex items-center gap-1.5 ml-1">
            {result?.drive?.viewLink && (
              <a
                href={result.drive.viewLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all"
                title="Open in Google Drive"
              >
                <DriveIcon size={isSm ? 12 : 14} />
              </a>
            )}
            {result?.drive?.downloadLink && (
              <a
                href={result.drive.downloadLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-gray-200 hover:border-gray-400 hover:shadow-sm transition-all text-gray-500"
                title="Download file"
              >
                <Download size={isSm ? 12 : 14} />
              </a>
            )}
          </span>
          <button
            type="button"
            onClick={() => { setStatus('idle'); setResult(null); }}
            className="text-gray-400 hover:text-gray-600 ml-1 text-[10px] underline flex-shrink-0"
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

/* ─── Reusable Cloud Link Icons ──────────────────────────────────────────────── */

export { DriveIcon, DropboxIcon };

/**
 * Convert a Google Drive view URL to a thumbnail URL.
 * Input:  https://drive.google.com/file/d/FILE_ID/view?…
 * Output: https://drive.google.com/thumbnail?id=FILE_ID&sz=w{size}
 */
export function getDriveThumbnail(url, size = 200) {
  if (!url) return null;
  const m = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w${size}`;
  // Also handle open?id= format
  const m2 = url.match(/drive\.google\.com\/open\?id=([^&]+)/);
  if (m2) return `https://drive.google.com/thumbnail?id=${m2[1]}&sz=w${size}`;
  return null;
}

/**
 * Detect if a URL is a Google Drive or Dropbox link and return
 * structured props for CloudLinks.
 */
export function detectCloudUrl(url, explicitDriveUrl, explicitDropboxUrl) {
  if (!url && !explicitDriveUrl && !explicitDropboxUrl) return {};
  const isDrive = url?.includes('drive.google.com') || url?.includes('docs.google.com');
  const isDropbox = url?.includes('dropbox.com');
  return {
    driveUrl: explicitDriveUrl || (isDrive ? url : null),
    dropboxUrl: explicitDropboxUrl || (isDropbox ? url : null),
    downloadUrl: url || explicitDriveUrl || explicitDropboxUrl,
  };
}

/**
 * CloudLinks — renders Drive / Dropbox / Download icons for any URL set.
 * Can be used standalone wherever cloud file links need to be shown.
 */
export function CloudLinks({ driveUrl, dropboxUrl, downloadUrl, size = 'sm' }) {
  if (!driveUrl && !downloadUrl) return null;
  const iconSize = size === 'sm' ? 14 : 16;
  return (
    <span className="inline-flex items-center gap-1">
      {driveUrl && (
        <a href={driveUrl} target="_blank" rel="noopener noreferrer"
           className="inline-flex items-center p-1 rounded hover:bg-gray-100 transition-colors" title="Open in Google Drive">
          <DriveIcon size={iconSize} />
        </a>
      )}
      {(downloadUrl || driveUrl) && (
        <a href={getDownloadUrl(downloadUrl || driveUrl) || downloadUrl || driveUrl}
           download target="_blank" rel="noopener noreferrer"
           className="inline-flex items-center p-1 rounded hover:bg-gray-100 transition-colors" title="Download file">
          <Download size={iconSize} className="text-gray-500" />
        </a>
      )}
    </span>
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
