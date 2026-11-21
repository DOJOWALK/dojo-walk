const metrics = [
  { label: 'Active dogs', value: '—', note: 'Will load from Supabase' },
  { label: 'Today’s walks', value: '—', note: 'Live walk activity' },
  { label: 'Pending payments', value: '—', note: 'Awaiting admin verification' },
  { label: 'Walker payouts', value: '—', note: 'Monthly payout summary' },
];

export default function App() {
  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">DW</span><span>DOJO WALK</span></div>
        <p className="side-label">WORKSPACE</p>
        <nav><a className="active" href="#overview">Overview</a><a href="#walks">Walks</a><a href="#dogs">Dogs & customers</a><a href="#walkers">Walkers</a><a href="#payments">Payments</a><a href="#payouts">Walker payouts</a><a href="#settings">Settings</a></nav>
        <div className="sidebar-foot">WALK. CARE. TRUST.</div>
      </aside>
      <section className="content" id="overview">
        <header><div><p className="eyebrow">ADMIN WORKSPACE</p><h1>Overview</h1><p className="muted">Welcome to your DOJO WALK operations dashboard.</p></div><span className="status">Setup preview</span></header>
        <section className="hero"><div><p className="eyebrow light">DOJO WALK</p><h2>Every walk. Every dog. Every detail.</h2><p>Your service operations will appear here once secure Supabase access is connected.</p></div><div className="hero-mark">DW</div></section>
        <section className="metrics">{metrics.map((item) => <article className="metric" key={item.label}><p>{item.label}</p><strong>{item.value}</strong><small>{item.note}</small></article>)}</section>
        <section className="panel"><div><h3>Next setup steps</h3><p>Connect the existing Supabase project, add secure admin authentication, then build live operations and payment verification.</p></div><ol><li>Secure sign-in and role checks</li><li>Dog, customer, and walker management</li><li>Walk scheduling and GPS route history</li><li>UPI payment verification and monthly payouts</li></ol></section>
        <footer>DOJO WALK · Admin dashboard scaffold · Not connected to live data yet</footer>
      </section>
    </main>
  );
}
