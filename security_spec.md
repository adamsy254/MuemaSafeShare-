# MuemaSafeShare FireStore Security Specification

This document details the security specification for **MuemaSafeShare**'s Firestore database, conforming to Zero-Trust architecture rules.

## 1. Data Invariants & Access Matrix

### Entities
1. **User Profile (`/users/{userId}`)**: Indexed by Firebase UID. Stores standard authentication coordinates. Is immutable once set.
2. **File Metadata (`/files/{fileId}`)**: Entry for uploaded files. Has high-contrast access rights: Either `public` or `restricted`. Owner has total power.
3. **Download Request (`/downloadRequests/{requestId}`)**: Relational state machine mapping access queries from requester to file owner. Indexed as `{fileId}_{requesterId}`.
4. **Contact Submission (`/contacts/{contactId}`)**: Public contact form. Write-only for users, read-only for admins (closed ledger).

### Access Rights Matrix

| Collection | Create | Read (Get) | Read (List) | Update | Delete |
|---|---|---|---|---|---|
| `/users/{userId}` | `isOwner()` | `isSignedIn()` | `isSignedIn()` | `isOwner()` | `if false` |
| `/files/{fileId}` | `isSignedIn()` | `isOwner() \|\| isPublic() \|\| isRequestApproved()` | `isSignedIn()` | `isOwner()` | `isOwner()` |
| `/downloadRequests/{requestId}` | `isSignedIn() && isSelf()` | `isRequester() \|\| isFileOwner()` | `isRequester() \|\| isFileOwner()` | `isFileOwner() (Approve/Reject) \|\| Client Action (Cancel)` | `if false` |
| `/contacts/{contactId}` | `true` | `if false` | `if false` | `if false` | `if false` |

---

## 2. The "Dirty Dozen" Payloads (Avenue of Attacks)

The following 12 JSON payloads represent malicious attempts to compromise the database. Every single one of these attempts is blocked by our Firestore Security rules.

### Target: `/users/{userId}`
#### 1. Identity Spoofing Attack (Claiming someone else's space)
An attacker attempts to write or edit a user profile that belongs to another victim.
```json
// Attempt to write users/victim_uid by attacker_uid
{
  "uid": "victim_uid",
  "email": "attacker@gmail.com",
  "displayName": "Hacker",
  "photoURL": "https://attacker.space/hacker.png",
  "createdAt": "2026-06-01T00:00:00Z"
}
```
*Outcome*: **PERMISSION_DENIED** (the document ID `userId` must strictly equal `request.auth.uid`).

#### 2. Privilege Escalation (Self-assigning values)
An attacker attempts to inject custom roles, system metadata, or override their profile validation fields.
```json
// Attempt to update users/attacker_uid
{
  "uid": "attacker_uid",
  "email": "attacker@gmail.com",
  "role": "admin",
  "isAdmin": true
}
```
*Outcome*: **PERMISSION_DENIED** (the validation helper schema denies extra parameters and forces exact structural matches).

---

### Target: `/files/{fileId}`
#### 3. Orphan File Hijack (Creating files for other owners)
Attacker tries to upload file metadata asserting a different `ownerId` to gain access or frame another user.
```json
// Attempt to create files/file_999
{
  "fileId": "file_999",
  "ownerId": "victim_uid",
  "ownerEmail": "victim@gmail.com",
  "name": "malicious.exe",
  "type": "image",
  "url": "https://evil.storage/malicious.exe",
  "storagePath": "files/file_999",
  "size": 1048576,
  "permissionSetting": "public",
  "createdAt": "2026-06-01T00:00:00Z"
}
```
*Outcome*: **PERMISSION_DENIED** (requires `incoming().ownerId == request.auth.uid`).

#### 4. Shadow State Corruption (Injecting un-validated keys)
Attacker tries to upload a file document with custom fields containing 1MB strings or ghost parameters (e.g. `downloadAttemptsCount`).
```json
// Create/update file metadata with extraneous fields
{
  "fileId": "file_123",
  "ownerId": "attacker_uid",
  "ownerEmail": "attacker@gmail.com",
  "ownerName": "Attacker",
  "name": "pic.jpg",
  "type": "image",
  "url": "https://storage.app/pic.jpg",
  "storagePath": "files/file_123",
  "size": 5000,
  "permissionSetting": "public",
  "createdAt": "2026-06-01T00:00:00Z",
  "ghost_field": "x".repeat(1000)
}
```
*Outcome*: **PERMISSION_DENIED** (keys length and precise matching is enforced by validation schema helper).

#### 5. Client Timestamp Spoofing (Backdating upload times)
Attacker attempts to forge the server upload time to the past or future.
```json
{
  "fileId": "file_123",
  "createdAt": "2020-01-01T00:00:00Z" // Attacker timeline spoofing
}
```
*Outcome*: **PERMISSION_DENIED** (mandated checks: `incoming().createdAt == request.time`).

#### 6. Denial of Wallet (Resource ID Exhaustion)
Attacker seeks to write file records with massive, malformed document IDs containing huge text sizes.
```json
// Attempt to write to file ID: file_name_with_huge_buffer_space...
{
  "id": "x".repeat(2000)
}
```
*Outcome*: **PERMISSION_DENIED** (`isValidId()` constraint: IDs must be alphanumeric and `<= 128` characters).

#### 7. Unauthorized File Deletion (Sabotaging files of other users)
Attacker tries to delete a file metadata record belonging to a victim.
```json
// Attacker tries to delete files/file_belonging_to_victim
{
  "ownerId": "victim_uid"
}
```
*Outcome*: **PERMISSION_DENIED** (deletion is guarded by `resource.data.ownerId == request.auth.uid`).

---

### Target: `/downloadRequests/{requestId}`
#### 8. Direct Download Bypass (Self-Approval Attack)
User requests access to a restricted file and writes their download request document with `status: "approved"` directly.
```json
// Attempt to write downloadRequests/file123_attackerUid
{
  "requestId": "file123_attackerUid",
  "fileId": "file123",
  "status": "approved", // malicious self-approval
  "requesterId": "attacker_uid",
  "fileOwnerId": "victim_uid"
}
```
*Outcome*: **PERMISSION_DENIED** (creation only allows `"pending"` states. Status modifications to `"approved"` or `"rejected"` are strictly gated only to `fileOwnerId`).

#### 9. Relational Impersonation Hijack (Making requests on behalf of others)
Attacker requests database updates purporting to be a different requester.
```json
// Create downloadRequests/file123_victimUid
{
  "requestId": "file123_victimUid",
  "requesterId": "victim_uid",
  "status": "pending"
}
```
*Outcome*: **PERMISSION_DENIED** (creation is strictly restricted to `request.auth.uid == requesterId`).

#### 10. Multi-State Lock Short-Cut (Stuck state bypass)
Attacker tries to modify request fields that are locked/immutable or transition an already approved/rejected request back to pending.
```json
// Attempting to reset closed case back to pending
{
  "requestId": "file123_attackerUid",
  "status": "pending"
}
```
*Outcome*: **PERMISSION_DENIED** (Terminal State Locking rule blocks modifications to requests that are already processed or blocks tampering with closed status values).

---

### Target: `/contacts/{contactId}`
#### 11. Feedback Ledgers Theft (PII scraping)
Attacker attempts to query list/read standard user contact submissions from `/contacts/` to crop personal information of other customers.
```json
// Attempt to read/list `/contacts`
```
*Outcome*: **PERMISSION_DENIED** (reading submissions is locked for everyone (`if false`)).

#### 12. Contact Form Abuse (Resource exhaustion)
Attacker tries to submit feedback missing core contact details or with massive data payload fields to exhaust server boundaries.
```json
// Attempt to write /contacts/msg_123
{
  "contactId": "msg_123",
  "name": "Attacker",
  "email": "invalid_email",
  "message": "x".repeat(100000) // Excess size
}
```
*Outcome*: **PERMISSION_DENIED** (enforced string sizes: `name` `<= 100`, `email` `<= 100`, `message` `<= 2000`).
