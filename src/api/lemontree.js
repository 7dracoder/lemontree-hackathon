const BASE = ''
// Parse superjson wire format — use raw.json directly (Option B from the API guide)
function parse(raw) {
  return raw.json ?? raw
}
// Single-page fetch — used for location/text searches
export async function fetchResources(params = {}) {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
  })
  const res = await fetch(`${BASE}/api/resources?${qs}`)
  if (!res.ok) throw new Error(`API ${res.status}`)
  return parse(await res.json())
}
// Multi-page fetch with skip/take pagination — loads all resources
export async function fetchAllResources(params = {}, onProgress) {
  let all = []
  let skip = 0
  const take = 100
  let total = null

  while (true) {
    const qs = new URLSearchParams({ take: String(take), skip: String(skip), ...params })
    const res = await fetch(`${BASE}/api/resources?${qs}`)
    if (!res.ok) throw new Error(`API ${res.status}`)
    const data = parse(await res.json())
    const resources = data.resources ?? []
    if (total === null) total = data.count ?? 0
    all = [...all, ...resources]
    if (onProgress) onProgress(all.length, total)
    if (resources.length < take) break
    skip += take
  }

  return all
}
// Fetch a single resource by ID
export async function fetchResourceById(id) {
  const res = await fetch(`${BASE}/api/resources/${id}`)
  if (!res.ok) throw new Error(`API ${res.status}`)
  return parse(await res.json())
}
// Lightweight GeoJSON markers for a bounding box (for map view)
export async function fetchMarkersWithinBounds(swLng, swLat, neLng, neLat) {
  const qs = new URLSearchParams()
  qs.append('corner', `${swLng},${swLat}`)
  qs.append('corner', `${neLng},${neLat}`)
  const res = await fetch(`${BASE}/api/resources/markersWithinBounds?${qs}`)
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json()
}
// Fetch reviews for a resource — tries the live API, falls back to seeded data
let _seededReviews = null
async function getSeededReviews() {
  if (!_seededReviews) {
    const res = await fetch('/seeded_reviews.json')
    _seededReviews = await res.json()
  }
  return _seededReviews
}
export async function fetchResourceReviews(id) {
  try {
    const res = await fetch(`${BASE}/api/resources/${id}/reviews`)
    if (res.ok) {
      const data = parse(await res.json())
      return Array.isArray(data) ? data : data.reviews ?? []
    }
  } catch (_) {}
  // Fall back to seeded data
  const seeded = await getSeededReviews()
  return seeded[String(id)] ?? []
}
// Returns URL to the print-ready PDF flyer
export function getResourcePDFUrl(lat, lng, { locationName, flyerLang = 'en', ref } = {}) {
  const qs = new URLSearchParams({ lat: String(lat), lng: String(lng) })
  if (locationName) qs.set('locationName', locationName)
  if (flyerLang) qs.set('flyerLang', flyerLang)
  if (ref) qs.set('ref', ref)
  return `${BASE}/api/resources.pdf?${qs}`
}