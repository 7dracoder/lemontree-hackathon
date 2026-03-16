import { useState, useMemo, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { MapPin, Shield, AlertTriangle, Eye, TrendingUp, Loader2 } from 'lucide-react'
import { useResources } from '../hooks/useResources'
import { useTranslation } from '../hooks/useTranslation'
import { computeBarrierIndex, getBarrierStyle, isClosedToday } from '../utils/mlScoring'
import MapView from '../components/MapView'
import HeatMapView from '../components/HeatMapView'
import HeatMapViewNYNJ from '../components/HeatMapViewNYNJ'
import VoronoiCoverageMapNYNJ from '../components/VoronoiCoverageMapNYNJ'
import TravelBurdenPanel from '../components/TravelBurdenPanel'
import { useExport } from '../context/ExportContext'
import MetricTooltip from '../components/MetricTooltip'

const _supabase = createClient(
  'https://sweceszfqssyzqyzpggc.supabase.co',
  'sb_publishable_CQV7UAc_2uHNKSNq6kVvVw_4GmAxF0c'
)

const STATE_ABBR = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
  'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
  'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
  'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH',
  'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC',
  'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA',
  'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', 'Tennessee': 'TN',
  'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA',
  'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC',
}

const CLUSTER_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444']
const CLUSTER_LABELS_KEY = ['wellServed', 'moderateAccess', 'strained', 'foodDesert']

const KPI_CONFIG = [
  { icon: MapPin, accent: 'kpi-blue', color: 'text-blue-400', hex: '#60A5FA' },
  { icon: AlertTriangle, accent: 'kpi-red', color: 'text-red-400', hex: '#F87171' },
  { icon: Shield, accent: 'kpi-orange', color: 'text-orange-400', hex: '#FB923C' },
  { icon: Eye, accent: 'kpi-yellow', color: 'text-yellow-400', hex: '#FACC15' },
]

const LEMONTREE_STATES = [
  { value: '', label: 'National (All)' },
  { value: 'CA', label: 'California' },
  { value: 'FL', label: 'Florida' },
  { value: 'IL', label: 'Illinois' },
  { value: 'NJ', label: 'New Jersey' },
  { value: 'NY', label: 'New York' },
  { value: 'PA', label: 'Pennsylvania' },
  { value: 'TX', label: 'Texas' },
]

function usePlacementRecommendations(state) {
  const [recs, setRecs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    async function load() {
      if (state) {
        try {
          const { data: scores } = await _supabase
            .from('zip_placement_scores')
            .select('zip, placement_score, state')
            .eq('state', state)
            .order('placement_score', { ascending: false })
            .limit(5)
          if (scores?.length) {
            const zips = scores.map((r) => r.zip)
            const { data: geo } = await _supabase
              .from('zip_coverage_gap')
              .select('zip, zip_lat, zip_lon')
              .in('zip', zips)
            const geoMap = Object.fromEntries((geo || []).map((g) => [g.zip, g]))
            setRecs(scores.map((r) => ({ ...r, zip_lat: geoMap[r.zip]?.zip_lat ?? null, zip_lon: geoMap[r.zip]?.zip_lon ?? null })))
            setLoading(false)
            return
          }
        } catch (_) {}
      }
      const url = '/api/placement-recommendations'
      try {
        const res = await fetch(url)
        if (res.ok) {
          setRecs(await res.json())
          return
        }
      } catch (_) {}

      if (!state) {
        try {
          const res = await fetch('/placement_recs.json')
          if (res.ok) setRecs(await res.json())
        } catch (_) {}
      }

      setLoading(false)
    }

    load().finally(() => setLoading(false))
  }, [state])

  return { recs, loading }
}

export default function GovDashboard() {
  const [heatMode, setHeatMode] = useState('snap_rate')
  const [nyHeatMode, setNyHeatMode] = useState('snap_rate')
  const [recState, setRecState] = useState('')

  const { data, isLoading, progress } = useResources({})
  const { recs, loading: recsLoading } = usePlacementRecommendations(recState)
  const { t, lang } = useTranslation()
  const { setExportState } = useExport()

  // Web Worker for K-Means clustering — keeps UI responsive
  const [clusterMap, setClusterMap] = useState({})
  const [clusterLoading, setClusterLoading] = useState(false)
  const [displayData, setDisplayData] = useState([])
  const workerRef = useRef(null)
  const runIdRef = useRef(0)
  const pendingDataRef = useRef(null)

  useEffect(() => {
    if (!data?.length) {
      setDisplayData([])
      setClusterMap({})
      setClusterLoading(false)
      return
    }

    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('../workers/clusterWorker.js', import.meta.url),
        { type: 'module' }
      )
      workerRef.current.onmessage = (e) => {
        const { ok, result, runId } = e.data ?? {}
        if (runId !== runIdRef.current) return
        if (ok) {
          setClusterMap(result ?? {})
          if (pendingDataRef.current?.runId === runId) setDisplayData(pendingDataRef.current.data)
        }
        setClusterLoading(false)
      }
      workerRef.current.onerror = () => {
        runIdRef.current += 1
        setClusterLoading(false)
      }
    }

    const thisRun = ++runIdRef.current
    pendingDataRef.current = { runId: thisRun, data }
    setClusterLoading(true)
    workerRef.current.postMessage({ resources: data, runId: thisRun })

    return () => {
      runIdRef.current += 1
    }
  }, [data])

  useEffect(() => {
    const w = workerRef.current
    return () => { w?.terminate(); workerRef.current = null }
  }, [])

  useEffect(() => {
    setExportState({ data: displayData, dashboardId: 'gov-dashboard' })
  }, [displayData, setExportState])

  const barrierMap = useMemo(() => {
    const result = {}
    data.forEach((r) => {
      result[r.id] = getBarrierStyle(r)
    })
    return result
  }, [data])

  const BARRIER_LEGEND = [
    { color: '#22c55e', label: 'Very Accessible' },
    { color: '#3b82f6', label: 'Moderately Accessible' },
    { color: '#f59e0b', label: 'Limited Access' },
    { color: '#ef4444', label: 'Severely Limited Access' },
    { color: '#a855f7', label: 'ML Recommended Placement' },
  ]

  const clusterDist = useMemo(() => {
    const counts = [0, 0, 0, 0]
    Object.values(clusterMap).forEach((v) => counts[v.cluster]++)
    return counts.map((count, i) => ({
      label: t(CLUSTER_LABELS_KEY[i]),
      count,
      color: CLUSTER_COLORS[i],
    }))
  }, [clusterMap, t, lang])

  const barrierByState = useMemo(() => {
    const m = {}
    displayData.forEach((r) => {
      if (!r.state) return
      const state = STATE_ABBR[r.state.trim()] ?? r.state.trim()
      if (!m[state]) m[state] = { sum: 0, count: 0 }
      m[state].sum += computeBarrierIndex(r)
      m[state].count++
    })
    return Object.entries(m)
      .map(([state, v]) => ({ state, barrier: parseFloat((v.sum / v.count).toFixed(2)) }))
      .sort((a, b) => b.barrier - a.barrier)
      .slice(0, 12)
  }, [displayData])

  const capacityData = useMemo(() => {
    const atCapacity = displayData.filter((r) => !r.occurrences?.some((o) => !o.skippedAt) || isClosedToday(r)).length
    const total = displayData.length || 1
    return [
      { name: 'At Capacity', value: atCapacity, pct: ((atCapacity / total) * 100).toFixed(1) },
      { name: 'Available', value: total - atCapacity, pct: (((total - atCapacity) / total) * 100).toFixed(1) },
    ]
  }, [displayData])

  const lowConfidenceByState = useMemo(() => {
    const m = {}
    displayData.forEach((r) => {
      if (!r.state || (r.confidence ?? 1) >= 0.5) return
      const state = STATE_ABBR[r.state.trim()] ?? r.state.trim()
      m[state] = (m[state] ?? 0) + 1
    })
    return Object.entries(m)
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  }, [displayData])

  const kpis = [
    { label: t('totalResources'), value: displayData.length.toLocaleString(), tip: 'Total number of food assistance resources currently loaded and displayed.', ...KPI_CONFIG[0] },
    {
      label: t('foodDeserts'),
      value: clusterDist[3]?.count ?? 0,
      href: '#nyc-pantry-service-zones',
      tip: 'Resources in the highest-need cluster — areas with low access, high barriers, and poor ratings.',
      ...KPI_CONFIG[1],
    },
    { label: t('atCapacity'), value: `${capacityData[0]?.pct ?? 0}%`, tip: 'Percentage of resources where all occurrences are skipped or the location is closed today.', ...KPI_CONFIG[2] },
    { label: t('lowConfidence'), value: displayData.filter((r) => (r.confidence ?? 1) < 0.5).length, tip: 'Resources with a data confidence score below 50% — information may be outdated or unverified.', ...KPI_CONFIG[3] },
  ]

  function LegendPin({ color }) {
    return (
      <span
        className="inline-block relative"
        style={{
          width: 12,
          height: 12,
          background: color,
          border: '1.5px solid white',
          borderRadius: '9999px 9999px 9999px 0',
          transform: 'rotate(-45deg)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
        }}
      />
    )
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 animate-fade-in">
        <div className="w-72 h-4 bg-gray-600 rounded-full overflow-hidden">
          <div
            className="h-full bg-yellow-400 transition-all duration-300 rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-secondary tracking-widest uppercase font-bold text-[10px] animate-pulse">
          SYS_LOADING {progress}%
        </p>
      </div>
    )
  }

  return (
    <>
      {clusterLoading && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
          aria-busy="true"
          aria-live="polite"
        >
          <div className="flex flex-col items-center gap-4">
            <Loader2 size={48} className="text-white animate-spin" />
            <span className="text-sm font-bold tracking-widest uppercase text-white/90">Computing clusters…</span>
          </div>
        </div>
      )}
      <div id="gov-dashboard" className="p-8 space-y-8 max-w-7xl mx-auto animate-fade-in">
        <div className="flex items-center justify-between flex-wrap gap-4 border-b border-border pb-6">
          <div>
            <h1 className="text-4xl font-display font-bold text-primary tracking-tighter uppercase">
              {t('government')}
            </h1>
            <p className="text-secondary text-xs tracking-wide uppercase mt-2">
              {'// '}
              {t('govHeadline')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpis.map((kpi, i) => {
            const Icon = kpi.icon
            const content = (
              <>
                <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: kpi.hex }} />
                <div className="flex items-center justify-between mb-3 border-b border-border pb-3">
                  <div className="text-sm font-display font-bold uppercase tracking-wide text-primary flex items-center gap-1">
                    {kpi.label}<MetricTooltip text={kpi.tip} />
                  </div>
                  <Icon size={14} className={`${kpi.color} opacity-80`} />
                </div>
                <div className={`text-3xl font-display font-bold ${kpi.color}`}>{kpi.value}</div>
              </>
            )

            if (kpi.href) {
              return (
                <a
                  key={kpi.label}
                  href={kpi.href}
                  className={`block bg-card border border-border p-5 relative animate-fade-in-up stagger-${i + 1} hover:border-accent transition-colors`}
                >
                  {content}
                </a>
              )
            }

            return (
              <div
                key={kpi.label}
                className={`bg-card border border-border p-5 relative animate-fade-in-up stagger-${i + 1} hover:border-accent transition-colors`}
              >
                {content}
              </div>
            )
          })}
        </div>

        <div className="bg-card border border-border p-5 relative">
          <h3 className="text-sm font-display font-bold text-primary mb-1 uppercase tracking-wide">
            Food Access Coverage Zones
          </h3>
          <p className="text-[11px] tracking-wide uppercase text-secondary mb-5">
            {'// '}Resources clustered by location, rating, and access barriers
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {clusterDist.map((c, i) => (
              <div
                key={i}
                className="p-4 text-center transition-all duration-200 hover:scale-[1.03]"
                style={{ border: `1px solid ${c.color}33`, background: `${c.color}0a` }}
              >
                <div className="text-2xl font-display font-bold" style={{ color: c.color }}>
                  {c.count}
                </div>
                <div className="text-[11px] text-secondary mt-1 font-semibold tracking-wide uppercase">
                  {c.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-card border border-border p-5">
            <h3 className="text-sm font-display font-bold text-primary mb-1 uppercase tracking-wide flex items-center">
              {t('barrierIndex')} by State
              <MetricTooltip text="Composite score (0–1) weighted across: requirement tags (30%), appointment-only access (25%), usage limits (20%), and no upcoming occurrences (25%). Higher = harder to access." />
            </h3>
            <p className="text-[11px] tracking-wide uppercase text-secondary mb-5">
              {'// '}Higher = more barriers (0–1 scale)
            </p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barrierByState}>
                <XAxis dataKey="state" tick={{ fill: '#71717A', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 1]} tick={{ fill: '#71717A', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-accent)', borderRadius: 0, fontFamily: 'JetBrains Mono' }} />
                <Bar dataKey="barrier" radius={[0, 0, 0, 0]}>
                  {barrierByState.map((entry, i) => (
                    <Cell key={i} fill={entry.barrier > 0.6 ? '#ef4444' : entry.barrier > 0.3 ? '#f59e0b' : '#22c55e'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card border border-border p-5">
            <h3 className="text-sm font-display font-bold text-primary mb-1 uppercase tracking-wide">
              States with Most Unverified Resources
            </h3>
            <p className="text-[11px] tracking-wide uppercase text-secondary mb-5">
              {'// '}Low confidence (&lt;0.5) resources by state
            </p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={lowConfidenceByState}>
                <XAxis dataKey="state" tick={{ fill: '#71717A', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#71717A', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-accent)', borderRadius: 0, fontFamily: 'JetBrains Mono' }} />
                <Bar dataKey="count" fill="#8b5cf6" radius={[0, 0, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Food Desert Zones Map */}
        <div className="bg-card border border-border p-5 relative">
          <h3 className="text-sm font-display font-bold text-primary mb-1 uppercase tracking-wide">🗺️ {t('mapTitle')} — Food Desert Zones</h3>
          <div className="flex gap-4 mb-3 flex-wrap">
            {CLUSTER_LABELS_KEY.map((k, i) => (
              <span key={k} className="text-xs flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 inline-block" style={{ background: CLUSTER_COLORS[i] }} />
                <span className="text-secondary uppercase tracking-wide">{t(k)}</span>
              </span>
            ))}
          </div>
          <MapView resources={displayData} clusterMap={clusterMap} height="380px" />
        </div>

        <div className="bg-card border border-border p-5">
          <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
            <div>
              <h3 className="text-sm font-display font-bold text-primary uppercase tracking-wide">
                Pantry Need Heatmap
              </h3>
              <p className="text-[11px] tracking-wide uppercase text-secondary mt-1">
                Click toggles to explore different need indicators
              </p>
            </div>

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setHeatMode('snap_rate')}
                className={`px-3 py-2 border text-xs uppercase tracking-widest ${
                  heatMode === 'snap_rate'
                    ? 'bg-yellow-400 text-black border-yellow-400'
                    : 'bg-transparent text-white border-border'
                }`}
              >
                SNAP Rate
              </button>

              <button
                onClick={() => setHeatMode('poverty_rate')}
                className={`px-3 py-2 border text-xs uppercase tracking-widest ${
                  heatMode === 'poverty_rate'
                    ? 'bg-yellow-400 text-black border-yellow-400'
                    : 'bg-transparent text-white border-border'
                }`}
              >
                Poverty Rate
              </button>

              <button
                onClick={() => setHeatMode('language_barrier_rate')}
                className={`px-3 py-2 border text-xs uppercase tracking-widest ${
                  heatMode === 'language_barrier_rate'
                    ? 'bg-yellow-400 text-black border-yellow-400'
                    : 'bg-transparent text-white border-border'
                }`}
              >
                Language Barrier Rate
              </button>

              <button
                onClick={() => setHeatMode('pantry_count')}
                className={`px-3 py-2 border text-xs uppercase tracking-widest ${
                  heatMode === 'pantry_count'
                    ? 'bg-yellow-400 text-black border-yellow-400'
                    : 'bg-transparent text-white border-border'
                }`}
              >
                Pantry Count
              </button>

              <button
                onClick={() => setHeatMode('nearest_pantry_distance')}
                className={`px-3 py-2 border text-xs uppercase tracking-widest ${
                  heatMode === 'nearest_pantry_distance'
                    ? 'bg-yellow-400 text-black border-yellow-400'
                    : 'bg-transparent text-white border-border'
                }`}
              >
                Distance to Pantry
              </button>

              <button
                onClick={() => setHeatMode('snap_vs_distance')}
                className={`px-3 py-2 border text-xs uppercase tracking-widest ${
                  heatMode === 'snap_vs_distance'
                    ? 'bg-yellow-400 text-black border-yellow-400'
                    : 'bg-transparent text-white border-border'
                }`}
              >
                SNAP Pop + Distance to Pantry
              </button>

              <button
                onClick={() => setHeatMode('snap_population_vs_pantry_count')}
                className={`px-3 py-2 border text-xs uppercase tracking-widest ${
                  heatMode === 'snap_population_vs_pantry_count'
                    ? 'bg-yellow-400 text-black border-yellow-400'
                    : 'bg-transparent text-white border-border'
                }`}
              >
                SNAP Pop + Pantry Count
              </button>
            </div>
          </div>

          <div className="text-[10px] uppercase tracking-widest text-secondary mb-2">
            Pantry Locations
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-2 mb-4 border border-border px-3 py-3 bg-surface/30">
            {BARRIER_LEGEND.map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-[11px] uppercase tracking-wide">
                <LegendPin color={item.color} />
                <span className="text-secondary">{item.label}</span>
              </div>
            ))}
          </div>

          <HeatMapView
            resources={data}
            clusterMap={barrierMap}
            placementRecs={recs}
            height="500px"
            mode={heatMode}
          />
        </div>


        <div className="bg-card border border-border overflow-hidden">
          <div className="p-5 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="text-sm font-display font-bold text-primary uppercase tracking-wide flex items-center gap-2">
                <TrendingUp size={14} className="text-green-400" />
                Optimal New Pantry Locations
              </h3>
              <p className="text-[11px] tracking-wide uppercase text-secondary mt-1">
                {'// '}ML-ranked zip codes · SHAP-weighted need score
              </p>
            </div>
            <div className="flex items-center gap-3">
              {!recsLoading && recs[0]?.model_r2 != null && (
                <span className="text-[10px] tracking-widest uppercase text-tertiary font-bold">
                  Model R² {recs[0].model_r2.toFixed(3)}
                </span>
              )}
              <select
                value={recState}
                onChange={(e) => setRecState(e.target.value)}
                className="text-[11px] bg-surface border border-border text-primary rounded px-2 py-1 uppercase tracking-wide"
              >
                {LEMONTREE_STATES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
          {recsLoading ? (
            <div className="p-6 text-[11px] text-secondary uppercase tracking-widest animate-pulse">Loading...</div>
          ) : recs.length === 0 ? (
            <div className="p-6 text-[11px] text-secondary uppercase tracking-widest">No recommendations available</div>
          ) : (
            <div className="divide-y divide-border">
              {recs.map((rec, i) => (
                <div key={rec.zip} className="p-5 flex flex-col md:flex-row md:items-center gap-3 hover:bg-surface transition-colors">
                  <div className="flex items-center gap-3 min-w-[80px]">
                    <span className="text-[10px] font-bold text-tertiary tracking-widest">#{i + 1}</span>
                    <span className="text-lg font-display font-bold text-green-400">{rec.zip}</span>
                  </div>
                  <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
                    <div>
                      <div className="text-tertiary uppercase tracking-widest mb-0.5">Score</div>
                      <div className="font-bold text-primary">{(rec.placement_score * 100).toFixed(1)}</div>
                    </div>
                    <div>
                      <div className="text-tertiary uppercase tracking-widest mb-0.5">SNAP HH</div>
                      <div className="font-bold text-yellow-400">{rec.snap_households?.toLocaleString() ?? '—'}</div>
                    </div>
                    <div>
                      <div className="text-tertiary uppercase tracking-widest mb-0.5">Coverage Gap</div>
                      <div className="font-bold text-red-400">{rec.coverage_gap != null ? `${(rec.coverage_gap * 100).toFixed(0)}%` : '—'}</div>
                    </div>
                    <div>
                      <div className="text-tertiary uppercase tracking-widest mb-0.5">Nearby Pantries</div>
                      <div className="font-bold text-secondary">{rec.pantry_count_nearby ?? 0}</div>
                    </div>
                  </div>
                  <div className="text-[11px] text-secondary md:max-w-xs tracking-wide">{rec.explanation}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card border border-border p-5">
          <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
            <div>
              <h3 className="text-sm font-display font-bold text-primary uppercase tracking-wide">
                NYC Greater Metro Area Heatmap
              </h3>
              <p className="text-[11px] tracking-wide uppercase text-secondary mt-1">
                A closer look at pantry access where Lemontree partners are most concentrated. Click toggles to explore different need indicators.
              </p>
            </div>

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setNyHeatMode('snap_rate')}
                className={`px-3 py-2 border text-xs uppercase tracking-widest ${
                  nyHeatMode === 'snap_rate'
                    ? 'bg-yellow-400 text-black border-yellow-400'
                    : 'bg-transparent text-white border-border'
                }`}
              >
                SNAP Rate
              </button>

              <button
                onClick={() => setNyHeatMode('poverty_rate')}
                className={`px-3 py-2 border text-xs uppercase tracking-widest ${
                  nyHeatMode === 'poverty_rate'
                    ? 'bg-yellow-400 text-black border-yellow-400'
                    : 'bg-transparent text-white border-border'
                }`}
              >
                Poverty Rate
              </button>

              <button
                onClick={() => setNyHeatMode('language_barrier_rate')}
                className={`px-3 py-2 border text-xs uppercase tracking-widest ${
                  nyHeatMode === 'language_barrier_rate'
                    ? 'bg-yellow-400 text-black border-yellow-400'
                    : 'bg-transparent text-white border-border'
                }`}
              >
                Language Barrier Rate
              </button>

              <button
                onClick={() => setNyHeatMode('pantry_count')}
                className={`px-3 py-2 border text-xs uppercase tracking-widest ${
                  nyHeatMode === 'pantry_count'
                    ? 'bg-yellow-400 text-black border-yellow-400'
                    : 'bg-transparent text-white border-border'
                }`}
              >
                Pantry Count
              </button>

              <button
                onClick={() => setNyHeatMode('nearest_pantry_distance')}
                className={`px-3 py-2 border text-xs uppercase tracking-widest ${
                  nyHeatMode === 'nearest_pantry_distance'
                    ? 'bg-yellow-400 text-black border-yellow-400'
                    : 'bg-transparent text-white border-border'
                }`}
              >
                Distance to Pantry
              </button>

              <button
                onClick={() => setNyHeatMode('snap_vs_distance')}
                className={`px-3 py-2 border text-xs uppercase tracking-widest ${
                  nyHeatMode === 'snap_vs_distance'
                    ? 'bg-yellow-400 text-black border-yellow-400'
                    : 'bg-transparent text-white border-border'
                }`}
              >
                SNAP Pop + Distance to Pantry
              </button>

              <button
                onClick={() => setNyHeatMode('snap_population_vs_pantry_count')}
                className={`px-3 py-2 border text-xs uppercase tracking-widest ${
                  nyHeatMode === 'snap_population_vs_pantry_count'
                    ? 'bg-yellow-400 text-black border-yellow-400'
                    : 'bg-transparent text-white border-border'
                }`}
              >
                SNAP Pop + Pantry Count
              </button>
            </div>
          </div>
          <div className="text-[10px] uppercase tracking-widest text-secondary mb-2">
            Pantry Locations
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-2 mb-4 border border-border px-3 py-3 bg-surface/30">
            {BARRIER_LEGEND.map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-[11px] uppercase tracking-wide">
                <LegendPin color={item.color} />
                <span className="text-secondary">{item.label}</span>
              </div>
            ))}
          </div>

          <HeatMapViewNYNJ
            resources={data}
            clusterMap={barrierMap}
            placementRecs={recs}
            height="500px"
            mode={nyHeatMode}
          />
        </div>

        <div id="nyc-pantry-service-zones" className="bg-card border border-border p-5">
          <div className="mb-4">
            <h3 className="text-sm font-display font-bold text-primary uppercase tracking-wide">
              NYC Pantry Service Zones
            </h3>
            <p className="text-[11px] tracking-wide uppercase text-secondary mt-1">
              Voronoi service areas colored by SNAP households assigned to each pantry
            </p>
          </div>

          <VoronoiCoverageMapNYNJ
            resources={data}
            clusterMap={barrierMap}
            height="620px"
          />
        </div>

        <div className="bg-card border border-border overflow-hidden">
          <div className="p-5 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-display font-bold text-primary uppercase tracking-wide">High-Priority Resources</h3>
            <span className="text-[10px] tracking-widest uppercase text-tertiary font-bold">{t('riskScore')} ≥ 60</span>
          </div>
          <div className="overflow-auto max-h-64">
            <table className="w-full text-xs">
              <thead className="bg-card sticky top-0 z-10 shadow-sm border-b border-border">
                <tr>
                  {[t('name'), t('city'), t('state'), t('riskScore'), t('barrierIndex'), t('confidence'), t('cluster')].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] text-secondary font-bold uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displayData
                  .filter((r) => (r.riskScore ?? 0) >= 60)
                  .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0))
                  .slice(0, 50)
                  .map((r) => (
                    <tr key={r.id} className="hover:bg-surface transition-colors">
                      <td className="px-4 py-3 text-primary truncate max-w-[160px] font-semibold tracking-wide uppercase">{r.name ?? '—'}</td>
                      <td className="px-4 py-3 text-secondary tracking-wide uppercase">{r.city ?? '—'}</td>
                      <td className="px-4 py-3 text-secondary tracking-wide uppercase">{r.state ?? '—'}</td>
                      <td className="px-4 py-3 text-red-400 font-bold">{r.riskScore}</td>
                      <td className="px-4 py-3 text-orange-400">{computeBarrierIndex(r).toFixed(2)}</td>
                      <td className="px-4 py-3 text-secondary">{r.confidence != null ? `${(r.confidence * 100).toFixed(0)}%` : '—'}</td>
                      <td className="px-4 py-3 text-xs font-medium" style={{ color: clusterMap[r.id]?.color ?? '#71717A' }}>
                        {clusterMap[r.id]?.label ?? '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        <TravelBurdenPanel resources={displayData} />
      </div>
    </>
  )
}
