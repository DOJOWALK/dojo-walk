import { useCallback, useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from './lib/supabase';

type AdminProfile = { role: string };
type WalkerAdmin = { id: string; service_areas: string[]; experience_years: number; verification_status: string; account_status: string; profile: { full_name: string | null; phone: string | null } | null };
type WalkerDocumentType = 'profile_selfie' | 'aadhaar_front' | 'aadhaar_back' | 'pan_card';
type WalkerDocument = { id: string; walker_id: string; document_type: WalkerDocumentType; object_path: string; mime_type: string; file_size_bytes: number; created_at: string };
type AssignmentBooking = { id: string; scheduled_at: string; duration_minutes: number; service_address: string; service_slot: string | null; service_latitude: number | null; service_longitude: number | null; status: string; walker_id: string | null; dog: { name: string } | null; customer: { full_name: string | null; phone: string | null } | null };
type PricingRow = { id: string; duration_minutes: number; price_inr: number; is_active: boolean };
type AdminCustomer = { id: string; full_name: string | null; phone: string | null; dogs: { id: string; name: string; breed: string | null; age_years: number | null; service_address: string | null; service_latitude: number | null; service_longitude: number | null }[] };
type WalkerPayout = { id: string; walker_id: string; payout_month: string; gross_amount_inr: number; paid_amount_inr: number; status: string; walker: { profile: { full_name: string | null; phone: string | null } | null } | null };
type Booking = {
  id: string;
  scheduled_at: string;
  status: string;
  duration_minutes: number;
  service_type: string;
};
type RoutePoint = { id: number; booking_id: string; latitude: number; longitude: number; recorded_at: string };
type RouteWalk = { id: string; status: string; scheduled_at: string; actual_started_at: string | null; actual_ended_at: string | null; dog: { name: string } | null; points: RoutePoint[] };
type CustomerCredit = {
  customer_id: string;
  is_trusted: boolean;
  credit_limit_inr: number;
  custom_monthly_price_inr: number | null;
  admin_note: string | null;
  profile: { full_name: string | null; phone: string | null } | null;
};
type CreditEntry = { id: string; entry_type: string; amount_inr: number; description: string; recorded_at: string };
type PayLaterRequest = {
  id: string; created_at: string; customer_id: string; dog_id: string; package_id: string;
  customer: { full_name: string | null; phone: string | null } | null;
  dog: { name: string } | null;
  package: { walks_per_day: number; duration_minutes: number; monthly_price_inr: number } | null;
};
type BookingChangeRequest = { id: string; booking_id: string; customer_id: string; proposed_scheduled_at: string | null; proposed_service_address: string | null; proposed_latitude: number | null; proposed_longitude: number | null; proposed_service_slot: string | null; customer_note: string | null; status: string; admin_note: string | null; created_at: string; booking: { scheduled_at: string; service_address: string; service_slot: string | null; status: string; dog: { name: string } | null } | null; customer: { full_name: string | null; phone: string | null } | null };
type SubscriptionScheduleChange = { id: string; subscription_id: string; proposed_morning_time: string | null; proposed_evening_time: string | null; proposed_service_address: string; proposed_latitude: number | null; proposed_longitude: number | null; customer_note: string | null; status: string; admin_note: string | null; created_at: string; dog: { name: string } | null; customer: { full_name: string | null; phone: string | null } | null; schedule: { morning_time: string | null; evening_time: string | null; service_address: string } | null };
type PendingPayment = {
  id: string;
  amount_inr: number;
  upi_transaction_ref: string | null;
  submitted_at: string;
  status: string;
  customer: { full_name: string | null; phone: string | null } | null;
  subscription: { dog_id: string; dogs: { name: string } | null } | null;
};

const money = (amount: number) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
}).format(amount);

const dateTime = (value: string) => new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value));

const statusLabel: Record<string, string> = {
  requested: 'Requested', assigned: 'Assigned', accepted: 'Accepted',
  in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled',
};

export default function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [adminEmail, setAdminEmail] = useState('');
  const [error, setError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState('');
  const [metrics, setMetrics] = useState({ dogs: 0, activeSubscriptions: 0, todayWalks: 0, pendingPayments: 0 });
  const [walks, setWalks] = useState<Booking[]>([]);
  const [payments, setPayments] = useState<PendingPayment[]>([]);
  const [payLaterRequests, setPayLaterRequests] = useState<PayLaterRequest[]>([]);
  const [routeWalks, setRouteWalks] = useState<RouteWalk[]>([]);
  const [lastUpdated, setLastUpdated] = useState('');
  const [creditCustomers, setCreditCustomers] = useState<CustomerCredit[]>([]);
  const [selectedCreditCustomer, setSelectedCreditCustomer] = useState('');
  const [creditEntries, setCreditEntries] = useState<CreditEntry[]>([]);
  const [trustedEnabled, setTrustedEnabled] = useState(false);
  const [creditLimit, setCreditLimit] = useState('0');
  const [creditNote, setCreditNote] = useState('');
  const [ledgerType, setLedgerType] = useState<'charge' | 'payment'>('charge');
  const [ledgerAmount, setLedgerAmount] = useState('');
  const [ledgerDescription, setLedgerDescription] = useState('');
  const [creditBusy, setCreditBusy] = useState(false);
  const [creditMessage, setCreditMessage] = useState('');
  const [walkersAdmin, setWalkersAdmin] = useState<WalkerAdmin[]>([]);
  const [walkerDocuments, setWalkerDocuments] = useState<WalkerDocument[]>([]);
  const [assignmentBookings, setAssignmentBookings] = useState<AssignmentBooking[]>([]);
  const [pricingRows, setPricingRows] = useState<PricingRow[]>([]);
  const [walkerSelections, setWalkerSelections] = useState<Record<string, string>>({});
  const [pricingInputs, setPricingInputs] = useState<Record<string, string>>({});
  const [walkerPayouts, setWalkerPayouts] = useState<WalkerPayout[]>([]);
  const [adminCustomers, setAdminCustomers] = useState<AdminCustomer[]>([]);
  const [bookingChangeRequests, setBookingChangeRequests] = useState<BookingChangeRequest[]>([]);
  const [subscriptionScheduleChanges, setSubscriptionScheduleChanges] = useState<SubscriptionScheduleChange[]>([]);
  const [operationsBusy, setOperationsBusy] = useState(false);
  const [operationsMessage, setOperationsMessage] = useState('');
  const [walkerName, setWalkerName] = useState('');
  const [walkerPhone, setWalkerPhone] = useState('');
  const [walkerExperience, setWalkerExperience] = useState('0');
  const [walkerAreas, setWalkerAreas] = useState('Gaur City 1, Gaur City 2');
  const [walkerBio, setWalkerBio] = useState('');
  const [walkerLocalAddress, setWalkerLocalAddress] = useState('');
  const [walkerPermanentAddress, setWalkerPermanentAddress] = useState('');

  async function verifyAdmin(userId: string, userEmail?: string) {
    if (!supabase) return;
    const { data, error: profileError } = await supabase
      .from('profiles').select('role').eq('id', userId).single();
    if (profileError || (data as AdminProfile | null)?.role !== 'admin') {
      await supabase.auth.signOut();
      setIsAdmin(false);
      setAdminEmail('');
      setError('इस खाते को Admin access नहीं मिला है। कृपया DOJO WALK Admin account से login करें।');
      return;
    }
    setError('');
    setAdminEmail(userEmail ?? '');
    setIsAdmin(true);
  }

  const loadDashboard = useCallback(async () => {
    if (!supabase) return;
    setDashboardLoading(true);
    setDashboardError('');
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const [dogs, subscriptions, today, pending, recentWalks, recentPayments, routeBookings, payLater] = await Promise.all([
      supabase.from('dogs').select('id', { count: 'exact', head: true }),
      supabase.from('dog_subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('bookings').select('id', { count: 'exact', head: true })
        .gte('scheduled_at', dayStart.toISOString()).lt('scheduled_at', dayEnd.toISOString()),
      supabase.from('subscription_payments').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('bookings')
        .select('id, scheduled_at, status, duration_minutes, service_type')
        .order('scheduled_at', { ascending: false }).limit(6),
      supabase.from('subscription_payments')
        .select('id, amount_inr, upi_transaction_ref, submitted_at, status, customer:profiles!subscription_payments_customer_id_fkey(full_name,phone), subscription:dog_subscriptions!inner(dog_id,dogs(name))')
        .eq('status', 'pending').order('submitted_at', { ascending: true }).limit(30),
      supabase.from('bookings')
        .select('id, status, scheduled_at, actual_started_at, actual_ended_at, dog:dogs(name)')
        .in('status', ['in_progress', 'completed'])
        .order('actual_started_at', { ascending: false }).limit(20),
      supabase.from('pay_later_requests')
        .select('id, created_at, customer_id, dog_id, package_id, customer:profiles!pay_later_requests_customer_id_fkey(full_name,phone), dog:dogs(name), package:service_packages(walks_per_day,duration_minutes,monthly_price_inr)')
        .eq('status', 'pending').order('created_at', { ascending: true }).limit(50),
    ]);
    const firstError = dogs.error || subscriptions.error || today.error || pending.error || recentWalks.error || recentPayments.error || routeBookings.error || payLater.error;
    if (firstError) {
      setDashboardError('Database data load नहीं हो पाया: ' + firstError.message);
    } else {
      setMetrics({
        dogs: dogs.count ?? 0,
        activeSubscriptions: subscriptions.count ?? 0,
        todayWalks: today.count ?? 0,
        pendingPayments: pending.count ?? 0,
      });
      setWalks((recentWalks.data ?? []) as Booking[]);
      setPayments((recentPayments.data ?? []) as PendingPayment[]);
      setPayLaterRequests((payLater.data ?? []) as unknown as PayLaterRequest[]);
      const routeRows = (routeBookings.data ?? []) as unknown as Omit<RouteWalk, 'points'>[];
      const routeIds = routeRows.map((item) => item.id);
      if (routeIds.length) {
        const { data: routePoints, error: routeError } = await supabase.from('walker_locations')
          .select('id, booking_id, latitude, longitude, recorded_at')
          .in('booking_id', routeIds).order('recorded_at', { ascending: true });
        if (routeError) setDashboardError('Route data load नहीं हुआ: ' + routeError.message);
        else setRouteWalks(routeRows.map((walk) => ({ ...walk, points: ((routePoints ?? []) as RoutePoint[]).filter((point) => point.booking_id === walk.id) })));
      } else setRouteWalks([]);
      setLastUpdated(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
    }
    setDashboardLoading(false);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setChecking(false);
      return;
    }
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive && data.session) void verifyAdmin(data.session.user.id, data.session.user.email);
      if (alive) setChecking(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      if (session) {
        window.setTimeout(() => { if (alive) void verifyAdmin(session.user.id, session.user.email); }, 0);
      } else {
        setIsAdmin(false);
        setAdminEmail('');
      }
    });
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const loadCreditCustomers = useCallback(async () => {
    if (!supabase) return;
    const [{ data: profiles, error: profileError }, { data: accounts, error: accountError }] = await Promise.all([
      supabase.from('profiles').select('id,full_name,phone').eq('role', 'customer').order('full_name'),
      supabase.from('customer_credit_accounts').select('customer_id,is_trusted,credit_limit_inr,custom_monthly_price_inr,admin_note'),
    ]);
    if (profileError || accountError) {
      setDashboardError('Customer credit data load नहीं हुआ: ' + (profileError || accountError)?.message);
      return;
    }
    const accountMap = new Map((accounts ?? []).map((account) => [account.customer_id, account]));
    const rows = (profiles ?? []).map((profile) => ({
      customer_id: profile.id,
      is_trusted: accountMap.get(profile.id)?.is_trusted ?? false,
      credit_limit_inr: accountMap.get(profile.id)?.credit_limit_inr ?? 0,
      custom_monthly_price_inr: accountMap.get(profile.id)?.custom_monthly_price_inr ?? null,
      admin_note: accountMap.get(profile.id)?.admin_note ?? null,
      profile: { full_name: profile.full_name, phone: profile.phone },
    })) as CustomerCredit[];
    setCreditCustomers(rows);
    if (!selectedCreditCustomer && rows.length) setSelectedCreditCustomer(rows[0].customer_id);
  }, [selectedCreditCustomer]);

  useEffect(() => {
    if (!isAdmin || !supabase) return;
    void loadCreditCustomers();
  }, [isAdmin, loadCreditCustomers]);

  const loadOperations = useCallback(async () => {
    if (!supabase) return;
    setOperationsBusy(true);
    const [walkerResult, bookingResult, pricingResult, payoutResult, customerResult, changeRequestResult, scheduleChangeResult, documentResult] = await Promise.all([
      supabase.from('walkers')
        .select('id,service_areas,experience_years,verification_status,account_status,profile:profiles!walkers_id_fkey(full_name,phone)')
        .order('created_at', { ascending: false }),
      supabase.from('bookings')
        .select('id,scheduled_at,duration_minutes,service_address,service_slot,service_latitude,service_longitude,status,walker_id,dog:dogs(name),customer:profiles!bookings_customer_id_fkey(full_name,phone)')
        .in('status', ['requested', 'assigned']).order('scheduled_at', { ascending: true }).limit(100),
      supabase.from('pricing').select('id,duration_minutes,price_inr,is_active').order('duration_minutes'),
      supabase.from('walker_payouts')
        .select('id,walker_id,payout_month,gross_amount_inr,paid_amount_inr,status,walker:walkers!walker_payouts_walker_id_fkey(profile:profiles!walkers_id_fkey(full_name,phone))')
        .order('payout_month', { ascending: false }).limit(100),
      supabase.from('profiles')
        .select('id,full_name,phone,dogs:dogs!dogs_customer_id_fkey(id,name,breed,age_years,service_address,service_latitude,service_longitude)')
        .eq('role', 'customer').order('full_name'),
      supabase.from('booking_change_requests')
        .select('id,booking_id,customer_id,proposed_scheduled_at,proposed_service_address,proposed_latitude,proposed_longitude,proposed_service_slot,customer_note,status,admin_note,created_at,booking:bookings!booking_change_requests_booking_id_fkey(scheduled_at,service_address,service_slot,status,dog:dogs(name)),customer:profiles!booking_change_requests_customer_id_fkey(full_name,phone)')
        .in('status', ['pending','needs_info','approved']).order('created_at', { ascending: true }).limit(100),
      supabase.from('subscription_schedule_change_requests')
        .select('id,subscription_id,proposed_morning_time,proposed_evening_time,proposed_service_address,proposed_latitude,proposed_longitude,customer_note,status,admin_note,created_at,dog:dogs(name),customer:profiles!subscription_schedule_change_requests_customer_id_fkey(full_name,phone),schedule:subscription_walk_schedules!subscription_schedule_change_requests_schedule_id_fkey(morning_time,evening_time,service_address)')
        .eq('status', 'pending').order('created_at', { ascending: true }).limit(100),
      supabase.from('walker_documents').select('id,walker_id,document_type,object_path,mime_type,file_size_bytes,created_at').order('created_at', { ascending: false }),
    ]);
    const failed = walkerResult.error || bookingResult.error || pricingResult.error || payoutResult.error || customerResult.error || changeRequestResult.error || scheduleChangeResult.error || documentResult.error;
    if (failed) setOperationsMessage('Management data load नहीं हुआ: ' + failed.message);
    else {
      setWalkersAdmin((walkerResult.data ?? []) as unknown as WalkerAdmin[]);
      setWalkerDocuments((documentResult.data ?? []) as WalkerDocument[]);
      setAssignmentBookings((bookingResult.data ?? []) as unknown as AssignmentBooking[]);
      const rows = (pricingResult.data ?? []) as PricingRow[];
      setPricingRows(rows);
      setPricingInputs(Object.fromEntries(rows.map((row) => [row.id, String(row.price_inr)])));
      setWalkerPayouts((payoutResult.data ?? []) as unknown as WalkerPayout[]);
      setAdminCustomers((customerResult.data ?? []) as unknown as AdminCustomer[]);
      setBookingChangeRequests((changeRequestResult.data ?? []) as unknown as BookingChangeRequest[]);
      setSubscriptionScheduleChanges((scheduleChangeResult.data ?? []) as unknown as SubscriptionScheduleChange[]);
      setOperationsMessage('');
    }
    setOperationsBusy(false);
  }, []);

  useEffect(() => {
    if (isAdmin) void loadOperations();
  }, [isAdmin, loadOperations]);

  async function createWalkerAccount() {
    if (!supabase) return;
    const phoneDigits = walkerPhone.replace(/[\s()-]/g, '');
    const phone = phoneDigits.startsWith('+91') ? phoneDigits : '+91' + phoneDigits.replace(/^0/, '');
    const experience = Number(walkerExperience);
    const areas = walkerAreas.split(',').map((area) => area.trim()).filter(Boolean);
    if (walkerName.trim().length < 2) { setOperationsMessage('Walker का पूरा नाम डालें।'); return; }
    if (!/^\+91[6-9]\d{9}$/.test(phone)) { setOperationsMessage('सही 10 अंकों का Indian mobile number डालें।'); return; }
    if (!Number.isFinite(experience) || experience < 0 || experience > 60) { setOperationsMessage('Experience 0 से 60 साल के बीच डालें।'); return; }
    if (!areas.length) { setOperationsMessage('कम से कम एक service area डालें।'); return; }
    setOperationsBusy(true); setOperationsMessage('');
    const { data, error: createError } = await supabase.functions.invoke('admin-create-walker', {
      body: {
        full_name: walkerName.trim(),
        phone,
        experience_years: experience,
        service_areas: areas,
        bio: walkerBio.trim(),
        local_address: walkerLocalAddress.trim(),
        permanent_address: walkerPermanentAddress.trim(),
      },
    });
    if (createError || data?.error) {
      setOperationsMessage('Walker account नहीं बना: ' + (data?.error || createError?.message || 'Unknown error'));
    } else {
      setWalkerName(''); setWalkerPhone(''); setWalkerExperience('0'); setWalkerBio(''); setWalkerLocalAddress(''); setWalkerPermanentAddress('');
      setOperationsMessage('Walker account बन गया। Mobile OTP verify होने के बाद वह काम कर सकेगा।');
      await loadOperations();
    }
    setOperationsBusy(false);
  }

  async function uploadWalkerDocument(walkerId: string, documentType: WalkerDocumentType, file: File | undefined) {
    if (!supabase || !file) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      setOperationsMessage('केवल JPG, PNG, WEBP या PDF document upload करें।');
      return;
    }
    if (file.size <= 0 || file.size > 5 * 1024 * 1024) {
      setOperationsMessage('File size 5 MB से कम होनी चाहिए।');
      return;
    }
    const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const startsWith = (...values: number[]) => values.every((value, index) => header[index] === value);
    const isJpeg = file.type === 'image/jpeg' && startsWith(0xff, 0xd8, 0xff);
    const isPng = file.type === 'image/png' && startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    const isWebp = file.type === 'image/webp' && startsWith(0x52, 0x49, 0x46, 0x46) && header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50;
    const isPdf = file.type === 'application/pdf' && startsWith(0x25, 0x50, 0x44, 0x46, 0x2d);
    if (!(isJpeg || isPng || isWebp || isPdf)) {
      setOperationsMessage('File का actual format उसके selected type से match नहीं करता। सही document file चुनें।');
      return;
    }
    const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'pdf';
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user?.id) {
      setOperationsMessage('Admin session verify नहीं हुआ। दोबारा login करें।');
      return;
    }
    const objectPath = walkerId + '/' + documentType + '-' + crypto.randomUUID() + '.' + extension;
    setOperationsBusy(true);
    setOperationsMessage('Private document upload हो रहा है…');
    const { error: uploadError } = await supabase.storage.from('walker-private-documents').upload(objectPath, file, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) {
      setOperationsMessage('Document upload नहीं हुआ: ' + uploadError.message);
      setOperationsBusy(false);
      return;
    }
    const { error: metadataError } = await supabase.from('walker_documents').insert({
      walker_id: walkerId,
      document_type: documentType,
      object_path: objectPath,
      mime_type: file.type,
      file_size_bytes: file.size,
      uploaded_by: authData.user.id,
    });
    if (metadataError) {
      await supabase.storage.from('walker-private-documents').remove([objectPath]);
      setOperationsMessage('Document record save नहीं हुआ; uploaded file हटाने की कोशिश की गई: ' + metadataError.message);
    } else {
      setOperationsMessage('Private document सुरक्षित bucket में upload हो गया।');
      await loadOperations();
    }
    setOperationsBusy(false);
  }

  async function openWalkerDocument(document: WalkerDocument) {
    if (!supabase) return;
    const { data, error: urlError } = await supabase.storage.from('walker-private-documents').createSignedUrl(document.object_path, 60);
    if (urlError || !data?.signedUrl) { setOperationsMessage('Document open नहीं हुआ: ' + (urlError?.message || 'Signed URL unavailable')); return; }
    window.location.assign(data.signedUrl);
  }

  async function deleteWalkerDocument(document: WalkerDocument) {
    if (!supabase) return;
    const label = document.document_type.replace(/_/g, ' ');
    if (!window.confirm('इस Walker का ' + label + ' document permanently delete करना है? यह action वापस नहीं होगा।')) return;
    setOperationsBusy(true); setOperationsMessage('');
    const { error: storageError } = await supabase.storage.from('walker-private-documents').remove([document.object_path]);
    if (storageError) {
      setOperationsMessage('File delete नहीं हुई; metadata सुरक्षित रखा गया: ' + storageError.message);
      setOperationsBusy(false);
      return;
    }
    const { error: metadataError } = await supabase.from('walker_documents').delete().eq('id', document.id);
    if (metadataError) setOperationsMessage('File हट गई लेकिन metadata delete नहीं हुआ; Admin support की जरूरत है: ' + metadataError.message);
    else { setOperationsMessage('Document permanently delete हो गया।'); await loadOperations(); }
    setOperationsBusy(false);
  }

  async function updateWalkerAccountStatus(walkerId: string, status: 'active' | 'on_hold' | 'suspended' | 'deactivated') {
    if (!supabase) return;
    const labels = { active: 'Active', on_hold: 'On Hold', suspended: 'Suspended', deactivated: 'Deactivated' };
    if (!window.confirm('Walker account को ' + labels[status] + ' करना है?')) return;
    setOperationsBusy(true); setOperationsMessage('');
    const { data, error: statusError } = await supabase.functions.invoke('admin-set-walker-status', {
      body: { walker_id: walkerId, account_status: status },
    });
    if (statusError || data?.error) {
      setOperationsMessage('Walker status update नहीं हुआ: ' + (data?.error || statusError?.message || 'Unknown error'));
    } else {
      setOperationsMessage('Walker account status: ' + labels[status]);
    }
    await loadOperations();
    setOperationsBusy(false);
  }

  async function assignBooking(bookingId: string) {
    if (!supabase) return;
    const walkerId = walkerSelections[bookingId];
    if (!walkerId) { setOperationsMessage('पहले approved walker चुनें।'); return; }
    setOperationsBusy(true); setOperationsMessage('');
    const { data, error: updateError } = await supabase.from('bookings')
      .update({ walker_id: walkerId, status: 'assigned' })
      .eq('id', bookingId).eq('status', 'requested')
      .select('id').maybeSingle();
    if (updateError) setOperationsMessage('Walk assign नहीं हुई: ' + updateError.message);
    else if (!data) setOperationsMessage('यह booking अब requested नहीं है। Refresh करके दोबारा देखें।');
    else setOperationsMessage('Walk selected walker को assign कर दी गई।');
    await loadOperations();
    setOperationsBusy(false);
  }

  async function recordWalkerPayout(payout: WalkerPayout) {
    if (!supabase) return;
    const due = Math.max(0, payout.gross_amount_inr - payout.paid_amount_inr);
    if (due === 0) return;
    const raw = window.prompt('Kitni salary/payout transfer ki? Remaining due: ₹' + due, String(due));
    if (raw === null) return;
    const amount = Number(raw);
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > due) {
      setOperationsMessage('Payout amount ₹1 से लेकर remaining due ₹' + due + ' तक होना चाहिए।');
      return;
    }
    const paidTotal = payout.paid_amount_inr + amount;
    setOperationsBusy(true); setOperationsMessage('');
    const { error: payoutError } = await supabase.from('walker_payouts')
      .update({
        paid_amount_inr: paidTotal,
        status: paidTotal >= payout.gross_amount_inr ? 'paid' : 'pending',
        paid_at: paidTotal >= payout.gross_amount_inr ? new Date().toISOString() : null,
      }).eq('id', payout.id);
    if (payoutError) setOperationsMessage('Payout update नहीं हुआ: ' + payoutError.message);
    else setOperationsMessage('Walker payout payment दर्ज हो गया।');
    await loadOperations();
    setOperationsBusy(false);
  }

  async function reviewBookingChange(requestId: string, decision: 'approve' | 'reject' | 'needs_info' | 'resolve') {
    if (!supabase) return;
    const note = decision === 'reject' || decision === 'needs_info' ? window.prompt(decision === 'reject' ? 'Reject karne ka reason:' : 'Customer se kaunsi detail chahiye?') : null;
    if ((decision === 'reject' || decision === 'needs_info') && (!note || note.trim().length < 3)) return;
    setOperationsBusy(true); setOperationsMessage('');
    const { error: reviewError } = await supabase.rpc('admin_review_booking_change_request', {
      p_request_id: requestId, p_decision: decision, p_admin_note: note,
    });
    if (reviewError) setOperationsMessage('Change request update nahi hui: ' + reviewError.message);
    else setOperationsMessage(decision === 'approve' ? 'Change approve karke booking par apply kar diya.' : decision === 'resolve' ? 'Request resolved mark ho gayi.' : decision === 'reject' ? 'Change request reject ho gayi.' : 'Customer se clarification maang li gayi.');
    await loadOperations();
    setOperationsBusy(false);
  }

  async function reviewSubscriptionScheduleChange(requestId: string, decision: 'approve' | 'reject') {
    if (!supabase) return;
    const note = decision === 'reject' ? window.prompt('Reject karne ka reason likhen:') : null;
    if (decision === 'reject' && (!note || note.trim().length < 3)) return;
    setOperationsBusy(true); setOperationsMessage('');
    const { error: reviewError } = await supabase.rpc('admin_review_subscription_schedule_change', {
      p_request_id: requestId, p_decision: decision, p_admin_note: note,
    });
    if (reviewError) setOperationsMessage('Weekly schedule request update nahi hui: ' + reviewError.message);
    else setOperationsMessage(decision === 'approve' ? 'Weekly schedule approve ho gaya; future unassigned bookings naye time par generate hongi.' : 'Weekly schedule change reject ho gaya; purana schedule active hai.');
    await loadOperations();
    setOperationsBusy(false);
  }

  async function savePricing(row: PricingRow) {
    if (!supabase) return;
    const amount = Number(pricingInputs[row.id]);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      setOperationsMessage(row.duration_minutes + ' मिनट की walk के लिए ₹1 या उससे अधिक सही price डालें।');
      return;
    }
    setOperationsBusy(true); setOperationsMessage('');
    const { error: updateError } = await supabase.from('pricing')
      .update({ price_inr: amount, is_active: true, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (updateError) setOperationsMessage('Pricing save नहीं हुई: ' + updateError.message);
    else setOperationsMessage(row.duration_minutes + ' मिनट की walk की pricing save हो गई।');
    await loadOperations();
    setOperationsBusy(false);
  }

  useEffect(() => {
    if (!isAdmin || !supabase || !selectedCreditCustomer) { setCreditEntries([]); return; }
    const customer = creditCustomers.find((item) => item.customer_id === selectedCreditCustomer);
    if (customer) {
      setTrustedEnabled(customer.is_trusted);
      setCreditLimit(String(customer.credit_limit_inr));
      setCreditNote(customer.admin_note ?? '');
    }
    void supabase.from('customer_credit_ledger')
      .select('id,entry_type,amount_inr,description,recorded_at')
      .eq('customer_id', selectedCreditCustomer)
      .order('recorded_at', { ascending: false })
      .limit(30)
      .then(({ data, error: ledgerError }) => {
        if (ledgerError) setCreditMessage('Ledger load नहीं हुआ: ' + ledgerError.message);
        else setCreditEntries((data ?? []) as CreditEntry[]);
      });
  }, [isAdmin, selectedCreditCustomer, creditCustomers]);

  async function saveCreditAccount() {
    if (!supabase || !selectedCreditCustomer) return;
    setCreditBusy(true); setCreditMessage('');
    const { error: saveError } = await supabase.rpc('admin_set_customer_credit_account', {
      p_customer_id: selectedCreditCustomer,
      p_is_trusted: trustedEnabled,
      p_credit_limit_inr: Number(creditLimit || 0),
      p_admin_note: creditNote,
    });
    if (saveError) setCreditMessage('Save नहीं हुआ: ' + saveError.message);
    else { setCreditMessage('Trusted customer settings save हो गईं।'); await loadCreditCustomers(); }
    setCreditBusy(false);
  }

  async function addCreditEntry() {
    if (!supabase || !selectedCreditCustomer) return;
    setCreditBusy(true); setCreditMessage('');
    const { error: entryError } = await supabase.rpc('admin_record_customer_credit_entry', {
      p_customer_id: selectedCreditCustomer,
      p_entry_type: ledgerType,
      p_amount_inr: Number(ledgerAmount),
      p_description: ledgerDescription,
    });
    if (entryError) setCreditMessage('Entry save नहीं हुई: ' + entryError.message);
    else {
      setCreditMessage(ledgerType === 'charge' ? 'बकाया जोड़ दिया गया।' : 'Payment received दर्ज हो गया।');
      setLedgerAmount(''); setLedgerDescription('');
      const { data } = await supabase.from('customer_credit_ledger')
        .select('id,entry_type,amount_inr,description,recorded_at')
        .eq('customer_id', selectedCreditCustomer)
        .order('recorded_at', { ascending: false }).limit(30);
      setCreditEntries((data ?? []) as CreditEntry[]);
    }
    setCreditBusy(false);
  }

  useEffect(() => {
    if (!isAdmin || !supabase) return;
    void loadDashboard();
    const channel = supabase.channel('admin-live-walk-routes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'walker_locations' }, () => { void loadDashboard(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => { void loadDashboard(); })
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [isAdmin, loadDashboard]);

  async function reviewPayment(paymentId: string, decision: 'verified' | 'rejected') {
    if (!supabase) return;
    const note = window.prompt(decision === 'verified'
      ? 'Optional admin note (UTR verified against your UPI statement):'
      : 'Rejection reason (required):');
    if (note === null) return;
    if (decision === 'rejected' && note.trim().length < 3) {
      setDashboardError('Reject करने के लिए कम से कम 3 अक्षर का कारण लिखें।');
      return;
    }
    setDashboardLoading(true); setDashboardError('');
    const { error: reviewError } = await supabase.rpc('admin_review_subscription_payment', {
      p_payment_id: paymentId,
      p_decision: decision,
      p_admin_note: note.trim() || null,
    });
    if (reviewError) setDashboardError('Payment review नहीं हो पाया: ' + reviewError.message);
    else setDashboardError(decision === 'verified'
      ? 'Payment verified. Subscription आज से activate हो गया।'
      : 'Payment rejected. Pending subscription cancel कर दिया गया।');
    await loadDashboard();
  }

  async function reviewPayLater(requestId: string, decision: 'approved' | 'rejected') {
    if (!supabase) return;
    const note = window.prompt(decision === 'approved'
      ? 'Optional approval note:'
      : 'Rejection reason (required):');
    if (note === null) return;
    if (decision === 'rejected' && note.trim().length < 3) {
      setDashboardError('Reject करने के लिए कम से कम 3 अक्षर का कारण लिखें।');
      return;
    }
    setDashboardLoading(true); setDashboardError('');
    const { error: reviewError } = await supabase.rpc('admin_review_pay_later_request', {
      p_request_id: requestId, p_decision: decision, p_admin_note: note.trim() || null,
    });
    if (reviewError) setDashboardError('Pay Later request review नहीं हुई: ' + reviewError.message);
    else setDashboardError(decision === 'approved'
      ? 'Pay Later approved. Package active और monthly due ledger में दर्ज हो गया।'
      : 'Pay Later request rejected.');
    await loadDashboard();
  }

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setError('');
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(), password,
    });
    if (authError) setError('Login नहीं हो पाया। Email और password जाँचें।');
    else if (data.user) await verifyAdmin(data.user.id, data.user.email);
    setLoading(false);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setIsAdmin(false);
    setAdminEmail('');
  }

  if (checking) return <main className="auth-shell"><div className="auth-card">DOJO WALK Admin सुरक्षित session जाँच रहा है…</div></main>;

  if (!isAdmin) {
    return (
      <main className="auth-shell">
        <form className="auth-card" onSubmit={signIn}>
          <div className="brand auth-brand"><span className="brand-mark">DW</span><span>DOJO WALK</span></div>
          <p className="eyebrow">ADMIN ACCESS</p>
          <h1>Welcome back</h1>
          <p className="muted">अपने सुरक्षित Admin account से sign in करें।</p>
          {!isSupabaseConfigured && <div className="notice">Supabase अभी configure नहीं है। पहले <code>apps/admin/.env</code> में Project URL और Publishable Key डालें।</div>}
          <label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@example.com" autoComplete="username" required /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="अपना password डालें" autoComplete="current-password" required /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" disabled={!isSupabaseConfigured || loading}>{loading ? 'Signing in…' : 'Sign in securely'}</button>
          <p className="auth-foot">केवल अधिकृत DOJO WALK Admin account को dashboard access मिलेगा।</p>
        </form>
      </main>
    );
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">DW</span><span>DOJO WALK</span></div>
        <p className="side-label">WORKSPACE</p>
        <nav><a className="active" href="#overview">Overview</a><a href="#walks">Walks</a><a href="#payments">Payments</a><a href="#pay-later-requests">Pay Later approvals</a><a href="#dogs">Dogs & customers</a><a href="#walkers">Walkers</a><a href="#weekly-schedule-requests">Weekly schedule requests</a><a href="#change-requests">Change requests</a><a href="#assignments">Walk assignment</a><a href="#pricing">Pricing</a><a href="#payouts">Walker payouts</a><a href="#trusted-customers">Trusted customers</a></nav>
        <div className="sidebar-foot">WALK. CARE. TRUST.</div>
      </aside>
      <section className="content" id="overview">
        <header>
          <div><p className="eyebrow">ADMIN WORKSPACE</p><h1>Overview</h1><p className="muted">Signed in as {adminEmail}</p></div>
          <div className="header-actions"><button className="refresh" onClick={() => void loadDashboard()} disabled={dashboardLoading}>{dashboardLoading ? 'Loading…' : 'Refresh data'}</button><button className="signout" onClick={signOut}>Sign out</button></div>
        </header>
        <section className="hero"><div><p className="eyebrow light">DOJO WALK</p><h2>Every walk. Every dog. Every detail.</h2><p>आपके DOJO WALK database से जुड़ा Admin overview।</p></div><div className="hero-mark">DW</div></section>
        {dashboardError && <div className="error dashboard-error" role="alert">{dashboardError}</div>}
        <section className="metrics">
          <article className="metric"><p>Registered dogs</p><strong>{metrics.dogs}</strong><small>Database में दर्ज dogs</small></article>
          <article className="metric"><p>Active subscriptions</p><strong>{metrics.activeSubscriptions}</strong><small>अभी चालू packages</small></article>
          <article className="metric"><p>Today's walks</p><strong>{metrics.todayWalks}</strong><small>आज scheduled walks</small></article>
          <article className="metric"><p>Pending UPI payments</p><strong>{metrics.pendingPayments}</strong><small>Admin verification बाकी</small></article>
        </section>
        <section className="panel route-panel" id="live-routes">
          <div className="panel-heading"><div><h3>Live walker locations & route history</h3><p>Only active walks and recent completed walks are shown</p></div><span className="subtle-count">{routeWalks.filter((walk) => walk.status === 'in_progress').length} active</span></div>
          {routeWalks.length === 0 ? <p className="empty">अभी कोई active या completed walk route उपलब्ध नहीं है।</p> : <div className="route-list">{routeWalks.map((walk) => {
            const first = walk.points[0];
            const latest = walk.points[walk.points.length - 1];
            const mapUrl = latest ? 'https://www.openstreetmap.org/?mlat=' + latest.latitude + '&mlon=' + latest.longitude + '#map=17/' + latest.latitude + '/' + latest.longitude : '';
            return <article className="route-row" key={walk.id}>
              <div className="route-info"><strong>{walk.dog?.name || 'Dog walk'} · {walk.status === 'in_progress' ? 'LIVE' : 'Completed'}</strong><small>{walk.actual_started_at ? dateTime(walk.actual_started_at) : dateTime(walk.scheduled_at)}</small><small>{walk.points.length} GPS points · {latest ? 'Last update ' + dateTime(latest.recorded_at) : 'No GPS points yet'}</small>{first && latest ? <small>Start {first.latitude.toFixed(5)}, {first.longitude.toFixed(5)} → Latest {latest.latitude.toFixed(5)}, {latest.longitude.toFixed(5)}</small> : null}</div>
              {latest ? <a className="map-link" href={mapUrl} target="_blank" rel="noreferrer">Open map ↗</a> : null}
            </article>;
          })}</div>}
        </section>
        <section className="panel route-panel" id="pay-later-requests">
          <div className="panel-heading"><div><h3>Pay Later requests · Admin approval</h3><p>Approve करने पर package active होगा और पूरा monthly charge customer ledger में जुड़ेगा।</p></div><span className="subtle-count">{payLaterRequests.length} pending</span></div>
          {payLaterRequests.length === 0 ? <p className="empty">कोई pending Pay Later request नहीं है।</p> : <div className="payment-list">{payLaterRequests.map((request) => <div className="payment-row payment-review-row" key={request.id}>
            <div><strong>{request.dog?.name || 'Dog'} · {money(request.package?.monthly_price_inr ?? 0)}</strong>
              <small>{request.customer?.full_name || 'Customer'} {request.customer?.phone ? '· ' + request.customer.phone : ''}</small>
              <small>{request.package?.walks_per_day ?? '—'} walk(s)/day · {request.package?.duration_minutes ?? '—'} min · Requested {dateTime(request.created_at)}</small>
              <div className="payment-actions"><button className="refresh approve" onClick={() => void reviewPayLater(request.id, 'approved')}>Approve & activate</button><button className="refresh reject" onClick={() => void reviewPayLater(request.id, 'rejected')}>Reject</button></div>
            </div><span className="pill pending">Approval pending</span>
          </div>)}</div>}
        </section>
        <section className="data-grid">
          <article className="panel" id="walks">
            <div className="panel-heading"><div><h3>Recent walks</h3><p>Latest scheduled walk records</p></div><span className="subtle-count">{walks.length} shown</span></div>
            {walks.length === 0 ? <p className="empty">अभी कोई walk record नहीं है।</p> : <div className="table-wrap"><table><thead><tr><th>Schedule</th><th>Duration</th><th>Type</th><th>Status</th></tr></thead><tbody>{walks.map((walk) => <tr key={walk.id}><td>{dateTime(walk.scheduled_at)}</td><td>{walk.duration_minutes} min</td><td>{walk.service_type === 'sunday_extra' ? 'Sunday extra' : 'Regular'}</td><td><span className={'pill ' + walk.status}>{statusLabel[walk.status] ?? walk.status}</span></td></tr>)}</tbody></table></div>}
          </article>
          <article className="panel" id="payments">
            <div className="panel-heading"><div><h3>Pending UPI payments</h3><p>Admin verification required</p></div><span className="subtle-count">{metrics.pendingPayments} pending</span></div>
            {payments.length === 0 ? <p className="empty">कोई pending payment नहीं है।</p> : <div className="payment-list">{payments.map((payment) => <div className="payment-row payment-review-row" key={payment.id}><div><strong>{money(payment.amount_inr)} · {payment.subscription?.dogs?.name || 'Dog not found'}</strong><small>{payment.customer?.full_name || 'Customer'} {payment.customer?.phone ? '· ' + payment.customer.phone : ''}</small><small>UTR: {payment.upi_transaction_ref || 'Not entered'}</small><small>{dateTime(payment.submitted_at)}</small><div className="payment-actions"><button className="refresh approve" onClick={() => void reviewPayment(payment.id, 'verified')}>Verify & activate</button><button className="refresh reject" onClick={() => void reviewPayment(payment.id, 'rejected')}>Reject</button></div></div><span className="pill pending">Pending</span></div>)}</div>}
            <p className="notice inline-notice">हर UTR को अपने PhonePe / bank statement में मिलाने के बाद ही Verify करें। Verify करने पर subscription आज से active होगा। Reject करने पर pending subscription cancel होगा।</p>
          </article>
        </section>
        <section className="panel route-panel" id="dogs">
          <div className="panel-heading"><div><h3>Customers & dogs</h3><p>Every dog is listed separately and remains linked to its own customer account and package.</p></div><span className="subtle-count">{adminCustomers.length} customers</span></div>
          {adminCustomers.length === 0 ? <p className="empty">अभी कोई customer account नहीं है।</p> : <div className="table-wrap"><table><thead><tr><th>Customer</th><th>Phone</th><th>Dogs & service location</th></tr></thead><tbody>{adminCustomers.map((customer) => <tr key={customer.id}><td>{customer.full_name || customer.id.slice(0, 8)}</td><td>{customer.phone || '—'}</td><td>{customer.dogs.length ? customer.dogs.map((dog) => dog.name + (dog.breed ? ' · ' + dog.breed : '') + (dog.service_address ? ' · ' + dog.service_address : ' · Address missing') + (dog.service_latitude !== null && dog.service_longitude !== null ? ' · Pin ' + dog.service_latitude.toFixed(4) + ', ' + dog.service_longitude.toFixed(4) : '')).join(' | ') : 'No dog added yet'}</td></tr>)}</tbody></table></div>}
        </section>
        <section className="panel route-panel" id="walkers">
          <div className="panel-heading"><div><h3>Walker management</h3><p>Admin creates and verifies each Walker profile. New accounts are Active; Admin can hold or close them later.</p></div><button className="refresh" onClick={() => void loadOperations()} disabled={operationsBusy}>Refresh</button></div>
          <div className="credit-form">
            <h4>Create walker account</h4>
            <p className="muted">Admin पूरा account बनाएगा। Walker अपने registered mobile पर OTP verify करके login करेगा। कोई approval/rejection step नहीं है।</p>
            <label>Walker full name<input value={walkerName} onChange={(event) => setWalkerName(event.target.value)} placeholder="Full name" maxLength={100} /></label>
            <label>Indian mobile number<input value={walkerPhone} onChange={(event) => setWalkerPhone(event.target.value)} placeholder="9876543210" inputMode="tel" maxLength={14} /></label>
            <label>Experience (years)<input type="number" min="0" max="60" step="0.5" value={walkerExperience} onChange={(event) => setWalkerExperience(event.target.value)} /></label>
            <label>Service areas (comma separated)<input value={walkerAreas} onChange={(event) => setWalkerAreas(event.target.value)} placeholder="Gaur City 1, Gaur City 2" maxLength={500} /></label>
            <label>Local address<textarea value={walkerLocalAddress} onChange={(event) => setWalkerLocalAddress(event.target.value)} placeholder="Current/local residential address" maxLength={500} required /></label>
            <label>Permanent address<textarea value={walkerPermanentAddress} onChange={(event) => setWalkerPermanentAddress(event.target.value)} placeholder="Permanent residential address" maxLength={500} required /></label>
            <label>Short bio (optional)<input value={walkerBio} onChange={(event) => setWalkerBio(event.target.value)} placeholder="Experience with dogs…" maxLength={1000} /></label>
            <button className="refresh approve" disabled={operationsBusy} onClick={() => void createWalkerAccount()}>{operationsBusy ? 'Please wait…' : 'Create walker account'}</button>
          </div>
          {walkersAdmin.length === 0 ? <p className="empty">अभी कोई walker account नहीं है।</p> : <div className="table-wrap"><table><thead><tr><th>Walker</th><th>Phone</th><th>Experience</th><th>Account Status</th><th>Private documents (max 5 MB each)</th><th>Action</th></tr></thead><tbody>{walkersAdmin.map((walker) => <tr key={walker.id}><td>{walker.profile?.full_name || walker.id.slice(0, 8)}</td><td>{walker.profile?.phone || '—'}</td><td>{walker.experience_years} years</td><td><span className={'pill ' + walker.account_status}>{walker.account_status.replace('_', ' ')}</span></td><td><div className="document-upload-list"><label>Selfie<input type="file" accept="image/jpeg,image/png,image/webp" disabled={operationsBusy} onChange={(event) => { void uploadWalkerDocument(walker.id, 'profile_selfie', event.target.files?.[0]); event.currentTarget.value = ''; }} /></label><label>Aadhaar front<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={operationsBusy} onChange={(event) => { void uploadWalkerDocument(walker.id, 'aadhaar_front', event.target.files?.[0]); event.currentTarget.value = ''; }} /></label><label>Aadhaar back<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={operationsBusy} onChange={(event) => { void uploadWalkerDocument(walker.id, 'aadhaar_back', event.target.files?.[0]); event.currentTarget.value = ''; }} /></label><label>PAN card<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={operationsBusy} onChange={(event) => { void uploadWalkerDocument(walker.id, 'pan_card', event.target.files?.[0]); event.currentTarget.value = ''; }} /></label></div><div className="walker-document-list">{walkerDocuments.filter((document) => document.walker_id === walker.id).map((document) => <div className="walker-document-row" key={document.id}><span>{document.document_type.replace(/_/g, ' ')} · {(document.file_size_bytes / 1024).toFixed(0)} KB · {dateTime(document.created_at)}</span><button type="button" className="refresh" disabled={operationsBusy} onClick={() => void openWalkerDocument(document)}>View / download</button><button type="button" className="refresh reject" disabled={operationsBusy} onClick={() => void deleteWalkerDocument(document)}>Delete</button></div>)}{walkerDocuments.every((document) => document.walker_id !== walker.id) ? <small>No documents uploaded yet.</small> : null}</div><div className="payment-actions">{walker.account_status === 'active' ? <><button className="refresh" disabled={operationsBusy} onClick={() => void updateWalkerAccountStatus(walker.id, 'on_hold')}>Hold</button><button className="refresh reject" disabled={operationsBusy} onClick={() => void updateWalkerAccountStatus(walker.id, 'suspended')}>Suspend</button><button className="refresh reject" disabled={operationsBusy} onClick={() => void updateWalkerAccountStatus(walker.id, 'deactivated')}>Deactivate</button></> : walker.account_status === 'deactivated' ? <span className="subtle-count">Closed</span> : <><button className="refresh approve" disabled={operationsBusy} onClick={() => void updateWalkerAccountStatus(walker.id, 'active')}>Reactivate</button><button className="refresh reject" disabled={operationsBusy} onClick={() => void updateWalkerAccountStatus(walker.id, 'deactivated')}>Deactivate</button></>}</div></td></tr>)}</tbody></table></div>}
        </section>
        <section className="panel route-panel" id="weekly-schedule-requests">
          <div className="panel-heading"><div><h3>Weekly schedule change requests</h3><p>Customer ke recurring morning/evening time aur service address changes review karein. Approval se pehle old schedule active rehta hai.</p></div><button className="refresh" onClick={() => void loadOperations()} disabled={operationsBusy}>Refresh</button></div>
          {subscriptionScheduleChanges.length === 0 ? <p className="empty">Koi pending weekly schedule change nahi hai.</p> : <div className="payment-list">{subscriptionScheduleChanges.map((request) => <div className="payment-row payment-review-row" key={request.id}><div><strong>{request.dog?.name || 'Dog'} · Weekly schedule</strong><small>{request.customer?.full_name || 'Customer'} {request.customer?.phone ? '· ' + request.customer.phone : ''}</small>{request.customer?.phone ? <small><a className="map-link" href={'tel:' + request.customer.phone}>Contact customer ↗</a></small> : null}<small>Current: {request.schedule?.morning_time ? 'Morning ' + request.schedule.morning_time.slice(0,5) : ''}{request.schedule?.morning_time && request.schedule?.evening_time ? ' · ' : ''}{request.schedule?.evening_time ? 'Evening ' + request.schedule.evening_time.slice(0,5) : ''} · {request.schedule?.service_address || 'No address'}</small><small>Requested: {request.proposed_morning_time ? 'Morning ' + request.proposed_morning_time.slice(0,5) : ''}{request.proposed_morning_time && request.proposed_evening_time ? ' · ' : ''}{request.proposed_evening_time ? 'Evening ' + request.proposed_evening_time.slice(0,5) : ''} · {request.proposed_service_address}</small>{request.proposed_latitude !== null && request.proposed_longitude !== null ? <small><a className="map-link" href={'https://www.openstreetmap.org/?mlat=' + request.proposed_latitude + '&mlon=' + request.proposed_longitude + '#map=17/' + request.proposed_latitude + '/' + request.proposed_longitude} target="_blank" rel="noreferrer">Open requested pickup pin ↗</a></small> : null}{request.customer_note ? <small>Customer note: {request.customer_note}</small> : null}<div className="payment-actions"><button className="refresh approve" disabled={operationsBusy} onClick={() => void reviewSubscriptionScheduleChange(request.id, 'approve')}>Approve & apply</button><button className="refresh reject" disabled={operationsBusy} onClick={() => void reviewSubscriptionScheduleChange(request.id, 'reject')}>Reject</button></div></div><span className="pill pending">Pending</span></div>)}</div>}
        </section>
        <section className="panel route-panel" id="change-requests">
          <div className="panel-heading"><div><h3>Customer change requests</h3><p>Time, morning/evening slot, address ya map pin change Admin approval ke baad hi apply hoga.</p></div><span className="subtle-count">{bookingChangeRequests.length} open</span></div>
          {bookingChangeRequests.length === 0 ? <p className="empty">Koi open change request nahi hai.</p> : <div className="payment-list">{bookingChangeRequests.map((request) => <div className="payment-row payment-review-row" key={request.id}><div><strong>{request.booking?.dog?.name || 'Dog'} · {request.status}</strong><small>{request.customer?.full_name || 'Customer'} {request.customer?.phone ? '· ' + request.customer.phone : ''}</small>{request.customer?.phone ? <small><a className="map-link" href={'tel:' + request.customer.phone}>Contact customer ↗</a></small> : null}<small>Current: {dateTime(request.booking?.scheduled_at || request.created_at)} · {request.booking?.service_slot || 'slot not set'} · {request.booking?.service_address || 'address missing'}</small>{request.proposed_scheduled_at ? <small>Requested time: {dateTime(request.proposed_scheduled_at)} · {request.proposed_service_slot || 'slot unchanged'}</small> : null}{request.proposed_service_address ? <small>New address: {request.proposed_service_address}</small> : null}{request.proposed_latitude !== null && request.proposed_longitude !== null ? <small>New map pin: {request.proposed_latitude.toFixed(5)}, {request.proposed_longitude.toFixed(5)}</small> : null}{request.customer_note ? <small>Customer note: {request.customer_note}</small> : null}{request.admin_note ? <small>Admin note: {request.admin_note}</small> : null}<div className="payment-actions">{request.status === 'pending' || request.status === 'needs_info' ? <><button className="refresh approve" disabled={operationsBusy} onClick={() => void reviewBookingChange(request.id, 'approve')}>Approve & apply</button><button className="refresh reject" disabled={operationsBusy} onClick={() => void reviewBookingChange(request.id, 'reject')}>Reject</button></> : <button className="refresh approve" disabled={operationsBusy} onClick={() => void reviewBookingChange(request.id, 'resolve')}>Mark resolved</button>}</div></div><span className={'pill ' + request.status}>{request.status}</span></div>)}</div>}
        </section>
        <section className="panel route-panel" id="assignments">
          <div className="panel-heading"><div><h3>Walk assignment</h3><p>Assign each requested walk to one approved walker.</p></div></div>
          {assignmentBookings.filter((booking) => booking.status === 'requested').length === 0 ? <p className="empty">कोई unassigned walk request नहीं है।</p> : <div className="payment-list">{assignmentBookings.filter((booking) => booking.status === 'requested').map((booking) => <div className="payment-row payment-review-row" key={booking.id}><div><strong>{booking.dog?.name || 'Dog'} · {booking.duration_minutes} min</strong><small>{booking.customer?.full_name || 'Customer'} {booking.customer?.phone ? '· ' + booking.customer.phone : ''}</small><small>{dateTime(booking.scheduled_at)} · {booking.service_slot ? booking.service_slot.toUpperCase() + ' · ' : ''}{booking.service_address}</small>{booking.service_latitude !== null && booking.service_longitude !== null ? <small><a className="map-link" href={'https://www.openstreetmap.org/?mlat=' + booking.service_latitude + '&mlon=' + booking.service_longitude + '#map=17/' + booking.service_latitude + '/' + booking.service_longitude} target="_blank" rel="noreferrer">Open pickup pin ↗</a></small> : null}<div className="payment-actions"><select value={walkerSelections[booking.id] || ''} onChange={(event) => setWalkerSelections((current) => ({ ...current, [booking.id]: event.target.value }))}><option value="">Active walker चुनें</option>{walkersAdmin.filter((walker) => walker.account_status === 'active').map((walker) => <option key={walker.id} value={walker.id}>{walker.profile?.full_name || walker.profile?.phone || walker.id.slice(0, 8)}</option>)}</select><button className="refresh approve" disabled={operationsBusy} onClick={() => void assignBooking(booking.id)}>Assign walk</button></div></div><span className="pill pending">Requested</span></div>)}</div>}
          {assignmentBookings.some((booking) => booking.status === 'assigned') ? <p className="notice inline-notice">{assignmentBookings.filter((booking) => booking.status === 'assigned').length} walk(s) already assigned. Walker sees only their own assigned walks.</p> : null}
        </section>
        <section className="panel route-panel" id="pricing">
          <div className="panel-heading"><div><h3>Walk pricing</h3><p>Admin sets the public per-walk price for 30, 45 and 60 minute services.</p></div></div>
          <div className="credit-grid">{pricingRows.map((row) => <div className="credit-form" key={row.id}><h4>{row.duration_minutes} minute walk</h4><label>Price in INR<input type="number" min="1" step="1" value={pricingInputs[row.id] ?? ''} onChange={(event) => setPricingInputs((current) => ({ ...current, [row.id]: event.target.value }))} /></label><small>{row.price_inr > 0 && row.is_active ? 'Active price' : 'Not available to customers until a valid price is saved'}</small><button className="refresh" disabled={operationsBusy} onClick={() => void savePricing(row)}>Save {row.duration_minutes} min price</button></div>)}</div>
        </section>
        {operationsMessage && <p className="notice">{operationsMessage}</p>}
        <section className="panel route-panel" id="payouts">
          <div className="panel-heading"><div><h3>Walker monthly payouts</h3><p>Completed billable walks automatically add the 80% walker share to the India-local payout month.</p></div><button className="refresh" onClick={() => void loadOperations()} disabled={operationsBusy}>Refresh</button></div>
          {walkerPayouts.length === 0 ? <p className="empty">अभी कोई completed billable walk payout generate नहीं हुआ है।</p> : <div className="table-wrap"><table><thead><tr><th>Walker</th><th>Month</th><th>Earned (80%)</th><th>Paid</th><th>Due</th><th>Status</th><th>Action</th></tr></thead><tbody>{walkerPayouts.map((payout) => {
            const due = Math.max(0, payout.gross_amount_inr - payout.paid_amount_inr);
            return <tr key={payout.id}><td>{payout.walker?.profile?.full_name || payout.walker?.profile?.phone || payout.walker_id.slice(0, 8)}</td><td>{new Date(payout.payout_month + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</td><td>{money(payout.gross_amount_inr)}</td><td>{money(payout.paid_amount_inr)}</td><td>{money(due)}</td><td><span className={'pill ' + payout.status}>{payout.status}</span></td><td>{due > 0 ? <button className="refresh approve" disabled={operationsBusy} onClick={() => void recordWalkerPayout(payout)}>Record transfer</button> : 'Settled'}</td></tr>;
          })}</tbody></table></div>}
          <p className="notice inline-notice">Commission rule: 20% DOJO WALK / 80% Walker. Commission accrues only when a completed booking has a positive billable price_inr; subscription walks must be assigned a correct billable amount before payout is expected.</p>
        </section>
        <section className="panel route-panel" id="trusted-customers">
          <div className="panel-heading"><div><h3>Trusted customers · Pay Later</h3><p>भरोसेमंद ग्राहक को अनुमति दें, बकाया जोड़ें और payment मिलने पर receipt दर्ज करें।</p></div></div>
          <div className="credit-grid">
            <div className="credit-form">
              <label>Customer account
                <select value={selectedCreditCustomer} onChange={(e) => setSelectedCreditCustomer(e.target.value)}>
                  <option value="">Trusted account चुनें</option>
                  {creditCustomers.map((customer) => <option key={customer.customer_id} value={customer.customer_id}>{customer.profile?.full_name || customer.profile?.phone || customer.customer_id}</option>)}
                </select>
              </label>
              <p className="muted">नया trusted customer बनाने के लिए पहले customer app से उसका account बनवाएँ; फिर उसका account यहाँ उपलब्ध होगा।</p>
              {selectedCreditCustomer ? <>
                <label className="check-line"><input type="checkbox" checked={trustedEnabled} onChange={(e) => setTrustedEnabled(e.target.checked)} /> Enable Pay Later for this customer</label>
                <label>Credit limit (₹, 0 = no limit)<input type="number" min="0" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} /></label>
                <label>Admin note<input value={creditNote} onChange={(e) => setCreditNote(e.target.value)} placeholder="e.g. Trusted long-time customer" /></label>
                <button className="refresh" disabled={creditBusy} onClick={() => void saveCreditAccount()}>{creditBusy ? 'Saving…' : 'Save trusted settings'}</button>
              </> : null}
            </div>
            <div className="credit-form">
              <h4>Record charge / payment</h4>
              <label>Entry type<select value={ledgerType} onChange={(e) => setLedgerType(e.target.value as 'charge' | 'payment')}><option value="charge">Add amount due (charge)</option><option value="payment">Payment received</option></select></label>
              <label>Amount (₹)<input type="number" min="1" value={ledgerAmount} onChange={(e) => setLedgerAmount(e.target.value)} placeholder="Amount" /></label>
              <label>Description<input value={ledgerDescription} onChange={(e) => setLedgerDescription(e.target.value)} placeholder="e.g. 10 dog walks / cash received" /></label>
              <button className="refresh" disabled={creditBusy || !selectedCreditCustomer || !trustedEnabled} onClick={() => void addCreditEntry()}>{ledgerType === 'charge' ? 'Add due amount' : 'Record payment received'}</button>
              {!trustedEnabled && <small>पहले Trusted settings save करके Pay Later enable करें।</small>}
            </div>
          </div>
          {creditMessage && <p className="notice">{creditMessage}</p>}
          <h4>Outstanding balance: {money(creditEntries.reduce((balance, entry) => balance + (entry.entry_type === 'charge' ? entry.amount_inr : entry.entry_type === 'payment' ? -entry.amount_inr : 0), 0))}</h4>
          <h4>Recent ledger entries</h4>
          {creditEntries.length === 0 ? <p className="empty">इस customer का ledger अभी खाली है।</p> : <div className="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Description</th></tr></thead><tbody>{creditEntries.map((entry) => <tr key={entry.id}><td>{dateTime(entry.recorded_at)}</td><td>{entry.entry_type === 'charge' ? 'Due added' : entry.entry_type === 'payment' ? 'Payment received' : 'Adjustment'}</td><td>{money(entry.amount_inr)}</td><td>{entry.description}</td></tr>)}</tbody></table></div>}
        </section>
        <footer>DOJO WALK · Admin dashboard · {lastUpdated ? 'Last refreshed ' + lastUpdated : 'Waiting for data'}</footer>
      </section>
    </main>
  );
}