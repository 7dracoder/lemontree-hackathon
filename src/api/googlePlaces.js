/**
 * googlePlaces.js
 * ───────────────────────────────────────────────────────────────
 * Wraps the Google Places API (New) to fetch public reviews for a
 * food pantry given its name + city.
 *
 * Flow:
 *   1. Text Search  →  find the most likely Place ID
 *   2. Place Details →  pull reviews[] (up to 5, English-biased)
 *   3. Normalize     →  return a consistent shape for the UI
 *
 * Env var required:
 *   VITE_GOOGLE_PLACES_API_KEY   (set in .env)
 *
 * Free tier: 200 req/day — enough for 100 pantries (2 calls each).
 * Results are cached in sessionStorage to avoid repeat calls.
 */

const API_KEY = import.meta.env.VITE_GOOGLE_PLACES_API_KEY ?? ''

const SESSION_PREFIX = 'gplaces_'          // sessionStorage key prefix
const MAX_REVIEWS    = 5
const SEARCH_RADIUS  = 5000                // metres for Text Search bias

// ── Log helper ────────────────────────────────────────────────────────────
const log  = (...args) => console.log('%c[GooglePlaces]', 'color:#4ade80;font-weight:bold', ...args)
const warn = (...args) => console.warn('%c[GooglePlaces]', 'color:#fb923c;font-weight:bold', ...args)
const err  = (...args) => console.error('%c[GooglePlaces]', 'color:#f87171;font-weight:bold', ...args)

// ── Cache helpers ─────────────────────────────────────────────────────────

function cacheGet(key) {
  try {
    const raw = sessionStorage.getItem(SESSION_PREFIX + key)
    const hit = raw ? JSON.parse(raw) : null
    if (hit !== null) log(`Cache HIT → ${key}`)
    return hit
  } catch { return null }
}

function cacheSet(key, value) {
  try {
    sessionStorage.setItem(SESSION_PREFIX + key, JSON.stringify(value))
    log(`Cache SET → ${key}`, value)
  } catch { warn('sessionStorage quota exceeded — skipping cache write') }
}

// ── Step 1: Text Search ───────────────────────────────────────────────────
// Returns the top Place ID for "pantry name, city" query.

async function findPlaceId(name, city, state, lat, lng) {
  const cacheKey = `id_${name}_${city}`
  const cached = cacheGet(cacheKey)
  if (cached !== null) return cached          // null = known-miss, string = hit

  const query = `${name} food pantry ${city} ${state ?? ''}`
  log(`[1] Text Search query: "${query}"`, { lat, lng })

  // Use Places Text Search (legacy REST — works without billing beyond free tier)
  const params = new URLSearchParams({
    query,
    key: API_KEY,
    fields: 'place_id,name,geometry',
    ...(lat && lng ? { location: `${lat},${lng}`, radius: SEARCH_RADIUS } : {}),
  })

  const url = `/maps/maps/api/place/textsearch/json?${params}`
  log('[1] Fetching URL (key redacted):', url.replace(API_KEY, 'REDACTED'))

  const res = await fetch(url)
  log('[1] HTTP status:', res.status, res.statusText)

  if (!res.ok) {
    err(`[1] Text Search failed — HTTP ${res.status}`)
    throw new Error(`Places Text Search HTTP ${res.status}`)
  }

  const data = await res.json()
  log('[1] Raw Text Search response:', data)

  if (data.status === 'REQUEST_DENIED') {
    err('[1] REQUEST_DENIED — API key is invalid, missing, or the Places API is not enabled in Google Cloud Console')
    throw new Error(`Places Text Search: ${data.status} — ${data.error_message ?? 'check API key and enabled APIs'}`)
  }

  if (data.status === 'OVER_QUERY_LIMIT') {
    err('[1] OVER_QUERY_LIMIT — daily quota exceeded')
    throw new Error('Places Text Search: daily quota exceeded')
  }

  if (data.status === 'ZERO_RESULTS' || !data.results?.length) {
    warn(`[1] No results for query: "${query}"`)
    cacheSet(cacheKey, null)
    return null
  }

  const top = data.results[0]
  log(`[1] Top match: "${top.name}" → placeId: ${top.place_id}`, top.geometry?.location)
  if (data.results.length > 1) {
    log(`[1] Other candidates (ignored):`, data.results.slice(1).map(r => r.name))
  }

  cacheSet(cacheKey, top.place_id)
  return top.place_id
}

// ── Step 2: Place Details ─────────────────────────────────────────────────
// Returns reviews[], rating, user_ratings_total for a known Place ID.

async function fetchPlaceDetails(placeId) {
  const cacheKey = `det_${placeId}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  log(`[2] Fetching Place Details for placeId: ${placeId}`)

  const params = new URLSearchParams({
    place_id: placeId,
    fields:   'name,rating,user_ratings_total,reviews',
    key:      API_KEY,
    language: 'en',        // prefer English reviews
    reviews_sort: 'newest',
  })

  const url = `/maps/maps/api/place/details/json?${params}`
  log('[2] Fetching URL (key redacted):', url.replace(API_KEY, 'REDACTED'))

  const res = await fetch(url)
  log('[2] HTTP status:', res.status, res.statusText)

  if (!res.ok) {
    err(`[2] Place Details failed — HTTP ${res.status}`)
    throw new Error(`Places Details HTTP ${res.status}`)
  }

  const data = await res.json()
  log('[2] Raw Place Details response:', data)

  if (data.status === 'REQUEST_DENIED') {
    err('[2] REQUEST_DENIED — API key is invalid or Places API not enabled')
    throw new Error(`Places Details: ${data.status} — ${data.error_message ?? 'check API key'}`)
  }

  if (data.status !== 'OK') {
    err(`[2] Unexpected status: ${data.status}`)
    throw new Error(`Places Details: ${data.status}`)
  }

  const result = data.result ?? {}
  log(`[2] Place name: "${result.name}" | Rating: ${result.rating} | Total ratings: ${result.user_ratings_total}`)
  log(`[2] Reviews returned: ${result.reviews?.length ?? 0}`)

  if (!result.reviews?.length) {
    warn('[2] No reviews in response — place may have no public reviews or the reviews field was not returned')
  } else {
    result.reviews.forEach((r, i) => {
      log(`[2] Review ${i + 1}: ★${r.rating} | lang:${r.language} | "${r.text?.slice(0, 60)}..."`)
    })
  }

  const details = {
    placeId,
    placeName:     result.name ?? null,
    googleRating:  result.rating ?? null,
    totalRatings:  result.user_ratings_total ?? 0,
    reviews:       (result.reviews ?? []).slice(0, MAX_REVIEWS).map(r => ({
      author:      r.author_name,
      rating:      r.rating,
      text:        r.text ?? '',
      time:        r.time,
      relativeTime: r.relative_time_description ?? '',
      lang:        r.language ?? 'en',
      profileUrl:  r.author_url ?? null,
    })),
  }

  cacheSet(cacheKey, details)
  return details
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Fetch Google Places reviews for a single pantry resource.
 *
 * @param {object} resource  — must have .name, .city; optionally .state, .latitude, .longitude
 * @returns {Promise<PlacesResult|null>}
 *
 * PlacesResult shape:
 * {
 *   placeId, placeName,
 *   googleRating,      // 1–5 float  (Google's aggregate)
 *   totalRatings,      // count of Google ratings
 *   reviews: [{        // up to 5
 *     author, rating, text, time, relativeTime, lang, profileUrl
 *   }],
 *   matchWarning,      // string | null — set if name match looks fuzzy
 * }
 */
export async function fetchGoogleReviews(resource) {
  console.group('%c[GooglePlaces] fetchGoogleReviews()', 'color:#4ade80;font-weight:bold')
  log('Resource:', { id: resource?.id, name: resource?.name, city: resource?.city, state: resource?.state })

  if (!API_KEY) {
    err('VITE_GOOGLE_PLACES_API_KEY is not set — add it to your .env file and restart npm run dev')
    console.groupEnd()
    throw new Error('VITE_GOOGLE_PLACES_API_KEY is not set in .env')
  }
  log('API key present ✓ (first 8 chars):', API_KEY.slice(0, 8) + '...')

  if (!resource?.name || !resource?.city) {
    warn('Resource is missing name or city — cannot search')
    console.groupEnd()
    return null
  }

  let placeId
  try {
    placeId = await findPlaceId(
      resource.name,
      resource.city,
      resource.state ?? '',
      resource.latitude,
      resource.longitude
    )
  } catch (e) {
    err('findPlaceId threw:', e.message)
    console.groupEnd()
    throw e
  }

  if (!placeId) {
    warn('No Place ID found — returning null. The pantry may not be listed on Google Maps.')
    console.groupEnd()
    return null
  }
  log('Place ID resolved:', placeId)

  let details
  try {
    details = await fetchPlaceDetails(placeId)
  } catch (e) {
    err('fetchPlaceDetails threw:', e.message)
    console.groupEnd()
    throw e
  }

  const similarity = nameSimilarity(resource.name, details.placeName ?? '')
  log(`Name similarity: ${(similarity * 100).toFixed(0)}% ("${resource.name}" vs "${details.placeName}")`)

  const matchWarning = similarity < 0.4
    ? `Google matched "${details.placeName}" — may not be the same location.`
    : null
  if (matchWarning) warn('Fuzzy match warning:', matchWarning)

  const result = { ...details, matchWarning }
  log('Final result:', result)
  console.groupEnd()
  return result
}

// ── Name similarity (Jaccard on word sets) ────────────────────────────────
// Good enough to catch obvious mismatches without a heavy library.

function nameSimilarity(a, b) {
  if (!a || !b) return 0
  const words  = s => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean))
  const setA   = words(a)
  const setB   = words(b)
  const inter  = [...setA].filter(w => setB.has(w)).length
  const union  = new Set([...setA, ...setB]).size
  return union === 0 ? 0 : inter / union
}