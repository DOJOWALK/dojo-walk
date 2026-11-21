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
type PendingPayment = {
  id: string;
  amount_inr: number;
  upi_transaction_ref: string | null;
  submitted_at: string;
  status: string;
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
  const [lastUpdated, setLastUpdated] = useState('');

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
    const [dogs, subscriptions, today, pending, recentWalks, recentPayments] = await Promise.all([
      supabase.from('dogs').select('id', { count: 'exact', head: true }),
      supabase.from('dog_subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('bookings').select('id', { count: 'exact', head: true })
        .gte('scheduled_at', dayStart.toISOString()).lt('scheduled_at', dayEnd.toISOString()),
      supabase.from('subscription_payments').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('bookings')
        .select('id, scheduled_at, status, duration_minutes, service_type')
        .order('scheduled_at', { ascending: false }).limit(6),
      supabase.from('subscription_payments')
        .select('id, amount_inr, upi_transaction_ref, submitted_at, status')
        .eq('status', 'pending').order('submitted_at', { ascending: true }).limit(6),
    ]);
    const firstError = dogs.error || subscriptions.error || today.error || pending.error || recentWalks.error || recentPayments.error;
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

  useEffect(() => {
    if (isAdmin) void loadDashboard();
  }, [isAdmin, loadDashboard]);

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
        <nav><a className="active" href="#overview">Overview</a><a href="#walks">Walks</a><a href="#payments">Payments</a><a href="#dogs">Dogs & customers</a><a href="#walkers">Walkers</a><a href="#payouts">Walker payouts</a></nav>
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
        <section className="data-grid">
          <article className="panel" id="walks">
            <div className="panel-heading"><div><h3>Recent walks</h3><p>Latest scheduled walk records</p></div><span className="subtle-count">{walks.length} shown</span></div>
            {walks.length === 0 ? <p className="empty">अभी कोई walk record नहीं है।</p> : <div className="table-wrap"><table><thead><tr><th>Schedule</th><th>Duration</th><th>Type</th><th>Status</th></tr></thead><tbody>{walks.map((walk) => <tr key={walk.id}><td>{dateTime(walk.scheduled_at)}</td><td>{walk.duration_minutes} min</td><td>{walk.service_type === 'sunday_extra' ? 'Sunday extra' : 'Regular'}</td><td><span className={'pill ' + walk.status}>{statusLabel[walk.status] ?? walk.status}</span></td></tr>)}</tbody></table></div>}
          </article>
          <article className="panel" id="payments">
            <div className="panel-heading"><div><h3>Pending UPI payments</h3><p>Admin verification required</p></div><span className="subtle-count">{metrics.pendingPayments} pending</span></div>
            {payments.length === 0 ? <p className="empty">कोई pending payment नहीं है।</p> : <div className="payment-list">{payments.map((payment) => <div className="payment-row" key={payment.id}><div><strong>{money(payment.amount_inr)}</strong><small>Ref: {payment.upi_transaction_ref || 'Not entered'}</small><small>{dateTime(payment.submitted_at)}</small></div><span className="pill pending">Pending</span></div>)}</div>}
            <p className="notice inline-notice">Payment केवल bank/UPI statement से जाँचकर ही verified करें। यह स्क्रीन अभी केवल pending entries दिखाती है।</p>
          </article>
        </section>
        <footer>DOJO WALK · Admin dashboard · {lastUpdated ? 'Last refreshed ' + lastUpdated : 'Waiting for data'}</footer>
      </section>
    </main>
  );
}
