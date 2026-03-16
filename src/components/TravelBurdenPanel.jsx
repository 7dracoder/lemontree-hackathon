import { useMemo, useState } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip } from 'react-leaflet'
import { AlertTriangle, Navigation, Star, MapPin } from 'lucide-react'
import { computeTravelBurden } from '../utils/travelBurden'
import MetricTooltip from './MetricTooltip'

const SEVERITY_COLOR = {
  high:    '#ef4444',
  medium:  '#f59e0b',
  low:     '#22c55e',
  unknown: '#6b7280',
}

const METRIC_TIPS = {
  highBurden: 'ZIP codes where residents must travel significantly farther to reach a quality-rated pantry than the nearest one.',
  mediumBurden: 'ZIP codes with moderate travel burden — some extra distance required for quality options.',
  lowBurden: 'ZIP codes where the nearest pantry is already well-rated, requiring minimal extra travel.',
  avgBurden: 'Average burden score across all analyzed ZIPs. Higher = more travel needed for quality food access.',
  scatter: 'Each dot is a ZIP code. Points above the diagonal = people must travel farther for a quality pantry than the nearest one. Color = severity.',
}

function ScatterTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div className="bg-card border border-accent p-3 space-y-1 font-mono text-xs" style={{ borderRadius: 0 }}>
      <div className="font-bold text-primary uppercase tracking-wide">ZIP {d.zip}</div>
      <div className="text-secondary">
        Nearest pantry: <span className="text-primary font-semibold">{d.distToNearest} mi</span>
      </div>
      <div className="text-secondary">
        Nearest <em>good</em> pantry:{' '}
        <span className="text-primary font-semibold">
          {d.distToNearestGood != null ? `${d.distToNearestGood} mi` : 'N/A'}
        </span>
      </div>
      <div className="text-secondary">
        Local avg rating:{' '}
        <span className="text-primary font-semibold">
          {d.avgLocalRating != null ? `⭐ ${d.avgLocalRating.toFixed(1)}` : 'N/A'}
        </span>
      </div>
      <div className="text-secondary">
        Burden score:{' '}
        <span className="font-bold" style={{ color: SEVERITY_COLOR[d.severity] }}>
          {d.burdenScore ?? 'N/A'}×
        </span>
      </div>
      {d.nearestGoodName && (
        <div className="text-tertiary text-[10px] pt-1 border-t border-border tracking-wide uppercase">
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

  const mapZips = useMemo(
    () => allZips.filter(z => z.centLat && z.centLng && z.severity !== 'low' && z.severity !== 'unknown'),
    [allZips]
  )
  const mapCenter = mapZips.length > 0
    ? [mapZips[0].centLat, mapZips[0].centLng]
    : [39.5, -98.35]

  const scatterData = useMemo(
    () => allZips.filter(z => z.distToNearestGood != null).slice(0, 200),
    [allZips]
  )

  if (!resources.length) return null

  const kpis = [
    { label: 'High Burden ZIPs', value: summary.high, color: 'text-red-400', hex: '#F87171', icon: AlertTriangle, tip: METRIC_TIPS.highBurden },
    { label: 'Medium Burden ZIPs', value: summary.medium, color: 'text-yellow-400', hex: '#FACC15', icon: Navigation, tip: METRIC_TIPS.mediumBurden },
    { label: 'Low Burden ZIPs', value: summary.low, color: 'text-green-400', hex: '#4ADE80', icon: MapPin, tip: METRIC_TIPS.lowBurden },
    { label: 'Avg Burden Score', value: `${summary.avgBurden}×`, color: 'text-blue-400', hex: '#60A5FA', icon: Star, tip: METRIC_TIPS.avgBurden },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-sm font-display font-bold text-primary uppercase tracking-wide flex items-center gap-2">
          <Navigation size={16} className="text-accent" />
          Travel Burden Analysis
        </h2>
        <p className="text-[11px] tracking-wide uppercase text-secondary mt-1">
          {'// '}ZIPs where the closest pantry is low-quality, forcing longer trips for good options
        </p>
      </div>

      {/* Definitions */}
      <div className="bg-card border border-border px-5 py-3 flex flex-wrap gap-x-6 gap-y-1.5 items-baseline">
        <span className="text-[10px] font-bold tracking-widest uppercase text-tertiary shrink-0">// Defs</span>
        {[
          { term: 'Burden Score', def: 'dist-to-good ÷ dist-to-nearest. Higher = more extra travel needed.' },
          { term: 'High Burden', def: 'Score ≥ 3×.' },
          { term: 'Good Pantry', def: 'Rating ≥ 3.5★, walk-in, above-median quality.' },
          { term: '50mi Cap', def: 'No good pantry found within 50 mi — capped at 50 for scoring.' },
        ].map(({ term, def }) => (
          <span key={term} className="text-[10px] font-mono text-secondary">
            <span className="text-primary font-bold uppercase tracking-wide">{term}:</span> {def}
          </span>
        ))}
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon
          return (
            <div key={kpi.label} className="bg-card border border-border p-5 relative hover:border-accent transition-colors">
              <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: kpi.hex }} />
              <div className="flex items-center justify-between mb-3 border-b border-border pb-3">
                <div className="text-sm font-display font-bold uppercase tracking-wide text-primary flex items-center gap-1 min-w-0">
                  <span className="truncate">{kpi.label}</span><MetricTooltip text={kpi.tip} />
                </div>
                <Icon size={14} className={`${kpi.color} opacity-80`} />
              </div>
              <div className={`text-2xl font-display font-bold ${kpi.color}`}>{kpi.value}</div>
            </div>
          )
        })}
      </div>

      {/* Scatter: nearest-any vs nearest-good */}
      <div className="bg-card border border-border p-5">
        <h3 className="text-sm font-display font-bold text-primary mb-1 uppercase tracking-wide flex items-center">
          Nearest Pantry vs Nearest <em className="ml-1 mr-1">Good</em> Pantry — by ZIP
          <MetricTooltip text={METRIC_TIPS.scatter} />
        </h3>
        <p className="text-[11px] tracking-wide uppercase text-secondary mb-5">
          {'// '}Points above the diagonal = people must travel farther for quality
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
            <XAxis
              dataKey="distToNearest"
              name="Nearest (any)"
              label={{ value: 'Nearest pantry (mi)', position: 'insideBottom', offset: -10, fill: '#71717A', fontSize: 10 }}
              tick={{ fill: '#71717A', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              domain={[0, 'auto']}
            />
            <YAxis
              dataKey="distToNearestGood"
              name="Nearest (good)"
              label={{ value: 'Nearest good (mi)', angle: -90, position: 'insideLeft', offset: 10, fill: '#71717A', fontSize: 10 }}
              tick={{ fill: '#71717A', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              domain={[0, 'auto']}
            />
            <ReferenceLine
              segment={[{ x: 0, y: 0 }, { x: 30, y: 30 }]}
              stroke="var(--color-border)"
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
        <div className="flex gap-4 mt-3 justify-end">
          {Object.entries(SEVERITY_COLOR).filter(([k]) => k !== 'unknown').map(([sev, col]) => (
            <span key={sev} className="text-[10px] flex items-center gap-1.5 tracking-widest uppercase font-bold">
              <span className="w-2.5 h-2.5 inline-block" style={{ background: col }} />
              <span className="text-secondary">{sev}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Map */}
      {mapZips.length > 0 && (
        <div className="bg-card border border-border p-5">
          <h3 className="text-sm font-display font-bold text-primary mb-1 uppercase tracking-wide">
            🗺️ High / Medium Burden ZIP Centroids
          </h3>
          <p className="text-[11px] tracking-wide uppercase text-secondary mb-3">
            {'// '}Each bubble = one ZIP. Size scales with burden score
          </p>
          <div style={{ height: 360 }} className="border border-border overflow-hidden">
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
                    <div className="font-mono text-[10px] tracking-wide uppercase leading-relaxed">
                      <strong className="text-accent">ZIP {z.zip}</strong><br />
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

      {/* Worst 10 */}
      <div className="bg-card border border-border overflow-hidden">
        <div className="p-5 border-b border-border">
          <h3 className="text-sm font-display font-bold text-primary uppercase tracking-wide">Top 10 Worst Burden ZIPs</h3>
          <p className="text-[11px] tracking-wide uppercase text-secondary mt-1">{'// '}Highest burden scores — orange badge = good pantry was beyond 50 mi (capped)</p>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-card border-b border-border">
              <tr>
                {['ZIP', 'Nearest (mi)', 'Nearest Good (mi)', 'Burden Score', 'Severity'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] text-secondary font-bold uppercase tracking-widest whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {allZips.slice(0, 10).map(z => (
                <tr key={z.zip} className="hover:bg-surface transition-colors">
                  <td className="px-4 py-3 text-primary font-mono font-bold tracking-wide">{z.zip}</td>
                  <td className="px-4 py-3 text-secondary font-mono">{z.distToNearest} mi</td>
                  <td className="px-4 py-3 font-mono">
                    <span className={z.goodCapped ? 'text-orange-400 font-bold' : 'text-secondary'}>
                      {z.distToNearestGood} mi
                    </span>
                    {z.goodCapped && (
                      <span className="ml-2 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 border border-orange-500/30 bg-orange-500/10 text-orange-400">50mi cap</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-bold font-mono" style={{ color: SEVERITY_COLOR[z.severity] }}>
                    {z.burdenScore}×
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5"
                      style={{ background: `${SEVERITY_COLOR[z.severity]}15`, color: SEVERITY_COLOR[z.severity], border: `1px solid ${SEVERITY_COLOR[z.severity]}30` }}>
                      {z.severity}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border overflow-hidden">
        <div className="p-5 border-b border-border flex items-center justify-between flex-wrap gap-3">
          <h3 className="text-sm font-display font-bold text-primary uppercase tracking-wide">ZIP-level Detail</h3>
          <div className="flex gap-2 flex-wrap">
            {['all', 'high', 'medium', 'low'].map(s => (
              <button
                key={s}
                onClick={() => setSelectedSeverity(s)}
                className={`px-3 py-1 text-[10px] tracking-widest font-bold uppercase transition-colors border ${
                  selectedSeverity === s
                    ? 'bg-accent text-page border-accent'
                    : 'bg-surface text-secondary border-border hover:border-accent'
                }`}
              >
                {s}
              </button>
            ))}
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="ml-2 bg-surface text-secondary text-[10px] font-mono tracking-wide uppercase px-3 py-1 border border-border focus:border-accent outline-none appearance-none"
            >
              <option value="burdenScore">Sort: Burden Score</option>
              <option value="distToNearestGood">Sort: Distance to Good</option>
            </select>
          </div>
        </div>
        <div className="overflow-auto max-h-72">
          <table className="w-full text-xs">
            <thead className="bg-card sticky top-0 z-10 shadow-sm border-b border-border">
              <tr>
                {['ZIP', 'Pantries', 'Avg Rating', 'Nearest (mi)', 'Nearest Good (mi)', 'Burden Score', 'Severity', 'Nearest Good Pantry', '50mi Cap'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] text-secondary font-bold uppercase tracking-widest whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.slice(0, 60).map(z => (
                <tr key={z.zip} className="hover:bg-surface transition-colors">
                  <td className="px-4 py-3 text-primary font-mono font-semibold tracking-wide">{z.zip}</td>
                  <td className="px-4 py-3 text-secondary">{z.resourceCount}</td>
                  <td className="px-4 py-3 text-secondary">
                    {z.avgLocalRating != null ? `⭐ ${z.avgLocalRating.toFixed(1)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-primary">{z.distToNearest}</td>
                  <td className="px-4 py-3 text-primary">
                    {z.distToNearestGood != null ? z.distToNearestGood : '—'}
                  </td>
                  <td className="px-4 py-3 font-bold" style={{ color: SEVERITY_COLOR[z.severity] }}>
                    {z.burdenScore != null ? `${z.burdenScore}×` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5"
                      style={{
                        background: `${SEVERITY_COLOR[z.severity]}15`,
                        color: SEVERITY_COLOR[z.severity],
                        border: `1px solid ${SEVERITY_COLOR[z.severity]}30`,
                      }}
                    >
                      {z.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-tertiary text-[10px] truncate max-w-[160px] tracking-wide uppercase">
                    {z.nearestGoodName
                      ? `${z.nearestGoodName}${z.nearestGoodCity ? `, ${z.nearestGoodCity}` : ''}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {z.goodCapped
                      ? <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 border border-orange-500/30 bg-orange-500/10 text-orange-400">CAPPED</span>
                      : <span className="text-[10px] text-tertiary font-mono">—</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center text-tertiary text-[10px] tracking-widest uppercase font-bold py-8 border-t border-border">
              No ZIPs match this filter
            </div>
          )}
        </div>
      </div>
    </div>
  )
}