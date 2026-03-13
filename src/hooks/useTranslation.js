import { useLanguage } from '../context/LanguageContext'
import { translations } from '../utils/translations'

export function useTranslation() {
  const { lang } = useLanguage()
  const t = (key) => translations[lang]?.[key] ?? translations.en[key] ?? key
  return { t, lang }
}
