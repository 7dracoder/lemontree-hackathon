import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { fetchResources } from '../api/lemontree'
import { computeRiskScore } from '../utils/mlScoring'

const STABLE_EMPTY_ARRAY = []

export function useResources() {
  const [progress, setProgress] = useState(0)

  const { data: raw = STABLE_EMPTY_ARRAY, isLoading, error } = useQuery({
    queryKey: ['resources-all'],
    queryFn: async () => {
      let all = []
      let nextCursor = null
      const take = 200

      const firstPage = await fetchResources({ take })
      const firstResources = firstPage.resources ?? []
      const total = firstPage.count ?? 0
      all = [...all, ...firstResources]
      nextCursor = firstPage.cursor
      setProgress(Math.min(100, Math.round((all.length / Math.max(total, 1)) * 100)))

      while (nextCursor && all.length < total) {
        const data = await fetchResources({ take, cursor: nextCursor })
        const resources = data.resources ?? []
        if (resources.length === 0) break
        all = [...all, ...resources]
        nextCursor = data.cursor
        setProgress(Math.min(100, Math.round((all.length / Math.max(total, 1)) * 100)))
      }

      // Deduplicate by id in case the API returns overlapping pages
      const seen = new Set()
      return all.filter(r => {
        if (seen.has(r.id)) return false
        seen.add(r.id)
        return true
      })
    },
    staleTime: Infinity,
    retry: 2,
  })

  const enriched = useMemo(
    () => raw.map(r => ({ ...r, riskScore: computeRiskScore(r) })),
    [raw]
  )

  return { data: enriched, isLoading, error, progress }
}

export function useFilteredResources(filters = {}) {
  const { data, isLoading, error, progress } = useResources()

  const filtered = useMemo(() => {
    return data.filter(r => {
      if (filters.zipCode?.trim() && r.zipCode !== filters.zipCode.trim()) return false
      if (filters.text?.trim() && !r.name?.toLowerCase().includes(filters.text.toLowerCase())) return false
      if (filters.resourceType && filters.resourceType !== 'all') {
        const slug = r.resourceType?.name?.toUpperCase().replace(/\s+/g, '_') ?? ''
        if (slug !== filters.resourceType) return false
      }
      if (filters.minRating && (r.ratingAverage ?? 0) < parseFloat(filters.minRating)) return false
      if (filters.openByAppointment === 'appointment' && !r.openByAppointment) return false
      if (filters.openByAppointment === 'walkin' && r.openByAppointment) return false
      return true
    })
  }, [data, filters])

  return { data: filtered, all: data, isLoading, error, progress }
}
