import { useState, useMemo, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { Users, Star, MessageSquare, TrendingUp } from 'lucide-react'
import { useFilteredResources } from '../hooks/useResources'
import { useTranslation } from '../hooks/useTranslation'
import FilterBar from '../components/FilterBar'
import MapView from '../components/MapView'
import { useExport } from '../context/ExportContext'
import MetricTooltip from '../components/MetricTooltip'

const METRIC_TIPS = {
  resources: 'Total number of food resources matching your current filters.',
  subscriptions: 'Total user subscriptions across all resources — indicates community engagement.',
  totalReviews: 'Sum of all user-submitted reviews across every listed resource.',
  avgRating: 'Average user rating (1–5 stars) across resources with at least one review. Resources with no reviews are excluded.',
  top10: 'The 10 resources with the highest subscription counts (excludes zero-subscription resources).',
  subsByType: 'How total subscriptions are distributed across resource categories (e.g. Food Pantry, Soup Kitchen, SNAP).',
  ratingDist: 'Resources grouped into five rating buckets (1–5 stars) to show overall quality distribution across the catalog.',
}

const COLORS = ['#facc15', '#22c55e', '#3b82f6', '#8b5cf6', '#f97316', '#ec4899', '#14b8a6', '#ef4444', '#6366f1', '#84cc16']

const RADIAN = Math.PI / 180
const renderLabel = ({ cx, cy, midAngle, outerRadius, percent }) => {
  if (percent < 0.05) return null
  const radius = outerRadius + 18
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="#9ca3af" fontSize={11} textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

const KPI_CONFIG = [
  { icon: Users, accent: 'kpi-yellow', color: 'text-yellow-400', hex: '#FACC15' },
  { icon: TrendingUp, accent: 'kpi-green', color: 'text-green-400', hex: '#4ADE80' },
  { icon: MessageSquare, accent: 'kpi-blue', color: 'text-blue-400', hex: '#60A5FA' },
  { icon: Star, accent: 'kpi-purple', color: 'text-purple-400', hex: '#C084FC' },
]

export default function DonorDashboard() {
  const [filters, setFilters] = useState({})
  const [mapColorMode, setMapColorMode] = useState('risk')
  const { data, all, isLoading, progress } = useFilteredResources(filters)
  const { t, lang } = useTranslation()
  const { setExportState } = useExport()

  useEffect(() => {
    setExportState({ data, dashboardId: 'donor-dashboard' })
  }, [data, setExportState])

  const totalSubs = useMemo(() =>
    data.reduce((s, r) => s + (r._count?.resourceSubscriptions ?? 0), 0), [data])

  const totalReviews = useMemo(() =>
    data.reduce((s, r) => s + (r._count?.reviews ?? 0), 0), [data])

  const topBySubscriptions = useMemo(() =>
    [...data]
      .filter(r => r._count?.resourceSubscriptions > 0)
      .sort((a, b) => (b._count?.resourceSubscriptions ?? 0) - (a._count?.resourceSubscriptions ?? 0))
      .slice(0, 10)
      .map(r => ({ name: (r.name ?? 'Unknown').slice(0, 25), subs: r._count?.resourceSubscriptions ?? 0 })),
    [data])

  const typeDist = useMemo(() => {
    const m = {}
    data.forEach(r => {
      const k = lang === 'es'
        ? (r.resourceType?.name_es ?? r.resourceType?.name ?? 'Unknown')
        : (r.resourceType?.name ?? 'Unknown')
      m[k] = (m[k] ?? 0) + (r._count?.resourceSubscriptions ?? 0)
    })
    return Object.entries(m).map(([name, value]) => ({ name, value }))
  }, [data, lang])

  const typeColorMap = useMemo(() => {
    const seen = new Map()
    data.forEach(r => {
      const name = r.resourceType?.name
      if (name && !seen.has(name)) seen.set(name, COLORS[seen.size % COLORS.length])
    })
    return Object.fromEntries(seen)
  }, [data])

  const mapLegend = mapColorMode === 'risk'
    ? [{ color: '#22C55E', label: 'Low Risk' }, { color: '#FACC15', label: 'Med Risk' }, { color: '#EF4444', label: 'High Risk' }]
    : Object.entries(typeColorMap).slice(0, 8).map(([label, color]) => ({ color, label }))

  const ratingBuckets = useMemo(() => {
    const bins = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
    data.forEach(r => {
      if (r.ratingAverage) {
        const k = String(Math.round(r.ratingAverage))
        if (bins[k] !== undefined) bins[k]++
      }
    })
    return Object.entries(bins).map(([k, v]) => ({ stars: '★'.repeat(Number(k)), count: v }))
  }, [data])

  const avgRating = data.filter(r => r.ratingAverage).length
    ? (data.reduce((s, r) => s + (r.ratingAverage ?? 0), 0) / data.filter(r => r.ratingAverage).length).toFixed(2)
    : '—'

  const kpis = [
    { label: t('totalResources'), value: data.length.toLocaleString(), tip: METRIC_TIPS.resources, ...KPI_CONFIG[0] },
    { label: t('subscriptions'), value: totalSubs.toLocaleString(), tip: METRIC_TIPS.subscriptions, ...KPI_CONFIG[1] },
    { label: t('totalReviews'), value: totalReviews.toLocaleString(), tip: METRIC_TIPS.totalReviews, ...KPI_CONFIG[2] },
    { label: t('ratingAverage'), value: avgRating, tip: METRIC_TIPS.avgRating, ...KPI_CONFIG[3] },
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
    <div id="donor-dashboard" className="p-8 space-y-8 max-w-7xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-4xl font-display font-bold text-primary tracking-tighter uppercase">
            {t('donor')}
          </h1>
          <p className="text-secondary text-xs tracking-wide uppercase mt-2">{'// '}{t('donorHeadline')}</p>
        </div>
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
                <div className="text-sm font-display font-bold uppercase tracking-wide text-primary flex items-center gap-1 min-w-0"><span className="truncate">{kpi.label}</span><MetricTooltip text={kpi.tip} side="bottom" /></div>
                <Icon size={14} className={`${kpi.color} opacity-80`} />
              </div>
              <div className={`text-3xl font-display font-bold ${kpi.color}`}>{kpi.value}</div>
            </div>
          )
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card border border-border p-5">
          <h3 className="text-sm font-display font-bold text-primary mb-1 uppercase tracking-wide flex items-center">Top 10 by {t('subscriptions')}<MetricTooltip text={METRIC_TIPS.top10} /></h3>
          <p className="text-[11px] tracking-wide uppercase text-secondary mb-5">{'// '}Highest subscribed resources</p>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={topBySubscriptions} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 0 }}>
              <XAxis type="number" tick={{ fill: '#71717A', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#71717A', fontSize: 10 }} width={140} axisLine={false} tickLine={false} interval={0} />
              <Tooltip 
                contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-accent)', borderRadius: 0, fontFamily: 'JetBrains Mono', color: 'var(--color-primary)' }}
                itemStyle={{ color: 'var(--color-primary)' }}
              />
              <Bar dataKey="subs" fill="#facc15" radius={[0, 0, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border border-border p-5">
          <h3 className="text-sm font-display font-bold text-primary mb-1 uppercase tracking-wide flex items-center">{t('subscriptions')} by {t('type')}<MetricTooltip text={METRIC_TIPS.subsByType} /></h3>
          <p className="text-[11px] tracking-wide uppercase text-secondary mb-5">{'// '}Distribution of subscriptions across resource types</p>
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie data={typeDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} stroke="none">
                {typeDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: '#71717A', textTransform: 'uppercase' }} iconType="square" />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-card border border-border p-5">
        <h3 className="text-sm font-display font-bold text-primary mb-4 uppercase tracking-wide">🗺️ {t('mapTitle')}</h3>
        <div className="flex gap-4">
          <div className="flex-1 min-w-0">
            <MapView resources={data} height="360px" colorMode={mapColorMode} typeColorMap={typeColorMap} />
          </div>
          <div className="w-44 shrink-0 flex flex-col gap-4 pt-1">
            <div className="flex flex-col gap-1">
              {[['risk', 'Reliability'], ['type', 'Type']].map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setMapColorMode(mode)}
                  className={`text-[10px] font-bold tracking-widest uppercase px-3 py-2 border transition-colors text-left ${
                    mapColorMode === mode
                      ? 'border-accent text-accent bg-accent/10'
                      : 'border-border text-secondary hover:border-accent hover:text-accent'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              {mapLegend.map(item => (
                <div key={item.label} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.color }} />
                  <span className="text-[10px] font-mono tracking-wide uppercase text-secondary truncate">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Resource Table + Rating Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card border border-border overflow-hidden">
          <div className="p-5 border-b border-border">
            <h3 className="text-sm font-display font-bold text-primary uppercase tracking-wide">Resource Impact Table</h3>
          </div>
          <div className="overflow-auto max-h-72">
            <table className="w-full text-xs">
              <thead className="bg-card sticky top-0 z-10 shadow-sm border-b border-border">
                <tr>
                  {[t('name'), t('city'), t('type'), t('subscriptions'), t('totalReviews'), t('ratingAverage')].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] text-secondary font-bold uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...data].sort((a, b) => (b._count?.resourceSubscriptions ?? 0) - (a._count?.resourceSubscriptions ?? 0)).slice(0, 100).map(r => (
                  <tr key={r.id} className="hover:bg-surface transition-colors">
                    <td className="px-4 py-3 text-primary truncate max-w-[180px] font-semibold tracking-wide uppercase">{r.name ?? '—'}</td>
                    <td className="px-4 py-3 text-secondary tracking-wide uppercase">{r.city ?? '—'}, {r.state ?? ''}</td>
                    <td className="px-4 py-3 text-tertiary tracking-wide text-[10px] uppercase">
                      {lang === 'es' ? (r.resourceType?.name_es ?? r.resourceType?.name) : r.resourceType?.name}
                    </td>
                    <td className="px-4 py-3 text-green-400 font-semibold">{r._count?.resourceSubscriptions ?? 0}</td>
                    <td className="px-4 py-3 text-blue-400">{r._count?.reviews ?? 0}</td>
                    <td className="px-4 py-3 text-accent font-bold">{r.ratingAverage ? `⭐ ${r.ratingAverage.toFixed(1)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-card border border-border p-5">
          <h3 className="text-sm font-display font-bold text-primary mb-1 uppercase tracking-wide flex items-center">Rating Distribution<MetricTooltip text={METRIC_TIPS.ratingDist} /></h3>
          <p className="text-[11px] tracking-wide uppercase text-secondary mb-5">{'// '}Count of resources by rating</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={ratingBuckets}>
              <XAxis dataKey="stars" tick={{ fill: '#71717A', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#71717A', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip 
                contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-accent)', borderRadius: 0, fontFamily: 'JetBrains Mono', color: 'var(--color-primary)' }}
                itemStyle={{ color: 'var(--color-primary)' }}
              />
              <Bar dataKey="count" fill="#facc15" radius={[0, 0, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}