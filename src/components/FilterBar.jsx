import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from '../hooks/useTranslation'
import { X, SlidersHorizontal } from 'lucide-react'

const RESOURCE_TYPES = [
  { id: 'all', en: 'All Types', es: 'Todos los Tipos' },
  { id: 'FOOD_PANTRY', en: 'Food Pantry', es: 'Despensa de Alimentos' },
  { id: 'SOUP_KITCHEN', en: 'Soup Kitchen', es: 'Comedor' },
]

export default function FilterBar({ filters, onChange, allData = [] }) {
  const { t, lang } = useTranslation()

  // All state is local until user clicks "Apply"
  const [local, setLocal] = useState({
    text: filters.text ?? '',
    zipCode: filters.zipCode ?? '',
    resourceType: filters.resourceType ?? 'all',
    minRating: filters.minRating ?? '',
    openByAppointment: filters.openByAppointment ?? '',
  })

  // Track whether local differs from committed filters
  const isDirty =
    (local.text ?? '') !== (filters.text ?? '') ||
    (local.zipCode ?? '') !== (filters.zipCode ?? '') ||
    (local.resourceType ?? 'all') !== (filters.resourceType ?? 'all') ||
    (local.minRating ?? '') !== (filters.minRating ?? '') ||
    (local.openByAppointment ?? '') !== (filters.openByAppointment ?? '')

  const set = (key, val) => setLocal(prev => ({ ...prev, [key]: val }))

  const applyFilters = () => {
    onChange({ ...local })
  }

  const clearFilters = () => {
    const empty = { text: '', zipCode: '', resourceType: 'all', minRating: '', openByAppointment: '' }
    setLocal(empty)
    onChange({})
  }

  // Sync local state if parent resets filters externally
  useEffect(() => {
    const allEmpty = !filters.text && !filters.zipCode && !filters.resourceType && !filters.minRating && !filters.openByAppointment
    if (allEmpty && (local.text || local.zipCode)) {
      setLocal({ text: '', zipCode: '', resourceType: 'all', minRating: '', openByAppointment: '' })
    }
  }, [filters])

  // Build suggestion lists from loaded data
  const nameSuggestions = useMemo(() => {
    const seen = new Set()
    return allData.map(r => r.name).filter(n => n && !seen.has(n) && seen.add(n)).sort((a,b) => a.localeCompare(b))
  }, [allData])

  const zipSuggestions = useMemo(() => {
    const seen = new Set()
    return allData.map(r => r.zipCode).filter(z => z && !seen.has(z) && seen.add(z)).sort()
  }, [allData])

  const hasActive = Object.entries(filters).some(([k, v]) => v && v !== 'all')

  return (
    <div className="bg-card border border-border flex flex-wrap gap-3 items-center p-4 animate-fade-in shadow-xl shadow-black/50">
      <select
        value={local.text}
        onChange={e => set('text', e.target.value)}
        className="bg-page text-primary text-xs tracking-wide uppercase px-3 py-2 border border-border focus:border-accent outline-none transition-all cursor-pointer max-w-[200px]"
      >
        <option value="" className="bg-page text-primary">{t('searchByName')}</option>
        {nameSuggestions.map(n => (
          <option key={n} value={n} className="bg-page text-primary">{n.length > 30 ? n.substring(0, 30) + '...' : n}</option>
        ))}
      </select>

      <select
        value={local.zipCode}
        onChange={e => set('zipCode', e.target.value)}
        className="bg-page text-primary text-xs tracking-wide uppercase px-3 py-2 border border-border focus:border-accent outline-none transition-all cursor-pointer"
      >
        <option value="" className="bg-page text-primary">{t('searchByZip')}</option>
        {zipSuggestions.map(z => (
          <option key={z} value={z} className="bg-page text-primary">{z}</option>
        ))}
      </select>

      <select
        value={local.resourceType}
        onChange={e => set('resourceType', e.target.value)}
        className="bg-page text-primary text-xs tracking-wide uppercase px-3 py-2 border border-border focus:border-accent outline-none transition-all cursor-pointer"
      >
        {RESOURCE_TYPES.map(rt => (
          <option key={rt.id} value={rt.id} className="bg-page text-primary">
            {lang === 'es' ? rt.es : rt.en}
          </option>
        ))}
      </select>

      <select
        value={local.minRating}
        onChange={e => set('minRating', e.target.value)}
        className="bg-page text-primary text-xs tracking-wide uppercase px-3 py-2 border border-border focus:border-accent outline-none transition-all cursor-pointer"
      >
        <option value="" className="bg-page text-primary">{t('minRating')}</option>
        {[1, 2, 3, 4].map(n => (
          <option key={n} value={n} className="bg-page text-primary">{'★'.repeat(n)}+ ({n}+)</option>
        ))}
      </select>

      <select
        value={local.openByAppointment}
        onChange={e => set('openByAppointment', e.target.value)}
        className="bg-page text-primary text-xs tracking-wide uppercase px-3 py-2 border border-border focus:border-accent outline-none transition-all cursor-pointer"
      >
        <option value="" className="bg-page text-primary">{t('allClients')}</option>
        <option value="walkin" className="bg-page text-primary">{t('walkin')}</option>
        <option value="appointment" className="bg-page text-primary">{t('appointment')}</option>
      </select>

      {/* Apply Filters button */}
      <button
        onClick={applyFilters}
        className={`flex items-center gap-2 px-4 py-2 text-xs font-bold tracking-wide transition-all duration-200 uppercase border ${
          isDirty
            ? 'bg-accent text-page border-accent hover:bg-accent/90'
            : 'bg-page text-secondary border-border cursor-default'
        }`}
      >
        <SlidersHorizontal size={14} />
        Apply Filters
      </button>

      {hasActive && (
        <button
          onClick={clearFilters}
          className="flex items-center gap-2 text-xs font-semibold tracking-wide uppercase text-tertiary hover:text-status-error transition-all px-3 py-2 border border-transparent hover:border-status-error/30 hover:bg-status-error/10 ml-auto"
        >
          <X size={14} /> {t('clearFilters')}
        </button>
      )}
    </div>
  )
}
