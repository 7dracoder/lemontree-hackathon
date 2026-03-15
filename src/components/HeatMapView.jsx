import { MapContainer, TileLayer, Circle, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'


//this is publishable key, safe for github
const supabase = createClient(
 'https://sweceszfqssyzqyzpggc.supabase.co',
 'sb_publishable_CQV7UAc_2uHNKSNq6kVvVw_4GmAxF0c'
)


const NYC = [40.7128, -74.0060]

const DEFAULT_CENTER = [39.5, -98.35]
const DEFAULT_ZOOM = 4


function FlyToCenter({ center, zoom, shouldFly }) {
 const map = useMap()


 useEffect(() => {
   if (shouldFly) {
     map.flyTo(center, zoom, { duration: 1.2 })
   }
 }, [center[0], center[1], zoom, shouldFly])


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
       ? (r.nearest_pantry_miles - distMin) / distRange
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


function isNycZip(zip) {
 const s = String(zip || '')
 return (
   s.startsWith('100') ||
   s.startsWith('101') ||
   s.startsWith('102') ||
   s.startsWith('103') ||
   s.startsWith('104') ||
   s.startsWith('111') ||
   s.startsWith('112') ||
   s.startsWith('113') ||
   s.startsWith('114') ||
   s.startsWith('116')
 )
}


function getDisplayRadius(zip) {
 return isNycZip(zip) ? 1000 : 2000
}


function SnapLayer({ rows, mode }) {
 const scoredRows = useMemo(() => buildRowsWithScore(rows, mode), [rows, mode])


 return scoredRows.map((r) => {
   const color = getColor(r._score ?? 0, mode)


   return (
     <Circle
       key={`${mode}-${r.zip}`}
       center={[r.zip_lat, r.zip_lon]}
       radius={getDisplayRadius(r.zip)}
       pathOptions={{
         color,
         fillColor: color,
         fillOpacity: 0.4,
         opacity: 0.7,
         weight: 1
       }}
     >
       <Tooltip>
         <div style={{ fontSize: 11 }}>
           <strong>ZIP {r.zip}</strong><br />
           {r._label}: {r._valueText}<br />
           SNAP rate: {r.snap_rate != null ? `${(r.snap_rate * 100).toFixed(1)}%` : '—'}<br />
           Nearby pantries: {r.pantry_count_nearby ?? '—'}<br />
           Nearest pantry: {r.nearest_pantry_miles !== 10 ? `${Number(r.nearest_pantry_miles).toFixed(2)} mi` : '—'}
         </div>
       </Tooltip>
     </Circle>
   )
 })
}


export default function HeatMapView({
 resources,
 clusterMap = {},
 placementRecs = [],
 height = '400px',
 mode = 'snap_rate'
}) {
 const [rows, setRows] = useState([])

 const center = DEFAULT_CENTER
 const zoom = DEFAULT_ZOOM

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


       const batch = Array.isArray(data) ? data : []
       allGap = allGap.concat(batch)


       if (batch.length < pageSize) break
       from += pageSize
     }


     const zips = allGap.map((r) => r.zip).filter(Boolean)


     let allDemo = []
     let demoFrom = 0


     while (demoFrom < zips.length) {
       const zipBatch = zips.slice(demoFrom, demoFrom + 1000)


       const { data, error } = await supabase
         .from('zip_demographics')
         .select('zip, snap_households, total_households, snap_rate')
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
         pantry_count_nearby:
           g.pantry_count_nearby == null ? null : Number(g.pantry_count_nearby),
         nearest_pantry_miles:
           g.nearest_pantry_miles == null ? 10 : Number(g.nearest_pantry_miles),
         snap_households: demoMap[g.zip]?.snap_households ?? null,
         total_households: demoMap[g.zip]?.total_households ?? null,
         snap_rate:
           demoMap[g.zip]?.snap_rate == null
             ? null
             : Number(demoMap[g.zip].snap_rate)
       }))
       .filter((r) => Number.isFinite(r.zip_lat) && Number.isFinite(r.zip_lon))


     setRows(merged)
   }


   load()
 }, [])


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

    {placementRecs.filter(r => r.zip_lat && r.zip_lon).map((rec, i) => (
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

