/**
 * Landing page — Register / Login
 * Demonstrates POST /api/auth/register and POST /api/auth/login
 * with HttpOnly JWT cookies set by awesome-node-auth.
 */

import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

type Tab = 'register' | 'login';

interface ApiResult {
  method: string;
  path: string;
  status: number;
  body: unknown;
}

async function callApi(method: string, path: string, body?: unknown): Promise<{ status: number; data: unknown }> {
  try {
    const res = await fetch(path, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } catch (err) {
    return { status: 0, data: { error: String(err) } };
  }
}

export default function HomePage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('register');
  const [email, setEmail] = useState('alice@example.com');
  const [password, setPassword] = useState('secret123');
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function doRegister() {
    setLoading(true);
    const { status, data } = await callApi('POST', '/api/auth/register', { email, password });
    setResult({ method: 'POST', path: '/api/auth/register', status, body: data });
    if (status === 201) setTab('login');
    setLoading(false);
  }

  async function doLogin() {
    setLoading(true);
    const { status, data } = await callApi('POST', '/api/auth/login', { email, password });
    setResult({ method: 'POST', path: '/api/auth/login', status, body: data });
    if (status === 200) router.push('/dashboard');
    setLoading(false);
  }

  const statusClass = result
    ? result.status < 300 ? 'ok' : result.status < 500 ? 'err' : 'srv'
    : '';

  return (
    <>
      <Head>
        <title>awesome-node-auth Next.js — Live Demo</title>
      </Head>

      <div style={styles.page}>
        <header style={styles.header}>
          <div style={styles.logo}>node<span style={{ color: '#fff' }}>-auth</span>{' '}
            <small style={{ fontSize: 11, color: '#4a6a7a', fontWeight: 500 }}>Next.js</small>
          </div>
          <div style={styles.badge}><span style={styles.pulse} />live demo</div>
          <a href="/api/admin" target="_blank" style={styles.adminLink}>🛡️ Admin ↗</a>
        </header>

        <main style={styles.main}>
          <div style={styles.panelLeft}>
            {/* Tabs */}
            <nav style={styles.tabs}>
              {(['register', 'login'] as Tab[]).map(t => (
                <button
                  key={t}
                  style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}
                  onClick={() => setTab(t)}
                >
                  {t === 'register' ? '📝 Register' : '🔑 Login'}
                </button>
              ))}
            </nav>

            <div style={styles.formArea}>
              {tab === 'register' && (
                <>
                  <div style={styles.endpoint}>POST /api/auth/register</div>
                  <label style={styles.label}>Email</label>
                  <input style={styles.input} type="email" value={email} onChange={e => setEmail(e.target.value)} />
                  <label style={styles.label}>Password</label>
                  <input style={styles.input} type="password" value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && doRegister()} />
                  <button style={styles.btn} onClick={doRegister} disabled={loading}>
                    {loading ? 'Registering…' : 'Register →'}
                  </button>
                  <div style={styles.infoBox}>
                    After registering, switch to Login. The server uses <strong>bcrypt</strong> and
                    issues <code style={styles.code}>HttpOnly JWT cookies</code>.
                  </div>
                </>
              )}

              {tab === 'login' && (
                <>
                  <div style={styles.endpoint}>POST /api/auth/login</div>
                  <label style={styles.label}>Email</label>
                  <input style={styles.input} type="email" value={email} onChange={e => setEmail(e.target.value)} />
                  <label style={styles.label}>Password</label>
                  <input style={styles.input} type="password" value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && doLogin()} />
                  <button style={styles.btn} onClick={doLogin} disabled={loading}>
                    {loading ? 'Signing in…' : 'Login →'}
                  </button>
                  <div style={styles.infoBox}>
                    Login sets an <code style={styles.code}>accessToken</code> HttpOnly cookie.
                    On success you will be redirected to <code style={styles.code}>/dashboard</code>.
                  </div>
                </>
              )}
            </div>
          </div>

          <div style={styles.panelRight}>
            {result ? (
              <>
                <div style={styles.respHeader}>
                  <span style={{ ...styles.method, ...(result.method === 'POST' ? styles.methodPost : {}) }}>
                    {result.method}
                  </span>
                  <code style={styles.respPath}>{result.path}</code>
                  <span style={{ ...styles.status, ...(statusClass === 'ok' ? styles.statusOk : styles.statusErr) }}>
                    {result.status}
                  </span>
                </div>
                <pre style={styles.pre}>{JSON.stringify(result.body, null, 2)}</pre>
              </>
            ) : (
              <div style={styles.respEmpty}>
                <p>Send a request to see the response</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  );
}

// ── Inline styles ─────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: { background: '#0b1320', color: '#c8dce8', fontFamily: 'system-ui, sans-serif', minHeight: '100vh', display: 'flex', flexDirection: 'column' },
  header: { background: '#0f1c2e', borderBottom: '1px solid #1a2e42', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 14 },
  logo: { fontSize: 18, fontWeight: 800, color: '#00c896', letterSpacing: -0.5 },
  badge: { display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(0,200,150,.1)', border: '1px solid rgba(0,200,150,.25)', borderRadius: 100, padding: '2px 10px', fontSize: 11, fontWeight: 700, color: '#00c896', letterSpacing: 1, textTransform: 'uppercase' },
  pulse: { width: 6, height: 6, background: '#00c896', borderRadius: '50%', display: 'inline-block' },
  adminLink: { marginLeft: 'auto', fontSize: 12, color: '#4a6a7a', textDecoration: 'none', padding: '5px 10px', border: '1px solid #1a2e42', borderRadius: 6 },
  main: { flex: 1, display: 'grid', gridTemplateColumns: '400px 1fr', height: 'calc(100vh - 54px)', overflow: 'hidden' },
  panelLeft: { background: '#0f1c2e', borderRight: '1px solid #1a2e42', display: 'flex', flexDirection: 'column' },
  tabs: { display: 'flex', borderBottom: '1px solid #1a2e42' },
  tab: { flex: 1, background: 'none', border: 'none', borderBottom: '2px solid transparent', marginBottom: -1, color: '#4a6a7a', fontSize: 13, fontWeight: 500, padding: '11px 4px', cursor: 'pointer', fontFamily: 'inherit' },
  tabActive: { color: '#00c896', borderBottomColor: '#00c896', background: 'rgba(0,200,150,.04)' },
  formArea: { flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 4 },
  endpoint: { fontFamily: 'monospace', fontSize: 11, color: '#3a8a60', background: 'rgba(0,200,150,.06)', border: '1px solid rgba(0,200,150,.12)', borderRadius: 6, padding: '5px 10px', marginBottom: 14 },
  label: { fontSize: 11, fontWeight: 700, color: '#4a6a7a', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 10, marginBottom: 4 },
  input: { width: '100%', background: '#0e1928', border: '1px solid rgba(0,200,150,.15)', borderRadius: 8, color: '#d0e8e0', fontSize: 14, padding: '9px 12px', outline: 'none', fontFamily: 'inherit' },
  btn: { marginTop: 14, background: 'linear-gradient(135deg,#00a87a,#007a58)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', width: '100%', fontFamily: 'inherit' },
  infoBox: { background: 'rgba(0,200,150,.06)', border: '1px solid rgba(0,200,150,.15)', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#80b0a0', lineHeight: 1.6, marginTop: 10 },
  code: { background: 'rgba(0,200,150,.12)', color: '#00c896', padding: '1px 5px', borderRadius: 4, fontSize: 12, fontFamily: 'monospace' },
  panelRight: { background: '#070f1a', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  respHeader: { padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,.05)', display: 'flex', alignItems: 'center', gap: 8 },
  method: { fontSize: 11, fontWeight: 800, padding: '2px 7px', borderRadius: 5, fontFamily: 'monospace' },
  methodPost: { background: 'rgba(80,130,255,.14)', color: '#7090ff' },
  respPath: { fontSize: 13, color: '#5a8a9a', fontFamily: 'monospace' },
  status: { fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100 },
  statusOk: { background: 'rgba(0,200,150,.14)', color: '#00c896' },
  statusErr: { background: 'rgba(255,160,50,.14)', color: '#ffb060' },
  pre: { margin: 0, padding: '16px 18px', fontSize: 13, lineHeight: 1.75, fontFamily: 'monospace', color: '#90c8b0', whiteSpace: 'pre', flex: 1, overflow: 'auto' },
  respEmpty: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1a3a4a', fontSize: 14 },
};
