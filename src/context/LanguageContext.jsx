import { createContext, useContext, useState, useEffect } from 'react'

const LanguageContext = createContext({ lang: 'en', setLang: () => {} })

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('lemontree-lang') || 'en' }
    catch { return 'en' }
  })

  useEffect(() => {
    try { localStorage.setItem('lemontree-lang', lang) }
    catch {}
  }, [lang])

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
