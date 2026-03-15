export function computeRiskScore(resource) {
  let score = 0
  const conf = resource.confidence ?? 1
  if (conf < 0.4) score += 35
  else if (conf < 0.7) score += 15

  // No confirmed upcoming occurrences = unreliable
  const occ = resource.occurrences ?? []
  const hasUpcoming = occ.some(o => !o.skippedAt)
  if (!hasUpcoming) score += 20

  // Many skip ranges = frequently closed
  const skips = resource.occurrenceSkipRanges?.length ?? 0
  if (skips > 3) score += 10

  // No reviews = unknown quality
  const reviews = resource._count?.reviews ?? 0
  if (reviews === 0) score += 5

  // Appointment-only = access barrier
  if (resource.openByAppointment) score += 10

  return Math.min(score, 100)
}

export function getRiskLabel(score) {
  if (score >= 60) return { label: 'HIGH RISK', color: '#EF4444', border: 'border-status-error', text: 'text-status-error' }
  if (score >= 30) return { label: 'MED RISK', color: '#FACC15', border: 'border-status-warning', text: 'text-status-warning' }
  return { label: 'LOW RISK', color: '#22C55E', border: 'border-status-success', text: 'text-status-success' }
}

export function computeBarrierIndex(resource) {
  const requirementTags = (resource.tags ?? []).filter(t => t.tagCategoryId === 'REQUIREMENT').length
  const appointmentOnly = resource.openByAppointment ? 1 : 0
  const usageLimit = resource.usageLimitCount ? 1 : 0
  const occ = resource.occurrences ?? []
  const noUpcoming = occ.some(o => !o.skippedAt) ? 0 : 1
  const raw = (requirementTags * 0.3) + (appointmentOnly * 0.25) + (usageLimit * 0.2) + (noUpcoming * 0.25)
  return Math.min(parseFloat(raw.toFixed(2)), 1)
}

export function getBarrierStyle(resource) {
  const barrier = computeBarrierIndex(resource)

  if (barrier >= 0.75) {
    return { bucket: 3, color: '#ef4444', label: 'Severely Limited Access', barrier }
  }
  if (barrier >= 0.5) {
    return { bucket: 2, color: '#f59e0b', label: 'Limited Access', barrier }
  }
  if (barrier >= 0.25) {
    return { bucket: 1, color: '#3b82f6', label: 'Moderately Accessible', barrier }
  }
  return { bucket: 0, color: '#22c55e', label: 'Very Accessible', barrier }
}

export function clusterResources(resources, k = 4) {
  const pts = resources
    .filter(r => r.latitude && r.longitude)
    .map(r => ({
      id: r.id,
      lat: r.latitude,
      lng: r.longitude,
      rating: r.ratingAverage ?? 0,
      barrier: computeBarrierIndex(r),
    }))

  if (pts.length < k) return {}

  let centroids = pts.slice(0, k).map(p => ({ ...p }))

  for (let iter = 0; iter < 10; iter++) {
    const clusters = Array.from({ length: k }, () => [])
    pts.forEach(p => {
      let minDist = Infinity, assigned = 0
      centroids.forEach((c, i) => {
        const dist = Math.hypot(p.lat - c.lat, p.lng - c.lng, (p.rating - c.rating) * 0.1, (p.barrier - c.barrier) * 0.1)
        if (dist < minDist) { minDist = dist; assigned = i }
      })
      clusters[assigned].push(p)
    })
    centroids = clusters.map(cl => {
      if (!cl.length) return centroids[0]
      return {
        lat: cl.reduce((s, p) => s + p.lat, 0) / cl.length,
        lng: cl.reduce((s, p) => s + p.lng, 0) / cl.length,
        rating: cl.reduce((s, p) => s + p.rating, 0) / cl.length,
        barrier: cl.reduce((s, p) => s + p.barrier, 0) / cl.length,
      }
    })
  }

  const clusterColors = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444']
  const clusterLabels = ['Very Accesible', 'Moderate Access', 'Strained', 'Food Desert']
  const result = {}
  pts.forEach(p => {
    let minDist = Infinity, assigned = 0
    centroids.forEach((c, i) => {
      const dist = Math.hypot(p.lat - c.lat, p.lng - c.lng)
      if (dist < minDist) { minDist = dist; assigned = i }
    })
    result[p.id] = { cluster: assigned, color: clusterColors[assigned], label: clusterLabels[assigned] }
  })
  return result
}
