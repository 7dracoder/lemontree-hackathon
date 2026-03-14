import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Globe, ArrowRight, ChevronDown } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { useTranslation } from '../hooks/useTranslation'
import { LANGUAGES } from '../utils/translations'

export default function Landing() {
  const navigate = useNavigate()
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

  const PERSONAS = [
    {
      view: 'foodbank',
      emoji: '🏦',
      title: t('foodbankTitle'),
      description: t('foodbankDesc'),
      accentColor: '#3B82F6',
      pillText: t('foodbankPill'),
    },
    {
      view: 'donor',
      emoji: '💛',
      title: t('donorTitle'),
      description: t('donorDesc'),
      accentColor: '#FACC15',
      pillText: t('donorPill'),
    },
    {
      view: 'government',
      emoji: '🏛️',
      title: t('govTitle'),
      description: t('govDesc'),
      accentColor: '#8B5CF6',
      pillText: t('govPill'),
    },
  ]

  return (
    <div className="min-h-screen bg-page flex flex-col items-center justify-center px-4 py-16 relative overflow-hidden transition-colors duration-300">
      {/* Language dropdown */}
      <div className="absolute top-6 right-6 animate-fade-in" ref={langRef}>
        <button
          onClick={() => setLangOpen(o => !o)}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold tracking-wide uppercase text-primary border border-border hover:border-accent hover:text-accent transition-all"
        >
          <Globe size={14} />
          <span>{currentLang.flag} {currentLang.label}</span>
          <ChevronDown size={12} className={`transition-transform ${langOpen ? 'rotate-180' : ''}`} />
        </button>

        {langOpen && (
          <div className="absolute right-0 mt-2 w-52 bg-card border border-border py-1 animate-fade-in z-50 max-h-80 overflow-y-auto shadow-2xl shadow-black/50">
            {LANGUAGES.map(l => (
              <button
                key={l.code}
                onClick={() => { setLang(l.code); setLangOpen(false) }}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-xs tracking-wide uppercase transition-all ${
                  lang === l.code
                    ? 'text-accent bg-accent/10 font-semibold border-l-2 border-accent'
                    : 'text-secondary hover:text-primary hover:bg-surface border-l-2 border-transparent'
                }`}
              >
                <span className="text-base">{l.flag}</span>
                <span>{l.label}</span>
                {lang === l.code && <span className="ml-auto text-accent text-xs">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="text-center mb-14 animate-fade-in-up">
        <div className="text-7xl mb-5">🍋</div>
        <h1 className="text-5xl font-display font-bold text-accent mb-4 tracking-tighter uppercase">{t('appName')}</h1>
        <p className="text-secondary max-w-xl mx-auto text-sm leading-relaxed tracking-wide uppercase">
          {t('tagline')}
        </p>
        <p className="text-accent/80 mt-3 font-bold text-[10px] tracking-widest uppercase">{t('serving')}</p>
      </div>

      <h2 className="text-sm font-display font-bold text-primary mb-8 animate-fade-in-up stagger-2 uppercase tracking-widest">{t('whoAreYou')}</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full">
        {PERSONAS.map((p, i) => (
          <button
            key={p.view}
            onClick={() => navigate(`/dashboard?view=${p.view}`)}
            className={`group relative bg-card border border-border p-6 text-left transition-all duration-300 cursor-pointer hover:border-accent animate-fade-in-up stagger-${i + 2}`}
            style={{ borderLeftColor: p.accentColor, borderLeftWidth: '3px' }}
          >
            <div
              className="inline-block text-[10px] px-2.5 py-1 mb-4 font-bold tracking-widest uppercase"
              style={{ backgroundColor: `${p.accentColor}15`, color: p.accentColor, border: `1px solid ${p.accentColor}30` }}
            >
              {p.pillText}
            </div>
            <div className="text-4xl mb-3">{p.emoji}</div>
            <h3 className="text-primary font-display font-bold text-lg mb-2 uppercase tracking-wide">{p.title}</h3>
            <p className="text-secondary text-xs leading-relaxed mb-4 tracking-wide">{p.description}</p>
            <div className="flex items-center gap-1 text-xs font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-0 group-hover:translate-x-1" style={{ color: p.accentColor }}>
              Explore <ArrowRight size={14} />
            </div>
          </button>
        ))}
      </div>

      <p className="text-[10px] text-tertiary mt-14 text-center max-w-lg animate-fade-in stagger-4 tracking-widest uppercase">{t('dataSource')}</p>
    </div>
  )
}
