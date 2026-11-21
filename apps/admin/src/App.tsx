import { useCallback, useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from './lib/supabase';

type AdminProfile = { role: string };
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
        <nav><a className="active" href="#overview">Overview</a><a href="#walks">Walks</a><a href="#payments">Payments</a><a href="#pay-later-requests">Pay Later approvals</a><a href="#dogs">Dogs & customers</a><a href="#walkers">Walkers</a><a href="#payouts">Walker payouts</a><a href="#trusted-customers">Trusted customers</a></nav>
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
