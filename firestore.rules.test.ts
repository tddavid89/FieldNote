import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, serverTimestamp, Timestamp } from 'firebase/firestore';
import fs from 'node:fs';

let testEnv: RulesTestEnvironment;

const VALID_ITEM_BASE = {
  id: 'item_1',
  userId: 'userA',
  title: 'iCloud vs Google Photos',
  userPrompt: 'Compare 200GB and 2TB plans',
  category: 'comparison',
  completed: false,
  personalNotes: '',
  researchStatus: 'idle',
  researchError: '',
  locationUsed: '',
  summary: '',
  keyFindings: [],
  comparisonColumns: [],
  comparisonRows: [],
  actionSteps: [],
  sources: [],
};

export async function runDirtyDozenSuite() {
  testEnv = await initializeTestEnvironment({
    projectId: 'fieldnote-security-test',
    firestore: {
      rules: fs.readFileSync('firestore.rules', 'utf8'),
    },
  });

  const userACtx = testEnv.authenticatedContext('userA', { email: 'a@example.com', email_verified: true });
  const userBCtx = testEnv.authenticatedContext('userB', { email: 'b@example.com', email_verified: true });
  const unverifiedCtx = testEnv.authenticatedContext('userA', { email: 'a@example.com', email_verified: false });

  const dbA = userACtx.firestore();
  const dbB = userBCtx.firestore();
  const dbUnverified = unverifiedCtx.firestore();

  // Seed valid parent item as userA
  await assertSucceeds(
    setDoc(doc(dbA, 'users/userA/items/item_1'), {
      ...VALID_ITEM_BASE,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  // 1. Cross-User Spoof
  await assertFails(
    setDoc(doc(dbA, 'users/userB/items/item_x'), {
      ...VALID_ITEM_BASE,
      id: 'item_x',
      userId: 'userB',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  // 2. Identity Spoof in Payload
  await assertFails(
    setDoc(doc(dbA, 'users/userA/items/item_2'), {
      ...VALID_ITEM_BASE,
      id: 'item_2',
      userId: 'userB',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  // 3. Unverified Email Write
  await assertFails(
    setDoc(doc(dbUnverified, 'users/userA/items/item_3'), {
      ...VALID_ITEM_BASE,
      id: 'item_3',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  // 4. Shadow Field Injection (Create)
  await assertFails(
    setDoc(doc(dbA, 'users/userA/items/item_4'), {
      ...VALID_ITEM_BASE,
      id: 'item_4',
      isAdmin: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  // 5. Shadow Field Injection (Update)
  await assertFails(
    updateDoc(doc(dbA, 'users/userA/items/item_1'), {
      personalNotes: 'Hello',
      ghostRole: 'owner',
      updatedAt: serverTimestamp(),
    })
  );

  // 6. Client-Forged Timestamp
  await assertFails(
    setDoc(doc(dbA, 'users/userA/items/item_5'), {
      ...VALID_ITEM_BASE,
      id: 'item_5',
      createdAt: Timestamp.fromMillis(1000),
      updatedAt: Timestamp.fromMillis(1000),
    })
  );

  // 7. Immortal Field Tampering
  await assertFails(
    updateDoc(doc(dbA, 'users/userA/items/item_1'), {
      userId: 'userB',
      updatedAt: serverTimestamp(),
    })
  );

  // 8. ID Poisoning (Oversized ID)
  const badId = 'a'.repeat(130);
  await assertFails(
    setDoc(doc(dbA, `users/userA/items/${badId}`), {
      ...VALID_ITEM_BASE,
      id: badId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  // 9. Resource Exhaustion
  await assertFails(
    setDoc(doc(dbA, 'users/userA/items/item_6'), {
      ...VALID_ITEM_BASE,
      id: 'item_6',
      title: 'x'.repeat(300),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  // 10. Value Poisoning on Action Update
  await assertFails(
    updateDoc(doc(dbA, 'users/userA/items/item_1'), {
      completed: 'true' as unknown as boolean,
      updatedAt: serverTimestamp(),
    })
  );

  // 11. Orphaned Subcollection Write
  await assertFails(
    setDoc(doc(dbA, 'users/userA/items/nonexistent_item/followups/f1'), {
      id: 'f1',
      userId: 'userA',
      itemId: 'nonexistent_item',
      question: 'Any updates?',
      answer: 'Test answer',
      sources: [],
      createdAt: serverTimestamp(),
    })
  );

  // 12. Blanket List Scraping across users
  await assertFails(getDocs(collection(dbB, 'users')));
  await assertFails(getDocs(query(collection(dbB, 'users/userA/items'), where('userId', '==', 'userA'))));
  await assertSucceeds(getDoc(doc(dbA, 'users/userA/items/item_1')));

  await testEnv.cleanup();
}
