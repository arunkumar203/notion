// XHR-based chunked uploader to Appwrite Storage with realtime progress
// Uses JWT auth header and supports files of any size by slicing into 5MB chunks

export type XhrProgress = {
  progress: number; // 0-100
  loaded: number; // bytes uploaded so far
  total: number; // total file size
  chunkIndex: number;
  chunkCount: number;
};

// Compute dynamic chunk size so we always have multiple chunks, even for small files
const MAX_CHUNK = 5 * 1024 * 1024; // Appwrite maximum per request
const MIN_CHUNK = 64 * 1024; // Avoid too many tiny requests
const MIN_CHUNKS = 20; // Aim for at least 20 chunks for smooth progress

function computeChunkSize(total: number) {
  const target = Math.ceil(total / MIN_CHUNKS);
  return Math.min(MAX_CHUNK, Math.max(MIN_CHUNK, target));
}

export async function uploadFileXHR(params: {
  endpoint: string; // e.g., https://<region>.cloud.appwrite.io/v1
  projectId: string;
  bucketId: string;
  jwt: string; // short-lived user JWT
  file: File;
  permissions?: string[];
  onProgress?: (p: XhrProgress) => void;
}) {
  const { endpoint, projectId, bucketId, jwt, file, permissions, onProgress } = params;

  const url = `${endpoint.replace(/\/$/, '')}/storage/buckets/${encodeURIComponent(
    bucketId
  )}/files`;

  const total = file.size;
  const CHUNK_SIZE = computeChunkSize(total);
  const chunkCount = Math.max(1, Math.ceil(total / CHUNK_SIZE));
  let uploadedBase = 0; // bytes completed from previous chunks
  let createdFileId: string | null = null;

  const sendChunk = (chunkIndex: number, lastRateBps?: number): Promise<number> =>
    new Promise((resolve, reject) => {
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, total);
      const chunk = file.slice(start, end);

      const form = new FormData();
      if (!createdFileId) {
        // First request must include fileId; 'unique()' lets Appwrite generate an id
        form.set('fileId', 'unique()');
      }
      if (permissions && permissions.length) {
        // Appwrite accepts multiple permissions as repeated keys
        for (const perm of permissions) form.append('permissions[]', perm);
      }
      // Use original filename for every chunk
      form.set('file', chunk, file.name);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.responseType = 'json';
      xhr.withCredentials = false; // using JWT header, not cookies
      xhr.setRequestHeader('X-Appwrite-Project', projectId);
      xhr.setRequestHeader('X-Appwrite-JWT', jwt);

      const contentRange = `bytes ${start}-${end - 1}/${total}`;
      if (createdFileId) {
        xhr.setRequestHeader('x-appwrite-id', createdFileId);
        xhr.setRequestHeader('content-range', contentRange);
      } else if (chunkCount > 1) {
        // First request for chunked upload also needs content-range
        xhr.setRequestHeader('content-range', contentRange);
      }

      let smoothTimer: any = null;
      const chunkBytes = end - start;
      let chunkStartTs = Date.now();
      let lastLoaded = 0;
      let estRate = lastRateBps || 0; // bytes/sec estimate

      const beginSmoothing = () => {
        if (!onProgress) return;
        if (smoothTimer) clearInterval(smoothTimer);
        // Backoff to prior rate or assume baseline 256KB/s
        const baseRate = estRate > 0 ? estRate : 256 * 1024;
        smoothTimer = setInterval(() => {
          const dt = 100; // ms
          lastLoaded = Math.min(
            chunkBytes - 1,
            lastLoaded + Math.max(1, Math.round((baseRate * dt) / 1000))
          );
          const loaded = uploadedBase + lastLoaded;
          const pct = Math.max(1, Math.min(99, Math.round((loaded / total) * 100)));
          onProgress({ progress: pct, loaded, total, chunkIndex, chunkCount });
        }, 100);
      };

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (e) => {
          if (smoothTimer) {
            clearInterval(smoothTimer);
            smoothTimer = null;
          }
          const loaded = uploadedBase + (e.loaded || 0);
          lastLoaded = e.loaded || 0;
          const elapsed = Math.max(1, Date.now() - chunkStartTs) / 1000;
          estRate = lastLoaded / elapsed; // bytes/sec
          const pct = Math.max(1, Math.min(99, Math.round((loaded / total) * 100)));
          onProgress({ progress: pct, loaded, total, chunkIndex, chunkCount });
        };
      } else if (onProgress) {
        // No reliable progress events; start smoothing loop
        beginSmoothing();
      }

  xhr.onerror = () => {
        reject(new Error('Network error during upload'));
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const data: any = xhr.response || {};
          // When first request returns, capture the file ID
          if (!createdFileId) {
            // Appwrite returns { $id, ... }
            createdFileId = data?.$id || data?.fileId || data?.id || null;
          }
          if (smoothTimer) {
            clearInterval(smoothTimer);
            smoothTimer = null;
          }
          uploadedBase = end; // this chunk fully uploaded
          if (onProgress) {
            const pct = Math.max(1, Math.min(100, Math.round((uploadedBase / total) * 100)));
            onProgress({ progress: pct, loaded: uploadedBase, total, chunkIndex, chunkCount });
          }
          // Resolve with last observed rate for next chunk smoothing
          const elapsed = Math.max(1, Date.now() - chunkStartTs) / 1000;
          const rate = chunkBytes / elapsed;
          resolve(rate);
        } else {
          const errText = typeof xhr.response === 'string' ? xhr.response : JSON.stringify(xhr.response);
          reject(new Error(`Upload failed: HTTP ${xhr.status} ${errText}`));
        }
      };

      // If we know progress events are sparse, start smoothing immediately; will be cleared on real events
      beginSmoothing();
      xhr.send(form);
    });

  let prevRate: number | undefined = undefined;
  for (let i = 0; i < chunkCount; i++) {
    prevRate = await sendChunk(i, prevRate);
  }

  // Fetch final file JSON to return consistent object if first response didn't include full data
  // Not strictly necessary; many UIs just proceed after last chunk.
  return { $id: createdFileId, sizeOriginal: total, name: file.name };
}
