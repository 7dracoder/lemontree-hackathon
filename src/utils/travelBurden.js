// ─── Haversine Distance ────────────────────────────────────────────────────
// Returns distance in miles between two lat/lng points
export function haversine(lat1, lng1, lat2, lng2) {
  const R = 3958.8 // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ─── Nearest-Pantry Finder ─────────────────────────────────────────────────
// For each resource, returns the N closest others (by haversine)
function findNearestNeighbors(resource, allResources, n = 5) {
  return allResources
    .filter(r => r.id !== resource.id && r.latitude && r.longitude)
    .map(r => ({
      ...r,
      distanceMiles: haversine(
        resource.latitude,
        resource.longitude,
        r.latitude,
        r.longitude
      ),
    }))
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, n)
}

// ─── ZIP-level aggregation ────────────────────────────────────────────────

const CLOSE_THRESHOLD_MI = 3
const MIN_RATING_GOOD = 2.0
const MIN_RESOURCES = 1
const MAX_DIST_MI = 50

function qualityScore(r) {
  let score = 0
  if (r.ratingAverage != null) {
    score += (r.ratingAverage / 3) * 50
  } else {
    score += 25
  }
  const reviewCount = r._count?.reviews ?? 0
  score += Math.min(reviewCount, 10) * 2
  if (r.openByAppointment) score -= 20
  const hasUpcoming = (r.occurrences ?? []).some(o => !o.skippedAt)
  if (!hasUpcoming && (r.occurrences ?? []).length > 0) score -= 15
  const skips = r.occurrenceSkipRanges?.length ?? 0
  if (skips > 3) score -= 10
  return score
}

function buildIsGood(allResources) {
  const scores = allResources.map(qualityScore).sort((a, b) => a - b)
  const median = scores[Math.floor(scores.length / 2)] ?? 25
  return (r) =>
    qualityScore(r) >= median &&
    (r.ratingAverage == null || r.ratingAverage >= MIN_RATING_GOOD) &&
    !r.openByAppointment
}

export function computeTravelBurden(resources) {
  const valid = resources.filter(r => r.latitude && r.longitude && r.zipCode)
  if (valid.length === 0) return []

  const isGood = buildIsGood(valid)

  const byZip = {}
  valid.forEach(r => {
    if (!byZip[r.zipCode]) byZip[r.zipCode] = []
    byZip[r.zipCode].push(r)
  })

  const results = []

  Object.entries(byZip).forEach(([zip, zipResources]) => {
    if (zipResources.length < MIN_RESOURCES) return

    const centLat = zipResources.reduce((s, r) => s + r.latitude, 0) / zipResources.length
    const centLng = zipResources.reduce((s, r) => s + r.longitude, 0) / zipResources.length

    const candidatesAny = valid.filter(r => !zipResources.find(zr => zr.id === r.id))
    const nearestAny = candidatesAny
      .map(r => ({ ...r, dist: haversine(centLat, centLng, r.latitude, r.longitude) }))
      .sort((a, b) => a.dist - b.dist)[0]

    const candidatesGood = valid.filter(r => !zipResources.find(zr => zr.id === r.id) && isGood(r))
    const nearestGood = candidatesGood
      .map(r => ({ ...r, dist: haversine(centLat, centLng, r.latitude, r.longitude) }))
      .sort((a, b) => a.dist - b.dist)[0]

    if (!nearestAny) return

    const distToNearest = nearestAny.dist
    if (distToNearest > MAX_DIST_MI) return   // nearest pantry too far — skip ZIP

    const rawDistGood = nearestGood?.dist ?? null
    const goodCapped = rawDistGood == null || rawDistGood > MAX_DIST_MI
    const distToNearestGood = goodCapped ? MAX_DIST_MI : rawDistGood

    const ratedLocals = zipResources.filter(r => r.ratingAverage != null)
    const avgLocalRating = ratedLocals.length > 0
      ? ratedLocals.reduce((s, r) => s + r.ratingAverage, 0) / ratedLocals.length
      : null
    const avgLocalQuality = zipResources.reduce((s, r) => s + qualityScore(r), 0) / zipResources.length

    const burdenScore = parseFloat((distToNearestGood / Math.max(distToNearest, 0.1)).toFixed(2))

    const hasNearbyButLowQuality = distToNearest <= CLOSE_THRESHOLD_MI && avgLocalQuality < 30
    const localClosed = zipResources.filter(r => (r.occurrences ?? []).length > 0 && r.occurrences.every(o => o.skippedAt)).length
    const localAppointment = zipResources.filter(r => r.openByAppointment).length

    results.push({
      zip, centLat, centLng,
      resourceCount: zipResources.length,
      avgLocalRating,
      avgLocalQuality: parseFloat(avgLocalQuality.toFixed(1)),
      distToNearest: parseFloat(distToNearest.toFixed(2)),
      distToNearestGood: parseFloat(distToNearestGood.toFixed(2)),
      distToNearestGoodRaw: rawDistGood != null ? parseFloat(rawDistGood.toFixed(2)) : null,
      goodCapped,
      nearestGoodName: goodCapped ? null : (nearestGood?.name ?? null),
      nearestGoodCity: goodCapped ? null : (nearestGood?.city ?? null),
      burdenScore,
      hasNearbyButLowQuality,
      localClosed,
      localAppointment,
      severity:
        burdenScore >= 3  ? 'high'
        : burdenScore >= 1.5 ? 'medium'
        : 'low',
    })
  })

  return results.sort((a, b) => (b.burdenScore ?? 0) - (a.burdenScore ?? 0))
}

// Convenience: top N high-burden zips
export function getHighBurdenZips(resources, n = 20) {
  return computeTravelBurden(resources)
    .filter(z => z.severity === 'high' || z.severity === 'medium')
    .slice(0, n)
}