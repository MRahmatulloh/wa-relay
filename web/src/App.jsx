import { useCallback, useEffect, useMemo, useState } from 'react'
import { io } from 'socket.io-client'
import {
  fetchHealth,
  fetchMessages,
  fetchUnreadByFolder,
  getHost,
  getToken,
  login,
  patchMessage,
  setHost,
  setToken,
} from './api'
import './App.css'

const FOLDERS = ['all', 'lgw', 'lhr', 'ltn', 'stn', 'others']
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'read', label: 'Read' },
  { id: 'starred', label: 'Starred' },
  { id: 'thumbsUp', label: 'Thumbs up' },
  { id: 'done', label: 'Done' },
  { id: 'parseBug', label: 'Parse bugs' },
]

function formatJobs(jobs) {
  if (!Array.isArray(jobs) || !jobs.length) return null
  const j = jobs[0]
  const from = j.from || null
  const to = j.to || null
  const price =
    j.price != null && Number.isFinite(Number(j.price))
      ? `£${Number(j.price)}`
      : null

  // Multi-leg + one total fare: show combined miles for £/mi consistency
  let milesNum =
    j.distanceMiles != null && Number.isFinite(Number(j.distanceMiles))
      ? Number(j.distanceMiles)
      : null
  let perMileNum =
    j.pricePerMile != null && Number.isFinite(Number(j.pricePerMile))
      ? Number(j.pricePerMile)
      : null
  if (jobs.length > 1 && j.price != null) {
    const sum = jobs.reduce((s, x) => {
      const d = x.distanceMiles
      return s + (d != null && Number.isFinite(Number(d)) ? Number(d) : 0)
    }, 0)
    if (sum > 0) {
      milesNum = Math.round(sum * 10) / 10
      perMileNum = Math.round((Number(j.price) / sum) * 100) / 100
    }
  }

  const miles = milesNum != null ? `${milesNum} mi` : null
  const perMile = perMileNum != null ? `£${perMileNum}/mi` : null
  if (!from && !to && !price && !miles) return null
  return {
    from,
    to,
    price,
    miles,
    perMile,
    extra: jobs.length > 1 ? jobs.length - 1 : 0,
  }
}

function formatTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function Icon({ d, children }) {
  return (
    <svg className="btn-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {d ? <path d={d} /> : children}
    </svg>
  )
}

function Login({ onOk }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const data = await login(username.trim(), password)
      setToken(data.token)
      onOk(data.username || username)
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>WA Relay Admin</h1>
        <label>
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error ? <div className="error">{error}</div> : null}
        <button type="submit" className="btn" disabled={busy}>
          <Icon d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" />
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

const WA_TEXT_MAX = 1500

/** Prefills WhatsApp compose with order text (`?text=`). Matches mobile apps. */
function buildWaMeUrl(waLink, text) {
  const raw = typeof waLink === 'string' ? waLink.trim() : ''
  if (!raw.startsWith('https://wa.me/') || raw.length <= 'https://wa.me/'.length) return null
  const base = raw.split('?')[0]
  const body = (text || '').trim()
  if (!body) return base
  const truncated = body.length > WA_TEXT_MAX ? body.slice(0, WA_TEXT_MAX) : body
  return `${base}?text=${encodeURIComponent(truncated)}`
}

function MessageRow({ msg, onPatch }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const jobsLine = formatJobs(msg.jobs)
  const unread = !msg.readAt
  const waHref = buildWaMeUrl(msg.waLink, msg.text)

  function toggleOpen() {
    const next = !open
    setOpen(next)
    if (next && unread) onPatch(msg, { read: true })
  }

  async function copyText(e) {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(msg.text || '')
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <article className={`msg ${unread ? 'unread' : ''}`}>
      <button type="button" className="msg-main" onClick={toggleOpen}>
        <div className="msg-top">
          <span className={`unread-dot ${unread ? 'on' : ''}`} aria-hidden="true" />
          <strong className={unread ? 'msg-title-unread' : undefined}>
            {msg.senderName || msg.senderPhone || 'Unknown'}
            {msg.isGroup && msg.groupName ? ` · ${msg.groupName}` : ''}
          </strong>
          <span className="chip">{(msg.folder || 'others').toUpperCase()}</span>
          <span className="chip times muted small">
            In: {formatTime(msg.createdAt || msg.timestamp)}
            {' · '}
            Read: {formatTime(msg.readAt)}
          </span>
        </div>
        {jobsLine ? (
          <div className="jobs">
            {(jobsLine.from || jobsLine.to) ? (
              <span className="jobs-route">
                {jobsLine.from || '—'}
                <span className="jobs-arrow" aria-hidden="true">→</span>
                {jobsLine.to || '—'}
              </span>
            ) : null}
            {jobsLine.price ? <span className="jobs-price">{jobsLine.price}</span> : null}
            {jobsLine.miles ? <span className="jobs-miles">{jobsLine.miles}</span> : null}
            {jobsLine.perMile ? <span className="jobs-per-mile">{jobsLine.perMile}</span> : null}
            {jobsLine.extra ? <span className="jobs-extra">+{jobsLine.extra}</span> : null}
          </div>
        ) : null}
        {open ? <div className="preview full">{msg.text}</div> : null}
        <div className="meta muted small">
          parse: {msg.parseStatus || '—'}
          {msg.parseSource ? ` · ${msg.parseSource}` : ''}
          {msg.parseBug ? ' · parse bug' : ''}
          {msg.starred ? ' · ★' : ''}
          {msg.thumbsUp ? ' · 👍' : ''}
          {msg.done ? ' · done' : ''}
        </div>
      </button>
      {open ? (
        <div className="msg-actions">
          <button type="button" onClick={() => onPatch(msg, { starred: !msg.starred })}>
            <Icon d={msg.starred
              ? 'M12 2l2.9 6.9L22 10.3l-5 4.6L18.2 22 12 18.3 5.8 22 7 14.9l-5-4.6 7.1-1.4L12 2z'
              : 'M12 3.5l2.2 5.1 5.5.6-4.2 3.8 1.2 5.4L12 15.8 7.3 18.4l1.2-5.4-4.2-3.8 5.5-.6L12 3.5z'}
            />
            {msg.starred ? 'Unstar' : 'Star'}
          </button>
          <button type="button" onClick={() => onPatch(msg, { done: !msg.done })}>
            <Icon d="M20 6L9 17l-5-5" />
            {msg.done ? 'Undone' : 'Done'}
          </button>
          <button type="button" onClick={copyText}>
            <Icon d="M8 8h10v12H8zM6 4h10v2H6z" />
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            className={msg.parseBug ? 'danger' : ''}
            onClick={() => onPatch(msg, { parseBug: !msg.parseBug })}
            title="Mark incorrect parse as bug"
          >
            <Icon d="M12 3c-1.5 2-2 3.5-2 5a2 2 0 104 0c0-1.5-.5-3-2-5zM8 10h8M9 14h6M10 18h4M9 10c-2 .5-3.5 2-3.5 4M15 10c2 .5 3.5 2 3.5 4" />
            {msg.parseBug ? 'Unmark bug' : 'Parse bug'}
          </button>
          {waHref ? (
            <a className="wa-btn" href={waHref} target="_blank" rel="noreferrer">
              <Icon d="M8 5v14l11-7L8 5z" />
              WhatsApp
            </a>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

function sessionFromHealth(health, error = null) {
  if (error) {
    return { loading: false, reachable: false, status: null, ok: false, hasQr: false, error }
  }
  const wa = health?.whatsapp || {}
  return {
    loading: false,
    reachable: Boolean(health?.ok),
    status: wa.status ?? null,
    ok: Boolean(wa.ok ?? wa.connected),
    hasQr: Boolean(wa.hasQr),
    error: null,
  }
}

function WhatsAppSessionCard({ session, hostUrl }) {
  const checking = session.loading && !session.status && !session.error
  const sessionOk = session.reachable && session.ok
  const tone = checking ? 'checking' : sessionOk ? 'ok' : 'bad'
  const headline = checking
    ? 'WhatsApp session'
    : sessionOk
      ? 'WhatsApp session: OK'
      : 'WhatsApp session: not OK'
  let detail = 'Status: unknown'
  if (checking) detail = 'Checking…'
  else if (!session.reachable || session.error) detail = session.error || 'Backend unreachable'
  else if (sessionOk) detail = 'Connected (open)'
  else if (session.status === 'qr' || session.hasQr) {
    const base = (hostUrl || window.location.origin).replace(/\/$/, '')
    detail = `Needs QR scan — open ${base}/qr`
  } else if (session.status === 'starting') detail = 'Starting… wait a moment'
  else if (session.status === 'close') detail = 'Disconnected — reconnecting or needs QR'
  else detail = `Status: ${session.status || 'unknown'}`

  return (
    <div className={`session-card session-${tone}`}>
      <div className="session-icon" aria-hidden="true">
        {checking ? <span className="session-spinner" /> : sessionOk ? '✓' : '✕'}
      </div>
      <div>
        <strong>{headline}</strong>
        <p className="muted small">{detail}</p>
      </div>
    </div>
  )
}

function Settings({ username, onBack, onLogout, onHostSaved }) {
  const [hostDraft, setHostDraft] = useState(() => getHost())
  const [savedHint, setSavedHint] = useState('')
  const [session, setSession] = useState({
    loading: true,
    reachable: false,
    status: null,
    ok: false,
    hasQr: false,
    error: null,
  })

  const refreshSession = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setSession((prev) => ({ ...prev, loading: true, error: null }))
    }
    try {
      const health = await fetchHealth()
      setSession(sessionFromHealth(health))
    } catch (err) {
      setSession(sessionFromHealth(null, err.message || 'Health check failed'))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function poll() {
      if (cancelled) return
      try {
        const health = await fetchHealth()
        if (!cancelled) setSession(sessionFromHealth(health))
      } catch (err) {
        if (!cancelled) setSession(sessionFromHealth(null, err.message || 'Health check failed'))
      }
    }
    poll()
    const id = setInterval(poll, 3000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  function saveHost(e) {
    e.preventDefault()
    setHost(hostDraft)
    setSavedHint('Host saved')
    onHostSaved?.(getHost())
    setTimeout(() => setSavedHint(''), 2000)
    refreshSession(true)
  }

  const qrHost = hostDraft.trim() || getHost() || window.location.origin

  return (
    <div className="admin settings">
      <header className="top">
        <div>
          <h1>Settings</h1>
          <p className="muted">{username ? `Signed in as ${username}` : 'Account'}</p>
        </div>
        <div className="top-actions">
          <button type="button" className="btn-secondary icon-btn" onClick={() => refreshSession(true)} title="Refresh session">
            <Icon d="M21 12a9 9 0 11-2.64-6.36M21 3v6h-6" />
          </button>
          <button type="button" className="btn-secondary" onClick={onBack}>
            <Icon d="M19 12H5M12 19l-7-7 7-7" />
            Back
          </button>
        </div>
      </header>

      <section className="settings-section">
        <h2>WhatsApp session</h2>
        <WhatsAppSessionCard session={session} hostUrl={qrHost} />
        {(session.status === 'qr' || session.hasQr) && !session.ok ? (
          <a className="qr-link" href={`${qrHost.replace(/\/$/, '')}/qr`} target="_blank" rel="noreferrer">
            Open QR page
          </a>
        ) : null}
      </section>

      <section className="settings-section">
        <h2>Backend</h2>
        <form className="settings-form" onSubmit={saveHost}>
          <label>
            Host URL
            <input
              value={hostDraft}
              onChange={(e) => setHostDraft(e.target.value)}
              placeholder="(empty = same origin)"
              autoComplete="url"
            />
          </label>
          <p className="muted small">
            Empty means same origin (dev proxy / nginx). No trailing slash needed.
          </p>
          <button type="submit" className="btn">
            <Icon d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2zM17 21v-8H7v8M7 3v5h8" />
            Save host
          </button>
          {savedHint ? <p className="saved-hint">{savedHint}</p> : null}
        </form>
      </section>

      <section className="settings-section">
        <h2>Account</h2>
        <p className="account-line">{username || '—'}</p>
        <button type="button" className="btn-danger" onClick={onLogout} title="Log out">
          <Icon d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
          Log out
        </button>
      </section>
    </div>
  )
}

function Inbox({ onLogout, onOpenSettings }) {
  const [folder, setFolder] = useState('all')
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [messages, setMessages] = useState([])
  const [counts, setCounts] = useState({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [nextCursor, setNextCursor] = useState(null)

  const query = useMemo(() => {
    const base = { folder: folder === 'all' ? undefined : folder, q: search || undefined, limit: 40 }
    if (filter === 'unread') base.unread = true
    if (filter === 'read') base.unread = false
    if (filter === 'starred') base.starred = true
    if (filter === 'thumbsUp') base.thumbsUp = true
    if (filter === 'done') base.done = true
    if (filter === 'parseBug') base.parseBug = true
    return base
  }, [folder, filter, search])

  const load = useCallback(
    async (cursor) => {
      setLoading(true)
      setError('')
      try {
        const data = await fetchMessages({ ...query, before: cursor || undefined })
        setMessages((prev) => (cursor ? [...prev, ...data.messages] : data.messages))
        setNextCursor(data.nextCursor)
        const c = await fetchUnreadByFolder().catch(() => null)
        if (c?.counts) setCounts(c.counts)
      } catch (err) {
        if (err.code === 401) {
          setToken('')
          onLogout()
          return
        }
        setError(err.message || 'Failed to load')
      } finally {
        setLoading(false)
      }
    },
    [query, onLogout],
  )

  useEffect(() => {
    load(null)
  }, [load])

  useEffect(() => {
    const token = getToken()
    if (!token) return undefined
    const host = getHost() || undefined
    const sock = io(host || undefined, {
      auth: { token },
      transports: ['websocket', 'polling'],
    })
    sock.on('message:matched', (msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id || m.messageId === msg.messageId)) return prev
        if (folder !== 'all' && (msg.folder || 'others') !== folder) return prev
        return [msg, ...prev]
      })
    })
    return () => sock.disconnect()
  }, [folder])

  async function onPatch(msg, patch) {
    try {
      const wasUnread = !msg.readAt
      const data = await patchMessage(msg.id, patch)
      const updated = data.message || data
      setMessages((prev) =>
        prev
          .map((m) => (m.id === msg.id ? { ...m, ...updated } : m))
          .filter((m) => {
            if (m.id !== msg.id) return true
            if (filter === 'unread' && m.readAt) return false
            if (filter === 'read' && !m.readAt) return false
            return true
          }),
      )
      if ('read' in patch || (wasUnread && updated.readAt)) {
        const c = await fetchUnreadByFolder().catch(() => null)
        if (c?.counts) setCounts(c.counts)
      }
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="admin">
      <header className="top">
        <div>
          <h1>WA Relay</h1>
        </div>
        <div className="top-actions">
          <button type="button" className="btn-secondary icon-btn" onClick={onOpenSettings} title="Settings">
            <Icon d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
          </button>
          <button type="button" className="btn-danger" onClick={onLogout} title="Log out">
            <Icon d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            Log out
          </button>
        </div>
      </header>

      <div className="folders">
        {FOLDERS.map((f) => (
          <button
            key={f}
            type="button"
            className={folder === f ? 'active' : ''}
            onClick={() => setFolder(f)}
          >
            {f.toUpperCase()}
            {f !== 'all' && counts[f] ? ` (${counts[f]})` : ''}
          </button>
        ))}
      </div>

      <div className="toolbar">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          {FILTERS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        <form
          className="search"
          onSubmit={(e) => {
            e.preventDefault()
            setSearch(q.trim())
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search text, from, to…"
          />
          <button type="submit" className="btn">
            <Icon d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3" />
            Search
          </button>
        </form>
        <button type="button" className="btn-secondary" onClick={() => load(null)} disabled={loading}>
          <Icon d="M21 12a9 9 0 11-2.64-6.36M21 3v6h-6" />
          Refresh
        </button>
      </div>

      {error ? <div className="error banner">{error}</div> : null}

      <div className="list">
        {messages.map((msg) => (
          <MessageRow key={msg.id || msg.messageId} msg={msg} onPatch={onPatch} />
        ))}
        {!loading && !messages.length ? <p className="muted empty">No messages</p> : null}
      </div>

      {nextCursor ? (
        <button type="button" className="btn-secondary more" onClick={() => load(nextCursor)} disabled={loading}>
          <Icon d="M12 5v14M5 12h14" />
          {loading ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState(() => (getToken() ? 'user' : ''))
  const [screen, setScreen] = useState('inbox')
  const [hostTick, setHostTick] = useState(0)

  function logout() {
    setToken('')
    setUser('')
    setScreen('inbox')
  }

  if (!user) {
    return <Login onOk={setUser} />
  }

  if (screen === 'settings') {
    return (
      <Settings
        username={user}
        onBack={() => setScreen('inbox')}
        onLogout={logout}
        onHostSaved={() => setHostTick((n) => n + 1)}
      />
    )
  }

  return (
    <Inbox
      key={hostTick}
      onOpenSettings={() => setScreen('settings')}
      onLogout={logout}
    />
  )
}
