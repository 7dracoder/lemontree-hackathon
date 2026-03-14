import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import { useEffect } from 'react'
import { getRiskLabel } from '../utils/mlScoring'
import { useTranslation } from '../hooks/useTranslation'

function FlyToCenter({ center, zoom }) {
  const map = useMap()
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.2 })
  }, [center[0], center[1]])
  return null
}

export default function MapView({ resources, clusterMap = {}, height = '400px' }) {
  const { t, lang } = useTranslation()
  const valid = resources.filter(r => r.latitude && r.longitude)

  const center = valid.length > 0
    ? [
        valid.reduce((sum, r) => sum + r.latitude, 0) / valid.length,
        valid.reduce((sum, r) => sum + r.longitude, 0) / valid.length,
      ]
    : [39.5, -98.35]

  const zoom = valid.length > 0 ? 10 : 4

  return (
    <div style={{ height }} className="border border-border">
      <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <FlyToCenter center={center} zoom={zoom} />
        {valid.map(r => {
          const cluster = clusterMap[r.id]
          const { color } = getRiskLabel(r.riskScore ?? 0)
          const fillColor = cluster?.color ?? color
          const typeName = lang === 'es'
            ? (r.resourceType?.name_es ?? r.resourceType?.name ?? '')
            : (r.resourceType?.name ?? '')
          const desc = lang === 'es'
            ? (r.description_es ?? r.description ?? '')
            : (r.description ?? '')
          return (
            <CircleMarker
              key={r.id}
              center={[r.latitude, r.longitude]}
              radius={6}
              pathOptions={{ fillColor, color: fillColor, fillOpacity: 0.8, weight: 1 }}
            >
              <Tooltip>
                <div className="font-mono text-[10px] tracking-wide uppercase leading-relaxed max-w-[200px] text-primary">
                  <strong className="text-accent">{r.name ?? 'Unknown'}</strong><br />
                  <span className="text-secondary">{typeName} · {r.city}, {r.state}</span><br />
                  {r.ratingAverage ? `⭐ ${r.ratingAverage.toFixed(1)}` : ''}
                  {r._count?.reviews ? ` (${r._count.reviews} ${t('reviews').toLowerCase()})` : ''}<br />
                  {cluster?.label && <span className="text-status-warning">📍 {cluster.label}</span>}
                  {desc ? <span><br />{desc.slice(0, 80)}…</span> : ''}
                  {r.openByAppointment ? <span className="text-status-info"><br />📅 {t('openByAppointment')}</span> : ''}
                </div>
              </Tooltip>
            </CircleMarker>
          )
        })}
      </MapContainer>
    </div>
  )
}