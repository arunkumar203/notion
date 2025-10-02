# Security Findings

## 1. Appwrite service JWT exposure to all authenticated users
- **Location:** `src/app/api/files/token/route.ts:12`
- **Severity:** Critical
- **Issue:** The `/api/files/token` endpoint issues an Appwrite JWT for the `APPWRITE_SERVICE_USER_ID` to *any* authenticated session. The handler only checks that a session cookie exists, then calls `users.createJWT` with the service user identifier and returns the raw token to the caller.
- **Impact:** Possessing this JWT gives the caller the same permissions as the service user / API key, enabling them to bypass all server-side access controls and interact with Appwrite directly (e.g., create/list/delete files, enumerate databases, call functions). An attacker can exfiltrate or destroy any tenant's data, mint additional tokens, or pivot to other Appwrite resources despite only having a normal user account.
- **Recommendation:** Remove this endpoint or restrict it to trusted admins and scope-limited users. Prefer issuing per-user tokens through Appwrite's native auth or proxy specific storage operations through server routes that enforce ownership. If a service token must exist, gate it behind strong role checks and shorten its lifetime, or better yet replace it with signed URLs generated server-side for specific files.

## 2. Appwrite storage endpoints lack ownership enforcement (global data disclosure)
- **Locations:** `src/app/api/files/list/route.ts:7`, `src/app/api/files/view/[id]/route.ts:8`, `src/app/api/files/download/[id]/route.ts:8`, `src/app/api/files/preview/[id]/route.ts:8`
- **Severity:** Critical
- **Issue:** These routes only verify that *some* session exists, then use the Appwrite API key to list or stream files straight from the bucket. No file-level authorization or ownership check is performed, so a user can call `/api/files/list` to enumerate every stored object and then pull arbitrary content via `/view`, `/preview`, or `/download` regardless of who uploaded it.
- **Impact:** Any authenticated user can read every document, media asset, or secret the application stores in Appwrite. This completely breaks tenant isolation and leaks sensitive data. Because the service API key is used, Appwrite's native ACLs are bypassed, so even private buckets become globally readable through these handlers.
- **Recommendation:** Track and enforce per-file ownership (e.g., store owner UID alongside the Appwrite file ID) and reject accesses where the requester is not the owner or an authorized collaborator. Alternatively, rely on Appwrite's built-in permission model by uploading files with restrictive ACLs and proxying requests with user-scoped JWTs instead of the master API key.

## 3. Any user can delete any stored file
- **Location:** `src/app/api/files/[id]/route.ts:26`
- **Severity:** Critical
- **Issue:** The delete handler uses the Appwrite API key to call `storage.deleteFile` and explicitly notes that "any authenticated user can delete any file" pending a TODO. There is no verification that the requester owns the target file.
- **Impact:** A malicious user can iterate over file IDs (using `/api/files/list`) and wipe out other users' uploads or vital application assets, leading to irreversible data loss and denial of service.
- **Recommendation:** Require proof of ownership (or admin privileges) before deleting a file. Enforce this by maintaining metadata that maps files to owners and checking it prior to deletion, or by leveraging Appwrite's object-level permissions so only creators (or admins) receive the authority to delete.
