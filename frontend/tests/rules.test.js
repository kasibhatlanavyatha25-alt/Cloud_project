import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getBytes } from 'firebase/storage';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const projectId = 'demo-carecloud-rules';
const env = await initializeTestEnvironment({
  projectId,
  firestore: { rules: readFileSync(resolve(root, 'firestore.rules'), 'utf8') },
  storage: { rules: readFileSync(resolve(root, 'storage.rules'), 'utf8') },
});
const userDoc = (uid, role) => ({ uid, role, name: uid, email: `${uid}@example.test`, createdAt: new Date() });

try {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users/patient-a'), userDoc('patient-a', 'patient'));
    await setDoc(doc(db, 'users/patient-b'), userDoc('patient-b', 'patient'));
    await setDoc(doc(db, 'users/doctor-a'), userDoc('doctor-a', 'doctor'));
    await setDoc(doc(db, 'users/admin-a'), userDoc('admin-a', 'admin'));
    await setDoc(doc(db, 'patients/patient-a'), { patientId: 'patient-a', userId: 'patient-a', name: 'Synthetic Patient A', createdAt: new Date() });
    await setDoc(doc(db, 'patients/patient-b'), { patientId: 'patient-b', userId: 'patient-b', name: 'Synthetic Patient B', createdAt: new Date() });
    await setDoc(doc(db, 'doctors/doctor-a'), { doctorId: 'doctor-a', userId: 'doctor-a', name: 'Synthetic Doctor', email: 'doctor-a@example.test', specialization: 'Cardiology', createdAt: new Date() });
    await setDoc(doc(db, 'medical_records/record-a'), { patientId: 'patient-a', symptoms: 'synthetic', medicalHistory: '', familyHistory: '', allergies: '', medications: '', vitalSigns: {}, createdAt: new Date(), updatedAt: new Date() });
    await setDoc(doc(db, 'lab_reports/report-a'), { reportId: 'report-a', patientId: 'patient-a', fileName: 'synthetic.pdf', fileType: 'application/pdf', storagePath: 'patients/patient-a/report-a.pdf', uploadedAt: new Date(), uploadedBy: 'patient-a', description: 'synthetic' });
    await setDoc(doc(db, 'predictions/prediction-a'), { patientId: 'patient-a', predictedDisease: 'synthetic class', predictionTimestamp: new Date() });
  });

  const unauth = env.unauthenticatedContext();
  const patientA = env.authenticatedContext('patient-a', { email: 'patient-a@example.test' });
  const patientB = env.authenticatedContext('patient-b');
  const doctor = env.authenticatedContext('doctor-a');
  const admin = env.authenticatedContext('admin-a');
  const dbA = patientA.firestore(); const dbB = patientB.firestore(); const dbDoctor = doctor.firestore(); const dbAdmin = admin.firestore();

  await assertFails(getDoc(doc(unauth.firestore(), 'patients/patient-a')));
  await assertSucceeds(getDoc(doc(dbA, 'patients/patient-a')));
  await assertFails(getDoc(doc(dbA, 'patients/patient-b')));
  await assertFails(getDoc(doc(dbDoctor, 'patients/patient-a')));
  await assertSucceeds(getDoc(doc(dbAdmin, 'patients/patient-b')));
  await assertFails(setDoc(doc(dbA, 'users/patient-a'), userDoc('patient-a', 'admin')));
  await assertFails(setDoc(doc(dbA, 'predictions/fake'), { patientId: 'patient-a', predictedDisease: 'fake' }));

  const accessId = 'patient-a_doctor-a';
  await assertSucceeds(setDoc(doc(dbA, `doctor_access/${accessId}`), {
    accessId, patientId: 'patient-a', doctorId: 'doctor-a', status: 'active', grantedAt: serverTimestamp(),
  }));
  await assertSucceeds(getDoc(doc(dbDoctor, 'patients/patient-a')));
  await assertSucceeds(getDoc(doc(dbDoctor, 'medical_records/record-a')));
  await assertSucceeds(setDoc(doc(dbDoctor, 'medical_records/doctor-note'), {
    patientId: 'patient-a', kind: 'clinical_note', note: 'Synthetic review note', authorId: 'doctor-a',
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
  await assertFails(getDoc(doc(dbB, 'medical_records/record-a')));

  const storeA = patientA.storage('gs://demo-carecloud-rules.appspot.com');
  const storeDoctor = doctor.storage('gs://demo-carecloud-rules.appspot.com');
  const pdfRef = ref(storeA, 'patients/patient-a/allowed.pdf');
  await assertSucceeds(uploadBytes(pdfRef, new Uint8Array([37, 80, 68, 70]), { contentType: 'application/pdf' }));
  await assertSucceeds(getBytes(ref(storeDoctor, 'patients/patient-a/allowed.pdf')));
  await assertFails(uploadBytes(ref(storeA, 'patients/patient-a/forbidden.txt'), new Uint8Array([1]), { contentType: 'text/plain' }));
  await assertFails(getBytes(ref(storeDoctor, 'patients/patient-b/hidden.pdf')));

  await assertSucceeds(updateDoc(doc(dbA, `doctor_access/${accessId}`), { status: 'revoked', revokedAt: serverTimestamp() }));
  await assertFails(getDoc(doc(dbDoctor, 'patients/patient-a')));
  await assertFails(getDoc(doc(dbDoctor, 'medical_records/record-a')));
  await assertFails(getBytes(ref(storeDoctor, 'patients/patient-a/allowed.pdf')));
  await assertSucceeds(getBytes(ref(storeA, 'patients/patient-a/allowed.pdf')));
  console.log('Firebase rules checks passed: default deny, ownership, role protection, grant/revoke, report storage and type validation.');
} finally {
  await env.cleanup();
}
