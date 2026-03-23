/**
 * invoiceUtils.js
 * Helpers for invoice URL handling (View / Download link conversion).
 */

/**
 * Given a Google Drive "view" URL or Dropbox share URL,
 * returns a direct-download URL.  Falls back to the original URL.
 *
 * Supported conversions:
 *  - Google Drive:
 *      https://drive.google.com/file/d/<ID>/view?...
 *      https://drive.google.com/open?id=<ID>
 *      https://docs.google.com/…/d/<ID>/…
 *    → https://drive.google.com/uc?export=download&id=<ID>
 *
 *  - Dropbox:
 *      ?dl=0  →  ?dl=1
 *      www.dropbox.com  →  dl.dropboxusercontent.com
 */
export function getDownloadUrl(url) {
  if (!url) return null;

  // ---- Google Drive ----
  // Pattern 1: /file/d/<ID>/
  const driveFile = url.match(/drive\.google\.com\/file\/d\/([^/?#]+)/);
  if (driveFile) {
    return `https://drive.google.com/uc?export=download&id=${driveFile[1]}`;
  }
  // Pattern 2: /open?id=<ID>
  const driveOpen = url.match(/drive\.google\.com\/open\?id=([^&]+)/);
  if (driveOpen) {
    return `https://drive.google.com/uc?export=download&id=${driveOpen[1]}`;
  }
  // Pattern 3: docs.google.com/…/d/<ID>/
  const docsFile = url.match(/docs\.google\.com\/[^/]+\/d\/([^/?#]+)/);
  if (docsFile) {
    return `https://drive.google.com/uc?export=download&id=${docsFile[1]}`;
  }

  // ---- Dropbox ----
  if (url.includes('dropbox.com')) {
    // Replace dl=0 with dl=1, or append dl=1
    let dl = url.includes('dl=0')
      ? url.replace('dl=0', 'dl=1')
      : url.includes('dl=1')
      ? url
      : url + (url.includes('?') ? '&dl=1' : '?dl=1');
    // Optionally use direct download subdomain
    dl = dl.replace('www.dropbox.com', 'dl.dropboxusercontent.com');
    return dl;
  }

  // Fallback: return as-is (browser will handle it)
  return url;
}

/**
 * Returns true if the URL looks like a Google Drive or Dropbox link
 * (i.e., we can attempt a download conversion).
 */
export function isCloudStorageUrl(url) {
  if (!url) return false;
  return (
    url.includes('drive.google.com') ||
    url.includes('docs.google.com') ||
    url.includes('dropbox.com')
  );
}
