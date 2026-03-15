import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { Activity, Star, AlertTriangle, MessageSquare } from 'lucide-react'
import { useFilteredResources } from '../hooks/useResources'
import { useTranslation } from '../hooks/useTranslation'
import FilterBar from '../components/FilterBar'
import MapView from '../components/MapView'
import RiskBadge from '../components/RiskBadge'
import ExportButton from '../components/ExportButton'
import ResourceReviews from '../components/ResourceReviews'
import SentimentPanel from '../components/SentimentPanel'
import GoogleReviewsPanel from '../components/GoogleReviewsPanel'
const COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#22c55e', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16']

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
  { key: 'total', icon: Activity, accent: 'kpi-blue', color: 'text-blue-400', hex: '#60A5FA' },
  { key: 'rating', icon: Star, accent: 'kpi-yellow', color: 'text-yellow-400', hex: '#FACC15' },
  { key: 'reviews', icon: MessageSquare, accent: 'kpi-green', color: 'text-green-400', hex: '#4ADE80' },
  { key: 'risk', icon: AlertTriangle, accent: 'kpi-red', color: 'text-red-400', hex: '#F87171' },
]

export default function FoodBankDashboard() {
  const [filters, setFilters] = useState({})
  const [selectedResource, setSelectedResource] = useState(null)
  const { data, all, isLoading, progress } = useFilteredResources(filters)
  const { t, lang } = useTranslation()

  const flyerCoords = useMemo(() => {
    const r = data.find(x => x.latitude && x.longitude)
    if (!r) return null
    return { lat: r.latitude, lng: r.longitude, locationName: r.city ?? 'Food Resources' }
  }, [data])

  const ratingDist = useMemo(() => {
    const bins = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
    data.forEach(r => {
      if (r.ratingAverage) {
        const k = String(Math.round(r.ratingAverage))
        if (bins[k] !== undefined) bins[k]++
      }
    })
    return Object.entries(bins).map(([k, v]) => ({ stars: `${'★'.repeat(Number(k))}`, count: v }))
  }, [data])

  const riskDist = useMemo(() => {
    const bins = { 'Low Risk': 0, 'Medium Risk': 0, 'High Risk': 0 }
    data.forEach(r => {
      const s = r.riskScore ?? 0
      if (s >= 60) bins['High Risk']++
      else if (s >= 30) bins['Medium Risk']++
      else bins['Low Risk']++
    })
    return Object.entries(bins).map(([name, value]) => ({ name, value }))
  }, [data])

  const typeDist = useMemo(() => {
    const m = {}
    data.forEach(r => {
      const k = lang === 'es'
        ? (r.resourceType?.name_es ?? r.resourceType?.name ?? 'Unknown')
        : (r.resourceType?.name ?? 'Unknown')
      m[k] = (m[k] ?? 0) + 1
    })
    return Object.entries(m).map(([name, value]) => ({ name, value }))
  }, [data, lang])

  const avgRating = data.filter(r => r.ratingAverage).length
    ? (data.reduce((s, r) => s + (r.ratingAverage ?? 0), 0) / data.filter(r => r.ratingAverage).length).toFixed(2)
    : '—'

  const kpis = [
    { label: 'Total Resources', value: data.length, ...KPI_CONFIG[0] },
    { label: t('ratingAverage'), value: avgRating, ...KPI_CONFIG[1] },
    { label: t('totalReviews'), value: data.reduce((s, r) => s + (r._count?.reviews ?? 0), 0).toLocaleString(), ...KPI_CONFIG[2] },
    { label: 'High Risk', value: data.filter(r => (r.riskScore ?? 0) >= 60).length, ...KPI_CONFIG[3] },
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
    <div id="foodbank-dashboard" className="p-8 space-y-8 max-w-7xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-4xl font-display font-bold text-primary tracking-tighter uppercase">
            {t('foodbank')}
          </h1>
          <p className="text-secondary text-xs tracking-wide uppercase mt-2">{'// '}{t('foodbankHeadline')}</p>
        </div>
        <ExportButton data={data} dashboardId="foodbank-dashboard" showFlyer flyerCoords={flyerCoords} />
      </div>

      <FilterBar filters={filters} onChange={setFilters} allData={all} />

      {/* KPI Cards */}
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

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-card border border-border p-5">
          <h3 className="text-sm font-display font-bold text-primary mb-1 uppercase tracking-wide">Rating Distribution</h3>
          <p className="text-[11px] tracking-wide uppercase text-secondary mb-5">{'// '}Count of resources by rating bucket</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={ratingDist}>
              <XAxis dataKey="stars" tick={{ fill: '#71717A', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#71717A', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-accent)', borderRadius: 0, fontFamily: 'JetBrains Mono' }} />
              <Bar dataKey="count" fill="#facc15" radius={[0, 0, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border border-border p-5">
          <h3 className="text-sm font-display font-bold text-primary mb-1 uppercase tracking-wide">{t('risk')} Distribution</h3>
          <p className="text-[11px] tracking-wide uppercase text-secondary mb-5">{'// '}Count of resources by risk level</p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={riskDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={55} label={renderLabel} labelLine={false} stroke="none">
                {riskDist.map((_, i) => <Cell key={i} fill={['#22C55E', '#FACC15', '#EF4444'][i]} />)}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: '#71717A', textTransform: 'uppercase' }} iconType="square" />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border border-border p-5">
          <h3 className="text-sm font-display font-bold text-primary mb-1 uppercase tracking-wide">{t('type')} Breakdown</h3>
          <p className="text-[11px] tracking-wide uppercase text-secondary mb-5">{'// '}Distribution of resource types</p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={typeDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={55} label={renderLabel} labelLine={false} stroke="none">
                {typeDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: '#71717A', textTransform: 'uppercase' }} iconType="square" />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Map */}
      <div className="bg-card border border-border p-5">
        <h3 className="text-sm font-display font-bold text-primary mb-4 uppercase tracking-wide">🗺️ {t('mapTitle')}</h3>
        <MapView resources={data} height="350px" />
      </div>

      {/* Resource Table + Reviews */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card border border-border overflow-hidden flex flex-col max-h-[700px]">
          <div className="p-5 border-b border-border flex items-center justify-between shrink-0">
            <h3 className="text-sm font-display font-bold text-primary uppercase tracking-wide">Resources</h3>
            <span className="text-[10px] tracking-widest uppercase text-tertiary font-bold">
              {'// '}click row to view reviews
            </span>
          </div>
          <div className="overflow-auto flex-1">
            <table className="w-full text-xs">
              <thead className="bg-card sticky top-0 z-10 shadow-sm border-b border-border">
                <tr>
                  {[t('name'), t('city'), t('type'), t('rating'), t('risk')].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] text-secondary font-bold uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.slice(0, 100).map(r => (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedResource(r)}
                    className={`cursor-pointer transition-colors ${
                      selectedResource?.id === r.id ? 'bg-surface border-l-2 border-accent' : 'hover:bg-surface border-l-2 border-transparent'
                    }`}
                  >
                    <td className="px-4 py-3 text-primary truncate max-w-[160px] font-semibold tracking-wide uppercase">{r.name ?? '—'}</td>
                    <td className="px-4 py-3 text-secondary tracking-wide uppercase">{r.city ?? '—'}</td>
                    <td className="px-4 py-3 text-tertiary tracking-wide text-[10px] uppercase">
                      {lang === 'es' ? (r.resourceType?.name_es ?? r.resourceType?.name) : r.resourceType?.name}
                    </td>
                    <td className="px-4 py-3 text-accent font-bold">{r.ratingAverage ? `⭐ ${r.ratingAverage.toFixed(1)}` : '—'}</td>
                    <td className="px-4 py-3"><RiskBadge score={r.riskScore} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Reviews side panel */}
        <div className="bg-card border border-border p-5 overflow-auto max-h-[700px]">
          {selectedResource ? (
            <>
              <div className="mb-4 border-b border-border pb-4">
                <p className="font-display font-bold text-primary tracking-wide uppercase text-sm">{selectedResource.name}</p>
                <p className="text-[11px] tracking-widest uppercase text-tertiary mt-1">{selectedResource.city}, {selectedResource.state}</p>
                {selectedResource.openByAppointment && (
                  <span className="text-[10px] font-bold tracking-widest uppercase bg-status-info/10 text-status-info border border-status-info/30 px-2 py-0.5 mt-3 inline-block">
                    📅 {t('openByAppointment')}
                  </span>
                )}
              </div>
              <ResourceReviews resource={selectedResource} />
              <SentimentPanel resource={selectedResource} />
              <GoogleReviewsPanel resource={selectedResource} />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-tertiary text-xs gap-3">
              <MessageSquare size={24} className="opacity-40" />
              <span className="uppercase tracking-widest font-bold">SELECT A RESOURCE</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}