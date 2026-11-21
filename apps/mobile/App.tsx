import { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { isSupabaseConfigured, supabase } from './lib/supabase';

type Profile = { role: 'customer' | 'walker' | 'admin'; full_name: string | null; phone: string | null };
type Dog = { id: string; name: string; breed: string | null; age_years: number | null; notes: string | null };
type Package = { id: string; walks_per_day: number; duration_minutes: number; monthly_price_inr: number };
type Subscription = { id: string; dog_id: string; walks_per_day: number; duration_minutes: number; monthly_price_inr: number; starts_on: string; ends_on: string; status: string };\ntype AssignedWalk = { id: string; scheduled_at: string; duration_minutes: number; service_address: string; customer_notes: string | null; status: string; dog: { name: string; breed: string | null } | null };

function normalizeIndianPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return '+91' + digits;
  if (digits.length === 12 && digits.startsWith('91')) return '+' + digits;
  return value.trim();
}
const money = (amount: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

export default function App() {
  const [phoneInput, setPhoneInput] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);\n  const [assignedWalks, setAssignedWalks] = useState<AssignedWalk[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [showDogForm, setShowDogForm] = useState(false);
  const [dogName, setDogName] = useState('');
  const [dogBreed, setDogBreed] = useState('');
  const [dogAge, setDogAge] = useState('');
  const [dogNotes, setDogNotes] = useState('');

  async function loadProfile(id: string) {
    if (!supabase) return;
    const { data, error: profileError } = await supabase.from('profiles')
      .select('role, full_name, phone').eq('id', id).maybeSingle();
    if (profileError || !data) {
      await supabase.auth.signOut();
      setProfile(null); setUserId('');
      setError('आपका DOJO WALK profile नहीं मिला। कृपया Admin से account जाँच करवाएँ।');
      return;
    }
    setUserId(id);
    setProfile(data as Profile);
    setPhoneInput(''); setOtp(''); setOtpSent(false); setError('');
  }

  const loadCustomerData = useCallback(async () => {
    if (!supabase || !userId || profile?.role !== 'customer') return;
    setLoadingData(true); setError('');
    const [dogResult, packageResult, subscriptionResult] = await Promise.all([
      supabase.from('dogs').select('id, name, breed, age_years, notes').eq('customer_id', userId).order('created_at', { ascending: false }),
      supabase.from('service_packages').select('id, walks_per_day, duration_minutes, monthly_price_inr').eq('active', true).order('walks_per_day'),
      supabase.from('dog_subscriptions').select('id, dog_id, walks_per_day, duration_minutes, monthly_price_inr, starts_on, ends_on, status').eq('customer_id', userId).order('created_at', { ascending: false }),
    ]);
    const failed = dogResult.error || packageResult.error || subscriptionResult.error;
    if (failed) setError('जानकारी load नहीं हुई: ' + failed.message);
    else {
      setDogs((dogResult.data ?? []) as Dog[]);
      setPackages((packageResult.data ?? []) as Package[]);
      setSubscriptions((subscriptionResult.data ?? []) as Subscription[]);
    }
    setLoadingData(false);
  }, [userId, profile?.role]);

  const loadWalkerData = useCallback(async () => {
    if (!supabase || !userId || profile?.role !== 'walker') return;
    setLoadingData(true); setError('');
    const { data, error: queryError } = await supabase.from('bookings')
      .select('id, scheduled_at, duration_minutes, service_address, customer_notes, status, dog:dogs(name, breed)')
      .eq('walker_id', userId).order('scheduled_at', { ascending: true }).limit(50);
    if (queryError) setError('Assigned walks load नहीं हुए: ' + queryError.message);
    else setAssignedWalks((data ?? []) as unknown as AssignedWalk[]);
    setLoadingData(false);
  }, [userId, profile?.role]);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive && data.session) void loadProfile(data.session.user.id);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      if (session) setTimeout(() => { if (alive) void loadProfile(session.user.id); }, 0);
      else { setProfile(null); setUserId(''); setDogs([]); setSubscriptions([]); }
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => { if (profile?.role === 'customer' && userId) void loadCustomerData(); }, [profile?.role, userId, loadCustomerData]);\n  useEffect(() => { if (profile?.role === 'walker' && userId) void loadWalkerData(); }, [profile?.role, userId, loadWalkerData]);



  async function sendOtp() {
    if (!supabase) return;
    const normalized = normalizeIndianPhone(phoneInput);
    if (!/^\+91[6-9]\d{9}$/.test(normalized)) { setError('कृपया सही 10 अंकों का Indian mobile number डालें।'); return; }
    setBusy(true); setError(''); setMessage('');
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone: normalized });
    if (otpError) setError('OTP नहीं भेजा जा सका: ' + otpError.message);
    else { setPhone(normalized); setOtpSent(true); setMessage('OTP भेज दिया गया है। SMS में आया 6 अंकों का code डालें।'); }
    setBusy(false);
  }

  async function verifyOtp() {
    if (!supabase) return;
    if (!/^\d{6}$/.test(otp)) { setError('6 अंकों का OTP डालें।'); return; }
    setBusy(true); setError('');
    const { data, error: verifyError } = await supabase.auth.verifyOtp({ phone, token: otp, type: 'sms' });
    if (verifyError) setError('OTP verify नहीं हुआ। Code जाँचें या नया OTP मँगाएँ।');
    else if (data.user) await loadProfile(data.user.id);
    setBusy(false);
  }

  async function addDog() {
    if (!supabase || !userId) return;
    if (!dogName.trim()) { setError('कुत्ते का नाम डालें।'); return; }
    const age = dogAge.trim() ? Number(dogAge) : null;
    if (age !== null && (!Number.isFinite(age) || age < 0 || age > 30)) { setError('कृपया सही उम्र डालें।'); return; }
    setBusy(true); setError(''); setMessage('');
    const { error: insertError } = await supabase.from('dogs').insert({
      customer_id: userId, name: dogName.trim(), breed: dogBreed.trim() || null,
      age_years: age, notes: dogNotes.trim() || null,
    });
    if (insertError) setError('Dog profile save नहीं हुआ: ' + insertError.message);
    else {
      setDogName(''); setDogBreed(''); setDogAge(''); setDogNotes('');
      setShowDogForm(false); setMessage('Dog profile सफलतापूर्वक जोड़ दिया गया।');
      await loadCustomerData();
    }
    setBusy(false);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setProfile(null); setUserId(''); setDogs([]); setSubscriptions([]);
    setMessage('आप सुरक्षित रूप से sign out हो गए हैं।');
  }

  const roleText = profile?.role === 'walker' ? 'Walker account' : profile?.role === 'admin' ? 'Admin account' : 'Customer account';

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.brandMark}><Text style={styles.markText}>DW</Text></View>
        <Text style={styles.title}>DOJO WALK</Text>
        <Text style={styles.tagline}>WALK. CARE. TRUST.</Text>
        <Text style={styles.subtitle}>Trusted dog walks, with care you can follow.</Text>

        {!isSupabaseConfigured && <View style={styles.notice}><Text style={styles.noticeTitle}>App setup pending</Text><Text style={styles.noticeBody}>Supabase Project URL और Publishable Key को apps/mobile/.env में configure करना बाकी है।</Text></View>}

        {!profile ? (
          <View style={styles.card}>
            <Text style={styles.cardEyebrow}>MOBILE LOGIN</Text>
            <Text style={styles.welcome}>{otpSent ? 'Verify your number' : 'Welcome to DOJO WALK'}</Text>
            <Text style={styles.body}>{otpSent ? phone + ' पर भेजा गया OTP डालें।' : 'Customer और Walker अपने registered mobile number से login करें।'}</Text>
            {!otpSent ? <>
              <Text style={styles.label}>Mobile number</Text>
              <TextInput value={phoneInput} onChangeText={setPhoneInput} placeholder="98765 43210" keyboardType="phone-pad" maxLength={14} style={styles.input} editable={!busy} />
              <Pressable style={[styles.primaryButton, (!isSupabaseConfigured || busy) && styles.disabled]} onPress={() => void sendOtp()} disabled={!isSupabaseConfigured || busy}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Send OTP</Text>}</Pressable>
            </> : <>
              <Text style={styles.label}>6-digit OTP</Text>
              <TextInput value={otp} onChangeText={(value) => setOtp(value.replace(/\D/g, '').slice(0, 6))} placeholder="Enter OTP" keyboardType="number-pad" maxLength={6} style={[styles.input, styles.otpInput]} editable={!busy} />
              <Pressable style={[styles.primaryButton, busy && styles.disabled]} onPress={() => void verifyOtp()} disabled={busy}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Verify & continue</Text>}</Pressable>
              <Pressable style={styles.textButton} onPress={() => { setOtpSent(false); setOtp(''); setError(''); }}><Text style={styles.textButtonLabel}>Change mobile number</Text></Pressable>
            </>}
            {message ? <Text style={styles.success}>{message}</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Text style={styles.footnote}>आपका OTP किसी के साथ share न करें।</Text>
          </View>
        ) : (
          <View style={styles.dashboard}>
            <View style={styles.topRow}>
              <View style={{ flex: 1 }}><Text style={styles.cardEyebrow}>{roleText.toUpperCase()}</Text><Text style={styles.welcome}>नमस्ते{profile.full_name ? ', ' + profile.full_name : ''}!</Text><Text style={styles.body}>आपका DOJO WALK account सुरक्षित रूप से जुड़ा है।</Text></View>
              <Pressable onPress={() => void signOut()} style={styles.outlineButton}><Text style={styles.outlineText}>Sign out</Text></Pressable>
            </View>

            {profile.role === 'customer' ? <>
              <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>मेरे Dogs</Text><Text style={styles.sectionHint}>हर dog का अपना package और walk record होगा।</Text></View><Pressable style={styles.smallPrimary} onPress={() => { setShowDogForm(!showDogForm); setError(''); }}><Text style={styles.smallPrimaryText}>{showDogForm ? 'Cancel' : '+ Add Dog'}</Text></Pressable></View>
              {showDogForm && <View style={styles.card}>
                <Text style={styles.cardEyebrow}>NEW DOG PROFILE</Text>
                <Text style={styles.label}>Dog name *</Text><TextInput value={dogName} onChangeText={setDogName} placeholder="e.g. Bruno" style={styles.input} maxLength={60} />
                <Text style={styles.label}>Breed</Text><TextInput value={dogBreed} onChangeText={setDogBreed} placeholder="e.g. Labrador" style={styles.input} maxLength={80} />
                <Text style={styles.label}>Age in years</Text><TextInput value={dogAge} onChangeText={setDogAge} placeholder="e.g. 2" keyboardType="decimal-pad" style={styles.input} />
                <Text style={styles.label}>Care notes (optional)</Text><TextInput value={dogNotes} onChangeText={setDogNotes} placeholder="Health, behaviour, instructions..." multiline style={[styles.input, styles.multiline]} maxLength={500} />
                <Pressable style={[styles.primaryButton, busy && styles.disabled]} onPress={() => void addDog()} disabled={busy}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Save Dog Profile</Text>}</Pressable>
              </View>}
              {loadingData ? <ActivityIndicator color="#F07824" style={{ margin: 20 }} /> : dogs.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>अभी कोई dog profile नहीं है</Text><Text style={styles.body}>पहले अपने dog की जानकारी जोड़ें। उसके बाद package request की जा सकेगी।</Text></View> : dogs.map((dog) => {
                const active = subscriptions.find((sub) => sub.dog_id === dog.id && sub.status === 'active');
                return <View style={styles.dogCard} key={dog.id}>
                  <View style={styles.dogAvatar}><Text style={styles.dogAvatarText}>{dog.name.slice(0, 1).toUpperCase()}</Text></View>
                  <View style={{ flex: 1 }}><Text style={styles.dogName}>{dog.name}</Text><Text style={styles.dogMeta}>{[dog.breed, dog.age_years !== null ? dog.age_years + ' years' : null].filter(Boolean).join(' · ') || 'Breed and age not added'}</Text><Text style={styles.dogStatus}>{active ? 'Active package · ' + money(active.monthly_price_inr) + '/month' : 'No active package yet'}</Text></View>
                </View>;
              })}
              <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Monthly Packages</Text><Text style={styles.sectionHint}>Monday–Saturday · प्रति dog अलग package</Text></View></View>
              {packages.length === 0 ? <Text style={styles.body}>Packages अभी load नहीं हुए। Refresh करके देखें।</Text> : packages.map((item) => <View style={styles.packageCard} key={item.id}>
                <View style={{ flex: 1 }}><Text style={styles.packageTitle}>{item.walks_per_day === 1 ? 'Daily Walk' : item.walks_per_day + ' Walks Daily'}</Text><Text style={styles.packageHint}>{item.duration_minutes} minutes per walk · Monday–Saturday</Text></View>
                <View style={{ alignItems: 'flex-end' }}><Text style={styles.packagePrice}>{money(item.monthly_price_inr)}</Text><Text style={styles.packageHint}>per month</Text></View>
              </View>)}
              <View style={styles.notice}><Text style={styles.noticeTitle}>Package activation</Text><Text style={styles.noticeBody}>Package चुनने और UPI payment के बाद Admin verification से subscription activate होगा। फिलहाल इस app में package request और payment submit सुविधा अगली stage में जोड़ी जाएगी।</Text></View>
              <Pressable style={styles.textButton} onPress={() => void loadCustomerData()}><Text style={styles.textButtonLabel}>↻ Refresh my details</Text></Pressable>
            </> : profile.role === 'walker' ? <>
              <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>मेरी Assigned Walks</Text><Text style={styles.sectionHint}>सिर्फ आपको assign की गई walks दिखाई जाती हैं।</Text></View><Pressable style={styles.smallPrimary} onPress={() => void loadWalkerData()}><Text style={styles.smallPrimaryText}>Refresh</Text></Pressable></View>
              {loadingData ? <ActivityIndicator color="#F07824" style={{ margin: 20 }} /> : assignedWalks.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>अभी कोई walk assign नहीं हुई</Text><Text style={styles.body}>Admin द्वारा आपको dog और walk assign करने पर वह यहाँ दिखाई देगी।</Text></View> : assignedWalks.map((walk) => <View style={styles.dogCard} key={walk.id}>
                <View style={styles.dogAvatar}><Text style={styles.dogAvatarText}>{(walk.dog?.name || 'D').slice(0, 1).toUpperCase()}</Text></View>
                <View style={{ flex: 1 }}><Text style={styles.dogName}>{walk.dog?.name || 'Assigned dog'}</Text><Text style={styles.dogMeta}>{walk.dog?.breed || 'Breed not listed'} · {walk.duration_minutes} minutes</Text><Text style={styles.dogMeta}>{new Date(walk.scheduled_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</Text><Text style={styles.dogStatus}>{walk.status.replace('_', ' ')}</Text><Text style={styles.dogMeta}>{walk.service_address}</Text>{walk.customer_notes ? <Text style={styles.dogMeta}>Note: {walk.customer_notes}</Text> : null}</View>
              </View>)}
              <View style={styles.notice}><Text style={styles.noticeTitle}>Walk controls coming next</Text><Text style={styles.noticeBody}>Start/Stop Walk, live GPS और walk report अगली सुरक्षित development stage में जोड़े जाएँगे। अभी यह assigned walk list केवल देखने के लिए है।</Text></View>
            </> : <View style={styles.card}>
              <Text style={styles.cardEyebrow}>{roleText.toUpperCase()}</Text>
              <Text style={styles.welcome}>Admin account connected</Text>
              <Text style={styles.body}>Admin का पूरा workspace web dashboard पर उपलब्ध होगा।</Text>
              <Pressable style={styles.primaryButton} onPress={() => void signOut()}><Text style={styles.primaryText}>Sign out</Text></Pressable>
            </View>}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {message ? <Text style={styles.success}>{message}</Text> : null}
          </View>
        )}
        <Text style={styles.footer}>DOJO WALK · GAUR CITY · GREATER NOIDA WEST</Text>
        <StatusBar style="dark" />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFF8F2' },
  container: { flexGrow: 1, alignItems: 'center', padding: 22, paddingTop: 48, paddingBottom: 36 },
  brandMark: { width: 60, height: 60, borderRadius: 18, backgroundColor: '#F07824', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  markText: { color: '#FFFFFF', fontSize: 23, fontWeight: '900' },
  title: { color: '#242424', fontSize: 27, fontWeight: '900', letterSpacing: 1.1 },
  tagline: { color: '#F07824', fontSize: 11, fontWeight: '900', letterSpacing: 2, marginTop: 7 },
  subtitle: { color: '#777', fontSize: 13, textAlign: 'center', marginTop: 14, marginBottom: 22 },
  dashboard: { width: '100%', maxWidth: 500 },
  card: { width: '100%', backgroundColor: '#fff', borderRadius: 18, padding: 20, borderWidth: 1, borderColor: '#F0E7E0', marginBottom: 14 },
  cardEyebrow: { color: '#F07824', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  welcome: { color: '#242424', fontSize: 21, fontWeight: '800', marginTop: 7 },
  body: { color: '#777', fontSize: 12, lineHeight: 19, marginTop: 7 },
  label: { color: '#333', fontSize: 12, fontWeight: '700', marginTop: 16, marginBottom: 7 },
  input: { borderWidth: 1, borderColor: '#E3DDD8', borderRadius: 10, paddingHorizontal: 13, paddingVertical: 12, color: '#242424', fontSize: 14, backgroundColor: '#fff' },
  multiline: { minHeight: 74, textAlignVertical: 'top' },
  otpInput: { letterSpacing: 8, fontWeight: '800', textAlign: 'center', fontSize: 22 },
  primaryButton: { minHeight: 47, borderRadius: 11, backgroundColor: '#F07824', alignItems: 'center', justifyContent: 'center', marginTop: 17, paddingHorizontal: 16 },
  primaryText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  textButton: { alignItems: 'center', padding: 13 },
  textButtonLabel: { color: '#B75A1C', fontSize: 12, fontWeight: '700' },
  outlineButton: { borderWidth: 1, borderColor: '#E8DCD3', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  outlineText: { color: '#555', fontSize: 11, fontWeight: '700' },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 12 },
  sectionTitle: { color: '#242424', fontSize: 17, fontWeight: '900' },
  sectionHint: { color: '#888', fontSize: 10, marginTop: 4 },
  smallPrimary: { backgroundColor: '#F07824', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 9 },
  smallPrimaryText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  dogCard: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: '#fff', padding: 15, borderRadius: 15, borderWidth: 1, borderColor: '#F0E7E0', marginBottom: 10 },
  dogAvatar: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFF0E4', alignItems: 'center', justifyContent: 'center' },
  dogAvatarText: { color: '#C55D1B', fontSize: 19, fontWeight: '900' },
  dogName: { color: '#242424', fontSize: 15, fontWeight: '800' },
  dogMeta: { color: '#888', fontSize: 10, marginTop: 3 },
  dogStatus: { color: '#B75A1C', fontSize: 10, fontWeight: '700', marginTop: 6 },
  empty: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#F0E7E0', padding: 18, marginBottom: 15 },
  emptyTitle: { color: '#333', fontWeight: '800', fontSize: 13 },
  packageCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#F0E7E0', marginBottom: 9 },
  packageTitle: { color: '#242424', fontWeight: '800', fontSize: 13 },
  packageHint: { color: '#888', fontSize: 10, marginTop: 4 },
  packagePrice: { color: '#F07824', fontSize: 17, fontWeight: '900' },
  notice: { width: '100%', backgroundColor: '#FFF0E4', borderRadius: 12, padding: 14, marginTop: 12 },
  noticeTitle: { color: '#8E471B', fontWeight: '800', fontSize: 12 },
  noticeBody: { color: '#8E471B', fontSize: 11, lineHeight: 17, marginTop: 5 },
  success: { color: '#237343', fontSize: 12, marginTop: 13, lineHeight: 18 },
  error: { color: '#A52626', fontSize: 12, marginTop: 13, lineHeight: 18 },
  footnote: { color: '#999', fontSize: 10, textAlign: 'center', marginTop: 18 },
  role: { color: '#B75A1C', fontSize: 12, fontWeight: '800', marginTop: 7 },
  footer: { color: '#AAA', fontSize: 9, letterSpacing: 1, marginTop: 28, textAlign: 'center' },
});
