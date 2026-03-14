import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, CartesianGrid,
} from 'recharts'
import { Users, Star, MessageSquare, TrendingUp } from 'lucide-react'
import { useFilteredResources } from '../hooks/useResources'
import { useTranslation } from '../hooks/useTranslation'
import FilterBar from '../components/FilterBar'
import MapView from '../components/MapView'
import ExportButton from '../components/ExportButton'

const COLORS = ['#facc15', '#22c55e', '#3b82f6', '#8b5cf6', '#f97316']

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
  { icon: Users, accent: 'kpi-yellow', color: 'text-yellow-400' },
  { icon: TrendingUp, accent: 'kpi-green', color: 'text-green-400' },
  { icon: MessageSquare, accent: 'kpi-blue', color: 'text-blue-400' },
  { icon: Star, accent: 'kpi-purple', color: 'text-purple-400' },
]

export default function DonorDashboard() {
  const [filters, setFilters] = useState({})
  const { data, all, isLoading, progress } = useFilteredResources(filters)
  const { t, lang } = useTranslation()

  const flyerCoords = useMemo(() => {
    const r = data.find(x => x.latitude && x.longitude)
    if (!r) return null
    return { lat: r.latitude, lng: r.longitude, locationName: r.city ?? 'Food Resources' }
  }, [data])

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

  const ratingBuckets = useMemo(() => {
    const out = [
      { range: '1–2⭐', count: 0 },
      { range: '2–3⭐', count: 0 },
      { range: '3–4⭐', count: 0 },
      { range: '4–5⭐', count: 0 },
    ]
    data.forEach(r => {
      const v = r.ratingAverage ?? 0
      if (v < 2) out[0].count++
      else if (v < 3) out[1].count++
      else if (v < 4) out[2].count++
      else out[3].count++
    })
    return out
  }, [data])

  const avgRating = data.filter(r => r.ratingAverage).length
    ? (data.reduce((s, r) => s + (r.ratingAverage ?? 0), 0) / data.filter(r => r.ratingAverage).length).toFixed(2)
    : '—'

  const kpis = [
    { label: 'Resources', value: data.length.toLocaleString(), ...KPI_CONFIG[0] },
    { label: t('subscriptions'), value: totalSubs.toLocaleString(), ...KPI_CONFIG[1] },
    { label: t('totalReviews'), value: totalReviews.toLocaleString(), ...KPI_CONFIG[2] },
    { label: `Avg ${t('ratingAverage')}`, value: avgRating, ...KPI_CONFIG[3] },
  ]

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 animate-fade-in">
      <div className="w-72 h-4 bg-gray-600 rounded-full overflow-hidden">
        <div className="h-full bg-yellow-400 transition-all duration-300 rounded-full" style={{ width: `${progress}%` }} />
      </div>
      <p className="text-gray-400 text-sm">{t('loading')} {progress}%</p>
    </div>
  )

  return (
    <div id="donor-dashboard" className="p-6 space-y-6 max-w-7xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">💛 {t('donor')}</h1>
          <p className="text-gray-500 text-sm mt-1">{t('donorHeadline')}</p>
        </div>
        <ExportButton data={data} dashboardId="donor-dashboard" showFlyer flyerCoords={flyerCoords} />
      </div>

      <FilterBar filters={filters} onChange={setFilters} allData={all} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon
          return (
            <div key={kpi.label} className={`glass-card rounded-xl p-4 ${kpi.accent} animate-fade-in-up stagger-${i + 1}`}>
              <div className="flex items-center justify-between mb-2">
                <Icon size={16} className={`${kpi.color} opacity-60`} />
              </div>
              <div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
              <div className="text-xs text-gray-500 mt-1 font-medium">{kpi.label}</div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="chart-card">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Top 10 by {t('subscriptions')}</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topBySubscriptions} layout="vertical">
              <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#6b7280', fontSize: 10 }} width={120} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: 'rgba(17,24,39,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }} />
              <Bar dataKey="subs" fill="#facc15" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">{t('subscriptions')} by {t('type')}</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={typeDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} label={renderLabel} labelLine={false}>
                {typeDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 11, color: '#6b7280' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="chart-card">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Rating Distribution (Resources)</h3>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={ratingBuckets}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="range" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: 'rgba(17,24,39,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }} />
            <Bar dataKey="count" fill="#22c55e" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-card">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">🗺️ {t('mapTitle')}</h3>
        <MapView resources={data} height="360px" />
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        <div className="p-4 border-b border-gray-800/50">
          <h3 className="text-sm font-semibold text-gray-300">Resource Impact Table</h3>
        </div>
        <div className="overflow-auto max-h-72">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/40 sticky top-0">
              <tr>
                {[t('name'), t('city'), t('type'), t('subscriptions'), t('totalReviews'), t('ratingAverage')].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs text-gray-500 font-semibold uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...data].sort((a, b) => (b._count?.resourceSubscriptions ?? 0) - (a._count?.resourceSubscriptions ?? 0)).slice(0, 100).map(r => (
                <tr key={r.id} className="table-row border-t border-gray-800/30">
                  <td className="px-3 py-2.5 text-white truncate max-w-[180px] font-medium">{r.name ?? '—'}</td>
                  <td className="px-3 py-2.5 text-gray-400">{r.city ?? '—'}, {r.state ?? ''}</td>
                  <td className="px-3 py-2.5 text-gray-500 text-xs">
                    {lang === 'es' ? (r.resourceType?.name_es ?? r.resourceType?.name) : r.resourceType?.name}
                  </td>
                  <td className="px-3 py-2.5 text-green-400 font-semibold">{r._count?.resourceSubscriptions ?? 0}</td>
                  <td className="px-3 py-2.5 text-blue-400">{r._count?.reviews ?? 0}</td>
                  <td className="px-3 py-2.5 text-yellow-400">{r.ratingAverage ? `⭐ ${r.ratingAverage.toFixed(1)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}