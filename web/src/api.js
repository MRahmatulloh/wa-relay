const TOKEN_KEY = 'wa_relay_token'
const HOST_KEY = 'wa_relay_host'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

/** Empty host = same origin (dev proxy / nginx). */
export function getHost() {
  return (localStorage.getItem(HOST_KEY) || '').replace(/\/$/, '')
}

export function setHost(host) {
  localStorage.setItem(HOST_KEY, (host || '').trim().replace(/\/$/, ''))
}

function url(path) {
  const host = getHost()
  return `${host}${path}`
}

function friendlyHttpError(status, text) {
  const raw = typeof text === 'string' ? text.trim() : ''
  if (!raw) return `HTTP ${status}`
  if (raw.startsWith('<') || /<\/?(html|head|body|title|h1)\b/i.test(raw)) {
    const title = raw.match(/<title>([^<]+)<\/title>/i)?.[1]
    const h1 = raw.match(/<h1>([^<]+)<\/h1>/i)?.[1]
    const label = (title || h1 || `HTTP ${status}`).replace(/\s+/g, ' ').trim()
    return label
  }
  if (raw.length > 180) return `HTTP ${status}`
  return raw
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth) {
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }
  const res = await fetch(url(path), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (res.status === 401) {
    const err = new Error('Unauthorized')
    err.code = 401
    throw err
  }
  if (!res.ok) {
    const msg =
      (data && typeof data.error === 'string' && data.error) ||
      friendlyHttpError(res.status, text)
    throw new Error(msg)
  }
  return data
}

export function login(username, password) {
  return request('/auth/login', {
    method: 'POST',
    body: { username, password },
    auth: false,
  })
}

export function fetchMessages(query = {}) {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return
    params.set(k, String(v))
  })
  const qs = params.toString()
  return request(`/messages${qs ? `?${qs}` : ''}`)
}

export function fetchMapMessages(query = {}) {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return
    params.set(k, String(v))
  })
  const qs = params.toString()
  return request(`/messages/map${qs ? `?${qs}` : ''}`)
}

export function fetchUnreadByFolder() {
  return request('/messages/unread-counts')
}

export function fetchFolderCounts(query = {}) {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return
    params.set(k, String(v))
  })
  const qs = params.toString()
  return request(`/messages/folder-counts${qs ? `?${qs}` : ''}`)
}

export function patchMessage(id, patch) {
  return request(`/messages/${id}`, { method: 'PATCH', body: patch })
}

export function fetchHealth() {
  return request('/health', { auth: false })
}
