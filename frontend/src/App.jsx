import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, updateProfile } from 'firebase/auth';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { deleteObject, ref, uploadBytes } from 'firebase/storage';
import { Bar, Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler } from 'chart.js';
import { jsPDF } from 'jspdf';
import axios from 'axios';
import { auth, db, storage, firebaseConfigured, missingFirebaseSettings } from './firebase';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler);
const DISCLAIMER = 'AI-generated predictions are intended only for educational and decision-support purposes and are not a substitute for professional medical diagnosis or treatment.';
const API_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
const friendlyError = (error) => ({
  'auth/email-already-in-use': 'An account already exists for this email.',
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/weak-password': 'Use a password with at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Please wait and try again.',
  'permission-denied': 'Your account is not permitted to access this information.',
  'storage/unauthorized': 'You do not have permission to access this file.',
}[error?.code] || error?.response?.data?.error || error?.message || 'Something went wrong. Please try again.');

function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, profile: null, error: '' });
  useEffect(() => {
    if (!auth) { setState({ loading: false, user: null, profile: null, error: '' }); return undefined; }
    return onAuthStateChanged(auth, async (user) => {
      if (!user) { setState({ loading: false, user: null, profile: null, error: '' }); return; }
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        setState({ loading: false, user, profile: snap.exists() ? snap.data() : null, error: '' });
      } catch (error) { setState({ loading: false, user, profile: null, error: friendlyError(error) }); }
    });
  }, []);
  return <AuthContext.Provider value={{ ...state, refreshProfile: async () => {
    if (!auth?.currentUser) return;
    const snap = await getDoc(doc(db, 'users', auth.currentUser.uid));
    setState((old) => ({ ...old, profile: snap.exists() ? snap.data() : null }));
  } }}>{children}</AuthContext.Provider>;
}
import { createContext, useContext } from 'react';
const AuthContext = createContext(null);
const useAuth = () => useContext(AuthContext);

function App() {
  return <AuthProvider><Routes>
    <Route path="/" element={<Navigate to="/login" replace />} />
    <Route path="/login" element={<AuthPage mode="login" />} />
    <Route path="/register" element={<AuthPage mode="register" />} />
    <Route path="/forgot-password" element={<AuthPage mode="forgot" />} />
    <Route path="/patient/*" element={<RoleGate role="patient"><PatientDashboard /></RoleGate>} />
    <Route path="/doctor/*" element={<RoleGate role="doctor"><DoctorDashboard /></RoleGate>} />
    <Route path="/admin/*" element={<RoleGate role="admin"><AdminDashboard /></RoleGate>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></AuthProvider>;
}

function RoleGate({ role, children }) {
  const { loading, user, profile, error } = useAuth();
  if (!firebaseConfigured) return <SetupScreen />;
  if (loading) return <div className="center-screen"><span className="spinner" /> Checking your secure session…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (error) return <div className="center-screen"><div className="notice danger">{error}<button className="button quiet" onClick={() => signOut(auth)}>Sign out</button></div></div>;
  if (!profile) return <div className="center-screen"><div className="notice warning">Your account profile is missing. Please contact the administrator.<button className="button quiet" onClick={() => signOut(auth)}>Sign out</button></div></div>;
  return profile.role === role ? children : <Navigate to={`/${profile.role}/dashboard`} replace />;
}

function SetupScreen() {
  return <main className="setup-page"><div className="auth-brand"><span className="brand-mark">✚</span><span>care<span>cloud</span></span></div><section className="setup-card"><span className="eyebrow">Project setup</span><h1>Connect your Firebase project</h1><p>Copy <code>frontend/.env.example</code> to <code>frontend/.env.local</code>, add the Firebase web app settings, then restart the frontend.</p><div className="setup-vars">{missingFirebaseSettings.map((key) => <code key={key}>{key}</code>)}</div><p className="muted">No demo records are shown. Configure Authentication, Firestore, and Storage to start using the live dashboard.</p></section></main>;
}

function AuthPage({ mode }) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  if (firebaseConfigured && user && profile) return <Navigate to={`/${profile.role}/dashboard`} replace />;
  const titles = { login: 'Welcome back', register: 'Create your patient account', forgot: 'Reset your password' };
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      if (mode === 'forgot') { await sendPasswordResetEmail(auth, form.email.trim()); setMessage('Password reset email sent. Check your inbox.'); }
      else if (mode === 'register') {
        if (form.name.trim().length < 2) throw new Error('Enter your full name.');
        const result = await createUserWithEmailAndPassword(auth, form.email.trim(), form.password);
        await updateProfile(result.user, { displayName: form.name.trim() });
        const now = serverTimestamp();
        await setDoc(doc(db, 'users', result.user.uid), { uid: result.user.uid, name: form.name.trim(), email: form.email.trim().toLowerCase(), role: 'patient', createdAt: now });
        await setDoc(doc(db, 'patients', result.user.uid), { patientId: result.user.uid, userId: result.user.uid, name: form.name.trim(), createdAt: now, updatedAt: now });
        await addDoc(collection(db, 'audit_logs'), { userId: result.user.uid, action: 'profile.updated', patientId: result.user.uid, timestamp: now });
        navigate('/patient/dashboard', { replace: true });
      } else { await signInWithEmailAndPassword(auth, form.email.trim(), form.password); }
    } catch (err) { setError(friendlyError(err)); }
    finally { setBusy(false); }
  };
  if (!firebaseConfigured) return <SetupScreen />;
  return <main className="auth-layout">
    <section className="auth-story"><div className="auth-brand"><span className="brand-mark">✚</span><span>care<span>cloud</span></span></div><div className="story-copy"><span className="eyebrow light">CLOUD HEALTH WORKSPACE</span><h1>One secure place for your health records.</h1><p>Keep your health information organized and share it with a doctor when you choose. Structured AI results are for decision support only.</p><div className="story-points"><div><span>01</span><strong>Private by default</strong><small>Your records are visible to you and only the doctors you authorize.</small></div><div><span>02</span><strong>Cloud managed</strong><small>Reports and structured records live in your Firebase project.</small></div><div><span>03</span><strong>Doctor reviewed</strong><small>AI is a learning aid, never a final diagnosis.</small></div></div></div><small className="story-foot">Educational project · Do not enter real patient information</small></section>
    <section className="auth-panel"><div className="auth-card"><div className="mobile-brand auth-brand"><span className="brand-mark">✚</span><span>care<span>cloud</span></span></div><div className="section-icon">{mode === 'forgot' ? '↗' : '♡'}</div><span className="eyebrow">SECURE HEALTHCARE ACCESS</span><h2>{titles[mode]}</h2><p className="muted">{mode === 'register' ? 'Get started with a private patient workspace.' : mode === 'forgot' ? 'We will send a reset link to your email.' : 'Sign in to continue to your dashboard.'}</p>
      {error && <div className="notice danger" role="alert">{error}</div>}{message && <div className="notice success" role="status">{message}</div>}
      <form onSubmit={submit} className="stack-form">{mode === 'register' && <Field label="Full name" required value={form.name} onChange={(v) => setForm({ ...form, name: v })} autoComplete="name" />}<Field label="Email address" type="email" required value={form.email} onChange={(v) => setForm({ ...form, email: v })} autoComplete="email" />{mode !== 'forgot' && <Field label="Password" type="password" required minLength={6} value={form.password} onChange={(v) => setForm({ ...form, password: v })} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />}{mode === 'login' && <div className="form-trailing"><Link to="/forgot-password">Forgot password?</Link></div>}<button disabled={busy} className="button primary full">{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send reset link'}</button></form>
      {mode === 'login' ? <p className="auth-switch">New to CareCloud? <Link to="/register">Create an account</Link></p> : <p className="auth-switch"><Link to="/login">← Back to sign in</Link></p>}
      <p className="auth-footnote">Medical information is sensitive. Use synthetic data for this academic demonstration.</p>
    </div></section>
  </main>;
}

function Field({ label, value, onChange, type = 'text', required = false, min, max, minLength, autoComplete, placeholder, disabled }) {
  return <label className="field"><span>{label}{required && <b aria-hidden="true"> *</b>}</span><input type={type} value={value ?? ''} required={required} min={min} max={max} minLength={minLength} autoComplete={autoComplete} placeholder={placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value)} /></label>;
}
function SelectField({ label, value, onChange, options, required = false }) {
  return <label className="field"><span>{label}{required && <b aria-hidden="true"> *</b>}</span><select value={value ?? ''} required={required} onChange={(e) => onChange(e.target.value)}><option value="">Select…</option>{options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}</select></label>;
}
function TextArea({ label, value, onChange, placeholder = '', rows = 3 }) {
  return <label className="field"><span>{label}</span><textarea rows={rows} maxLength={4000} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /></label>;
}

function Shell({ title, subtitle, nav, active, children }) {
  const { user, profile } = useAuth(); const location = useLocation(); const navigate = useNavigate();
  return <div className="app-shell"><aside className="sidebar"><Link className="side-brand auth-brand" to={`/${profile?.role}/dashboard`}><span className="brand-mark">✚</span><span>care<span>cloud</span></span></Link><span className="side-label">WORKSPACE</span><nav className="side-nav">{nav.map((item) => <Link key={item.path} className={`nav-link ${active === item.key ? 'selected' : ''}`} to={item.path}><span className="nav-symbol">{item.icon}</span>{item.name}</Link>)}</nav><div className="side-note"><span className="shield">✓</span><span><strong>Private sharing</strong><small>Doctors see records only after authorization.</small></span></div><button className="signout" onClick={() => signOut(auth)}><span>↪</span> Sign out</button></aside><main className="workspace"><header className="topbar"><div className="breadcrumbs"><span>{profile?.role}</span><span>/</span><strong>{title}</strong></div><div className="account-pill"><span className="avatar">{(profile?.name || user?.email || 'U').slice(0, 1).toUpperCase()}</span><span><strong>{profile?.name || user?.email}</strong><small>{profile?.role}</small></span></div></header><div className="page-content"><div className="page-heading"><div><span className="eyebrow">{profile?.role?.toUpperCase()} WORKSPACE</span><h1>{title}</h1><p>{subtitle}</p></div>{active === 'overview' && <span className="live-tag"><i /> Connected workspace</span>}</div>{children}<footer className="page-footer">CareCloud · Academic decision-support demo · <span>AI output is not a medical diagnosis.</span></footer></div></main></div>;
}

const patientNav = [
  { name: 'Overview', path: '/patient/dashboard', key: 'overview', icon: '⌂' },
  { name: 'My health record', path: '/patient/records', key: 'records', icon: '▤' },
  { name: 'Reports', path: '/patient/reports', key: 'reports', icon: '▧' },
  { name: 'AI prediction', path: '/patient/prediction', key: 'prediction', icon: '⌁' },
  { name: 'Doctor access', path: '/patient/access', key: 'access', icon: '♧' },
];
const doctorNav = [
  { name: 'Overview', path: '/doctor/dashboard', key: 'overview', icon: '⌂' },
  { name: 'Authorized patients', path: '/doctor/patients', key: 'patients', icon: '♙' },
];
const adminNav = [
  { name: 'Overview', path: '/admin/dashboard', key: 'overview', icon: '⌂' },
  { name: 'Users & roles', path: '/admin/users', key: 'users', icon: '♙' },
  { name: 'Activity log', path: '/admin/activity', key: 'activity', icon: '◷' },
];

function PatientDashboard() {
  const location = useLocation(); const key = patientNav.find((item) => item.path === location.pathname)?.key || 'overview';
  const { user, profile } = useAuth(); const [data, setData] = useState({ patient: null, records: [], reports: [], predictions: [], doctors: [], access: [] });
  const [busy, setBusy] = useState(true); const [error, setError] = useState(''); const [refresh, setRefresh] = useState(0);
  const load = async () => {
    setBusy(true); setError('');
    try {
      const uid = user.uid;
      const [patientSnap, recordsSnap, reportsSnap, predictionsSnap, doctorsSnap, accessSnap] = await Promise.all([
        getDoc(doc(db, 'patients', uid)),
        getDocs(query(collection(db, 'medical_records'), where('patientId', '==', uid), orderBy('createdAt', 'desc'), limit(100))),
        getDocs(query(collection(db, 'lab_reports'), where('patientId', '==', uid), orderBy('uploadedAt', 'desc'), limit(100))),
        getDocs(query(collection(db, 'predictions'), where('patientId', '==', uid), orderBy('predictionTimestamp', 'desc'), limit(100))),
        getDocs(query(collection(db, 'doctor_access'), where('patientId', '==', uid))),
        getDocs(collection(db, 'doctors')),
      ]);
      setData({ patient: patientSnap.data() || {}, records: recordsSnap.docs.map((d) => ({ id: d.id, ...d.data() })), reports: reportsSnap.docs.map((d) => ({ id: d.id, ...d.data() })), predictions: predictionsSnap.docs.map((d) => ({ id: d.id, ...d.data() })), access: doctorsSnap.docs.map((d) => ({ id: d.id, ...d.data() })), doctors: accessSnap.docs.map((d) => ({ id: d.id, ...d.data() })) });
    } catch (err) { setError(friendlyError(err)); }
    finally { setBusy(false); }
  };
  useEffect(() => { load(); }, [user.uid, refresh]);
  const refreshData = () => setRefresh((x) => x + 1);
  return <Shell nav={patientNav} active={key} title={patientNav.find((n) => n.key === key)?.name || 'Overview'} subtitle="Your records and cloud health information in one secure place.">
    {error && <div className="notice danger" role="alert">{error}<button className="button quiet" onClick={load}>Retry</button></div>}
    {busy ? <Loading /> : <PatientPanel section={key} data={data} refresh={refreshData} profile={profile} user={user} />}
  </Shell>;
}

function PatientPanel({ section, data, refresh, profile, user }) {
  const [flash, setFlash] = useState('');
  const latest = data.predictions[0];
  if (section === 'overview') return <>
    <div className="welcome-strip"><div><span className="eyebrow light">YOUR PRIVATE HEALTH SPACE</span><h2>Good day, {profile.name?.split(' ')[0] || 'there'}.</h2><p>Keep your information current, and share it with your doctor when you are ready.</p></div><Link className="button white" to="/patient/records">Update health record <span>→</span></Link><span className="welcome-art">✚</span></div>
    {flash && <div className="notice success">{flash}</div>}
    <div className="metric-grid"><Metric icon="▤" label="Health records" value={data.records.length} detail="Saved to your profile"/><Metric icon="▧" label="Medical reports" value={data.reports.length} detail="Securely stored"/><Metric icon="⌁" label="Predictions" value={data.predictions.length} detail="Model history"/><Metric icon="♧" label="Doctor access" value={data.doctors.filter((x) => x.status === 'active').length} detail="Active sharing"/></div>
    <div className="content-grid overview-grid"><section className="card panel-card"><PanelTitle title="Latest AI result" subtitle="Structured heart disease model output" action={<Link to="/patient/prediction" className="text-link">New prediction →</Link>}/>{latest ? <PredictionResult item={latest}/> : <Empty icon="⌁" text="No prediction history yet." action={<Link className="button primary small" to="/patient/prediction">Enter clinical inputs</Link>}/>}</section><section className="card panel-card"><PanelTitle title="Recent reports" subtitle="Uploaded medical documents" action={<Link to="/patient/reports" className="text-link">View all →</Link>}/>{data.reports.length ? <ReportList reports={data.reports.slice(0, 4)} patientId={user.uid} refresh={refresh}/> : <Empty icon="▧" text="No health data available yet."/>}</section></div>
    <div className="content-grid"><section className="card panel-card"><PanelTitle title="Prediction history" subtitle="Your model results over time"/>{data.predictions.length ? <div className="chart-box"><Line data={predictionChart(data.predictions)} options={chartOptions}/></div> : <Empty icon="⌁" text="No prediction history yet."/>}</section><section className="card panel-card"><PanelTitle title="Health record" subtitle="Profile and recent symptoms" action={<div className="panel-actions"><button className="text-button" onClick={() => downloadPatientSummary(data, profile)}>Download summary</button><Link to="/patient/records" className="text-link">Edit →</Link></div>}/>{data.patient?.medicalHistory || data.patient?.symptoms ? <div className="record-preview"><Info label="Symptoms" value={data.patient?.symptoms}/><Info label="Medical history" value={data.patient?.medicalHistory}/><Info label="Last updated" value={formatDate(data.patient?.updatedAt)}/></div> : <Empty icon="♡" text="No health data available yet." action={<Link className="text-link" to="/patient/records">Add your first record →</Link>}/>}</section></div>
    <div className="content-grid"><section className="card panel-card"><PanelTitle title="Cholesterol trend" subtitle="Recorded values · mg/dL"/>{healthChart(data.records) ? <div className="chart-box"><Line data={healthChart(data.records)} options={chartOptions}/></div> : <Empty icon="⌁" text="No health measurements available yet."/>}</section><section className="card panel-card"><PanelTitle title="Report uploads" subtitle="Documents added by month"/>{data.reports.length ? <div className="chart-box"><Bar data={reportChart(data.reports)} options={{...chartOptions, plugins:{...chartOptions.plugins,legend:{display:false}}}}/></div> : <Empty icon="▧" text="No report uploads yet."/>}</section></div>
  </>;
  if (section === 'records') return <RecordEditor patient={data.patient || {}} user={user} refresh={refresh}/>;
  if (section === 'reports') return <ReportsPanel reports={data.reports} patientId={user.uid} refresh={refresh}/>;
  if (section === 'prediction') return <PredictionPanel user={user} patient={data.patient} predictions={data.predictions} refresh={refresh}/>;
  if (section === 'access') return <AccessPanel patient={data.patient} doctors={data.access} access={data.doctors} user={user} refresh={refresh}/>;
  return null;
}

function RecordEditor({ patient, user, refresh }) {
  const [form, setForm] = useState({ name: patient.name || '', age: patient.age ?? '', gender: patient.gender || '', phone: patient.phone || '', symptoms: patient.symptoms || '', medicalHistory: patient.medicalHistory || '', familyHistory: patient.familyHistory || '', allergies: patient.allergies || '', medications: patient.medications || '', bloodPressure: patient.vitalSigns?.bloodPressure || '', heartRate: patient.vitalSigns?.heartRate ?? '', temperature: patient.vitalSigns?.temperature ?? '', bloodSugar: patient.vitalSigns?.bloodSugar ?? '', cholesterol: patient.vitalSigns?.cholesterol ?? '', weight: patient.vitalSigns?.weight ?? '', height: patient.vitalSigns?.height ?? '' });
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState(''); const [error, setError] = useState('');
  const change = (key) => (value) => setForm((old) => ({ ...old, [key]: value }));
  const save = async (e) => { e.preventDefault(); setBusy(true); setError(''); setNotice(''); try {
    const age = form.age === '' ? null : Number(form.age); if (age !== null && (!Number.isInteger(age) || age < 0 || age > 120)) throw new Error('Age must be a whole number between 0 and 120.');
    const vitalSigns = Object.fromEntries(Object.entries({ bloodPressure: form.bloodPressure, heartRate: form.heartRate, temperature: form.temperature, bloodSugar: form.bloodSugar, cholesterol: form.cholesterol, weight: form.weight, height: form.height }).filter(([, v]) => v !== '').map(([k, v]) => [k, ['bloodPressure'].includes(k) ? v : Number(v)]));
    const patientDoc = { patientId: user.uid, userId: user.uid, name: form.name.trim(), age, gender: form.gender || null, phone: form.phone.trim(), symptoms: form.symptoms.trim(), medicalHistory: form.medicalHistory.trim(), familyHistory: form.familyHistory.trim(), allergies: form.allergies.trim(), medications: form.medications.trim(), vitalSigns, updatedAt: serverTimestamp() };
    if (!patientDoc.name) throw new Error('Name is required.');
    await setDoc(doc(db, 'patients', user.uid), { ...patientDoc, createdAt: patient.createdAt || serverTimestamp() }, { merge: true });
    await setDoc(doc(db, 'users', user.uid), { name: patientDoc.name }, { merge: true });
    await addDoc(collection(db, 'medical_records'), { patientId: user.uid, symptoms: patientDoc.symptoms, medicalHistory: patientDoc.medicalHistory, familyHistory: patientDoc.familyHistory, allergies: patientDoc.allergies, medications: patientDoc.medications, vitalSigns, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    await addDoc(collection(db, 'audit_logs'), { userId: user.uid, action: 'record.created', patientId: user.uid, timestamp: serverTimestamp() });
    setNotice('Your health record has been saved.'); refresh();
  } catch (err) { setError(friendlyError(err)); } finally { setBusy(false); } };
  return <section className="card form-card"><PanelTitle title="My health record" subtitle="Enter structured information and update it whenever something changes."/><Notice error={error} success={notice}/><form onSubmit={save} className="stack-form"><h3>Profile information</h3><div className="form-grid"><Field label="Full name" value={form.name} onChange={change('name')} required/><Field label="Age" type="number" min="0" max="120" value={form.age} onChange={change('age')}/><SelectField label="Gender" value={form.gender} onChange={change('gender')} options={['female','male','non-binary','prefer-not-to-say'].map((x) => [x, x.replaceAll('-', ' ')])}/><Field label="Phone" type="tel" value={form.phone} onChange={change('phone')}/></div><h3>Medical history</h3><div className="form-grid"><TextArea label="Symptoms" value={form.symptoms} onChange={change('symptoms')} placeholder="Describe symptoms and when they started"/><TextArea label="Medical history" value={form.medicalHistory} onChange={change('medicalHistory')}/><TextArea label="Family history" value={form.familyHistory} onChange={change('familyHistory')}/><TextArea label="Allergies" value={form.allergies} onChange={change('allergies')}/><TextArea label="Current medications" value={form.medications} onChange={change('medications')}/></div><h3>Clinical measurements</h3><p className="muted compact">Optional · Use values from a qualified clinician or your report. This form does not interpret measurements.</p><div className="form-grid"><Field label="Blood pressure" placeholder="120/80 mmHg" value={form.bloodPressure} onChange={change('bloodPressure')}/><Field label="Heart rate (bpm)" type="number" min="20" max="300" value={form.heartRate} onChange={change('heartRate')}/><Field label="Temperature (°C)" type="number" min="25" max="45" value={form.temperature} onChange={change('temperature')}/><Field label="Blood sugar (mg/dL)" type="number" min="1" max="2000" value={form.bloodSugar} onChange={change('bloodSugar')}/><Field label="Cholesterol (mg/dL)" type="number" min="1" max="2000" value={form.cholesterol} onChange={change('cholesterol')}/><Field label="Weight (kg)" type="number" min="1" max="500" value={form.weight} onChange={change('weight')}/><Field label="Height (cm)" type="number" min="30" max="260" value={form.height} onChange={change('height')}/></div><div className="form-actions"><button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save health record'}</button></div></form></section>;
}

function ReportsPanel({ reports, patientId, refresh }) {
  const [type, setType] = useState('Laboratory report'); const [description, setDescription] = useState(''); const [file, setFile] = useState(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const upload = async (e) => { e.preventDefault(); setError(''); setNotice(''); if (!file) { setError('Choose a PDF or image to upload.'); return; } if (!['application/pdf','image/jpeg','image/png'].includes(file.type)) { setError('Choose a PDF, JPG, or PNG file.'); return; } if (file.size >= 10 * 1024 * 1024) { setError('The file must be smaller than 10 MB.'); return; }
    setBusy(true); try { const reportId = crypto.randomUUID(); const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-160); const path = `patients/${patientId}/${reportId}-${safeName}`; await uploadBytes(ref(storage, path), file, { contentType: file.type, customMetadata: { patientId, reportId } }); await setDoc(doc(db, 'lab_reports', reportId), { reportId, patientId, fileName: file.name.slice(0, 180), fileType: file.type, storagePath: path, description: description.trim(), reportType: type, uploadedAt: serverTimestamp(), uploadedBy: patientId }); await addDoc(collection(db, 'audit_logs'), { userId: patientId, action: 'report.uploaded', patientId, timestamp: serverTimestamp() }); setFile(null); setDescription(''); e.target.reset(); setNotice('Report securely uploaded.'); refresh(); }
    catch (err) { setError(friendlyError(err)); } finally { setBusy(false); } };
  return <div className="reports-layout"><section className="card form-card"><PanelTitle title="Upload a medical report" subtitle="PDF, JPG, or PNG · Maximum 10 MB"/><Notice error={error} success={notice}/><form onSubmit={upload} className="stack-form"><SelectField label="Report type" value={type} onChange={setType} options={['Laboratory report','Prescription','Medical document','Imaging report','Other'].map((x) => [x,x])}/><TextArea label="Description (optional)" value={description} onChange={setDescription} placeholder="Add a short description" rows={2}/><label className="upload-drop"><span className="upload-icon">↑</span><strong>{file?.name || 'Choose a document'}</strong><small>PDF, JPG or PNG, under 10 MB</small><input type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] || null)}/></label><button className="button primary" disabled={busy}>{busy ? 'Uploading securely…' : 'Upload report'}</button></form></section><section className="card panel-card report-table-card"><PanelTitle title="My reports" subtitle={`${reports.length} document${reports.length === 1 ? '' : 's'}`}/>{reports.length ? <ReportList reports={reports} patientId={patientId} refresh={refresh}/> : <Empty icon="▧" text="No health data available yet."/>}</section></div>;
}

function ReportList({ reports, patientId, refresh }) {
  const [busyId, setBusyId] = useState(''); const [error, setError] = useState('');
  const openReport = async (item, download = false) => { const preview = download ? null : window.open('about:blank', '_blank'); setBusyId(item.id); setError(''); try { const token = await auth.currentUser.getIdToken(); const mode = download ? 'attachment' : 'inline'; const response = await axios.get(`${API_URL}/api/reports/${encodeURIComponent(item.id)}/download?disposition=${mode}`, { headers: { Authorization: `Bearer ${token}` }, responseType: 'blob' }); const url = URL.createObjectURL(response.data); if (download) { const a = document.createElement('a'); a.href = url; a.download = item.fileName || 'medical-report'; a.click(); } else if (preview) { preview.location.href = url; } setTimeout(() => URL.revokeObjectURL(url), 60_000); } catch (err) { preview?.close(); setError(friendlyError(err)); } finally { setBusyId(''); } };
  const remove = async (item) => { if (!window.confirm(`Delete ${item.fileName}?`)) return; setBusyId(item.id); setError(''); try { await deleteObject(ref(storage, item.storagePath)); await deleteDoc(doc(db, 'lab_reports', item.id)); refresh(); } catch (err) { setError(friendlyError(err)); } finally { setBusyId(''); } };
  return <div>{error && <div className="notice danger">{error}</div>}<div className="report-list">{reports.map((item) => <div className="report-row" key={item.id}><div className="file-badge">{item.fileType === 'application/pdf' ? 'PDF' : 'IMG'}</div><div className="report-info"><strong>{item.fileName}</strong><span>{item.reportType || 'Medical document'} · {formatDate(item.uploadedAt)}</span>{item.description && <small>{item.description}</small>}</div><div className="report-actions"><button className="icon-button" title="View report" disabled={busyId === item.id} onClick={() => openReport(item)}>↗</button><button className="icon-button" title="Download report" disabled={busyId === item.id} onClick={() => openReport(item, true)}>↓</button>{patientId === auth.currentUser?.uid && <button className="icon-button danger-text" title="Delete report" disabled={busyId === item.id} onClick={() => remove(item)}>×</button>}</div></div>)}</div></div>;
}

const predictionFields = [
  ['age','Age (years)','number',18,120], ['sex','Sex in dataset',[[0,'Female (0)'],[1,'Male (1)']]],
  ['cp','Chest pain type',[[0,'Type 0'],[1,'Type 1'],[2,'Type 2'],[3,'Type 3']]], ['trestbps','Resting blood pressure (mmHg)','number',60,280],
  ['chol','Cholesterol (mg/dL)','number',80,800], ['fbs','Fasting blood sugar > 120 mg/dL',[[0,'No'],[1,'Yes']]],
  ['restecg','Resting ECG category',[[0,'Category 0'],[1,'Category 1'],[2,'Category 2']]], ['thalach','Maximum heart rate (bpm)','number',40,260],
  ['exang','Exercise induced angina',[[0,'No'],[1,'Yes']]], ['oldpeak','ST depression','number',0,15],
  ['slope','ST slope category',[[0,'Category 0'],[1,'Category 1'],[2,'Category 2']]], ['ca','Major vessels (0–3)',[[0,'0'],[1,'1'],[2,'2'],[3,'3']]],
  ['thal','Thalassemia category',[[0,'Category 0'],[1,'Category 1'],[2,'Category 2'],[3,'Category 3']]],
];
function PredictionPanel({ user, patient, predictions, refresh }) {
  const init = { age: patient?.age || '', sex: '', cp: '', trestbps: '', chol: '', fbs: '', restecg: '', thalach: '', exang: '', oldpeak: '', slope: '', ca: '', thal: '' };
  const [form, setForm] = useState(init); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [result, setResult] = useState(null);
  const change = (key) => (value) => setForm((old) => ({ ...old, [key]: value }));
  const submit = async (e) => { e.preventDefault(); setBusy(true); setError(''); setResult(null); try { const token = await user.getIdToken(); const inputs = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, Number(v)])); const response = await axios.post(`${API_URL}/api/predict`, { ...inputs, patientId: user.uid }, { headers: { Authorization: `Bearer ${token}` } }); setResult(response.data); refresh(); } catch (err) { setError(friendlyError(err)); } finally { setBusy(false); } };
  return <div className="prediction-page"><section className="card form-card prediction-form-card"><div className="model-banner"><span className="model-icon">⌁</span><div><span className="eyebrow">EDUCATIONAL MODEL</span><strong>Heart disease decision support</strong><small>13 structured inputs · Logistic Regression · UCI dataset</small></div></div><div className="notice warning"><strong>Before you continue:</strong> this model is limited to a public research dataset and does not diagnose disease. It does not analyze uploaded documents. A qualified clinician must interpret health information.</div><Notice error={error}/><form onSubmit={submit} className="stack-form"><div className="form-grid prediction-input-grid">{predictionFields.map(([key, label, type, min, max]) => type === 'number' ? <Field key={key} label={label} type="number" required min={min} max={max} step={key === 'oldpeak' ? '0.1' : '1'} value={form[key]} onChange={change(key)}/> : <SelectField key={key} label={label} required value={form[key]} onChange={change(key)} options={type}/>)}</div><button className="button primary" disabled={busy}>{busy ? 'Analyzing structured inputs…' : 'Run AI prediction'}</button></form></section><div className="prediction-side"><section className="card panel-card">{result ? <PredictionResult item={result}/> : <Empty icon="⌁" text="Your prediction result will appear here."/>}</section><section className="card panel-card"><PanelTitle title="Prediction history" subtitle="Most recent first"/>{predictions.length ? <div className="compact-list">{predictions.slice(0, 8).map((item) => <PredictionRow key={item.id} item={item}/>)}</div> : <Empty icon="◷" text="No prediction history yet."/>}</section></div></div>;
}

function PredictionResult({ item }) {
  return <div className="result-block"><div className="result-head"><span className={`risk-mark ${String(item.riskLevel || '').toLowerCase().includes('elevated') ? 'risk-high' : 'risk-low'}`}>⌁</span><div><span className="eyebrow">MODEL OUTPUT</span><h3>{item.predictionLabel || item.predictedDisease || item.prediction}</h3><small>{item.riskLevel || 'Class output'} · {formatDate(item.predictionTimestamp || item.timestamp)}</small></div></div><div className="result-details"><Info label="Predicted class" value={item.predictedDisease || item.prediction}/><Info label="Model" value={item.modelName || item.modelName || item.model}/></div><p className="disclaimer">{DISCLAIMER}</p></div>;
}
function PredictionRow({ item }) { return <div className="mini-row"><span className="mini-dot"/><span><strong>{item.predictionLabel || item.predictedDisease || item.prediction}</strong><small>{formatDate(item.predictionTimestamp || item.timestamp)}</small></span><b className={String(item.riskLevel || '').toLowerCase().includes('elevated') ? 'risk-text-high' : 'risk-text-low'}>{item.riskLevel || '—'}</b></div>; }

function AccessPanel({ patient, doctors, access, user, refresh }) {
  const [doctorId, setDoctorId] = useState(''); const [busyId, setBusyId] = useState(''); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const grant = async (e) => { e.preventDefault(); setError(''); setNotice(''); if (!doctorId) { setError('Select a doctor first.'); return; } setBusyId(doctorId); try { const accessId = `${user.uid}_${doctorId}`; await setDoc(doc(db, 'doctor_access', accessId), { accessId, patientId: user.uid, doctorId, status: 'active', grantedAt: serverTimestamp() }); await addDoc(collection(db, 'audit_logs'), { userId: user.uid, action: 'access.granted', patientId: user.uid, timestamp: serverTimestamp() }); setNotice('Doctor access granted.'); refresh(); } catch (err) { setError(friendlyError(err)); } finally { setBusyId(''); } };
  const revoke = async (entry) => { setBusyId(entry.id); setError(''); try { await updateDoc(doc(db, 'doctor_access', entry.id), { status: 'revoked', revokedAt: serverTimestamp() }); await addDoc(collection(db, 'audit_logs'), { userId: user.uid, action: 'access.revoked', patientId: user.uid, timestamp: serverTimestamp() }); refresh(); } catch (err) { setError(friendlyError(err)); } finally { setBusyId(''); } };
  const activeIds = new Set(access.filter((item) => item.status === 'active').map((item) => item.doctorId));
  return <div className="access-layout"><section className="card form-card"><PanelTitle title="Grant doctor access" subtitle="Only doctors listed here can view your records and reports."/><Notice error={error} success={notice}/>{doctors.length ? <form onSubmit={grant} className="stack-form"><SelectField label="Choose a doctor" value={doctorId} onChange={setDoctorId} options={doctors.map((d) => [d.id, `${d.name} · ${d.specialization || 'Doctor'}`])}/><button className="button primary" disabled={busyId !== '' || !doctorId}>{busyId ? 'Saving…' : 'Grant access'}</button></form> : <Empty icon="♧" text="No doctor profiles are available yet. Ask your administrator to add a doctor account."/>}<p className="muted compact">Access can be revoked at any time. Revocation blocks subsequent reads and report downloads.</p></section><section className="card panel-card"><PanelTitle title="Sharing status" subtitle="You control every active permission."/>{access.length ? <div className="access-list">{access.map((entry) => { const doctor = doctors.find((d) => d.id === entry.doctorId); return <div key={entry.id} className="access-row"><span className="doctor-avatar">{(doctor?.name || 'D').slice(0,1)}</span><div><strong>{doctor?.name || 'Doctor account'}</strong><small>{doctor?.specialization || 'Specialization not listed'} · {entry.status === 'active' ? 'Access active' : 'Access revoked'}</small></div>{entry.status === 'active' ? <button className="button outline danger-outline small" disabled={busyId === entry.id} onClick={() => revoke(entry)}>{busyId === entry.id ? 'Saving…' : 'Revoke access'}</button> : <span className="status-chip muted-chip">Revoked</span>}</div>; })}</div> : <Empty icon="♧" text="You have not shared your health record with a doctor."/>}</section></div>;
}

function DoctorDashboard() {
  const location = useLocation(); const { user, profile } = useAuth(); const [accessList, setAccessList] = useState([]); const [patients, setPatients] = useState([]); const [activeId, setActiveId] = useState(''); const [patientData, setPatientData] = useState(null); const [search, setSearch] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [refresh, setRefresh] = useState(0);
  useEffect(() => { (async () => { setLoading(true); setError(''); try {
    const shared = await getDocs(query(collection(db, 'doctor_access'), where('doctorId', '==', user.uid), where('status', '==', 'active')));
    const list = await Promise.all(shared.docs.map(async (snap) => { const entry = snap.data(); const patient = await getDoc(doc(db, 'patients', entry.patientId)); return patient.exists() ? { id: entry.patientId, ...patient.data() } : null; }));
    const valid = list.filter(Boolean); setAccessList(shared.docs.map((d) => d.data())); setPatients(valid);
    if (!activeId || !valid.some((p) => p.id === activeId)) setActiveId(valid[0]?.id || '');
  } catch (err) { setError(friendlyError(err)); } finally { setLoading(false); } })(); }, [user.uid, refresh]);
  useEffect(() => { if (!activeId) { setPatientData(null); return; } (async () => { try {
    const [records, reports, predictions] = await Promise.all([
      getDocs(query(collection(db, 'medical_records'), where('patientId', '==', activeId), orderBy('createdAt', 'desc'), limit(100))),
      getDocs(query(collection(db, 'lab_reports'), where('patientId', '==', activeId), orderBy('uploadedAt', 'desc'), limit(100))),
      getDocs(query(collection(db, 'predictions'), where('patientId', '==', activeId), orderBy('predictionTimestamp', 'desc'), limit(100))),
    ]);
    setPatientData({ records: records.docs.map((d) => ({ id: d.id, ...d.data() })), reports: reports.docs.map((d) => ({ id: d.id, ...d.data() })), predictions: predictions.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (err) { setError(friendlyError(err)); setPatientData(null); } })(); }, [activeId, refresh]);
  const page = doctorNav.find((item) => item.path === location.pathname)?.key || 'overview';
  const visiblePatients = patients.filter((p) => `${p.name || ''} ${p.phone || ''}`.toLowerCase().includes(search.toLowerCase()));
  return <Shell nav={doctorNav} active={page} title={page === 'overview' ? 'Overview' : 'Authorized patients'} subtitle="Review only records patients have shared with your account.">
    {error && <div className="notice danger">{error}<button className="button quiet" onClick={() => setRefresh((x) => x + 1)}>Retry</button></div>}
    {loading ? <Loading/> : <div className="doctor-layout"><section className="card patient-selector"><PanelTitle title="Shared with me" subtitle={`${patients.length} authorized patient${patients.length === 1 ? '' : 's'}`}/><label className="search-box"><span>⌕</span><input placeholder="Search authorized patients" value={search} onChange={(e) => setSearch(e.target.value)}/></label>{visiblePatients.length ? visiblePatients.map((p) => <button key={p.id} className={`patient-choice ${activeId === p.id ? 'active' : ''}`} onClick={() => setActiveId(p.id)}><span className="avatar">{(p.name || 'P').slice(0,1).toUpperCase()}</span><span><strong>{p.name || 'Patient'}</strong><small>{p.age ? `${p.age} years` : 'Age not provided'} · Shared record</small></span><b>→</b></button>) : <Empty icon="♙" text={patients.length ? 'No matching patients.' : 'No patients have granted access to your account.'}/>}</section><section className="doctor-patient-content">{patientData && activeId ? <DoctorPatient patient={patients.find((p) => p.id === activeId)} data={patientData} doctor={user} refresh={() => setRefresh((x) => x + 1)}/> : <div className="card panel-card"><Empty icon="♙" text="Select an authorized patient to review shared records."/></div>}</section></div>}
  </Shell>;
}

function DoctorPatient({ patient, data, doctor, refresh }) {
  const [note, setNote] = useState(''); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const addNote = async (e) => { e.preventDefault(); if (!note.trim()) return; setBusy(true); setError(''); try { await addDoc(collection(db, 'medical_records'), { patientId: patient.id, kind: 'clinical_note', note: note.trim().slice(0,4000), authorId: doctor.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }); setNote(''); setNotice('Clinical note saved.'); refresh(); } catch (err) { setError(friendlyError(err)); } finally { setBusy(false); } };
  const records = data.records.filter((r) => r.kind !== 'clinical_note'); const notes = data.records.filter((r) => r.kind === 'clinical_note'); const latest = data.predictions[0];
  return <div className="patient-detail"><section className="card patient-profile-card"><div className="patient-profile-heading"><span className="avatar large">{(patient.name || 'P').slice(0,1).toUpperCase()}</span><div><span className="eyebrow">AUTHORIZED PATIENT</span><h2>{patient.name || 'Patient'}</h2><p>{patient.age ? `${patient.age} years` : 'Age not provided'} · {patient.gender || 'Gender not provided'}</p></div><span className="status-chip">Access granted</span></div><div className="patient-facts"><Info label="Phone" value={patient.phone}/><Info label="Symptoms" value={patient.symptoms}/><Info label="Medical history" value={patient.medicalHistory}/><Info label="Family history" value={patient.familyHistory}/><Info label="Allergies" value={patient.allergies}/><Info label="Current medications" value={patient.medications}/></div></section>
    <div className="metric-grid doctor-metrics"><Metric icon="▤" label="Medical records" value={records.length} detail="Patient-shared"/><Metric icon="▧" label="Reports" value={data.reports.length} detail="Patient-shared"/><Metric icon="⌁" label="Predictions" value={data.predictions.length} detail="Decision support"/><Metric icon="◷" label="Latest update" value={formatDate(patient.updatedAt, true)} detail="Profile"/></div>
    <div className="content-grid"><section className="card panel-card"><PanelTitle title="Latest prediction" subtitle="Review alongside the full patient history"/>{latest ? <PredictionResult item={latest}/> : <Empty icon="⌁" text="No prediction history available."/>}</section><section className="card panel-card"><PanelTitle title="Shared reports" subtitle="Patient-uploaded documents"/>{data.reports.length ? <ReportList reports={data.reports} patientId={patient.id} refresh={refresh}/> : <Empty icon="▧" text="No reports have been shared."/>}</section></div>
    <div className="content-grid"><section className="card panel-card"><PanelTitle title="Medical record history" subtitle="Patient-entered health information"/>{records.length ? records.map((r) => <article className="record-history" key={r.id}><span>{formatDate(r.createdAt)}</span><strong>{r.symptoms || 'Health record updated'}</strong><p>{r.medicalHistory || 'No additional history in this update.'}</p><small>Vitals: {Object.entries(r.vitalSigns || {}).map(([k,v]) => `${humanize(k)} ${v}`).join(' · ') || 'Not recorded'}</small></article>) : <Empty icon="▤" text="No health data available yet."/>}</section><section className="card panel-card"><PanelTitle title="Clinical notes" subtitle="Notes are visible to the patient and authorized doctors."/>{error && <div className="notice danger">{error}</div>}{notice && <div className="notice success">{notice}</div>}<form onSubmit={addNote} className="stack-form"><TextArea label="Add a clinical note" value={note} onChange={setNote} placeholder="Write a factual note for the patient's record…"/><button className="button primary" disabled={busy || !note.trim()}>{busy ? 'Saving…' : 'Add note'}</button></form>{notes.map((n) => <article key={n.id} className="note-item"><p>{n.note}</p><small>{formatDate(n.createdAt)}</small></article>)}</section></div>
    <div className="notice info">{DISCLAIMER}</div></div>;
}

function AdminDashboard() {
  const location = useLocation(); const { user } = useAuth(); const page = adminNav.find((i) => i.path === location.pathname)?.key || 'overview'; const [stats, setStats] = useState({ users: [], patients: [], doctors: [], reports: [], predictions: [], activity: [] }); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [refresh, setRefresh] = useState(0);
  useEffect(() => { (async () => { setLoading(true); setError(''); try {
    const [users, patients, doctors, reports, predictions, activity] = await Promise.all([
      getDocs(query(collection(db, 'users'), limit(500))), getDocs(query(collection(db, 'patients'), limit(500))), getDocs(query(collection(db, 'doctors'), limit(500))),
      getDocs(query(collection(db, 'lab_reports'), limit(500))), getDocs(query(collection(db, 'predictions'), limit(500))),
      getDocs(query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(100))),
    ]);
    const map = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })); setStats({ users: map(users), patients: map(patients), doctors: map(doctors), reports: map(reports), predictions: map(predictions), activity: map(activity) });
  } catch (err) { setError(friendlyError(err)); } finally { setLoading(false); } })(); }, [user.uid, refresh]);
  return <Shell nav={adminNav} active={page} title={page === 'overview' ? 'Overview' : page === 'users' ? 'Users & roles' : 'Activity log'} subtitle="Manage accounts and review real system activity.">
    {error && <div className="notice danger">{error}<button className="button quiet" onClick={() => setRefresh((x) => x + 1)}>Retry</button></div>}
    {loading ? <Loading/> : page === 'overview' ? <AdminOverview stats={stats}/> : page === 'users' ? <AdminUsers users={stats.users} refresh={() => setRefresh((x) => x + 1)}/> : <AuditTable logs={stats.activity}/>}
  </Shell>;
}
function AdminOverview({ stats }) {
  const distribution = { patient: stats.users.filter((x) => x.role === 'patient').length, doctor: stats.users.filter((x) => x.role === 'doctor').length, admin: stats.users.filter((x) => x.role === 'admin').length };
  const predictedPositive = stats.predictions.filter((p) => String(p.predictedDisease || '').includes('class 1')).length; const predictedNegative = stats.predictions.length - predictedPositive;
  return <><div className="welcome-strip admin-welcome"><div><span className="eyebrow light">SYSTEM ADMINISTRATION</span><h2>Cloud activity at a glance.</h2><p>Counts below are read from the configured Firestore project.</p></div><span className="welcome-art">✚</span></div><div className="metric-grid"><Metric icon="♙" label="Patients" value={distribution.patient} detail="Patient accounts"/><Metric icon="⚕" label="Doctors" value={distribution.doctor} detail="Doctor profiles"/><Metric icon="▧" label="Reports" value={stats.reports.length} detail="Uploaded documents"/><Metric icon="⌁" label="Predictions" value={stats.predictions.length} detail="Saved model results"/></div><div className="content-grid"><section className="card panel-card"><PanelTitle title="User roles" subtitle="Current account distribution"/>{stats.users.length ? <div className="chart-box"><Bar data={{ labels: ['Patients','Doctors','Admins'], datasets: [{ label: 'Accounts', data: [distribution.patient, distribution.doctor, distribution.admin], backgroundColor: ['#1c9c88','#4a83d3','#9372cc'], borderRadius: 8 }] }} options={{ ...chartOptions, plugins: { ...chartOptions.plugins, legend: { display: false } } }}/></div> : <Empty icon="♙" text="No users have registered."/>}</section><section className="card panel-card"><PanelTitle title="Prediction classes" subtitle="Observed model output, not clinical risk"/>{stats.predictions.length ? <div className="chart-box"><Bar data={{ labels: ['Positive class','Negative class'], datasets: [{ label: 'Stored predictions', data: [predictedPositive,predictedNegative], backgroundColor: ['#cf9361','#54a995'], borderRadius: 8 }] }} options={{ ...chartOptions, plugins: { ...chartOptions.plugins, legend: { display: false } } }}/></div> : <Empty icon="⌁" text="No prediction history yet."/>}</section></div><div className="content-grid"><section className="card panel-card"><PanelTitle title="Recent activity" subtitle="Latest audit entries" action={<Link className="text-link" to="/admin/activity">View activity →</Link>}/>{stats.activity.length ? <AuditRows logs={stats.activity.slice(0,6)}/> : <Empty icon="◷" text="No activity has been recorded."/>}</section></div></>;
}
function AdminUsers({ users, refresh }) {
  const [busyId, setBusyId] = useState(''); const [error, setError] = useState(''); const [search, setSearch] = useState('');
  const setRole = async (user, role) => { setBusyId(user.id); setError(''); try {
    if (user.id === auth.currentUser.uid && role !== 'admin') throw new Error('You cannot remove your own administrator role.');
    if (role === 'doctor') await setDoc(doc(db, 'doctors', user.id), { doctorId: user.id, userId: user.id, name: user.name, email: user.email, specialization: 'General practice', createdAt: user.createdAt || serverTimestamp() });
    else if (user.role === 'doctor') await deleteDoc(doc(db, 'doctors', user.id));
    await updateDoc(doc(db, 'users', user.id), { role }); refresh();
  } catch (err) { setError(friendlyError(err)); } finally { setBusyId(''); } };
  const visible = users.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="card panel-card"><PanelTitle title="Accounts" subtitle={`${users.length} users · New registrations are patients by default`}/>{error && <div className="notice danger">{error}</div>}<label className="search-box admin-search"><span>⌕</span><input placeholder="Search users by name or email" value={search} onChange={(e) => setSearch(e.target.value)}/></label>{visible.length ? <div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Created</th><th>Role</th><th>Manage role</th></tr></thead><tbody>{visible.map((u) => <tr key={u.id}><td><strong>{u.name || '—'}</strong></td><td>{u.email}</td><td>{formatDate(u.createdAt)}</td><td><span className={`role-badge ${u.role}`}>{u.role}</span></td><td><select aria-label={`Set role for ${u.name}`} disabled={busyId === u.id} value={u.role} onChange={(e) => setRole(u, e.target.value)}><option value="patient">Patient</option><option value="doctor">Doctor</option><option value="admin">Admin</option></select></td></tr>)}</tbody></table></div> : <Empty icon="♙" text="No matching user accounts."/>}<p className="muted compact">Doctor accounts become eligible for patient sharing after an administrator promotes them. User roles are protected by Firestore rules.</p></section>;
}
function AuditTable({ logs }) { return <section className="card panel-card"><PanelTitle title="Audit activity" subtitle="Latest account, record, upload and access changes"/>{logs.length ? <div className="table-wrap"><table><thead><tr><th>Action</th><th>User ID</th><th>Patient ID</th><th>Date</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id}><td><span className="action-badge">{humanize(log.action)}</span></td><td className="mono">{log.userId}</td><td className="mono">{log.patientId || '—'}</td><td>{formatDate(log.timestamp)}</td></tr>)}</tbody></table></div> : <Empty icon="◷" text="No activity has been recorded yet."/>}</section>; }
function AuditRows({ logs }) { return <div className="compact-list">{logs.map((log) => <div key={log.id} className="mini-row"><span className="mini-dot"/><span><strong>{humanize(log.action)}</strong><small>{formatDate(log.timestamp)}</small></span><small className="mono">{(log.userId || '').slice(0,8)}…</small></div>)}</div>; }

function Metric({ icon, label, value, detail }) { return <div className="card metric-card"><span className="metric-icon">{icon}</span><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong><small>{detail}</small></div>; }
function PanelTitle({ title, subtitle, action }) { return <div className="panel-title"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>; }
function Empty({ icon = '♡', text, action }) { return <div className="empty-state"><span className="empty-icon">{icon}</span><p>{text}</p>{action}</div>; }
function Loading() { return <div className="loading-block"><span className="spinner"/> Loading secure health data…</div>; }
function Notice({ error, success }) { return <>{error && <div className="notice danger" role="alert">{error}</div>}{success && <div className="notice success" role="status">{success}</div>}</>; }
function Info({ label, value }) { return <div className="info-row"><span>{label}</span><strong>{value || 'Not provided'}</strong></div>; }
function formatDate(value, short = false) { if (!value) return '—'; const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value); if (Number.isNaN(date.getTime())) return '—'; return new Intl.DateTimeFormat(undefined, short ? { month: 'short', day: 'numeric' } : { dateStyle: 'medium', timeStyle: 'short' }).format(date); }
function downloadPatientSummary(data, profile) {
  const pdf = new jsPDF(); const width = pdf.internal.pageSize.getWidth(); let y = 20;
  const line = (text, { heading = false } = {}) => { pdf.setFont('helvetica', heading ? 'bold' : 'normal'); pdf.setFontSize(heading ? 12 : 9); const rows = pdf.splitTextToSize(String(text || 'Not provided'), width - 32); if (y + rows.length * 5 > 275) { pdf.addPage(); y = 18; } pdf.text(rows, 16, y); y += rows.length * 5 + (heading ? 3 : 2); };
  pdf.setTextColor(18, 74, 69); line('CareCloud · Patient health summary', { heading: true });
  pdf.setTextColor(45, 61, 72); line(`Generated: ${new Date().toLocaleString()}`); line('Patient information', { heading: true });
  line(`Name: ${data.patient?.name || profile?.name}`); line(`Age: ${data.patient?.age ?? 'Not provided'}`); line(`Gender: ${data.patient?.gender || 'Not provided'}`); line(`Phone: ${data.patient?.phone || 'Not provided'}`);
  line('Medical history', { heading: true }); for (const key of ['symptoms','medicalHistory','familyHistory','allergies','medications']) line(`${humanize(key)}: ${data.patient?.[key] || 'Not provided'}`);
  line('Health measurements', { heading: true }); for (const [key, value] of Object.entries(data.patient?.vitalSigns || {})) line(`${humanize(key)}: ${value}`);
  line('Recent health records', { heading: true }); if (!data.records.length) line('No health data available yet.'); else data.records.slice(0, 10).forEach((r) => line(`${formatDate(r.createdAt)} — ${r.symptoms || r.medicalHistory || 'Record update'}`));
  line('Medical reports', { heading: true }); if (!data.reports.length) line('No reports uploaded.'); else data.reports.forEach((r) => line(`${r.fileName} · ${r.reportType || 'Report'} · ${formatDate(r.uploadedAt)}`));
  line('AI prediction history', { heading: true }); if (!data.predictions.length) line('No predictions recorded.'); else data.predictions.slice(0, 10).forEach((r) => line(`${formatDate(r.predictionTimestamp)} — ${r.predictionLabel || r.predictedDisease} (${r.riskLevel || 'class output'})`));
  if (y + 14 > 275) { pdf.addPage(); y = 18; } pdf.setTextColor(150, 70, 61); pdf.setFontSize(9); pdf.text(pdf.splitTextToSize(DISCLAIMER, width - 32), 16, y + 4);
  pdf.save('carecloud-patient-summary.pdf');
}
function humanize(value = '') { return String(value).replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }
function predictionChart(items) { const ordered = [...items].reverse(); return { labels: ordered.map((p) => formatDate(p.predictionTimestamp || p.timestamp, true)), datasets: [{ label: 'Model class', data: ordered.map((p) => String(p.predictedDisease || '').includes('class 1') ? 1 : 0), borderColor: '#178a7c', backgroundColor: 'rgba(23,138,124,.12)', fill: true, tension: .3 }] }; }
function healthChart(records) { const points = [...records].reverse().filter((r) => Number.isFinite(Number(r.vitalSigns?.cholesterol)) && r.vitalSigns?.cholesterol !== ''); if (!points.length) return null; return { labels: points.map((r) => formatDate(r.createdAt,true)), datasets: [{ label: 'Cholesterol', data: points.map((r) => Number(r.vitalSigns.cholesterol)), borderColor: '#5287c5', backgroundColor: 'rgba(82,135,197,.10)', fill: true, tension: .25 }] }; }
function reportChart(reports) { const byMonth = new Map(); for (const report of reports) { const raw = report.uploadedAt?.toDate ? report.uploadedAt.toDate() : new Date(report.uploadedAt); if (!Number.isNaN(raw.getTime())) { const key = `${raw.getFullYear()}-${raw.getMonth()}`; byMonth.set(key, (byMonth.get(key) || 0) + 1); } } const entries = [...byMonth.entries()].sort((a,b) => a[0].localeCompare(b[0])).slice(-6); return { labels: entries.map(([key]) => { const [year,month] = key.split('-').map(Number); return new Date(year,month,1).toLocaleDateString(undefined,{month:'short',year:'2-digit'}); }), datasets: [{ label: 'Reports', data: entries.map(([,count]) => count), backgroundColor: '#55a994', borderRadius: 7 }] }; }
const chartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 9, usePointStyle: true } } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } } };

export default App;
