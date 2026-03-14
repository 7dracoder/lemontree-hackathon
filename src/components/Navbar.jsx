import { useState, useRef, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Globe, ChevronDown, Sun, Moon } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { useTheme } from '../context/ThemeContext'
import { useTranslation } from '../hooks/useTranslation'
import { LANGUAGES } from '../utils/translations'

export default function Navbar() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const current = params.get('view')
  const { lang, setLang } = useLanguage()
  const { theme, toggleTheme } = useTheme()
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
    <nav className="flex items-center justify-between px-6 py-3 sticky top-0 z-50 bg-card border-b border-border transition-colors duration-300">
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 font-display font-bold text-accent text-lg transition-all tracking-wider uppercase"
      >
        <div className="w-5 h-5 bg-accent text-page flex items-center justify-center text-xs font-bold font-mono">L</div>
        {t('appName')}
      </button>

      <div className="flex items-center bg-card border border-border">
        {VIEWS.map((v, i) => (
          <button
            key={v.id}
            onClick={() => setParams({ view: v.id })}
            className={`px-4 py-2 text-xs font-semibold tracking-wide uppercase transition-all duration-200 border-r border-border last:border-r-0 flex items-center gap-2 ${
              current === v.id
                ? 'bg-accent/15 text-accent border-l-2 border-l-accent'
                : 'text-secondary hover:text-primary hover:bg-surface'
            }`}
          >
            <span className="text-tertiary">0{i + 1}</span> {v.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="flex items-center justify-center w-9 h-9 border border-border text-secondary hover:text-accent hover:border-accent transition-all duration-200"
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {/* Language Dropdown */}
        <div className="relative" ref={langRef}>
          <button
            onClick={() => setLangOpen(o => !o)}
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold tracking-wide uppercase text-primary transition-all hover:bg-surface border border-border"
          >
            <Globe size={14} className="text-accent" />
            <span>{currentLang.flag} {currentLang.code}</span>
            <ChevronDown size={14} className={`transition-transform text-secondary ${langOpen ? 'rotate-180' : ''}`} />
          </button>

          {langOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-card border border-border py-1 animate-fade-in z-50 max-h-80 overflow-y-auto shadow-2xl shadow-black/50">
              {LANGUAGES.map(l => (
                <button
                  key={l.code}
                  onClick={() => { setLang(l.code); setLangOpen(false) }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-xs tracking-wide transition-all ${
                    lang === l.code
                      ? 'text-accent bg-accent/10 font-semibold border-l-2 border-accent'
                      : 'text-secondary hover:text-primary hover:bg-surface border-l-2 border-transparent'
                  }`}
                >
                  <span className="text-base">{l.flag}</span>
                  <span className="uppercase">{l.label}</span>
                  {lang === l.code && <span className="ml-auto text-accent text-xs">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
