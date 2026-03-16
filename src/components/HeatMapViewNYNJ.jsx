import { MapContainer, TileLayer, Circle, CircleMarker, Marker, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { getRiskLabel } from '../utils/mlScoring'
import { useTranslation } from '../hooks/useTranslation'

// this is publishable key, safe for github
const supabase = createClient(
  'https://sweceszfqssyzqyzpggc.supabase.co',
  'sb_publishable_CQV7UAc_2uHNKSNq6kVvVw_4GmAxF0c'
)

const NYC_GREATER_METRO_AREA_CENTER = [40.7928, -73.9310]
const NYC_GREATER_METRO_AREA_ZOOM = 12

function makePinIcon(color = '#3b82f6') {
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width: 18px;
        height: 18px;
        background: ${color};
        border: 2px solid white;
        border-radius: 9999px 9999px 9999px 0;
        transform: rotate(-45deg);
        box-shadow: 0 1px 4px rgba(0,0,0,0.35);
      "></div>
    `,
    iconSize: [18, 18],
    iconAnchor: [9, 18],
    popupAnchor: [0, -18]
  })
}

function FlyToCenter({ center, zoom, shouldFly }) {
  const map = useMap()

  useEffect(() => {
    if (shouldFly) {
      map.flyTo(center, zoom, { duration: 1.2 })
    }
  }, [map, center, zoom, shouldFly])

  return null
}

function normalize(rows, field) {
  const vals = rows
    .map((r) => r[field])
    .filter((v) => typeof v === 'number' && !Number.isNaN(v))

  if (!vals.length) {
    return rows.map((r) => ({ ...r, _norm: 0 }))
  }

  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const range = max - min || 1

  return rows.map((r) => ({
    ...r,
    _norm:
      typeof r[field] === 'number' && !Number.isNaN(r[field])
        ? (r[field] - min) / range
        : 0
  }))
}

function buildRowsWithScore(rows, mode) {
  if (mode === 'snap_rate') {
    return normalize(rows, 'snap_rate').map((r) => ({
      ...r,
      _score: r._norm,
      _label: 'SNAP rate',
      _valueText: r.snap_rate != null ? `${(r.snap_rate * 100).toFixed(1)}%` : '—'
    }))
  }

  if (mode === 'pantry_count') {
    const normalized = normalize(rows, 'pantry_count_nearby')
    return normalized.map((r) => ({
      ...r,
      _score: r._norm,
      _label: 'Nearby pantry count',
      _valueText: r.pantry_count_nearby ?? '—'
    }))
  }

  if (mode === 'poverty_rate') {
    return normalize(rows, 'poverty_rate').map((r) => ({
      ...r,
      _score: r._norm,
      _label: 'Poverty rate',
      _valueText: r.poverty_rate != null ? `${(r.poverty_rate * 100).toFixed(1)}%` : '—'
    }))
  }

  if (mode === 'language_barrier_rate') {
    return normalize(rows, 'limited_english_pct').map((r) => ({
      ...r,
      _score: r._norm,
      _label: 'Language barrier rate',
      _valueText: r.limited_english_pct != null ? `${(r.limited_english_pct * 100).toFixed(1)}%` : '—'
    }))
  }

  if (mode === 'nearest_pantry_distance') {
    return rows.map((r) => {
      const dist = Number(r.nearest_pantry_miles ?? 0)
      const score = Math.min(Math.max(dist / 0.5, 0), 1)

      return {
        ...r,
        _score: score,
        _label: 'Nearest pantry distance',
        _valueText: r.nearest_pantry_miles != null ? `${dist.toFixed(2)} mi` : '—'
      }
    })
  }

  if (mode === 'snap_population_vs_pantry_count') {
    const snapNormRows = normalize(rows, 'snap_households')
    const pantryNormRows = normalize(rows, 'pantry_count_nearby')

    const pantryNormMap = Object.fromEntries(
      pantryNormRows.map((r) => [r.zip, r._norm ?? 0])
    )

    return snapNormRows.map((r) => {
      const snapNorm = r._norm ?? 0
      const pantryNorm = pantryNormMap[r.zip] ?? 0
      const badness = (snapNorm + (1 - pantryNorm)) / 2

      return {
        ...r,
        _score: badness,
        _label: 'SNAP households vs pantry count',
        _valueText:
          r.snap_households != null || r.pantry_count_nearby != null
            ? `${r.snap_households?.toLocaleString?.() ?? '—'} SNAP HH · ${r.pantry_count_nearby ?? '—'} pantries`
            : '—'
      }
    })
  }

  const snapHouseholdVals = rows
    .map((r) => r.snap_households)
    .filter((v) => typeof v === 'number' && !Number.isNaN(v))
  const snapHouseholdMin = Math.min(...snapHouseholdVals)
  const snapHouseholdMax = Math.max(...snapHouseholdVals)
  const snapHouseholdRange = snapHouseholdMax - snapHouseholdMin || 1

  const distVals = rows
    .map((r) => r.nearest_pantry_miles)
    .filter((v) => typeof v === 'number' && !Number.isNaN(v))
  const distMin = Math.min(...distVals)
  const distMax = Math.max(...distVals)
  const distRange = distMax - distMin || 1

  return rows.map((r) => {
    const snapPopulationNorm =
      typeof r.snap_households === 'number' && !Number.isNaN(r.snap_households)
        ? (r.snap_households - snapHouseholdMin) / snapHouseholdRange
        : 0

      const distNorm =
      typeof r.nearest_pantry_miles === 'number' && !Number.isNaN(r.nearest_pantry_miles)
        ? Math.min(Math.max(r.nearest_pantry_miles / 0.5, 0), 1)
        : 0

    const badness = (snapPopulationNorm + distNorm) / 2

    return {
      ...r,
      _score: badness,
      _label: 'SNAP households + pantry distance risk',
      _valueText:
        r.snap_households != null && r.nearest_pantry_miles != null
          ? `${r.snap_households.toLocaleString()} SNAP HH · ${Number(r.nearest_pantry_miles).toFixed(2)} mi`
          : '—'
    }
  })
}

function getColor(score, mode) {
  if (mode === 'pantry_count') {
    if (score >= 0.85) return '#22c55e'
    if (score >= 0.6) return '#84cc16'
    if (score >= 0.35) return '#eab308'
    if (score >= 0.1) return '#f59e0b'
    if (score >= 0.05) return '#ea580c'
    return '#dc2626'
  }

  if (score >= 0.85) return '#7f1d1d'
  if (score >= 0.7) return '#b91c1c'
  if (score >= 0.55) return '#ea580c'
  if (score >= 0.4) return '#f59e0b'
  if (score >= 0.25) return '#84cc16'
  return '#22c55e'
}

function isNyOrNjZip(zip) {
  const s = String(zip || '').padStart(5, '0')
  const prefix3 = s.slice(0, 3)

  const nyPrefixes = new Set([
    '005', '063', '100', '101', '102', '103', '104', '105', '106', '107', '108', '109',
    '110', '111', '112', '113', '114', '115', '116', '117', '118', '119', '120', '121',
    '122', '123', '124', '125', '126', '127', '128', '129', '130', '131', '132', '133',
    '134', '135', '136', '137', '138', '139', '140', '141', '142', '143', '144', '145',
    '146', '147', '148', '149'
  ])

  const njPrefixes = new Set([
    '070', '071', '072', '073', '074', '075', '076', '077', '078', '079',
    '080', '081', '082', '083', '084', '085', '086', '087', '088', '089'
  ])

  return nyPrefixes.has(prefix3) || njPrefixes.has(prefix3)
}

function isNyOrNjResource(resource) {
  return resource?.state === 'NY' || resource?.state === 'NJ'
}

function SnapLayer({ rows, mode }) {
  const scoredRows = useMemo(() => buildRowsWithScore(rows, mode), [rows, mode])

  return scoredRows.map((r) => {
    const color = getColor(r._score ?? 0, mode)

    return (
      <Circle
        key={`${mode}-${r.zip}`}
        center={[r.zip_lat, r.zip_lon]}
        radius={1000}
        pathOptions={{
          color,
          fillColor: color,
          fillOpacity: 0.28,
          opacity: 0.6,
          weight: 1
        }}
      >
        <Tooltip>
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
      </Circle>
    )
  })
}

export default function HeatMapViewNYNJ({
  resources,
  clusterMap = {},
  placementRecs = [],
  height = '400px',
  mode = 'snap_rate'
}) {
  const [rows, setRows] = useState([])
  const { t, lang } = useTranslation()

  const center = NYC_GREATER_METRO_AREA_CENTER
  const zoom = NYC_GREATER_METRO_AREA_ZOOM

  const validResources = useMemo(
    () => (resources || []).filter((r) => r.latitude && r.longitude && isNyOrNjResource(r)),
    [resources]
  )

  useEffect(() => {
    async function load() {
      const pageSize = 1000
      let from = 0
      let allGap = []

      while (true) {
        const { data, error } = await supabase
          .from('zip_coverage_gap')
          .select('zip, zip_lat, zip_lon, pantry_count_nearby, nearest_pantry_miles')
          .range(from, from + pageSize - 1)

        if (error) {
          console.error('zip_coverage_gap error', error)
          return
        }

        const batch = (Array.isArray(data) ? data : []).filter((r) => isNyOrNjZip(r.zip))
        allGap = allGap.concat(batch)

        if (!Array.isArray(data) || data.length < pageSize) break
        from += pageSize
      }

      const zips = allGap.map((r) => r.zip).filter(Boolean)

      let allDemo = []
      let demoFrom = 0

      while (demoFrom < zips.length) {
        const zipBatch = zips.slice(demoFrom, demoFrom + 1000)

        const { data, error } = await supabase
          .from('zip_demographics')
          .select('zip, snap_households, total_households, snap_rate, poverty_rate, limited_english_pct')
          .in('zip', zipBatch)

        if (error) {
          console.error('zip_demographics error', error)
          return
        }

        allDemo = allDemo.concat(Array.isArray(data) ? data : [])
        demoFrom += 1000
      }

      const demoMap = Object.fromEntries(allDemo.map((d) => [d.zip, d]))

      const merged = allGap
        .map((g) => ({
          zip: g.zip,
          zip_lat: Number(g.zip_lat),
          zip_lon: Number(g.zip_lon),
          pantry_count_nearby: g.pantry_count_nearby == null ? null : Number(g.pantry_count_nearby),
          nearest_pantry_miles: g.nearest_pantry_miles == null ? 10 : Number(g.nearest_pantry_miles),
          snap_households: demoMap[g.zip]?.snap_households ?? null,
          total_households: demoMap[g.zip]?.total_households ?? null,
          snap_rate: demoMap[g.zip]?.snap_rate == null ? null : Number(demoMap[g.zip].snap_rate),
          poverty_rate: demoMap[g.zip]?.poverty_rate == null ? null : Number(demoMap[g.zip].poverty_rate),
          limited_english_pct:
            demoMap[g.zip]?.limited_english_pct == null
              ? null
              : Number(demoMap[g.zip].limited_english_pct)
        }))
        .filter((r) => Number.isFinite(r.zip_lat) && Number.isFinite(r.zip_lon))

      setRows(merged)
    }

    load()
  }, [])

  const filteredPlacementRecs = useMemo(
    () => placementRecs.filter((r) => r.zip_lat && r.zip_lon && isNyOrNjZip(r.zip)),
    [placementRecs]
  )

  return (
    <div style={{ height }} className="border border-border">
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />

        <FlyToCenter center={center} zoom={zoom} shouldFly={false} />

        <SnapLayer rows={rows} mode={mode} />

        {validResources.map((r) => {
          const markerStyle = clusterMap?.[r.id]
          const fallbackRisk = getRiskLabel(r.riskScore ?? 0)
          const pinColor = markerStyle?.color ?? fallbackRisk.color ?? '#3b82f6'
          const pinLabel = markerStyle?.label ?? fallbackRisk.label
          const pinIcon = makePinIcon(pinColor)

          const typeName =
            lang === 'es'
              ? (r.resourceType?.name_es ?? r.resourceType?.name ?? '')
              : (r.resourceType?.name ?? '')

          const desc =
            lang === 'es'
              ? (r.description_es ?? r.description ?? '')
              : (r.description ?? '')

          return (
            <Marker
              key={`resource-${r.id}`}
              position={[r.latitude, r.longitude]}
              icon={pinIcon}
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

        {filteredPlacementRecs.map((rec, i) => (
          <CircleMarker
            key={`rec-${rec.zip}`}
            center={[rec.zip_lat, rec.zip_lon]}
            radius={10}
            pathOptions={{
              fillColor: '#a855f7',
              color: '#ffffff',
              fillOpacity: 0.95,
              weight: 2
            }}
          >
            <Tooltip>
              <div className="font-mono text-[10px] tracking-wide uppercase leading-relaxed max-w-[220px]">
                <strong style={{ color: '#a855f7' }}>
                  #{i + 1} RECOMMENDED · ZIP {rec.zip}
                </strong><br />
                <span>
                  Score: {(rec.placement_score * 100).toFixed(1)} · Gap:{' '}
                  {rec.coverage_gap != null ? `${(rec.coverage_gap * 100).toFixed(0)}%` : '—'}
                </span><br />
                <span>{rec.snap_households?.toLocaleString()} SNAP households</span><br />
                <span style={{ color: '#d1d5db' }}>{rec.explanation}</span>
              </div>
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  )
}