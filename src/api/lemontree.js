const BASE = 'https://platform.foodhelpline.org'

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

// Multi-page fetch with cursor pagination — caps at 500 to stay responsive
export async function fetchAllResources(params = {}, onProgress) {
  let cursor
  let all = []
  let total = null
  do {
    const qs = new URLSearchParams({ take: '100', ...params })
    if (cursor) qs.set('cursor', cursor)
    const res = await fetch(`${BASE}/api/resources?${qs}`)
    if (!res.ok) throw new Error(`API ${res.status}`)
    const data = parse(await res.json())
    const resources = data.resources ?? []
    if (total === null) total = data.count ?? 0
    all = [...all, ...resources]
    if (onProgress) onProgress(all.length, total)
    cursor = data.cursor
    if (all.length >= Math.min(total, 500)) break
  } while (cursor)
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
  return res.json() // GeoJSON FeatureCollection
}

// Returns URL to the print-ready PDF flyer (open in new tab or embed in iframe)
// flyerLang: 'en' | 'es'
export function getResourcePDFUrl(lat, lng, { locationName, flyerLang = 'en', ref } = {}) {
  const qs = new URLSearchParams({ lat: String(lat), lng: String(lng) })
  if (locationName) qs.set('locationName', locationName)
  if (flyerLang) qs.set('flyerLang', flyerLang)
  if (ref) qs.set('ref', ref)
  return `${BASE}/api/resources.pdf?${qs}`
}
