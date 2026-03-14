import { useMemo, useState } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip } from 'react-leaflet'
import { AlertTriangle, Navigation, Star, MapPin } from 'lucide-react'
import { computeTravelBurden } from '../utils/travelBurden'

const SEVERITY_COLOR = {
  high:    '#ef4444',
  medium:  '#f59e0b',
  low:     '#22c55e',
  unknown: '#6b7280',
}

const TOOLTIP_STYLE = {
  background: 'rgba(17,24,39,0.95)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  fontSize: 12,
}

function ScatterTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div style={TOOLTIP_STYLE} className="p-3 space-y-1">
      <div className="font-semibold text-white">ZIP {d.zip}</div>
      <div className="text-gray-400">
        Nearest pantry: <span className="text-white">{d.distToNearest} mi</span>
      </div>
      <div className="text-gray-400">
        Nearest <em>good</em> pantry:{' '}
        <span className="text-white">
          {d.distToNearestGood != null ? `${d.distToNearestGood} mi` : 'N/A'}
        </span>
      </div>
      <div className="text-gray-400">
        Local avg rating:{' '}
        <span className="text-white">
          {d.avgLocalRating != null ? `⭐ ${d.avgLocalRating.toFixed(1)}` : 'N/A'}
        </span>
      </div>
      <div className="text-gray-400">
        Burden score:{' '}
        <span style={{ color: SEVERITY_COLOR[d.severity] }} className="font-bold">
          {d.burdenScore ?? 'N/A'}×
        </span>
      </div>
      {d.nearestGoodName && (
        <div className="text-gray-500 text-[11px] pt-1 border-t border-gray-800">
          Nearest good: {d.nearestGoodName}
          {d.nearestGoodCity ? `, ${d.nearestGoodCity}` : ''}
        </div>
      )}
    </div>
  )
}

export default function TravelBurdenPanel({ resources }) {
  const [selectedSeverity, setSelectedSeverity] = useState('all')
  const [sortBy, setSortBy] = useState('burdenScore')

  const allZips = useMemo(() => computeTravelBurden(resources), [resources])

  const filtered = useMemo(() => {
    const base =
      selectedSeverity === 'all'
        ? allZips
        : allZips.filter(z => z.severity === selectedSeverity)
    return [...base].sort((a, b) =>
      sortBy === 'burdenScore'
        ? (b.burdenScore ?? 0) - (a.burdenScore ?? 0)
        : b.distToNearestGood - a.distToNearestGood
    )
  }, [allZips, selectedSeverity, sortBy])

  const summary = useMemo(() => ({
    high:    allZips.filter(z => z.severity === 'high').length,
    medium:  allZips.filter(z => z.severity === 'medium').length,
    low:     allZips.filter(z => z.severity === 'low').length,
    avgBurden:
      allZips.length
        ? (allZips.reduce((s, z) => s + (z.burdenScore ?? 0), 0) / allZips.length).toFixed(2)
        : 0,
  }), [allZips])

  // Map data: only show high/medium for map clarity
  const mapZips = useMemo(
    () => allZips.filter(z => z.centLat && z.centLng && z.severity !== 'low' && z.severity !== 'unknown'),
    [allZips]
  )
  const mapCenter = mapZips.length > 0
    ? [mapZips[0].centLat, mapZips[0].centLng]
    : [39.5, -98.35]

  // Scatter: x=distToNearest, y=distToNearestGood (only rows with both)
  const scatterData = useMemo(
    () => allZips.filter(z => z.distToNearestGood != null).slice(0, 200),
    [allZips]
  )

  if (!resources.length) return null

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Navigation size={18} className="text-yellow-400" />
          Travel Burden Analysis
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          ZIPs where the closest pantry is low-quality, forcing longer trips to find a good option.
          Burden score = distance to nearest <em>good</em> pantry ÷ distance to nearest <em>any</em> pantry.
        </p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'High Burden ZIPs',   value: summary.high,   color: 'text-red-400',    accent: 'kpi-red',    icon: AlertTriangle },
          { label: 'Medium Burden ZIPs', value: summary.medium, color: 'text-yellow-400', accent: 'kpi-orange', icon: Navigation },
          { label: 'Low Burden ZIPs',    value: summary.low,    color: 'text-green-400',  accent: 'kpi-green',  icon: MapPin },
          { label: 'Avg Burden Score',   value: `${summary.avgBurden}×`, color: 'text-blue-400', accent: 'kpi-blue', icon: Star },
        ].map(({ label, value, color, accent, icon: Icon }) => (
          <div key={label} className={`glass-card rounded-xl p-4 ${accent}`}>
            <div className="flex items-center justify-between mb-2">
              <Icon size={14} className={`${color} opacity-60`} />
            </div>
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-gray-500 mt-1 font-medium">{label}</div>
          </div>
        ))}
      </div>

      {/* Scatter: nearest-any vs nearest-good */}
      <div className="chart-card">
        <h3 className="text-sm font-semibold text-gray-300 mb-1">
          Nearest Pantry vs Nearest <em>Good</em> Pantry — by ZIP
        </h3>
        <p className="text-xs text-gray-600 mb-4">
          Points above the diagonal line = people must travel farther for quality. Color = burden severity.
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
            <XAxis
              dataKey="distToNearest"
              name="Nearest (any)"
              label={{ value: 'Nearest pantry (mi)', position: 'insideBottom', offset: -10, fill: '#6b7280', fontSize: 11 }}
              tick={{ fill: '#6b7280', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              domain={[0, 'auto']}
            />
            <YAxis
              dataKey="distToNearestGood"
              name="Nearest (good)"
              label={{ value: 'Nearest good (mi)', angle: -90, position: 'insideLeft', offset: 10, fill: '#6b7280', fontSize: 11 }}
              tick={{ fill: '#6b7280', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              domain={[0, 'auto']}
            />
            {/* diagonal y=x reference */}
            <ReferenceLine
              segment={[{ x: 0, y: 0 }, { x: 30, y: 30 }]}
              stroke="#374151"
              strokeDasharray="4 4"
            />
            <Tooltip content={<ScatterTooltip />} />
            <Scatter data={scatterData}>
              {scatterData.map((d, i) => (
                <Cell key={i} fill={SEVERITY_COLOR[d.severity]} fillOpacity={0.75} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-2 justify-end">
          {Object.entries(SEVERITY_COLOR).filter(([k]) => k !== 'unknown').map(([sev, col]) => (
            <span key={sev} className="text-xs flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: col }} />
              <span className="text-gray-400 capitalize">{sev}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Map */}
      {mapZips.length > 0 && (
        <div className="chart-card">
          <h3 className="text-sm font-semibold text-gray-300 mb-1">
            🗺️ High / Medium Burden ZIP Centroids
          </h3>
          <p className="text-xs text-gray-600 mb-3">
            Each bubble = one ZIP. Size scales with burden score. Red = high, amber = medium.
          </p>
          <div style={{ height: 360 }} className="rounded-xl overflow-hidden border border-gray-800">
            <MapContainer center={mapCenter} zoom={6} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; OpenStreetMap'
              />
              {mapZips.map(z => (
                <CircleMarker
                  key={z.zip}
                  center={[z.centLat, z.centLng]}
                  radius={Math.min(4 + (z.burdenScore ?? 1) * 2, 18)}
                  pathOptions={{
                    fillColor: SEVERITY_COLOR[z.severity],
                    color: SEVERITY_COLOR[z.severity],
                    fillOpacity: 0.65,
                    weight: 1,
                  }}
                >
                  <LeafletTooltip>
                    <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                      <strong>ZIP {z.zip}</strong><br />
                      Burden: {z.burdenScore ?? 'N/A'}× · {z.resourceCount} pantries<br />
                      Nearest any: {z.distToNearest} mi<br />
                      Nearest good: {z.distToNearestGood ?? 'N/A'} mi<br />
                      {z.avgLocalRating != null && `Avg local rating: ⭐ ${z.avgLocalRating.toFixed(1)}`}
                    </div>
                  </LeafletTooltip>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="p-4 border-b border-gray-800/50 flex items-center justify-between flex-wrap gap-3">
          <h3 className="text-sm font-semibold text-gray-300">ZIP-level Detail</h3>
          <div className="flex gap-2 flex-wrap">
            {/* Severity filter */}
            {['all', 'high', 'medium', 'low'].map(s => (
              <button
                key={s}
                onClick={() => setSelectedSeverity(s)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all capitalize ${
                  selectedSeverity === s
                    ? 'bg-yellow-400/20 text-yellow-300 border border-yellow-400/30'
                    : 'text-gray-500 hover:text-gray-300 border border-transparent'
                }`}
              >
                {s}
              </button>
            ))}
            {/* Sort */}
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="ml-2 bg-gray-800/60 text-gray-400 text-xs rounded-lg px-2 py-1 border border-gray-700 focus:outline-none"
            >
              <option value="burdenScore">Sort: Burden Score</option>
              <option value="distToNearestGood">Sort: Distance to Good</option>
            </select>
          </div>
        </div>
        <div className="overflow-auto max-h-72">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/40 sticky top-0">
              <tr>
                {['ZIP', 'Pantries', 'Avg Rating', 'Nearest (mi)', 'Nearest Good (mi)', 'Burden Score', 'Severity', 'Nearest Good Pantry'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs text-gray-500 font-semibold uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 60).map(z => (
                <tr key={z.zip} className="table-row border-t border-gray-800/30">
                  <td className="px-3 py-2.5 text-white font-mono font-medium">{z.zip}</td>
                  <td className="px-3 py-2.5 text-gray-400">{z.resourceCount}</td>
                  <td className="px-3 py-2.5 text-gray-400">
                    {z.avgLocalRating != null ? `⭐ ${z.avgLocalRating.toFixed(1)}` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-gray-300">{z.distToNearest}</td>
                  <td className="px-3 py-2.5 text-gray-300">
                    {z.distToNearestGood != null ? z.distToNearestGood : '—'}
                  </td>
                  <td className="px-3 py-2.5 font-bold" style={{ color: SEVERITY_COLOR[z.severity] }}>
                    {z.burdenScore != null ? `${z.burdenScore}×` : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full capitalize"
                      style={{
                        background: `${SEVERITY_COLOR[z.severity]}20`,
                        color: SEVERITY_COLOR[z.severity],
                      }}
                    >
                      {z.severity}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 text-xs truncate max-w-[160px]">
                    {z.nearestGoodName
                      ? `${z.nearestGoodName}${z.nearestGoodCity ? `, ${z.nearestGoodCity}` : ''}`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center text-gray-600 text-sm py-8">
              No ZIPs match this filter
            </div>
          )}
        </div>
      </div>
    </div>
  )
}