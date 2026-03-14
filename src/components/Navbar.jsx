import { useState, useRef, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Globe, ChevronDown } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { useTranslation } from '../hooks/useTranslation'
import { LANGUAGES } from '../utils/translations'

export default function Navbar() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const current = params.get('view')
  const { lang, setLang } = useLanguage()
  const { t } = useTranslation()
  const [langOpen, setLangOpen] = useState(false)
  const langRef = useRef(null)

  const currentLang = LANGUAGES.find(l => l.code === lang) ?? LANGUAGES[0]

  useEffect(() => {
    const handleClick = (e) => {
      if (langRef.current && !langRef.current.contains(e.target)) setLangOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const VIEWS = [
    { id: 'foodbank', label: t('foodbank') },
    { id: 'donor', label: t('donor') },
    { id: 'government', label: t('government') },
  ]

  return (
    <nav className="glass flex items-center justify-between px-6 py-2.5 sticky top-0 z-50">
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 font-bold gradient-text text-lg transition-all hover:scale-105"
      >
        🍋 {t('appName')}
      </button>

      <div className="flex items-center gap-1 bg-gray-800/50 rounded-full p-1">
        {VIEWS.map(v => (
          <button
            key={v.id}
            onClick={() => setParams({ view: v.id })}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
              current === v.id
                ? 'bg-yellow-400 text-gray-900 shadow-lg shadow-yellow-400/20'
                : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Language Dropdown */}
      <div className="relative" ref={langRef}>
        <button
          onClick={() => setLangOpen(o => !o)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-gray-300 hover:text-white transition-all hover:bg-gray-700/50 border border-gray-700/50"
        >
          <Globe size={13} />
          <span>{currentLang.flag} {currentLang.code.toUpperCase()}</span>
          <ChevronDown size={12} className={`transition-transform ${langOpen ? 'rotate-180' : ''}`} />
        </button>

        {langOpen && (
          <div className="absolute right-0 mt-2 w-48 glass rounded-xl shadow-2xl shadow-black/40 py-1.5 animate-fade-in z-50 max-h-80 overflow-y-auto">
            {LANGUAGES.map(l => (
              <button
                key={l.code}
                onClick={() => { setLang(l.code); setLangOpen(false) }}
                className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-all ${
                  lang === l.code
                    ? 'text-yellow-400 bg-yellow-400/10 font-medium'
                    : 'text-gray-300 hover:text-white hover:bg-gray-700/30'
                }`}
              >
                <span className="text-base">{l.flag}</span>
                <span>{l.label}</span>
                {lang === l.code && <span className="ml-auto text-yellow-400 text-xs">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </nav>
  )
}
