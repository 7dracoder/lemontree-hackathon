import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { fetchResources } from '../api/lemontree'
import { computeRiskScore } from '../utils/mlScoring'

export function useResources() {
  const [progress, setProgress] = useState(0)

  const { data: raw = [], isLoading, error } = useQuery({
    queryKey: ['resources-all'],
    queryFn: async () => {
      let all = []
      let skip = 0
      const take = 1500
      const MAX = 5000

      const firstPage = await fetchResources({ take, skip })
      const firstResources = firstPage.resources ?? []
      const total = Math.min(firstPage.count ?? 0, MAX)
      all = [...all, ...firstResources]
      setProgress(Math.min(100, Math.round((all.length / Math.max(total, 1)) * 100)))
      skip += take

      while (all.length < MAX && all.length < (firstPage.count ?? Infinity)) {
        const data = await fetchResources({ take, skip })
        const resources = data.resources ?? []
        if (resources.length === 0) break
        all = [...all, ...resources]
        setProgress(Math.min(100, Math.round((all.length / Math.max(total, 1)) * 100)))
        skip += take
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
