import { MapContainer, TileLayer, Circle, Marker, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { getRiskLabel } from '../utils/mlScoring'
import { useTranslation } from '../hooks/useTranslation'

const supabase = createClient(
  'https://sweceszfqssyzqyzpggc.supabase.co',
  'sb_publishable_CQV7UAc_2uHNKSNq6kVvVw_4GmAxF0c'
)

const DEFAULT_CENTER = [39.5, -98.35]
const DEFAULT_ZOOM = 4
const CACHE_KEY = 'heatmap_rows_v1'
const CACHE_TTL = 1000 * 60 * 60 * 24 // 24 hours

// FIX 4: defined outside component — never recreated on re-render
const CANVAS_RENDERER = L.canvas({ padding: 0.5 })

// FIX (bonus): pin icon cache — same color reuses same L.divIcon instance
const PIN_ICON_CACHE = {}
function getPinIcon(color = '#3b82f6') {
  if (!PIN_ICON_CACHE[color]) {
    PIN_ICON_CACHE[color] = L.divIcon({
      className: '',
      html: `<div style="width:24px;height:24px;background:${color};border:2px solid white;border-radius:9999px 9999px 9999px 0;transform:rotate(-45deg);box-shadow:0 1px 4px rgba(0,0,0,0.35)"></div>`,
      iconSize: [24, 24],
      iconAnchor: [9, 18],
      popupAnchor: [0, -18]
    })
  }
  return PIN_ICON_CACHE[color]
}

// FIX 1: both fetchers outside load(), use range() pagination — no zip list dependency
async function fetchAllGap() {
  const pageSize = 1000
  let from = 0
  let all = []
  while (true) {
    const { data, error } = await supabase
      .from('zip_coverage_gap')
      .select('zip, zip_lat, zip_lon, pantry_count_nearby, nearest_pantry_miles')
      .range(from, from + pageSize - 1)
    if (error) { console.error('zip_coverage_gap error', error); return [] }
    const batch = Array.isArray(data) ? data : []
    all = all.concat(batch)
    if (batch.length < pageSize) break
    from += pageSize
  }
  return all
}

async function fetchAllDemo() {
  const pageSize = 1000
  let from = 0
  let all = []
  while (true) {
    const { data, error } = await supabase
      .from('zip_demographics')
      .select('zip, snap_households, total_households, snap_rate, poverty_rate, limited_english_pct')
      .range(from, from + pageSize - 1)
    if (error) { console.error('zip_demographics error', error); return [] }
    const batch = Array.isArray(data) ? data : []
    all = all.concat(batch)
    if (batch.length < pageSize) break
    from += pageSize
  }
  return all
}

function FlyToCenter({ center, zoom, shouldFly }) {
  const map = useMap()
  useEffect(() => {
    if (shouldFly) map.flyTo(center, zoom, { duration: 1.2 })
  }, [map, center, zoom, shouldFly])
  return null
}

function normalize(rows, field) {
  const vals = rows.map(r => r[field]).filter(v => typeof v === 'number' && !Number.isNaN(v))
  if (!vals.length) return rows.map(r => ({ ...r, _norm: 0 }))
  const min = Math.min(...vals)
  const range = (Math.max(...vals) - min) || 1
  return rows.map(r => ({
    ...r,
    _norm: typeof r[field] === 'number' && !Number.isNaN(r[field])
      ? (r[field] - min) / range : 0
  }))
}

function buildRowsWithScore(rows, mode) {
  if (mode === 'snap_rate') {
    return normalize(rows, 'snap_rate').map(r => ({
      ...r, _score: r._norm, _label: 'SNAP rate',
      _valueText: r.snap_rate != null ? `${(r.snap_rate * 100).toFixed(1)}%` : '—'
    }))
  }
  if (mode === 'pantry_count') {
    return normalize(rows, 'pantry_count_nearby').map(r => ({
      ...r, _score: r._norm, _label: 'Nearby pantry count',
      _valueText: r.pantry_count_nearby ?? '—'
    }))
  }
  if (mode === 'poverty_rate') {
    return normalize(rows, 'poverty_rate').map(r => ({
      ...r, _score: r._norm, _label: 'Poverty rate',
      _valueText: r.poverty_rate != null ? `${(r.poverty_rate * 100).toFixed(1)}%` : '—'
    }))
  }
  if (mode === 'language_barrier_rate') {
    return normalize(rows, 'limited_english_pct').map(r => ({
      ...r, _score: r._norm, _label: 'Language barrier rate',
      _valueText: r.limited_english_pct != null ? `${(r.limited_english_pct * 100).toFixed(1)}%` : '—'
    }))
  }
  if (mode === 'nearest_pantry_distance') {
    return normalize(rows, 'nearest_pantry_miles').map(r => ({
      ...r, _score: r._norm, _label: 'Nearest pantry distance',
      _valueText: r.nearest_pantry_miles != null ? `${Number(r.nearest_pantry_miles).toFixed(2)} mi` : '—'
    }))
  }
  if (mode === 'snap_population_vs_pantry_count') {
    const snapNorm = normalize(rows, 'snap_households')
    const pantryNorm = normalize(rows, 'pantry_count_nearby')
    const pantryMap = Object.fromEntries(pantryNorm.map(r => [r.zip, r._norm ?? 0]))
    return snapNorm.map(r => ({
      ...r,
      _score: ((r._norm ?? 0) + (1 - (pantryMap[r.zip] ?? 0))) / 2,
      _label: 'SNAP households vs pantry count',
      _valueText: r.snap_households != null || r.pantry_count_nearby != null
        ? `${r.snap_households?.toLocaleString?.() ?? '—'} SNAP HH · ${r.pantry_count_nearby ?? '—'} pantries`
        : '—'
    }))
  }
  // default: snap_households + distance composite
  const snapVals = rows.map(r => r.snap_households).filter(v => typeof v === 'number' && !Number.isNaN(v))
  const snapMin = Math.min(...snapVals)
  const snapRange = (Math.max(...snapVals) - snapMin) || 1
  const distVals = rows.map(r => r.nearest_pantry_miles).filter(v => typeof v === 'number' && !Number.isNaN(v))
  const distMin = Math.min(...distVals)
  const distRange = (Math.max(...distVals) - distMin) || 1
  return rows.map(r => {
    const sn = typeof r.snap_households === 'number' && !Number.isNaN(r.snap_households)
      ? (r.snap_households - snapMin) / snapRange : 0
    const dn = typeof r.nearest_pantry_miles === 'number' && !Number.isNaN(r.nearest_pantry_miles)
      ? (r.nearest_pantry_miles - distMin) / distRange : 0
    return {
      ...r, _score: (sn + dn) / 2,
      _label: 'SNAP households + pantry distance risk',
      _valueText: r.snap_households != null && r.nearest_pantry_miles != null
        ? `${r.snap_households.toLocaleString()} SNAP HH · ${Number(r.nearest_pantry_miles).toFixed(2)} mi`
        : '—'
    }
  })
}

function getColor(score, mode) {
  if (mode === 'pantry_count') {
    if (score >= 0.85) return '#22c55e'
    if (score >= 0.6)  return '#84cc16'
    if (score >= 0.35) return '#eab308'
    if (score >= 0.1)  return '#f59e0b'
    if (score >= 0.05) return '#ea580c'
    return '#dc2626'
  }
  if (score >= 0.85) return '#7f1d1d'
  if (score >= 0.7)  return '#b91c1c'
  if (score >= 0.55) return '#ea580c'
  if (score >= 0.4)  return '#f59e0b'
  if (score >= 0.25) return '#84cc16'
  return '#22c55e'
}

function isNycZip(zip) {
  const s = String(zip || '')
  return ['100','101','102','103','104','111','112','113','114','116'].some(p => s.startsWith(p))
}

function getDisplayRadius(zip) {
  return isNycZip(zip) ? 1000 : 2000
}

function SnapLayer({ rows, mode }) {
  // FIX 3: single memoized pass — scoring + color computed together, only on rows/mode change
  const coloredRows = useMemo(() => {
    const scored = buildRowsWithScore(rows, mode)
    return scored.map(r => ({ ...r, _color: getColor(r._score ?? 0, mode) }))
  }, [rows, mode])

  // FIX 5: single state — only the hovered circle's tooltip subtree mounts
  const [hoveredZip, setHoveredZip] = useState(null)

  return coloredRows.map(r => (
    <Circle
      key={r.zip}                    // FIX 2: stable key — mode switch patches in place, no remount
      center={[r.zip_lat, r.zip_lon]}
      radius={getDisplayRadius(r.zip)}
      pathOptions={{
        color: r._color,
        fillColor: r._color,
        fillOpacity: 0.4,
        opacity: 0.7,
        weight: 1,
      }}
      eventHandlers={{
        mouseover: () => setHoveredZip(r.zip),
        mouseout:  () => setHoveredZip(null),
      }}
    >
      {hoveredZip === r.zip && (
        <Tooltip permanent>
          <div style={{ fontSize: 11 }}>
            <strong>ZIP {r.zip}</strong><br />
            {r._label}: {r._valueText}<br />
            SNAP rate: {r.snap_rate != null ? `${(r.snap_rate * 100).toFixed(1)}%` : '—'}<br />
            Poverty rate: {r.poverty_rate != null ? `${(r.poverty_rate * 100).toFixed(1)}%` : '—'}<br />
            Language barrier: {r.limited_english_pct != null ? `${(r.limited_english_pct * 100).toFixed(1)}%` : '—'}<br />
            Nearby pantries: {r.pantry_count_nearby ?? '—'}<br />
            Nearest pantry: {r.nearest_pantry_miles !== 10 ? `${Number(r.nearest_pantry_miles).toFixed(2)} mi` : '—'}
          </div>
        </Tooltip>
      )}
    </Circle>
  ))
}

export default function HeatMapView({
  resources,
  clusterMap = {},
  placementRecs = [],
  height = '400px',
  mode = 'snap_rate',
}) {
  const [rows, setRows] = useState([])
  const { t, lang } = useTranslation()

  const validResources = useMemo(
    () => (resources || []).filter(r => r.latitude && r.longitude),
    [resources]
  )

  useEffect(() => {
    async function load() {
      // FIX 6: serve from localStorage cache if still fresh — zero network on revisit
      try {
        const cached = localStorage.getItem(CACHE_KEY)
        if (cached) {
          const { ts, rows: cachedRows } = JSON.parse(cached)
          if (Date.now() - ts < CACHE_TTL) {
            setRows(cachedRows)
            return
          }
        }
      } catch (_) {}

      // FIX 1: both tables fetched in parallel
      const [allGap, allDemo] = await Promise.all([fetchAllGap(), fetchAllDemo()])

      const demoMap = Object.fromEntries(allDemo.map(d => [d.zip, d]))

      const merged = allGap
        .map(g => ({
          zip: g.zip,
          zip_lat: Number(g.zip_lat),
          zip_lon: Number(g.zip_lon),
          pantry_count_nearby:  g.pantry_count_nearby  == null ? null : Number(g.pantry_count_nearby),
          nearest_pantry_miles: g.nearest_pantry_miles == null ? 10   : Number(g.nearest_pantry_miles),
          snap_households:      demoMap[g.zip]?.snap_households     ?? null,
          total_households:     demoMap[g.zip]?.total_households    ?? null,
          snap_rate:            demoMap[g.zip]?.snap_rate           == null ? null : Number(demoMap[g.zip].snap_rate),
          poverty_rate:         demoMap[g.zip]?.poverty_rate        == null ? null : Number(demoMap[g.zip].poverty_rate),
          limited_english_pct:  demoMap[g.zip]?.limited_english_pct == null ? null : Number(demoMap[g.zip].limited_english_pct),
        }))
        .filter(r => Number.isFinite(r.zip_lat) && Number.isFinite(r.zip_lon))

      setRows(merged)

      // FIX 6: write to cache — next mount returns instantly
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), rows: merged }))
      } catch (_) {}
    }

    load()
  }, [])

  return (
    <div style={{ height }} className="border border-border">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        style={{ height: '100%', width: '100%' }}
        renderer={CANVAS_RENDERER}   // FIX 4: one canvas element instead of 40k+ SVG DOM nodes
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />

        <FlyToCenter center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} shouldFly={false} />

        <SnapLayer rows={rows} mode={mode} />

        <MarkerClusterGroup chunkedLoading>
          {validResources.map(r => {
            const markerStyle = clusterMap?.[r.id]
            const fallbackRisk = getRiskLabel(r.riskScore ?? 0)
            const pinColor = markerStyle?.color ?? fallbackRisk.color ?? '#3b82f6'
            const pinLabel = markerStyle?.label ?? fallbackRisk.label
            const typeName = lang === 'es'
              ? (r.resourceType?.name_es ?? r.resourceType?.name ?? '')
              : (r.resourceType?.name ?? '')
            const desc = lang === 'es'
              ? (r.description_es ?? r.description ?? '')
              : (r.description ?? '')
            return (
              <Marker
                key={`resource-${r.id}`}
                position={[r.latitude, r.longitude]}
                icon={getPinIcon(pinColor)}
              >
                <Tooltip>
                  <div className="font-mono text-[10px] tracking-wide uppercase leading-relaxed max-w-[200px] text-primary">
                    <strong className="text-accent">{r.name ?? 'Unknown'}</strong><br />
                    <span className="text-secondary">{typeName} · {r.city}, {r.state}</span><br />
                    {r.ratingAverage ? `⭐ ${r.ratingAverage.toFixed(1)}` : ''}
                    {r._count?.reviews ? ` (${r._count.reviews} ${t('reviews').toLowerCase()})` : ''}<br />
                    <span style={{ color: pinColor }}>📍 {pinLabel}</span>
                    {desc ? <span><br />{desc.slice(0, 80)}…</span> : ''}
                    {r.openByAppointment ? <span className="text-status-info"><br />📅 {t('openByAppointment')}</span> : ''}
                  </div>
                </Tooltip>
              </Marker>
            )
          })}
        </MarkerClusterGroup>

        {placementRecs.filter((r) => Number.isFinite(r.zip_lat) && Number.isFinite(r.zip_lon)).map((rec, i) => (
          <Marker
            key={`rec-${rec.zip}`}
            position={[rec.zip_lat, rec.zip_lon]}
            icon={getPinIcon('#a855f7')}
          >
            <Tooltip>
              <div className="font-mono text-[10px] tracking-wide uppercase leading-relaxed max-w-[220px]">
                <strong style={{ color: '#a855f7' }}>#{i + 1} RECOMMENDED · ZIP {rec.zip}</strong><br />
                <span>Score: {(rec.placement_score * 100).toFixed(1)} · Gap: {rec.coverage_gap != null ? `${(rec.coverage_gap * 100).toFixed(0)}%` : '—'}</span><br />
                <span>{rec.snap_households?.toLocaleString()} SNAP households</span><br />
                <span style={{ color: '#d1d5db' }}>{rec.explanation}</span>
              </div>
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}