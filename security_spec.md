# Security Specification & Payload-First Verification

## 1. Data Invariants
1. **Strict Ownership Isolation**: Every user profile (`/users/{userId}`), research item (`/users/{userId}/items/{itemId}`), and follow-up entry (`/users/{userId}/items/{itemId}/followups/{followupId}`) is strictly readable and writable only by the authenticated, email-verified user whose `request.auth.uid` matches `{userId}` and the document's immutable `userId`/`uid` field.
2. **Master Gate Parent Integrity**: A follow-up entry under `/users/{userId}/items/{itemId}/followups/{followupId}` cannot be created or accessed unless its parent `ResearchItem` exists and is owned by `request.auth.uid`.
3. **Zero Shadow Fields**: All documents enforce strict `keys().hasAll(...)` and `keys().hasOnly(...)` contracts on create, and action-partitioned `affectedKeys().hasOnly(...)` on update.
4. **Temporal Integrity & Immortality**: `createdAt`, `updatedAt`, and `researchedAt` must equal `request.time` via `serverTimestamp()`. `createdAt`, `uid`/`userId`, and `id` are immutable after creation.
5. **Volumetric & Array Bounds**: Every string has explicit `.size()` bounds; every array (`keyFindings`, `comparisonColumns`, `comparisonRows`, `actionSteps`, `sources`) is strictly capped (`<= 6` to `<= 15`).
6. **Zero-Trust Queries**: `allow list` rules explicitly verify `resource.data.userId == request.auth.uid` without `get()`/`exists()` calls.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Cross-User Spoof (Create Item)**: `userA` attempts to create `/users/userB/items/item1` with `userId: "userB"`. -> Denied by `isOwner(userId)`.
2. **Identity Spoof in Payload**: `userA` creates `/users/userA/items/item1` with `userId: "userB"`. -> Denied by `isValidResearchItem`.
3. **Unverified Email Write**: Authenticated user with `email_verified: false` attempts to create an item. -> Denied by `isVerifiedUser()`.
4. **Shadow Field Injection (Create)**: `userA` creates an item containing an extra ghost field `isAdmin: true`. -> Denied by `data.keys().hasOnly(...)`.
5. **Shadow Field Injection (Update)**: `userA` updates `personalNotes` while sneaking `role: "admin"` into the payload. -> Denied by action `affectedKeys().hasOnly(...)`.
6. **Client-Forged Timestamp**: `userA` creates an item with a backdated `createdAt` timestamp instead of `request.time`. -> Denied by `incoming().createdAt == request.time`.
7. **Immortal Field Tampering**: `userA` attempts to alter `createdAt` or `userId` during an update. -> Denied by immutability checks.
8. **ID Poisoning (Oversized Path Variable)**: `userA` writes to an `itemId` longer than 128 characters or containing invalid characters (`../bad`). -> Denied by `isValidId(itemId)`.
9. **Resource Exhaustion ("Denial of Wallet")**: `userA` sends a `title` of 5,000 characters or `keyFindings` with 50 entries. -> Denied by `.size()` bounds.
10. **Value Poisoning on Action Update**: `userA` updates `completed` with a string `"true"` instead of a boolean. -> Denied by `isValidResearchItem(incoming())`.
11. **Orphaned Subcollection Write**: `userA` creates a followup under a non-existent `itemId`. -> Denied by `exists()` + `get()` Master Gate.
12. **Blanket List Scraping**: `userA` attempts `list` on `/users` or `/users/userB/items` without matching `userId`. -> Denied by missing `/users` list rule and `resource.data.userId == request.auth.uid`.
