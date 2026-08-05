import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { fetchFolderCounts, fetchMapMessages, patchMessage, setToken } from './api'
import { FILTERS, FOLDERS, TIME_RANGES } from './filters'
import { ToastStack } from './Toast'

const LONDON_CENTER = [51.5074, -0.1278]
const LONDON_ZOOM = 11

function Icon({ d, children }) {
  return (
    <svg className="btn-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {d ? <path d={d} /> : children}
    </svg>
  )
}

function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function pickupCoords(msg) {
  if (!Array.isArray(msg?.jobs)) return null
  for (const j of msg.jobs) {
    const lat = Number(j.fromLat)
    const lng = Number(j.fromLng)
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
  }
  return null
}

/** ~11 m precision — stack exact/near-identical pickups. */
function coordKey(lat, lng) {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`
}

function pinIcon(count, selected) {
  const size = count > 1 ? 28 : 22
  const label = count > 1 ? String(count > 99 ? '99+' : count) : ''
  return L.divIcon({
    className: '',
    html: `<span class="map-pin${selected ? ' selected' : ''}${count > 1 ? ' clustered' : ''}">${label}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function userIcon() {
  return L.divIcon({
    className: '',
    html: '<span class="map-user-dot"></span>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

function formatJobsBrief(msg) {
  const j = Array.isArray(msg.jobs) && msg.jobs[0] ? msg.jobs[0] : null
  if (!j) return null
  const from = j.from || '—'
  const to = j.to || '—'
  const price = j.price != null && Number.isFinite(Number(j.price)) ? `£${Number(j.price)}` : null
  return { from, to, price }
}

function groupByPickup(messages) {
  const groups = new Map()
  for (const msg of messages) {
    const c = pickupCoords(msg)
    if (!c) continue
    const key = coordKey(c.lat, c.lng)
    let g = groups.get(key)
    if (!g) {
      g = { key, lat: c.lat, lng: c.lng, messages: [] }
      groups.set(key, g)
    }
    g.messages.push(msg)
  }
  return [...groups.values()]
}

export default function MapsScreen({
  folder,
  setFolder,
  filter,
  setFilter,
  search,
  setSearch,
  timeRange,
  setTimeRange,
  onBack,
  onLogout,
  renderCard,
}) {
  const mapEl = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef(new Map())
  const userMarkerRef = useRef(null)
  const [q, setQ] = useState(search || '')
  const [messages, setMessages] = useState([])
  const [counts, setCounts] = useState({})
  const [selectedId, setSelectedId] = useState(null)
  const [clusterKey, setClusterKey] = useState(null)
  const [loading, setLoading] = useState(false)
  const [toasts, setToasts] = useState([])
  const [userPos, setUserPos] = useState(null)
  const [filtersOpen, setFiltersOpen] = useState(false)

  function pushToast(message, tone = 'error') {
    const text = typeof message === 'string' ? message.trim() : ''
    if (!text) return
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setToasts((prev) => [...prev.slice(-4), { id, message: text, tone }])
  }

  function dismissToast(id) {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  const query = useMemo(() => {
    const base = {
      folder: folder === 'all' ? undefined : folder,
      q: search || undefined,
      time: timeRange || undefined,
    }
    if (filter === 'unread') base.unread = true
    if (filter === 'read') base.unread = false
    if (filter === 'starred') base.starred = true
    if (filter === 'thumbsUp') base.thumbsUp = true
    if (filter === 'done') base.done = true
    if (filter === 'parseBug') base.parseBug = true
    return base
  }, [folder, filter, search, timeRange])

  const countsQuery = useMemo(() => {
    const { folder: _f, ...rest } = query
    return { ...rest, map: true }
  }, [query])

  const groups = useMemo(() => groupByPickup(messages), [messages])

  const selected = useMemo(
    () => messages.find((m) => m.id === selectedId) || null,
    [messages, selectedId],
  )

  const clusterGroup = useMemo(
    () => (clusterKey ? groups.find((g) => g.key === clusterKey) || null : null),
    [groups, clusterKey],
  )

  const selectedMiles = useMemo(() => {
    if (!selected || !userPos) return null
    const c = pickupCoords(selected)
    if (!c) return null
    const mi = haversineMiles(userPos.lat, userPos.lng, c.lat, c.lng)
    return Math.round(mi * 10) / 10
  }, [selected, userPos])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [data, c] = await Promise.all([
        fetchMapMessages(query),
        fetchFolderCounts(countsQuery).catch(() => null),
      ])
      setMessages(Array.isArray(data.messages) ? data.messages : [])
      if (c?.counts) setCounts(c.counts)
    } catch (err) {
      if (err.code === 401) {
        setToken('')
        onLogout()
        return
      }
      pushToast(err.message || 'Failed to load map')
    } finally {
      setLoading(false)
    }
  }, [query, countsQuery, onLogout])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return undefined
    const map = L.map(mapEl.current, {
      center: LONDON_CENTER,
      zoom: LONDON_ZOOM,
      zoomControl: true,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)
    mapRef.current = map
    const markers = markersRef.current
    requestAnimationFrame(() => map.invalidateSize())
    return () => {
      map.remove()
      mapRef.current = null
      markers.clear()
      userMarkerRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const nextKeys = new Set()
    const selectedGroupKey = selected
      ? (() => {
          const c = pickupCoords(selected)
          return c ? coordKey(c.lat, c.lng) : null
        })()
      : clusterKey

    for (const g of groups) {
      nextKeys.add(g.key)
      const count = g.messages.length
      const isSelected = selectedGroupKey === g.key

      let marker = markersRef.current.get(g.key)
      if (!marker) {
        marker = L.marker([g.lat, g.lng], { icon: pinIcon(count, false) })
        marker.addTo(map)
        markersRef.current.set(g.key, marker)
      } else {
        marker.setLatLng([g.lat, g.lng])
      }
      marker.setIcon(pinIcon(count, isSelected))
      marker.off('click')
      marker.on('click', () => {
        if (g.messages.length === 1) {
          setClusterKey(null)
          setSelectedId(g.messages[0].id)
        } else {
          setSelectedId(null)
          setClusterKey(g.key)
        }
      })
    }

    for (const [key, marker] of markersRef.current) {
      if (!nextKeys.has(key)) {
        map.removeLayer(marker)
        markersRef.current.delete(key)
      }
    }

    requestAnimationFrame(() => map.invalidateSize())
  }, [groups, selected, clusterKey, userPos])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!userPos) {
      if (userMarkerRef.current) {
        map.removeLayer(userMarkerRef.current)
        userMarkerRef.current = null
      }
      return
    }
    if (!userMarkerRef.current) {
      userMarkerRef.current = L.marker([userPos.lat, userPos.lng], {
        icon: userIcon(),
        zIndexOffset: 1000,
      })
      userMarkerRef.current.addTo(map)
    } else {
      userMarkerRef.current.setLatLng([userPos.lat, userPos.lng])
    }
  }, [userPos])

  function locateMe() {
    if (!navigator.geolocation) {
      pushToast('Geolocation not supported')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setUserPos(next)
        const map = mapRef.current
        if (map) map.setView([next.lat, next.lng], 12)
      },
      (err) => {
        pushToast(err.message || 'Location denied')
      },
      { enableHighAccuracy: true, timeout: 12000 },
    )
  }

  function closeSheet() {
    setSelectedId(null)
    setClusterKey(null)
  }

  async function handlePatch(msg, patch) {
    try {
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
      if (filter === 'unread' && updated.readAt) setSelectedId(null)
      if (filter === 'read' && !updated.readAt) setSelectedId(null)
    } catch (err) {
      if (err.code === 401) {
        setToken('')
        onLogout()
        return
      }
      pushToast(err.message || 'Update failed')
    }
  }

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    requestAnimationFrame(() => map.invalidateSize())
  }, [filtersOpen, selectedId, clusterKey])

  return (
    <div className="admin maps-screen">
      <ToastStack items={toasts} onDismiss={dismissToast} />
      <header className="top maps-top">
        <div>
          <h1>Maps</h1>
        </div>
        <div className="top-actions">
          <button
            type="button"
            className={`btn-secondary toolbar-icon-btn${filtersOpen ? ' maps-filter-active' : ''}`}
            onClick={() => setFiltersOpen((v) => !v)}
            title="Filters"
            aria-label="Filters"
            aria-expanded={filtersOpen}
          >
            <Icon d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
          </button>
          <button
            type="button"
            className="btn-secondary toolbar-icon-btn"
            onClick={load}
            disabled={loading}
            title="Refresh"
            aria-label="Refresh"
          >
            <Icon d="M21 12a9 9 0 11-2.64-6.36M21 3v6h-6" />
          </button>
          <button type="button" className="btn-secondary toolbar-icon-btn" onClick={onBack} title="Back" aria-label="Back">
            <Icon d="M19 12H5M12 19l-7-7 7-7" />
          </button>
        </div>
      </header>

      {filtersOpen ? (
        <div className="maps-filters-panel">
          <div className="folders">
            {FOLDERS.map((f) => (
              <button
                key={f}
                type="button"
                className={folder === f ? 'active' : ''}
                onClick={() => setFolder(f)}
              >
                {f.toUpperCase()}
                {counts[f] ? ` (${counts[f]})` : ''}
              </button>
            ))}
          </div>
          <div className="toolbar">
            <div className="toolbar-row">
              <select
                className="toolbar-select"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                aria-label="Status filter"
              >
                {FILTERS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
              <select
                className="toolbar-select"
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                title="Message time window"
                aria-label="Time window"
              >
                {TIME_RANGES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <form
              className="toolbar-row search-bar"
              onSubmit={(e) => {
                e.preventDefault()
                setSearch(q.trim())
              }}
            >
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search text, from, to…"
                aria-label="Search"
              />
              <button type="submit" className="btn toolbar-icon-btn" title="Search" aria-label="Search">
                <Icon d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3" />
              </button>
            </form>
          </div>
          <button type="button" className="btn maps-filters-done" onClick={() => setFiltersOpen(false)}>
            Done
          </button>
        </div>
      ) : null}

      <div className="maps-body">
        <div className="maps-canvas-wrap">
          <div ref={mapEl} className="maps-canvas" />
          <button type="button" className="btn maps-locate toolbar-icon-btn" onClick={locateMe} title="My location" aria-label="My location">
            <Icon d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41M12 8a4 4 0 100 8 4 4 0 000-8z" />
          </button>
          {loading ? <div className="maps-loading muted small">Loading…</div> : null}
          {!loading && !messages.length ? (
            <div className="maps-empty muted small">No pickups with coordinates</div>
          ) : null}
        </div>
      </div>

      {clusterGroup && !selected ? (
        <div className="maps-modal-backdrop" onClick={closeSheet} role="presentation">
          <div
            className="maps-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Messages at pickup"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="maps-sheet-head">
              <span className="maps-distance">{clusterGroup.messages.length} at this pickup</span>
              <button type="button" className="btn-secondary icon-btn" onClick={closeSheet} title="Close">
                <Icon d="M18 6L6 18M6 6l12 12" />
              </button>
            </div>
            <ul className="maps-cluster-list">
              {clusterGroup.messages.map((msg) => {
                const brief = formatJobsBrief(msg)
                return (
                  <li key={msg.id}>
                    <button
                      type="button"
                      className="maps-cluster-item"
                      onClick={() => {
                        setSelectedId(msg.id)
                        setClusterKey(null)
                      }}
                    >
                      <strong>{msg.senderName || msg.senderPhone || 'Unknown'}</strong>
                      {brief ? (
                        <span className="muted small">
                          {brief.from} → {brief.to}
                          {brief.price ? ` · ${brief.price}` : ''}
                        </span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      ) : null}

      {selected ? (
        <div className="maps-modal-backdrop" onClick={closeSheet} role="presentation">
          <div
            className="maps-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Message"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="maps-sheet-head">
              {selectedMiles != null ? (
                <span className="maps-distance">{selectedMiles} mi away</span>
              ) : (
                <span className="muted small">Pickup</span>
              )}
              <button type="button" className="btn-secondary icon-btn" onClick={closeSheet} title="Close">
                <Icon d="M18 6L6 18M6 6l12 12" />
              </button>
            </div>
            {renderCard(selected, handlePatch)}
          </div>
        </div>
      ) : null}
    </div>
  )
}
