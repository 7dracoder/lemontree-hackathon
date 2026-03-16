import { MapContainer, TileLayer, GeoJSON, Marker, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import * as turf from '@turf/turf'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://sweceszfqssyzqyzpggc.supabase.co',
  'sb_publishable_CQV7UAc_2uHNKSNq6kVvVw_4GmAxF0c'
)

const NYC_GREATER_METRO_AREA_CENTER = [40.7928, -73.931]
const NYC_GREATER_METRO_AREA_ZOOM = 10

function makePinIcon(color = '#3b82f6') {
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width: 16px;
        height: 16px;
        background: ${color};
        border: 2px solid white;
        border-radius: 9999px 9999px 9999px 0;
        transform: rotate(-45deg);
        box-shadow: 0 1px 4px rgba(0,0,0,0.35);
      "></div>
    `,
    iconSize: [16, 16],
    iconAnchor: [8, 16],
    popupAnchor: [0, -16],
  })
}

function FlyToBounds({ bbox, fallbackCenter, fallbackZoom }) {
  const map = useMap()

  useEffect(() => {
    if (
      Array.isArray(bbox) &&
      bbox.length === 4 &&
      bbox.every((n) => Number.isFinite(n))
    ) {
      map.fitBounds(
        [
          [bbox[1], bbox[0]],
          [bbox[3], bbox[2]],
        ],
        { padding: [20, 20] }
      )
    } else {
      map.setView(fallbackCenter, fallbackZoom)
    }
  }, [map, bbox, fallbackCenter, fallbackZoom])

  return null
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

function getCoverageColor(value, breaks) {
    if (value > breaks[3]) return '#dc2626'      // red 20k+
    if (value > breaks[2]) return '#f97316'      // orange 100k–20k
    if (value > breaks[1]) return '#facc15'      // yellow 5k–10k
    if (value > breaks[0]) return '#86efac'      // light green 1k-5k
    return '#22c55e'                             // green <=1k
  }

function computeBreaks() {
    return [1000, 5000, 100000, 20000]
}

function buildTightBBox(resources, padMiles = 0.75) {
  const lats = resources.map((r) => Number(r.latitude)).filter(Number.isFinite)
  const lngs = resources.map((r) => Number(r.longitude)).filter(Number.isFinite)

  if (!lats.length || !lngs.length) return null

  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)

  const centerLat = (minLat + maxLat) / 2
  const latPad = padMiles / 69
  const lngPad = padMiles / (69 * Math.cos(centerLat * Math.PI / 180))

  return [
    minLng - lngPad,
    minLat - latPad,
    maxLng + lngPad,
    maxLat + latPad,
  ]
}

export default function VoronoiCoverageMapNYNJ({
  resources,
  clusterMap = {},
  height = '520px',
}) {
  const [rows, setRows] = useState([])
  const [loadError, setLoadError] = useState('')
  const [debugEnabled] = useState(true)

  const validResources = useMemo(() => {
    const filtered = (resources || []).filter((r) => {
      const lat = Number(r.latitude)
      const lng = Number(r.longitude)
      return Number.isFinite(lat) && Number.isFinite(lng) && isNyOrNjResource(r)
    })

    console.log('[Voronoi] validResources', filtered.length, filtered[0])
    return filtered
  }, [resources])

  const tightBBox = useMemo(() => {
    const bbox = buildTightBBox(validResources, 0.75)
    console.log('[Voronoi] tightBBox', bbox)
    return bbox
  }, [validResources])

  useEffect(() => {
    async function load() {
      try {
        setLoadError('')
        const pageSize = 1000
        let from = 0
        let allGap = []

        while (true) {
          const { data, error } = await supabase
            .from('zip_coverage_gap')
            .select('zip, zip_lat, zip_lon')
            .range(from, from + pageSize - 1)

          if (error) {
            console.error('[Voronoi] zip_coverage_gap error', error)
            setLoadError(`zip_coverage_gap error: ${error.message}`)
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
            .select('zip, snap_households, snap_rate, poverty_rate')
            .in('zip', zipBatch)

          if (error) {
            console.error('[Voronoi] zip_demographics error', error)
            setLoadError(`zip_demographics error: ${error.message}`)
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
            snap_households:
              demoMap[g.zip]?.snap_households == null
                ? 0
                : Number(demoMap[g.zip].snap_households),
            snap_rate:
              demoMap[g.zip]?.snap_rate == null
                ? null
                : Number(demoMap[g.zip].snap_rate),
            poverty_rate:
              demoMap[g.zip]?.poverty_rate == null
                ? null
                : Number(demoMap[g.zip].poverty_rate),
          }))
          .filter((r) => Number.isFinite(r.zip_lat) && Number.isFinite(r.zip_lon))

        console.log('[Voronoi] merged zip rows', merged.length, merged[0])
        setRows(merged)
      } catch (err) {
        console.error('[Voronoi] unexpected load error', err)
        setLoadError(err?.message || 'Unknown load error')
      }
    }

    load()
  }, [])

  const voronoiGeoJson = useMemo(() => {
    try {
      if (!validResources.length || !rows.length || !tightBBox) {
        console.log('[Voronoi] skipped generation', {
          validResources: validResources.length,
          rows: rows.length,
          tightBBox,
        })
        return null
      }

      const pantryPoints = validResources.map((r) =>
        turf.point([Number(r.longitude), Number(r.latitude)], {
          pantryId: r.id,
          pantryName: r.name ?? 'Unknown',
          city: r.city ?? '',
          state: r.state ?? '',
        })
      )

      const pointsFc = turf.featureCollection(pantryPoints)
      const rawVoronoi = turf.voronoi(pointsFc, { bbox: tightBBox })

      console.log('[Voronoi] rawVoronoi', rawVoronoi)

      if (!rawVoronoi || !rawVoronoi.features || !rawVoronoi.features.length) {
        console.warn('[Voronoi] Voronoi generation failed', {
          pointCount: pantryPoints.length,
          bbox: tightBBox,
        })
        return null
      }

      rawVoronoi.features = rawVoronoi.features.filter(
        (cell) =>
          cell &&
          cell.geometry &&
          cell.geometry.type === 'Polygon' &&
          Array.isArray(cell.geometry.coordinates) &&
          cell.geometry.coordinates.length > 0 &&
          Array.isArray(cell.geometry.coordinates[0]) &&
          cell.geometry.coordinates[0].length >= 4
      )

      const snapByPantry = {}
      const zipCountByPantry = {}

      rows.forEach((z) => {
        const zipPoint = turf.point([Number(z.zip_lon), Number(z.zip_lat)])

        let bestPantry = null
        let bestDist = Infinity

        validResources.forEach((r) => {
          const d = turf.distance(
            zipPoint,
            turf.point([Number(r.longitude), Number(r.latitude)]),
            { units: 'miles' }
          )

          if (d < bestDist) {
            bestDist = d
            bestPantry = r
          }
        })

        if (!bestPantry) return

        snapByPantry[bestPantry.id] = (snapByPantry[bestPantry.id] ?? 0) + (z.snap_households ?? 0)
        zipCountByPantry[bestPantry.id] = (zipCountByPantry[bestPantry.id] ?? 0) + 1
      })

      rawVoronoi.features.forEach((cell) => {
        if (!cell) return

        const centroid = turf.centroid(cell)

        let bestPantry = null
        let bestDist = Infinity

        validResources.forEach((r) => {
          const d = turf.distance(
            centroid,
            turf.point([Number(r.longitude), Number(r.latitude)]),
            { units: 'miles' }
          )

          if (d < bestDist) {
            bestDist = d
            bestPantry = r
          }
        })

        const pantryId = bestPantry?.id

        cell.properties = {
          ...(cell.properties || {}),
          pantryId,
          pantryName: bestPantry?.name ?? 'Unknown',
          city: bestPantry?.city ?? '',
          state: bestPantry?.state ?? '',
          snapCovered: snapByPantry[pantryId] ?? 0,
          zipCount: zipCountByPantry[pantryId] ?? 0,
        }
      })

      const breaks = computeBreaks(rawVoronoi.features.map((f) => f?.properties?.snapCovered ?? 0))

      rawVoronoi.features.forEach((cell) => {
        if (!cell?.properties) cell.properties = {}
        cell.properties.fillColor = getCoverageColor(cell.properties.snapCovered ?? 0, breaks)
      })

      rawVoronoi.properties = { breaks }

      console.log('[Voronoi] success', {
        featureCount: rawVoronoi.features.length,
        breaks,
      })

      return rawVoronoi
    } catch (err) {
      console.error('[Voronoi] generation error', err)
      return null
    }
  }, [validResources, rows, tightBBox])

  const breaks = voronoiGeoJson?.properties?.breaks ?? [100, 500, 1500, 3000, 6000]

  const debug = {
    resourceCount: validResources.length,
    zipCount: rows.length,
    hasVoronoi: !!voronoiGeoJson,
    voronoiFeatureCount: voronoiGeoJson?.features?.length ?? 0,
    loadError,
    tightBBox: tightBBox ? tightBBox.map((n) => Number(n).toFixed(4)).join(', ') : 'none',
  }

  return (
    <div>


      {!voronoiGeoJson && !loadError && rows.length > 0 && validResources.length > 0 && (
        <div className="mb-2 px-3 py-2 border border-red-500/40 bg-red-500/10 text-xs text-red-300">
          Voronoi map could not be generated. Check the browser console for details.
        </div>
      )}

      <div style={{ height }} className="border border-border">
        <MapContainer
          center={NYC_GREATER_METRO_AREA_CENTER}
          zoom={NYC_GREATER_METRO_AREA_ZOOM}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />

          <FlyToBounds
            bbox={tightBBox}
            fallbackCenter={NYC_GREATER_METRO_AREA_CENTER}
            fallbackZoom={NYC_GREATER_METRO_AREA_ZOOM}
          />

          {voronoiGeoJson?.features?.length > 0 && (
            <GeoJSON
              data={voronoiGeoJson}
              style={(feature) => ({
                color: '#111827',
                weight: 1,
                fillOpacity: 0.35,
                fillColor: feature?.properties?.fillColor ?? '#22c55e',
              })}
              onEachFeature={(feature, layer) => {
                const p = feature.properties || {}
                layer.bindTooltip(`
                  <div style="font-size:11px; line-height:1.45;">
                    <strong>${p.pantryName ?? 'Unknown'}</strong><br/>
                    ${p.city ?? ''}${p.city && p.state ? ', ' : ''}${p.state ?? ''}<br/>
                    SNAP households covered: ${(p.snapCovered ?? 0).toLocaleString()}<br/>
                    ZIPs assigned: ${p.zipCount ?? 0}
                  </div>
                `)
              }}
            />
          )}

        {validResources.map((r) => {
            const markerStyle = clusterMap?.[r.id]
            const pinColor = markerStyle?.color ?? '#ffffff'
            const pinLabel = markerStyle?.label ?? 'Unknown'

            return (
                <Marker
                key={`pantry-${r.id}`}
                position={[Number(r.latitude), Number(r.longitude)]}
                icon={makePinIcon(pinColor)}
                >
                <Tooltip>
                    <div className="font-mono text-[10px] tracking-wide uppercase leading-relaxed max-w-[200px]">
                    <strong>{r.name ?? 'Unknown'}</strong><br />
                    <span>{r.city ?? ''}{r.city && r.state ? ', ' : ''}{r.state ?? ''}</span><br />
                    <span style={{ color: pinColor }}>📍 {pinLabel}</span>
                    </div>
                </Tooltip>
                </Marker>
            )
            })}
        </MapContainer>
      </div>

      <div className="mt-3 border border-border px-3 py-3 bg-surface/30">
        <div className="text-[10px] uppercase tracking-widest text-secondary mb-2">
          Service Zone SNAP Coverage
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
            {[
                { color: '#22c55e', label: '≤ 1,000' },     // green
                { color: '#86efac', label: '1k – 5k' },    // light green
                { color: '#facc15', label: '5k – 10k' },   // yellow
                { color: '#f97316', label: '10k – 20k' },   // orange
                { color: '#dc2626', label: '20k+' },        // red
            ].map((item) => (
                <div key={item.label} className="flex items-center gap-2 text-[11px] uppercase tracking-wide">
                <span
                    className="inline-block"
                    style={{
                    width: 12,
                    height: 12,
                    background: item.color,
                    border: '1px solid rgba(255,255,255,0.5)',
                    }}
                />
                <span className="text-secondary">{item.label} SNAP HH</span>
                </div>
            ))}
            </div>
      </div>
    </div>
  )
}