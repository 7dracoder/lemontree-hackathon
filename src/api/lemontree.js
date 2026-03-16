const BASE = '';
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
// Multi-page fetch with cursor pagination — loads all resources up to limit
export async function fetchAllResources(params = {}, onProgress, limit = 15000) {
  let all = []
  let skip = 0
  const take = 100
  let total = null

  while (true) {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
    })
    qs.set('take', String(take))
    qs.set('skip', String(skip))

    const res = await fetch(`${BASE}/api/resources?${qs}`)
    if (!res.ok) throw new Error(`API ${res.status}`)
    const data = parse(await res.json())
    const resources = data.resources ?? []
    if (total === null) total = data.count ?? 0
    all = [...all, ...resources]
    if (onProgress) onProgress(all.length, total)
    if (resources.length < take) break
    if (all.length >= Math.min(total, limit)) break
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
// Fetch reviews for a resource — Supabase first, then API, then seeded data
let _seededReviews = null
async function getSeededReviews() {
  if (!_seededReviews) {
    const res = await fetch('/seeded_reviews.json')
    _seededReviews = await res.json()
  }
  return _seededReviews
}

function supabaseRowToReview(row) {
  if (!row) return null
  return {
    id: row.id,
    createdAt: row.created_at,
    deletedAt: row.deleted_at ?? null,
    rating: row.rating ?? 0,
    attended: row.attended ?? null,
    didNotAttendReason: row.did_not_attend_reason ?? null,
    waitTimeMinutes: row.wait_time_minutes ?? null,
    text: row.review_text ?? row.text ?? null,
    informationAccurate: row.information_accurate ?? null,
    shareTextWithResource: row.share_text_with_resource ?? false,
    photoUrl: row.photo_url ?? null,
    photoPublic: row.photo_public ?? null,
  }
}

async function fetchReviewsFromSupabase(resourceId) {
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY
    if (!url || !key) return []
    const supabase = createClient(url, key)
    const { data, error } = await supabase
      .from('resource_reviews')
      .select('*')
      .eq('resource_id', String(resourceId))
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    if (error) return []
    return (data ?? []).map(supabaseRowToReview)
  } catch (_) {
    return []
  }
}

export async function fetchResourceReviews(id) {
  const fromSupabase = await fetchReviewsFromSupabase(id)
  try {
    const res = await fetch(`${BASE}/api/resources/${id}/reviews`)
    if (res.ok) {
      const data = parse(await res.json())
      const fromApi = Array.isArray(data) ? data : data.reviews ?? []
      const seen = new Set(fromSupabase.map(r => r.id))
      const extra = fromApi.filter(r => !seen.has(r.id))
      return [...fromSupabase, ...extra]
    }
  } catch (_) {}
  const seeded = await getSeededReviews()
  const fromSeeded = seeded[String(id)] ?? []
  const seen = new Set(fromSupabase.map(r => r.id))
  const extra = fromSeeded.filter(r => !seen.has(r.id))
  return [...fromSupabase, ...extra]
}
// Returns URL to the print-ready PDF flyer
export function getResourcePDFUrl(lat, lng, { locationName, flyerLang = 'en', ref } = {}) {
  const qs = new URLSearchParams({ lat: String(lat), lng: String(lng) })
  if (locationName) qs.set('locationName', locationName)
  if (flyerLang) qs.set('flyerLang', flyerLang)
  if (ref) qs.set('ref', ref)
  return `${BASE}/api/resources.pdf?${qs}`
}