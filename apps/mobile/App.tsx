import { useCallback, useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Linking, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { isSupabaseConfigured, supabase } from './lib/supabase';

type Profile = { role: 'customer' | 'walker' | 'admin'; full_name: string | null; phone: string | null };
type Dog = { id: string; name: string; breed: string | null; age_years: number | null; notes: string | null };
type Package = { id: string; walks_per_day: number; duration_minutes: number; monthly_price_inr: number };
type Subscription = { id: string; dog_id: string; walks_per_day: number; duration_minutes: number; monthly_price_inr: number; starts_on: string; ends_on: string; status: string };
type CustomerWalk = { id: string; scheduled_at: string; status: string; actual_started_at: string | null; actual_ended_at: string | null; actual_duration_minutes: number | null; walk_report: string | null; dog: { name: string } | null };
type RoutePoint = { id: number; booking_id: string; latitude: number; longitude: number; recorded_at: string };
type AssignedWalk = { id: string; scheduled_at: string; duration_minutes: number; service_address: string; customer_notes: string | null; status: string; actual_started_at: string | null; actual_ended_at: string | null; actual_duration_minutes: number | null; walk_report: string | null; dog: { name: string; breed: string | null } | null };

const WALK_LOCATION_TASK = 'dojo-walk-active-route';
const PHONEPE_QR_BASE64 = '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';
const DOJO_UPI_ID = '9625813987-4@axl';

TaskManager.defineTask(WALK_LOCATION_TASK, async ({ data, error }) => {
  if (error || !supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  const walkerId = sessionData.session?.user.id;
  if (!walkerId) return;
  // Resolve the active walk from the database. React Native has no browser localStorage,
  // and the database enforces at most one active walk per walker.
  const { data: activeBooking, error: bookingError } = await supabase
    .from('bookings')
    .select('id')
    .eq('walker_id', walkerId)
    .eq('status', 'in_progress')
    .maybeSingle();
  if (bookingError || !activeBooking) return;
  const bookingId = activeBooking.id;
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations ?? [];
  if (!locations.length) return;
  await supabase.from('walker_locations').insert(
    locations.map((point) => ({
      booking_id: bookingId,
      walker_id: walkerId,
      latitude: point.coords.latitude,
      longitude: point.coords.longitude,
      recorded_at: new Date(point.timestamp).toISOString(),
    }))
  );
});

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
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [selectedDogId, setSelectedDogId] = useState('');
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [upiTransactionRef, setUpiTransactionRef] = useState('');
  const [payLaterRequests, setPayLaterRequests] = useState<{ id: string; dog_id: string; status: string; created_at: string }[]>([]);
  const [assignedWalks, setAssignedWalks] = useState<AssignedWalk[]>([]);
  const [customerWalks, setCustomerWalks] = useState<CustomerWalk[]>([]);
  const [customerRoutePoints, setCustomerRoutePoints] = useState<RoutePoint[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [showDogForm, setShowDogForm] = useState(false);
  const [dogName, setDogName] = useState('');
  const [dogBreed, setDogBreed] = useState('');
  const [dogAge, setDogAge] = useState('');
  const [dogNotes, setDogNotes] = useState('');
  const [walkReport, setWalkReport] = useState('');
  const [bookingSchedule, setBookingSchedule] = useState('');
  const [bookingAddress, setBookingAddress] = useState('');
  const [bookingNotes, setBookingNotes] = useState('');
  const [gpsMessage, setGpsMessage] = useState('');
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);

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
    const [dogResult, packageResult, subscriptionResult, payLaterResult] = await Promise.all([
      supabase.from('dogs').select('id, name, breed, age_years, notes').eq('customer_id', userId).order('created_at', { ascending: false }),
      supabase.from('service_packages').select('id, walks_per_day, duration_minutes, monthly_price_inr').eq('active', true).order('walks_per_day'),
      supabase.from('dog_subscriptions').select('id, dog_id, walks_per_day, duration_minutes, monthly_price_inr, starts_on, ends_on, status').eq('customer_id', userId).order('created_at', { ascending: false }),
      supabase.from('pay_later_requests').select('id, dog_id, status, created_at').eq('customer_id', userId).order('created_at', { ascending: false }),
    ]);
    const failed = dogResult.error || packageResult.error || subscriptionResult.error || payLaterResult.error;
    if (failed) setError('जानकारी load नहीं हुई: ' + failed.message);
    else {
      setDogs((dogResult.data ?? []) as Dog[]);
      if (!selectedDogId && dogResult.data?.length) setSelectedDogId(dogResult.data[0].id);
      setPackages((packageResult.data ?? []) as Package[]);
      setSubscriptions((subscriptionResult.data ?? []) as Subscription[]);
      setPayLaterRequests((payLaterResult.data ?? []) as { id: string; dog_id: string; status: string; created_at: string }[]);
    }
    setLoadingData(false);
  }, [userId, profile?.role, selectedDogId]);

  const loadCustomerWalks = useCallback(async () => {
    if (!supabase || !userId || profile?.role !== 'customer') return;
    const { data: bookings, error: bookingError } = await supabase.from('bookings')
      .select('id, scheduled_at, status, actual_started_at, actual_ended_at, actual_duration_minutes, walk_report, dog:dogs(name)')
      .eq('customer_id', userId).in('status', ['requested', 'assigned', 'accepted', 'in_progress', 'completed'])
      .order('scheduled_at', { ascending: false }).limit(20);
    if (bookingError) { setError('Walk history load नहीं हुई: ' + bookingError.message); return; }
    const rows = (bookings ?? []) as unknown as CustomerWalk[];
    setCustomerWalks(rows);
    const ids = rows.map((item) => item.id);
    if (!ids.length) { setCustomerRoutePoints([]); return; }
    const { data: points, error: pointError } = await supabase.from('walker_locations')
      .select('id, booking_id, latitude, longitude, recorded_at')
      .in('booking_id', ids).order('recorded_at', { ascending: true });
    if (pointError) setError('GPS route load नहीं हुई: ' + pointError.message);
    else setCustomerRoutePoints((points ?? []) as RoutePoint[]);
  }, [userId, profile?.role]);

  const loadWalkerData = useCallback(async () => {
    if (!supabase || !userId || profile?.role !== 'walker') return;
    setLoadingData(true); setError('');
    const { data, error: queryError } = await supabase.from('bookings')
      .select('id, scheduled_at, duration_minutes, service_address, customer_notes, status, actual_started_at, actual_ended_at, actual_duration_minutes, walk_report, dog:dogs(name, breed)')
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
      else { setProfile(null); setUserId(''); setDogs([]); setSubscriptions([]); setCustomerWalks([]); setCustomerRoutePoints([]); }
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => { if (profile?.role === 'customer' && userId) { void loadCustomerData(); void loadCustomerWalks(); } }, [profile?.role, userId, loadCustomerData, loadCustomerWalks]);
  useEffect(() => {
    if (!supabase || profile?.role !== 'customer' || !userId) return;
    const channel = supabase.channel('customer-walk-routes-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'walker_locations' }, () => { void loadCustomerWalks(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: 'customer_id=eq.' + userId }, () => { void loadCustomerWalks(); })
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [profile?.role, userId, loadCustomerWalks]);
  useEffect(() => { if (profile?.role === 'walker' && userId) void loadWalkerData(); }, [profile?.role, userId, loadWalkerData]);



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

  async function startWalk(bookingId: string) {
    if (!supabase || !userId) return;
    setBusy(true); setError(''); setMessage(''); setGpsMessage('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      const { error: startError } = await supabase.rpc('walker_start_booking', { p_booking_id: bookingId });
      if (startError) throw startError;

      setMessage('Walk शुरू हो गई।');
      await loadWalkerData();

      if (!permission.granted) {
        setGpsMessage('Location permission नहीं मिली। Walk शुरू है, लेकिन GPS route record नहीं होगा। Settings में location permission चालू करें।');
        setBusy(false);
        return;
      }

      const backgroundAvailable = await TaskManager.isAvailableAsync();
      const backgroundPermission = backgroundAvailable
        ? await Location.requestBackgroundPermissionsAsync()
        : { granted: false };
      if (backgroundAvailable && backgroundPermission.granted) {
        await Location.startLocationUpdatesAsync(WALK_LOCATION_TASK, {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 5000,
          distanceInterval: 10,
          pausesUpdatesAutomatically: false,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: 'DOJO WALK · Walk in progress',
            notificationBody: 'Your walk route is being shared with the customer and Admin.',
            killServiceOnDestroy: false,
          },
        });
        setGpsMessage('Background और foreground GPS route record हो रहा है।');
      } else {
        locationSubscription.current?.remove();
        locationSubscription.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 },
          async (position) => {
            if (!supabase) return;
            const { error: locationError } = await supabase.from('walker_locations').insert({
              booking_id: bookingId,
              walker_id: userId,
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              recorded_at: new Date(position.timestamp).toISOString(),
            });
            if (locationError) setGpsMessage('GPS point save नहीं हुआ: ' + locationError.message);
            else setGpsMessage('Foreground GPS route record हो रहा है।');
          }
        );
        setGpsMessage(backgroundAvailable
          ? 'Background permission उपलब्ध नहीं है। GPS केवल app खुला रहने पर record होगा।'
          : 'इस preview environment में background tracking उपलब्ध नहीं है। GPS केवल app खुला रहने पर record होगा।');
      }
    } catch (e) {
      setError('Walk शुरू नहीं हुई: ' + (e instanceof Error ? e.message : 'Unknown error'));
    }
    setBusy(false);
  }

  async function finishWalk(bookingId: string) {
    if (!supabase) return;
    setBusy(true); setError(''); setMessage('');
    const { error: finishError } = await supabase.rpc('walker_finish_booking', {
      p_booking_id: bookingId,
      p_walk_report: walkReport.trim() || null,
    });
    if (finishError) {
      setError('Walk finish नहीं हुई: ' + finishError.message);
    } else {
      locationSubscription.current?.remove();
      locationSubscription.current = null;
      if (await Location.hasStartedLocationUpdatesAsync(WALK_LOCATION_TASK)) {
        await Location.stopLocationUpdatesAsync(WALK_LOCATION_TASK);
      }
      setWalkReport('');
      setGpsMessage('');
      setMessage('Walk successfully complete हो गई।');
      await loadWalkerData();
    }
    setBusy(false);
  }

  async function requestSubscriptionWalk() {
    if (!supabase || !selectedDogId) {
      setError('पहले dog चुनें।');
      return;
    }
    const match = /^(\\d{4})-(\\d{2})-(\\d{2})\\s+(\\d{2}):(\\d{2})$/.exec(bookingSchedule.trim());
    if (!match) {
      setError('Date और time इस format में डालें: YYYY-MM-DD HH:MM (24-hour)');
      return;
    }
    const [, year, month, day, hour, minute] = match;
    const scheduled = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
    if (
      scheduled.getFullYear() !== Number(year) ||
      scheduled.getMonth() !== Number(month) - 1 ||
      scheduled.getDate() !== Number(day) ||
      scheduled.getHours() !== Number(hour) ||
      scheduled.getMinutes() !== Number(minute) ||
      scheduled.getTime() <= Date.now()
    ) {
      setError('कृपया आने वाली सही date और time डालें।');
      return;
    }
    if (!bookingAddress.trim()) {
      setError('Walk का पूरा address डालें।');
      return;
    }
    setBusy(true); setError(''); setMessage('');
    const { error: bookingError } = await supabase.rpc('customer_request_subscription_walk', {
      p_dog_id: selectedDogId,
      p_scheduled_at: scheduled.toISOString(),
      p_service_address: bookingAddress.trim(),
      p_customer_notes: bookingNotes.trim() || null,
    });
    if (bookingError) setError('Walk request नहीं बनी: ' + bookingError.message);
    else {
      setBookingSchedule(''); setBookingNotes('');
      setMessage('Walk request Admin को भेज दी गई है। Approved walker assign होने के बाद status यहाँ दिखेगा।');
      await loadCustomerWalks();
    }
    setBusy(false);
  }

  async function submitPayLaterRequest() {
    if (!supabase || !selectedDogId || !selectedPackageId) {
      setError('पहले dog और package चुनें।');
      return;
    }
    setBusy(true); setError(''); setMessage('');
    const { error: requestError } = await supabase.rpc('customer_submit_pay_later_request', {
      p_dog_id: selectedDogId,
      p_package_id: selectedPackageId,
    });
    if (requestError) setError('Pay Later request submit नहीं हुई: ' + requestError.message);
    else {
      setSelectedPackageId('');
      setMessage('Pay Later request Admin को भेज दी गई है। Approval मिलने के बाद ही package शुरू होगा; बकाया आपके account में जुड़ेगा।');
      await loadCustomerData();
    }
    setBusy(false);
  }

  async function submitPackagePayment() {
    if (!supabase || !selectedDogId || !selectedPackageId) {
      setError('पहले dog और package चुनें।');
      return;
    }
    if (upiTransactionRef.trim().length < 6) {
      setError('Payment के बाद UPI transaction reference / UTR डालें।');
      return;
    }
    setBusy(true); setError(''); setMessage('');
    const { error: paymentError } = await supabase.rpc('customer_submit_package_payment', {
      p_dog_id: selectedDogId,
      p_package_id: selectedPackageId,
      p_upi_transaction_ref: upiTransactionRef.trim(),
    });
    if (paymentError) {
      setError('Payment request submit नहीं हुई: ' + paymentError.message);
    } else {
      setUpiTransactionRef('');
      setSelectedPackageId('');
      setMessage('Payment details Admin को भेज दी गई हैं। Verification के बाद package activate होगा।');
      await loadCustomerData();
    }
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

  useEffect(() => () => { locationSubscription.current?.remove(); }, []);

  const roleText = profile?.role === 'walker' ? 'Walker account' : profile?.role === 'admin' ? 'Admin account' : 'Customer account';
  const selectedPackage = packages.find((item) => item.id === selectedPackageId);
  const selectedDogSubscription = subscriptions.find((item) =>
    item.dog_id === selectedDogId && item.status === 'active' &&
    item.starts_on <= new Date().toLocaleDateString('en-CA') &&
    item.ends_on >= new Date().toLocaleDateString('en-CA')
  );
  const upiPayUrl = selectedPackage
    ? 'upi://pay?pa=' + encodeURIComponent(DOJO_UPI_ID) + '&pn=' + encodeURIComponent('Bapan Rajbanshi') + '&am=' + selectedPackage.monthly_price_inr + '&cu=INR&tn=' + encodeURIComponent('DOJO WALK monthly package')
    : '';

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
                const pending = subscriptions.find((sub) => sub.dog_id === dog.id && sub.status === 'pending_payment');
                return <View style={styles.dogCard} key={dog.id}>
                  <View style={styles.dogAvatar}><Text style={styles.dogAvatarText}>{dog.name.slice(0, 1).toUpperCase()}</Text></View>
                  <View style={{ flex: 1 }}><Text style={styles.dogName}>{dog.name}</Text><Text style={styles.dogMeta}>{[dog.breed, dog.age_years !== null ? dog.age_years + ' years' : null].filter(Boolean).join(' · ') || 'Breed and age not added'}</Text><Text style={styles.dogStatus}>{active ? 'Active package · ' + money(active.monthly_price_inr) + '/month' : pending ? 'Payment submitted · awaiting Admin verification' : 'No active package yet'}</Text></View>
                </View>;
              })}
              <View style={styles.paymentPanel}>
                <Text style={styles.sectionTitle}>Request a subscription walk</Text>
                <Text style={styles.footnote}>Active monthly package वाले dog के लिए Monday–Saturday walk request करें। Daily walk limit database automatically check करेगा।</Text>
                <Text style={styles.label}>Dog</Text>
                <View style={styles.choiceRow}>{dogs.map((dog) => <Pressable key={dog.id} onPress={() => setSelectedDogId(dog.id)} style={[styles.dogChoice, selectedDogId === dog.id && styles.dogChoiceSelected]}><Text style={[styles.dogChoiceText, selectedDogId === dog.id && styles.dogChoiceTextSelected]}>{dog.name}</Text></Pressable>)}</View>
                {selectedDogSubscription ? <>
                  <Text style={styles.label}>Date & time · YYYY-MM-DD HH:MM</Text>
                  <TextInput value={bookingSchedule} onChangeText={setBookingSchedule} placeholder="2026-11-24 08:00" style={styles.input} autoCapitalize="none" />
                  <Text style={styles.label}>Full walk address *</Text>
                  <TextInput value={bookingAddress} onChangeText={setBookingAddress} placeholder="Flat, tower, society, Gaur City..." style={styles.input} maxLength={300} />
                  <Text style={styles.label}>Walker instructions (optional)</Text>
                  <TextInput value={bookingNotes} onChangeText={setBookingNotes} placeholder="Gate entry, leash, behaviour notes..." multiline style={[styles.input, styles.multiline]} maxLength={1000} />
                  <Pressable style={[styles.primaryButton, busy && styles.disabled]} onPress={() => void requestSubscriptionWalk()} disabled={busy}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Request walk</Text>}</Pressable>
                </> : <Text style={styles.body}>इस dog के लिए active monthly package नहीं है। पहले package activate करवाएँ।</Text>}
              </View>
              <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Walk Tracking & History</Text><Text style={styles.sectionHint}>Active walk की latest location और completed route points</Text></View><Pressable style={styles.smallPrimary} onPress={() => void loadCustomerWalks()}><Text style={styles.smallPrimaryText}>Refresh</Text></Pressable></View>
              {customerWalks.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>अभी कोई active या completed walk नहीं है</Text><Text style={styles.body}>Walk शुरू होने के बाद location और route यहाँ दिखाई देंगे।</Text></View> : customerWalks.map((walk) => {
                const points = customerRoutePoints.filter((point) => point.booking_id === walk.id);
                const latest = points[points.length - 1];
                const first = points[0];
                const mapUrl = latest ? 'https://www.openstreetmap.org/?mlat=' + latest.latitude + '&mlon=' + latest.longitude + '#map=17/' + latest.latitude + '/' + latest.longitude : '';
                return <View style={styles.dogCard} key={walk.id}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dogName}>{walk.dog?.name || 'Dog walk'} · {walk.status === 'in_progress' ? 'Live walk' : walk.status === 'completed' ? 'Completed' : walk.status.charAt(0).toUpperCase() + walk.status.slice(1)}</Text>
                    <Text style={styles.dogMeta}>{new Date(walk.scheduled_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</Text>
                    <Text style={styles.dogMeta}>{points.length} GPS points recorded</Text>
                    {walk.actual_duration_minutes ? <Text style={styles.dogMeta}>Duration: {walk.actual_duration_minutes} minutes</Text> : null}
                    {walk.walk_report ? <Text style={styles.dogMeta}>Walker report: {walk.walk_report}</Text> : null}
                    {latest ? <><Text style={styles.dogMeta}>Latest GPS: {latest.latitude.toFixed(5)}, {latest.longitude.toFixed(5)}</Text><Pressable style={styles.textButton} onPress={() => void Linking.openURL(mapUrl)}><Text style={styles.textButtonLabel}>Open latest location in map ↗</Text></Pressable></> : <Text style={styles.dogMeta}>GPS location अभी उपलब्ध नहीं है।</Text>}
                    {first && latest && points.length > 1 ? <Text style={styles.dogMeta}>Route range: {first.latitude.toFixed(5)}, {first.longitude.toFixed(5)} → {latest.latitude.toFixed(5)}, {latest.longitude.toFixed(5)}</Text> : null}
                  </View>
                </View>;
              })}
              <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Monthly Packages</Text><Text style={styles.sectionHint}>Monday–Saturday · प्रति dog अलग package</Text></View></View>
              {dogs.length > 0 ? <>
                <Text style={styles.label}>किस dog के लिए package चाहिए?</Text>
                <View style={styles.choiceRow}>{dogs.map((dog) => <Pressable key={dog.id} onPress={() => setSelectedDogId(dog.id)} style={[styles.dogChoice, selectedDogId === dog.id && styles.dogChoiceSelected]}><Text style={[styles.dogChoiceText, selectedDogId === dog.id && styles.dogChoiceTextSelected]}>{dog.name}</Text></Pressable>)}</View>
              </> : <Text style={styles.body}>Package लेने से पहले अपना dog profile जोड़ें।</Text>}
              {packages.length === 0 ? <Text style={styles.body}>Packages अभी load नहीं हुए। Refresh करके देखें।</Text> : packages.map((item) => <Pressable style={[styles.packageCard, selectedPackageId === item.id && styles.packageCardSelected]} key={item.id} onPress={() => { setSelectedPackageId(item.id); setUpiTransactionRef(''); setError(''); }}>
                <View style={{ flex: 1 }}><Text style={styles.packageTitle}>{item.walks_per_day === 1 ? 'Daily Walk' : item.walks_per_day + ' Walks Daily'}</Text><Text style={styles.packageHint}>{item.duration_minutes} minutes per walk · Monday–Saturday</Text><Text style={styles.packageHint}>{selectedPackageId === item.id ? 'Selected' : 'Tap to select'}</Text></View>
                <View style={{ alignItems: 'flex-end' }}><Text style={styles.packagePrice}>{money(item.monthly_price_inr)}</Text><Text style={styles.packageHint}>per month</Text></View>
              </Pressable>)}
              {selectedPackage ? <View style={styles.paymentPanel}>
                <Text style={styles.sectionTitle}>Choose payment method</Text>
                <Pressable style={[styles.primaryButton, busy && styles.disabled]} onPress={() => void submitPayLaterRequest()} disabled={busy || !selectedDogId}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Pay Later · Admin approval required</Text>}
                </Pressable>
                <Text style={styles.footnote}>अभी payment किए बिना request भेजें। Admin approve करेगा तभी package active होगा और monthly amount आपके बकाया में जुड़ेगा।</Text>
                <Text style={styles.sectionTitle}>या अभी UPI से भुगतान करें</Text>
                <Text style={styles.body}>QR scan करें या नीचे दिए UPI ID पर {money(selectedPackage.monthly_price_inr)} भेजें। Payee name: Bapan Rajbanshi.</Text>
                <Image source={{ uri: 'data:image/png;base64,' + PHONEPE_QR_BASE64 }} style={styles.paymentQr} resizeMode="contain" />
                <Text style={styles.upiId}>{DOJO_UPI_ID}</Text>
                <Pressable style={styles.outlineButton} onPress={() => void Linking.openURL('upi://pay?pa=' + encodeURIComponent(DOJO_UPI_ID) + '&pn=' + encodeURIComponent('Bapan Rajbanshi') + '&am=' + selectedPackage.monthly_price_inr + '&cu=INR&tn=' + encodeURIComponent('DOJO WALK monthly package')).catch(() => setError('UPI app नहीं खुला। QR scan करके payment करें।'))}><Text style={styles.outlineText}>Open UPI App · {money(selectedPackage.monthly_price_inr)}</Text></Pressable>
                <Text style={styles.label}>UPI transaction reference / UTR *</Text>
                <TextInput value={upiTransactionRef} onChangeText={setUpiTransactionRef} placeholder="Payment के बाद UTR number डालें" style={styles.input} autoCapitalize="characters" maxLength={100} />
                <Pressable style={[styles.primaryButton, (busy || !selectedDogId) && styles.disabled]} onPress={() => void submitPackagePayment()} disabled={busy || !selectedDogId}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Submit Payment Details</Text>}</Pressable>
                <Text style={styles.footnote}>Payment तभी submit करें जब PhonePe में transaction successful दिखे। Package Admin verification के बाद ही चालू होगा।</Text>
              </View> : null}
              {payLaterRequests.length > 0 ? <View style={styles.notice}><Text style={styles.noticeTitle}>Pay Later requests</Text>{payLaterRequests.slice(0,5).map((request) => <Text key={request.id} style={styles.noticeBody}>{dogs.find((dog) => dog.id === request.dog_id)?.name || 'Dog'} · {request.status === 'pending' ? 'Admin approval pending' : request.status === 'approved' ? 'Approved' : 'Rejected'} · {new Date(request.created_at).toLocaleDateString('en-IN')}</Text>)}</View> : null}
              <View style={styles.notice}><Text style={styles.noticeTitle}>Payment verification</Text><Text style={styles.noticeBody}>आपका payment reference Admin verify करेगा। App payment को अपने-आप successful नहीं मानेगा।</Text></View>
              <Pressable style={styles.textButton} onPress={() => void loadCustomerData()}><Text style={styles.textButtonLabel}>↻ Refresh my details</Text></Pressable>
            </> : profile.role === 'walker' ? <>
              <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>मेरी Assigned Walks</Text><Text style={styles.sectionHint}>सिर्फ आपको assign की गई walks दिखाई जाती हैं।</Text></View><Pressable style={styles.smallPrimary} onPress={() => void loadWalkerData()}><Text style={styles.smallPrimaryText}>Refresh</Text></Pressable></View>
              {loadingData ? <ActivityIndicator color="#F07824" style={{ margin: 20 }} /> : assignedWalks.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>अभी कोई walk assign नहीं हुई</Text><Text style={styles.body}>Admin द्वारा आपको dog और walk assign करने पर वह यहाँ दिखाई देगी।</Text></View> : assignedWalks.map((walk) => <View style={styles.dogCard} key={walk.id}>
                <View style={styles.dogAvatar}><Text style={styles.dogAvatarText}>{(walk.dog?.name || 'D').slice(0, 1).toUpperCase()}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dogName}>{walk.dog?.name || 'Assigned dog'}</Text>
                  <Text style={styles.dogMeta}>{walk.dog?.breed || 'Breed not listed'} · {walk.duration_minutes} minutes</Text>
                  <Text style={styles.dogMeta}>{new Date(walk.scheduled_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</Text>
                  <Text style={styles.dogStatus}>{walk.status.replace('_', ' ')}</Text>
                  <Text style={styles.dogMeta}>{walk.service_address}</Text>
                  {walk.customer_notes ? <Text style={styles.dogMeta}>Note: {walk.customer_notes}</Text> : null}
                  {walk.actual_started_at ? <Text style={styles.dogMeta}>Started: {new Date(walk.actual_started_at).toLocaleTimeString('en-IN')}</Text> : null}
                  {walk.status === 'in_progress' ? <>
                    <TextInput value={walkReport} onChangeText={setWalkReport} placeholder="Walk report (optional)" multiline style={[styles.input, styles.multiline, { marginTop: 10 }]} maxLength={2000} />
                    <Pressable style={[styles.primaryButton, busy && styles.disabled]} onPress={() => void finishWalk(walk.id)} disabled={busy}><Text style={styles.primaryText}>{busy ? 'Please wait…' : 'Stop Walk & Submit Report'}</Text></Pressable>
                  </> : walk.status === 'assigned' || walk.status === 'accepted' ? <Pressable style={[styles.primaryButton, busy && styles.disabled]} onPress={() => void startWalk(walk.id)} disabled={busy}><Text style={styles.primaryText}>{busy ? 'Please wait…' : 'Start Walk'}</Text></Pressable> : walk.status === 'completed' ? <Text style={styles.dogMeta}>Completed · {walk.actual_duration_minutes ?? '—'} minutes recorded</Text> : null}
                </View>
              </View>)}
              {gpsMessage ? <Text style={styles.success}>{gpsMessage}</Text> : null}
              <View style={styles.notice}><Text style={styles.noticeTitle}>GPS tracking</Text><Text style={styles.noticeBody}>Walk active रहने पर GPS points save होते हैं। Background GPS के लिए location permission और native development build जरूरी है; Expo Go में background tracking उपलब्ध नहीं होती।</Text></View>
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
  packageCardSelected: { borderColor: '#F07824', borderWidth: 2 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  dogChoice: { borderWidth: 1, borderColor: '#E8DED6', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: '#fff' },
  dogChoiceSelected: { backgroundColor: '#FFF1E7', borderColor: '#F07824' },
  dogChoiceText: { color: '#555', fontWeight: '700', fontSize: 12 },
  dogChoiceTextSelected: { color: '#A64D13' },
  paymentPanel: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#F0E7E0', marginVertical: 10 },
  paymentQr: { width: 230, height: 230, alignSelf: 'center', marginVertical: 10 },
  upiId: { color: '#242424', fontWeight: '900', fontSize: 16, textAlign: 'center', marginBottom: 12 },
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
