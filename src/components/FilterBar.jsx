import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from '../hooks/useTranslation'
import { X, SlidersHorizontal, ChevronDown } from 'lucide-react'

const RESOURCE_TYPES = [
  { id: 'all', en: 'All Types', es: 'Todos los Tipos' },
  { id: 'FOOD_PANTRY', en: 'Food Pantry', es: 'Despensa de Alimentos' },
  { id: 'SOUP_KITCHEN', en: 'Soup Kitchen', es: 'Comedor' },
]

function SearchableDropdown({ value, onChange, options, placeholder, className = "" }) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState(value || '')

  useEffect(() => {
    setSearch(value || '')
  }, [value])

  const filtered = useMemo(() => {
    if (!search) return options
    const s = search.toLowerCase()
    return options.filter(o => o.toLowerCase().includes(s))
  }, [options, search])

  return (
    <div className={`relative ${className}`}>
      <div className="relative group">
        <input
          type="text"
          value={search}
          onChange={e => {
            setSearch(e.target.value)
            onChange(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 200)}
          placeholder={placeholder}
          className="w-full bg-page text-primary text-xs tracking-wide uppercase px-3 py-2 pr-8 border border-border focus:border-accent outline-none transition-all cursor-text placeholder:text-tertiary"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-tertiary group-focus-within:text-accent transition-colors">
          <ChevronDown size={14} />
        </div>
      </div>
      {isOpen && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-[1000] mt-1 max-h-60 overflow-auto bg-page border border-accent shadow-2xl">
          {filtered.map(opt => (
            <div
              key={opt}
              onClick={() => {
                setSearch(opt)
                onChange(opt)
                setIsOpen(false)
              }}
              className="px-3 py-2.5 text-xs tracking-wide uppercase text-secondary hover:text-primary hover:bg-accent/10 cursor-pointer border-b border-border/50 last:border-0"
            >
              {opt.length > 40 ? opt.substring(0, 40) + '...' : opt}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

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
    <div className="relative z-[50] bg-card border border-border flex flex-wrap gap-3 items-center p-4 animate-fade-in shadow-xl shadow-black/50">
      <SearchableDropdown
        value={local.text}
        onChange={val => set('text', val)}
        options={nameSuggestions}
        placeholder={t('searchByName')}
        className="min-w-[200px]"
      />

      <SearchableDropdown
        value={local.zipCode}
        onChange={val => set('zipCode', val)}
        options={zipSuggestions}
        placeholder={t('searchByZip')}
        className="w-32"
      />

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
