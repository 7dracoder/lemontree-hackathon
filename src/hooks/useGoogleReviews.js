/**
 * useGoogleReviews.js
 * ────────────────────────────────────────────────────────────────
 * React hook that lazily fetches Google Places reviews for a resource.
 * Call fetchReviews() to trigger — nothing fires automatically,
 * so the caller controls when API quota is spent.
 *
 * Usage:
 *   const { reviews, googleRating, totalRatings, placeName,
 *           matchWarning, status, error, fetchReviews } = useGoogleReviews(resource)
 *
 * status: 'idle' | 'loading' | 'success' | 'error' | 'unavailable'
 *   'unavailable' → no API key configured
 *   'error'       → API key set but call failed (quota, network, no match)
 */

import { useState, useCallback, useEffect } from 'react'
import { fetchGoogleReviews } from '../api/googlePlaces'

const API_KEY = import.meta.env.VITE_GOOGLE_PLACES_API_KEY ?? ''

export function useGoogleReviews(resource) {
  const [status, setStatus] = useState(API_KEY ? 'idle' : 'unavailable')
  const [data, setData]     = useState(null)
  const [error, setError]   = useState(null)

  // Reset back to idle whenever the selected resource changes
  useEffect(() => {
    if (!API_KEY) return
    setStatus('idle')
    setData(null)
    setError(null)
  }, [resource?.id])

  const fetchReviews = useCallback(async () => {
    if (!API_KEY)        { setStatus('unavailable'); return }
    if (!resource?.name) { setStatus('error'); setError('Resource has no name'); return }

    // Debounce double-clicks without putting status in deps
    setStatus(prev => {
      if (prev === 'loading') return prev
      return 'loading'
    })
    setError(null)

    try {
      const result = await fetchGoogleReviews(resource)
      if (!result) {
        setStatus('error')
        setError('No Google Places match found for this pantry.')
      } else {
        setData(result)
        setStatus('success')
      }
    } catch (err) {
      setStatus('error')
      setError(err.message ?? 'Unknown error')
    }
  }, [resource?.id])

  return {
    // Data fields (null until successful fetch)
    reviews:      data?.reviews      ?? [],
    googleRating: data?.googleRating ?? null,
    totalRatings: data?.totalRatings ?? 0,
    placeName:    data?.placeName    ?? null,
    placeId:      data?.placeId      ?? null,
    matchWarning: data?.matchWarning ?? null,
    // State
    status,
    error,
    fetchReviews,
    hasKey: !!API_KEY,
  }
}