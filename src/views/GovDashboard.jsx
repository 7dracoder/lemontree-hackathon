import { useState, useMemo, useEffect, useRef } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { MapPin, Shield, AlertTriangle, Eye, Loader2 } from 'lucide-react'
import { useFilteredResources } from '../hooks/useResources'
import { useTranslation } from '../hooks/useTranslation'
import { computeBarrierIndex } from '../utils/mlScoring'
import FilterBar from '../components/FilterBar'
import MapView from '../components/MapView'
import ExportButton from '../components/ExportButton'
import TravelBurdenPanel from '../components/TravelBurdenPanel'

const CLUSTER_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444']
const CLUSTER_LABELS_KEY = ['wellServed', 'moderateAccess', 'strained', 'foodDesert']

const KPI_CONFIG = [
  { icon: MapPin, accent: 'kpi-blue', color: 'text-blue-400', hex: '#60A5FA' },
  { icon: AlertTriangle, accent: 'kpi-red', color: 'text-red-400', hex: '#F87171' },
  { icon: Shield, accent: 'kpi-orange', color: 'text-orange-400', hex: '#FB923C' },
  { icon: Eye, accent: 'kpi-yellow', color: 'text-yellow-400', hex: '#FACC15' },
]

export default function GovDashboard() {
  const [filters, setFilters] = useState({})
  const { data, all, isLoading, progress } = useFilteredResources(filters)
  const { t, lang } = useTranslation()
  const [clusterMap, setClusterMap] = useState({})
  const [clusterLoading, setClusterLoading] = useState(false)
  const [displayData, setDisplayData] = useState([])
  const workerRef = useRef(null)
  const runIdRef = useRef(0)
  const pendingDataRef = useRef(null)

  // Run K-Means in a Web Worker; only update displayData when worker finishes so spinner shows first (no freeze)
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

  const flyerCoords = useMemo(() => {
    const r = displayData.find(x => x.latitude && x.longitude)
    if (!r) return null
    return { lat: r.latitude, lng: r.longitude, locationName: r.city ?? 'Region' }
  }, [displayData])

  const clusterDist = useMemo(() => {
    const counts = [0, 0, 0, 0]
    Object.values(clusterMap).forEach(v => counts[v.cluster]++)
    return counts.map((count, i) => ({
      label: t(CLUSTER_LABELS_KEY[i]),
      count,
      color: CLUSTER_COLORS[i],
    }))
  }, [clusterMap, lang])

  const barrierByState = useMemo(() => {
    const m = {}
    displayData.forEach(r => {
      if (!r.state) return
      if (!m[r.state]) m[r.state] = { sum: 0, count: 0 }
      m[r.state].sum += computeBarrierIndex(r)
      m[r.state].count++
    })
    return Object.entries(m)
      .map(([state, v]) => ({ state, barrier: parseFloat((v.sum / v.count).toFixed(2)) }))
      .sort((a, b) => b.barrier - a.barrier)
      .slice(0, 12)
  }, [displayData])

  const capacityData = useMemo(() => {
    const atCapacity = displayData.filter(r => !r.occurrences?.some(o => !o.skippedAt)).length
    const total = displayData.length || 1
    return [
      { name: 'At Capacity', value: atCapacity, pct: ((atCapacity / total) * 100).toFixed(1) },
      { name: 'Available', value: total - atCapacity, pct: (((total - atCapacity) / total) * 100).toFixed(1) },
    ]
  }, [displayData])

  const lowConfidenceByState = useMemo(() => {
    const m = {}
    displayData.forEach(r => {
      if (!r.state || (r.confidence ?? 1) >= 0.5) return
      m[r.state] = (m[r.state] ?? 0) + 1
    })
    return Object.entries(m)
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  }, [displayData])

  const kpis = [
    { label: 'Total Resources', value: displayData.length.toLocaleString(), ...KPI_CONFIG[0] },
    { label: `${t('foodDesert')} Zones`, value: clusterDist[3]?.count ?? 0, ...KPI_CONFIG[1] },
    { label: 'At Capacity', value: `${capacityData[0]?.pct ?? 0}%`, ...KPI_CONFIG[2] },
    { label: 'Low Confidence', value: displayData.filter(r => (r.confidence ?? 1) < 0.5).length, ...KPI_CONFIG[3] },
  ]

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 animate-fade-in">
      <div className="w-72 h-4 bg-gray-600 rounded-full overflow-hidden">
      <div className="h-full bg-yellow-400 transition-all duration-300 rounded-full" style={{ width: `${progress}%` }} />
      </div>
      <p className="text-secondary tracking-widest uppercase font-bold text-[10px] animate-pulse">SYS_LOADING {progress}%</p>
    </div>
  )

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
          <p className="text-secondary text-xs tracking-wide uppercase mt-2">{'// '}{t('govHeadline')}</p>
        </div>
        <ExportButton data={displayData} dashboardId="gov-dashboard" showFlyer flyerCoords={flyerCoords} />
      </div>

      <FilterBar filters={filters} onChange={setFilters} allData={all} />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon
          return (
            <div key={kpi.label} className={`bg-card border border-border p-5 relative animate-fade-in-up stagger-${i + 1} hover:border-accent transition-colors`}>
              <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: kpi.hex }} />
              <div className="flex items-center justify-between mb-3 border-b border-border pb-3">
                <div className="text-[10px] font-bold tracking-widest uppercase text-tertiary">KPI_0{i + 1}</div>
                <Icon size={14} className={`${kpi.color} opacity-80`} />
              </div>
              <div className={`text-3xl font-display font-bold ${kpi.color}`}>{kpi.value}</div>
              <div className="text-[11px] text-secondary mt-2 tracking-wide uppercase font-semibold">{kpi.label}</div>
            </div>
          )
        })}
      </div>

      {/* Cluster Distribution */}
      <div className="bg-card border border-border p-5 relative">
        <h3 className="text-sm font-display font-bold text-primary mb-1 uppercase tracking-wide">Food Desert {t('cluster')} Distribution</h3>
        <p className="text-[11px] tracking-wide uppercase text-secondary mb-5">{'// '}Resources clustered by location, rating, and access barriers</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {clusterDist.map((c, i) => (
            <div
              key={i}
              className="p-4 text-center transition-all duration-200 hover:scale-[1.03]"
              style={{ border: `1px solid ${c.color}33`, background: `${c.color}0a` }}
            >
              <div className="text-2xl font-display font-bold" style={{ color: c.color }}>{c.count}</div>
              <div className="text-[11px] text-secondary mt-1 font-semibold tracking-wide uppercase">{c.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Bar Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card border border-border p-5">
          <h3 className="text-sm font-display font-bold text-primary mb-1 uppercase tracking-wide">{t('barrierIndex')} by State</h3>
          <p className="text-[11px] tracking-wide uppercase text-secondary mb-5">{'// '}Higher = more barriers (0–1 scale)</p>
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
          <h3 className="text-sm font-display font-bold text-primary mb-1 uppercase tracking-wide">States with Most Unverified Resources</h3>
          <p className="text-[11px] tracking-wide uppercase text-secondary mb-5">{'// '}Low confidence (&lt;0.5) resources by state</p>
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

      {/* Map */}
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

      {/* Priority Table */}
      <div className="bg-card border border-border overflow-hidden">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-display font-bold text-primary uppercase tracking-wide">High-Priority Resources</h3>
          <span className="text-[10px] tracking-widest uppercase text-tertiary font-bold">{t('riskScore')} ≥ 60</span>
        </div>
        <div className="overflow-auto max-h-64">
          <table className="w-full text-xs">
            <thead className="bg-card sticky top-0 z-10 shadow-sm border-b border-border">
              <tr>
                {[t('name'), t('city'), t('state'), t('riskScore'), t('barrierIndex'), t('confidence'), t('cluster')].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] text-secondary font-bold uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {displayData
                .filter(r => (r.riskScore ?? 0) >= 60)
                .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0))
                .slice(0, 50)
                .map(r => (
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
      {/* Travel Burden Analysis */}
      <div className="chart-card">
        <TravelBurdenPanel resources={displayData} />
      </div>
      </div>
    </>
  )
}