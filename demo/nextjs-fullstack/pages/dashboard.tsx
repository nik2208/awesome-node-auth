/**
 * Dashboard — Protected page
 * Demonstrates GET /api/auth/me (requires valid accessToken cookie).
 * The middleware.ts file at the project root redirects unauthenticated
 * users back to the home page before this component even renders.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

interface User {
  sub: string;
  email: string;
  role?: string;
  iat?: number;
  exp?: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [meResult, setMeResult] = useState<unknown>(null);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.sub) { setUser(data); setMeResult(data); }
        else router.push('/');
      })
      .catch(() => router.push('/'))
      .finally(() => setLoading(false));
  }, []);

  async function doLogout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    router.push('/');
  }

  async function doRefresh() {
    const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    setMeResult({ _note: 'POST /api/auth/refresh', ...data });
  }

  if (loading) {
    return <div style={{ ...styles.page, justifyContent: 'center', alignItems: 'center' }}>Loading…</div>;
  }

  return (
    <>
      <Head><title>Dashboard — awesome-node-auth Next.js</title></Head>
      <div style={styles.page}>
        <header style={styles.header}>
          <div style={styles.logo}>node<span style={{ color: '#fff' }}>-auth</span>{' '}
            <small style={{ fontSize: 11, color: '#4a6a7a', fontWeight: 500 }}>Next.js</small>
          </div>
          <div style={styles.badge}><span style={styles.pulse} />authenticated</div>
          {user && (
            <span style={{ marginLeft: 'auto', fontSize: 13, color: '#00c896' }}>
              {user.email} · <span style={{ color: '#4a6a7a' }}>{user.role ?? 'user'}</span>
            </span>
          )}
          <a href="/api/admin" target="_blank" style={styles.adminLink}>🛡️ Admin ↗</a>
        </header>

        <main style={styles.main}>
          <div style={styles.panelLeft}>
            <div style={styles.formArea}>
              {user && (
                <div style={styles.userCard}>
                  <div style={styles.avatar}>👤</div>
                  <div style={styles.userEmail}>{user.email}</div>
                  <div style={styles.userMeta}>
                    id: {user.sub} &nbsp;
                    <span style={styles.roleBadge}>{user.role ?? 'user'}</span>
                  </div>
                </div>
              )}
              <div style={styles.infoBox}>
                You are authenticated via an <strong>HttpOnly JWT cookie</strong>. JavaScript
                cannot read the token — it is sent automatically by the browser.
              </div>
              <button style={styles.btn} onClick={() =>
                fetch('/api/auth/me', { credentials: 'include' })
                  .then(r => r.json()).then(setMeResult)
              }>
                GET /api/auth/me →
              </button>
              <button style={{ ...styles.btn, ...styles.btnSecondary }} onClick={doRefresh}>
                POST /api/auth/refresh
              </button>
              <button style={{ ...styles.btn, ...styles.btnDanger }} onClick={doLogout}>
                POST /api/auth/logout
              </button>
            </div>
          </div>

          <div style={styles.panelRight}>
            {meResult ? (
              <>
                <div style={styles.respHeader}>
                  <span style={{ ...styles.methodGet }}>GET</span>
                  <code style={styles.respPath}>/api/auth/me</code>
                  <span style={styles.statusOk}>200 OK</span>
                </div>
                <pre style={styles.pre}>{JSON.stringify(meResult, null, 2)}</pre>
              </>
            ) : (
              <div style={styles.respEmpty}><p>Click a button to make an API call</p></div>
            )}
          </div>
        </main>
      </div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { background: '#0b1320', color: '#c8dce8', fontFamily: 'system-ui, sans-serif', minHeight: '100vh', display: 'flex', flexDirection: 'column' },
  header: { background: '#0f1c2e', borderBottom: '1px solid #1a2e42', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 14 },
  logo: { fontSize: 18, fontWeight: 800, color: '#00c896', letterSpacing: -0.5 },
  badge: { display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(0,200,150,.1)', border: '1px solid rgba(0,200,150,.25)', borderRadius: 100, padding: '2px 10px', fontSize: 11, fontWeight: 700, color: '#00c896', letterSpacing: 1, textTransform: 'uppercase' },
  pulse: { width: 6, height: 6, background: '#00c896', borderRadius: '50%', display: 'inline-block' },
  adminLink: { fontSize: 12, color: '#4a6a7a', textDecoration: 'none', padding: '5px 10px', border: '1px solid #1a2e42', borderRadius: 6 },
  main: { flex: 1, display: 'grid', gridTemplateColumns: '400px 1fr', height: 'calc(100vh - 54px)', overflow: 'hidden' },
  panelLeft: { background: '#0f1c2e', borderRight: '1px solid #1a2e42', display: 'flex', flexDirection: 'column' },
  formArea: { flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 10 },
  userCard: { background: 'rgba(0,200,150,.05)', border: '1px solid rgba(0,200,150,.15)', borderRadius: 10, padding: 14 },
  avatar: { width: 42, height: 42, background: 'linear-gradient(135deg,#00a87a,#005a40)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, marginBottom: 10 },
  userEmail: { fontSize: 15, fontWeight: 600, color: '#d0e8e0' },
  userMeta: { fontSize: 12, color: '#4a6a7a', marginTop: 4 },
  roleBadge: { background: 'rgba(0,200,150,.1)', border: '1px solid rgba(0,200,150,.2)', color: '#00c896', borderRadius: 100, padding: '1px 8px', fontSize: 11, fontWeight: 600 },
  infoBox: { background: 'rgba(0,200,150,.06)', border: '1px solid rgba(0,200,150,.15)', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#80b0a0', lineHeight: 1.6 },
  btn: { background: 'linear-gradient(135deg,#00a87a,#007a58)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', width: '100%', fontFamily: 'inherit' },
  btnSecondary: { background: 'transparent', border: '1px solid rgba(255,255,255,.1)', color: '#7a8a9a' },
  btnDanger: { background: 'rgba(200,50,50,.15)', border: '1px solid rgba(200,50,50,.3)', color: '#ff8a8a' },
  panelRight: { background: '#070f1a', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  respHeader: { padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,.05)', display: 'flex', alignItems: 'center', gap: 8 },
  methodGet: { fontSize: 11, fontWeight: 800, padding: '2px 7px', borderRadius: 5, fontFamily: 'monospace', background: 'rgba(0,200,150,.14)', color: '#00c896' },
  respPath: { fontSize: 13, color: '#5a8a9a', fontFamily: 'monospace' },
  statusOk: { fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: 'rgba(0,200,150,.14)', color: '#00c896' },
  pre: { margin: 0, padding: '16px 18px', fontSize: 13, lineHeight: 1.75, fontFamily: 'monospace', color: '#90c8b0', whiteSpace: 'pre', flex: 1, overflow: 'auto' },
  respEmpty: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1a3a4a', fontSize: 14 },
};
