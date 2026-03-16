import { useState, useMemo, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { Activity, Star, AlertTriangle, MessageSquare, FileText, Download } from 'lucide-react'
import { useFilteredResources } from '../hooks/useResources'
import { useTranslation } from '../hooks/useTranslation'
import FilterBar from '../components/FilterBar'
import MapView from '../components/MapView'
import RiskBadge from '../components/RiskBadge'
import { isClosedToday } from '../utils/mlScoring'
import { useExport } from '../context/ExportContext'
import { getResourcePDFUrl } from '../api/lemontree'
import ResourceReviews from '../components/ResourceReviews'
import SentimentPanel from '../components/SentimentPanel'
import GoogleReviewsPanel from '../components/GoogleReviewsPanel'
import MetricTooltip from '../components/MetricTooltip'

const METRIC_TIPS = {
  totalResources: 'Total number of food pantries, banks, and assistance programs currently tracked in the system.',
  ratingAvg: 'Average user rating across all resources (1–5 stars). Only resources with at least one review are included.',
  totalReviews: 'Sum of all user-submitted reviews across every listed resource.',
  highRisk: 'Resources with a risk score ≥ 60, indicating low ratings, few reviews, or data quality issues.',
  ratingDist: 'Histogram of resources grouped by their rounded average rating (1–5 stars).',
  riskDist: 'Pie chart showing how resources split across low (<30), medium (30–59), and high (≥60) risk scores.',
  typeDist: 'Breakdown of resources by their category (e.g. Food Pantry, SNAP, Meals on Wheels).',
}

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
  const [flyerCity, setFlyerCity] = useState('')
  const [mapColorMode, setMapColorMode] = useState('risk')
  const { data, all, isLoading, progress } = useFilteredResources(filters)
  const { t, lang } = useTranslation()
  const { setExportState } = useExport()

  useEffect(() => {
    setExportState({ data, dashboardId: 'foodbank-dashboard' })
  }, [data, setExportState])

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

  const citiesWithCoords = useMemo(() => {
    const seen = new Set()
    const cities = []
    data.forEach(r => {
      if (r.latitude && r.longitude && r.city && !seen.has(r.city)) {
        seen.add(r.city)
        cities.push({ city: r.city, state: r.state ?? '', lat: r.latitude, lng: r.longitude })
      }
    })
    return cities.sort((a, b) => a.city.localeCompare(b.city))
  }, [data])

  const flyerTarget = citiesWithCoords.find(c => c.city === flyerCity) ?? null

  const avgRating = data.filter(r => r.ratingAverage).length
    ? (data.reduce((s, r) => s + (r.ratingAverage ?? 0), 0) / data.filter(r => r.ratingAverage).length).toFixed(2)
    : '—'

  const kpis = [
    { label: t('totalResources'), value: data.length, tip: METRIC_TIPS.totalResources, ...KPI_CONFIG[0] },
    { label: t('ratingAverage'), value: avgRating, tip: METRIC_TIPS.ratingAvg, ...KPI_CONFIG[1] },
    { label: t('totalReviews'), value: data.reduce((s, r) => s + (r._count?.reviews ?? 0), 0).toLocaleString(), tip: METRIC_TIPS.totalReviews, ...KPI_CONFIG[2] },
    { label: t('highRisk'), value: data.filter(r => (r.riskScore ?? 0) >= 60).length, tip: METRIC_TIPS.highRisk, ...KPI_CONFIG[3] },
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
                <div className="text-sm font-display font-bold uppercase tracking-wide text-primary flex items-center gap-1 min-w-0"><span className="truncate">{kpi.label}</span><MetricTooltip text={kpi.tip} /></div>
                <Icon size={14} className={`${kpi.color} opacity-80`} />
              </div>
              <div className={`text-3xl font-display font-bold ${kpi.color}`}>{kpi.value}</div>
            </div>
          )
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-card border border-border p-5">
          <h3 className="text-sm font-display font-bold text-primary mb-1 uppercase tracking-wide flex items-center">Rating Distribution<MetricTooltip text={METRIC_TIPS.ratingDist} /></h3>
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
          <h3 className="text-sm font-display font-bold text-primary mb-1 uppercase tracking-wide flex items-center">{t('risk')} Distribution<MetricTooltip text={METRIC_TIPS.riskDist} /></h3>
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
          <h3 className="text-sm font-display font-bold text-primary mb-1 uppercase tracking-wide flex items-center">{t('type')} Breakdown<MetricTooltip text={METRIC_TIPS.typeDist} /></h3>
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
        <div className="flex gap-4">
          <div className="flex-1 min-w-0">
            <MapView resources={data} height="350px" colorMode={mapColorMode} typeColorMap={typeColorMap} />
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
          {selectedResource ? (() => {
            const r = selectedResource
            const typeName = lang === 'es'
              ? (r.resourceType?.name_es ?? r.resourceType?.name ?? 'Resource')
              : (r.resourceType?.name ?? 'Resource')
            const desc = lang === 'es'
              ? (r.description_es ?? r.description)
              : r.description
            const riskScore = r.riskScore ?? 0
            const riskLevel = riskScore >= 60 ? 'High' : riskScore >= 30 ? 'Medium' : 'Low'
            const riskColor = riskScore >= 60 ? 'text-red-400' : riskScore >= 30 ? 'text-yellow-400' : 'text-green-400'
            const confidence = r.confidence != null ? Math.round(r.confidence * 100) : null
            const reviewCount = r._count?.reviews ?? 0
            const subCount = r._count?.resourceSubscriptions ?? 0

            return (
              <>
                {/* Header */}
                <div className="mb-4 border-b border-border pb-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display font-bold text-primary tracking-wide uppercase text-sm leading-tight">{r.name}</p>
                    <RiskBadge score={riskScore} />
                  </div>
                  <span className="inline-block text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 mt-2 bg-accent/10 text-accent border border-accent/30">
                    {typeName}
                  </span>
                  {isClosedToday(r) && (
                    <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 mt-1.5 inline-block border border-red-500/30">
                      🔒 Closed Today
                    </span>
                  )}
                </div>

                {/* Plain-English Info */}
                <div className="space-y-3 mb-5 border-b border-border pb-5">
                  {/* Location */}
                  <div className="flex items-start gap-2.5">
                    <span className="text-tertiary mt-0.5 shrink-0">📍</span>
                    <div>
                      <p className="text-[10px] tracking-widest uppercase font-bold text-tertiary mb-0.5">Where to find it</p>
                      <p className="text-xs text-primary leading-relaxed">
                        {r.city ?? 'Unknown city'}, {r.state ?? ''}
                        {r.zipCode ? ` ${r.zipCode}` : ''}
                      </p>
                    </div>
                  </div>

                  {/* Description */}
                  {desc && (
                    <div className="flex items-start gap-2.5">
                      <span className="text-tertiary mt-0.5 shrink-0">📝</span>
                      <div>
                        <p className="text-[10px] tracking-widest uppercase font-bold text-tertiary mb-0.5">What they offer</p>
                        <p className="text-xs text-secondary leading-relaxed">{desc}</p>
                      </div>
                    </div>
                  )}

                  {/* Access */}
                  <div className="flex items-start gap-2.5">
                    <span className="text-tertiary mt-0.5 shrink-0">{r.openByAppointment ? '📅' : '🚶'}</span>
                    <div>
                      <p className="text-[10px] tracking-widest uppercase font-bold text-tertiary mb-0.5">How to visit</p>
                      <p className="text-xs text-primary leading-relaxed">
                        {r.openByAppointment
                          ? 'Appointment required — call ahead before visiting.'
                          : 'Walk-ins welcome — no appointment needed.'}
                      </p>
                    </div>
                  </div>

                  {/* Rating summary */}
                  <div className="flex items-start gap-2.5">
                    <span className="text-tertiary mt-0.5 shrink-0">⭐</span>
                    <div>
                      <p className="text-[10px] tracking-widest uppercase font-bold text-tertiary mb-0.5">Community rating</p>
                      <p className="text-xs text-primary leading-relaxed">
                        {r.ratingAverage
                          ? `Rated ${r.ratingAverage.toFixed(1)} out of 5 based on ${reviewCount} review${reviewCount !== 1 ? 's' : ''}.`
                          : 'No ratings yet — be the first to review!'}
                        {subCount > 0 && ` ${subCount} people subscribed.`}
                      </p>
                    </div>
                  </div>

                  {/* Risk assessment */}
                  <div className="flex items-start gap-2.5">
                    <span className="text-tertiary mt-0.5 shrink-0">🛡️</span>
                    <div>
                      <p className="text-[10px] tracking-widest uppercase font-bold text-tertiary mb-0.5">Data quality</p>
                      <p className="text-xs text-primary leading-relaxed">
                        <span className={`font-bold ${riskColor}`}>{riskLevel} risk</span> (score: {riskScore}).{' '}
                        {riskScore >= 60
                          ? 'This resource may have outdated info or quality concerns.'
                          : riskScore >= 30
                            ? 'Some data points need verification.'
                            : 'Data looks reliable and up to date.'}
                      </p>
                      {confidence != null && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-[10px] tracking-widest uppercase font-bold text-tertiary mb-1">
                            <span>Confidence</span>
                            <span className={confidence >= 70 ? 'text-green-400' : confidence >= 40 ? 'text-yellow-400' : 'text-red-400'}>
                              {confidence}%
                            </span>
                          </div>
                          <div className="h-1.5 bg-surface border border-border">
                            <div
                              className={`h-full transition-all ${confidence >= 70 ? 'bg-green-400' : confidence >= 40 ? 'bg-yellow-400' : 'bg-red-400'}`}
                              style={{ width: `${confidence}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <ResourceReviews resource={selectedResource} />
                <SentimentPanel resource={selectedResource} />
                <GoogleReviewsPanel resource={selectedResource} />
              </>
            )
          })() : (
            <div className="flex flex-col items-center justify-center h-full text-tertiary text-xs gap-3">
              <MessageSquare size={24} className="opacity-40" />
              <span className="uppercase tracking-widest font-bold">SELECT A RESOURCE</span>
            </div>
          )}
        </div>
      </div>

      {/* Community Flyer Download */}
      <div className="bg-card border border-border p-5">
        <h3 className="text-sm font-display font-bold text-primary mb-1 uppercase tracking-wide flex items-center gap-2">
          <FileText size={14} className="text-accent" /> Community Flyer
        </h3>
        <p className="text-[11px] tracking-wide uppercase text-secondary mb-5">{'// '}Download a printable resource flyer for a specific city</p>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-[10px] tracking-widest uppercase font-bold text-tertiary block mb-2">Select City</label>
            <select
              value={flyerCity}
              onChange={e => setFlyerCity(e.target.value)}
              className="w-full bg-surface text-primary text-[11px] font-mono p-3 border border-border focus:border-accent outline-none appearance-none rounded-none"
            >
              <option value="">— Choose a city —</option>
              {citiesWithCoords.map(c => (
                <option key={c.city} value={c.city}>{c.city}{c.state ? `, ${c.state}` : ''}</option>
              ))}
            </select>
          </div>
          <a
            href={flyerTarget ? getResourcePDFUrl(flyerTarget.lat, flyerTarget.lng, { locationName: flyerTarget.city, flyerLang: lang }) : undefined}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => !flyerTarget && e.preventDefault()}
            className={`flex items-center gap-2 px-5 py-3 text-[10px] font-bold tracking-widest uppercase border transition-colors whitespace-nowrap ${
              flyerTarget
                ? 'border-accent text-accent bg-accent/10 hover:bg-accent hover:text-page'
                : 'border-border text-tertiary cursor-not-allowed opacity-50'
            }`}
          >
            <Download size={13} /> {t('downloadFlyer')}
          </a>
        </div>
      </div>
    </div>
  )
}