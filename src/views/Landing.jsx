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
      gradient: 'from-blue-500/20 to-blue-600/5',
      border: 'border-blue-500/30 hover:border-blue-400/60',
      pill: 'bg-blue-500/20 text-blue-400',
      pillText: t('foodbankPill'),
      arrow: 'text-blue-400',
    },
    {
      view: 'donor',
      emoji: '💛',
      title: t('donorTitle'),
      description: t('donorDesc'),
      gradient: 'from-yellow-400/20 to-yellow-500/5',
      border: 'border-yellow-400/30 hover:border-yellow-400/60',
      pill: 'bg-yellow-400/20 text-yellow-500',
      pillText: t('donorPill'),
      arrow: 'text-yellow-400',
    },
    {
      view: 'government',
      emoji: '🏛️',
      title: t('govTitle'),
      description: t('govDesc'),
      gradient: 'from-purple-500/20 to-purple-600/5',
      border: 'border-purple-500/30 hover:border-purple-400/60',
      pill: 'bg-purple-500/20 text-purple-400',
      pillText: t('govPill'),
      arrow: 'text-purple-400',
    },
  ]

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4 py-16 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-yellow-400/[0.03] rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-20 left-20 w-[300px] h-[300px] bg-blue-500/[0.02] rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-20 right-20 w-[300px] h-[300px] bg-purple-500/[0.02] rounded-full blur-3xl pointer-events-none" />

      {/* Language dropdown */}
      <div className="absolute top-6 right-6 animate-fade-in" ref={langRef}>
        <button
          onClick={() => setLangOpen(o => !o)}
          className="glass flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-gray-300 hover:text-white transition-all hover:scale-105"
        >
          <Globe size={14} />
          <span>{currentLang.flag} {currentLang.label}</span>
          <ChevronDown size={12} className={`transition-transform ${langOpen ? 'rotate-180' : ''}`} />
        </button>

        {langOpen && (
          <div className="absolute right-0 mt-2 w-52 glass rounded-xl shadow-2xl shadow-black/40 py-1.5 animate-fade-in z-50 max-h-80 overflow-y-auto">
            {LANGUAGES.map(l => (
              <button
                key={l.code}
                onClick={() => { setLang(l.code); setLangOpen(false) }}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-all ${
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

      <div className="text-center mb-14 animate-fade-in-up">
        <div className="text-7xl mb-5 animate-float">🍋</div>
        <h1 className="text-5xl font-extrabold gradient-text mb-4 tracking-tight">{t('appName')}</h1>
        <p className="text-gray-400 max-w-xl mx-auto text-lg leading-relaxed">
          {t('tagline')}
        </p>
        <p className="text-yellow-400/80 mt-3 font-medium text-sm tracking-wide uppercase">{t('serving')}</p>
      </div>

      <h2 className="text-xl font-semibold text-gray-300 mb-8 animate-fade-in-up stagger-2">{t('whoAreYou')}</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full">
        {PERSONAS.map((p, i) => (
          <button
            key={p.view}
            onClick={() => navigate(`/dashboard?view=${p.view}`)}
            className={`group relative border rounded-2xl p-6 text-left transition-all duration-300 cursor-pointer bg-gradient-to-br ${p.gradient} ${p.border} hover:scale-[1.03] hover:shadow-2xl hover:shadow-black/20 animate-fade-in-up stagger-${i + 2}`}
          >
            <div className={`inline-block text-xs px-2.5 py-1 rounded-full mb-4 font-medium ${p.pill}`}>
              {p.pillText}
            </div>
            <div className="text-4xl mb-3">{p.emoji}</div>
            <h3 className="text-white font-bold text-lg mb-2">{p.title}</h3>
            <p className="text-gray-400 text-sm leading-relaxed mb-4">{p.description}</p>
            <div className={`flex items-center gap-1 text-sm font-medium ${p.arrow} opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-0 group-hover:translate-x-1`}>
              Explore <ArrowRight size={14} />
            </div>
          </button>
        ))}
      </div>

      <p className="text-xs text-gray-600 mt-14 text-center max-w-lg animate-fade-in stagger-4">{t('dataSource')}</p>
    </div>
  )
}
