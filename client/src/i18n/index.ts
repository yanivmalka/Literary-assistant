import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import he from './he.json'

const storedLanguage = localStorage.getItem('language')
const savedLanguage = storedLanguage === 'he' ? 'he' : 'en'

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    he: { translation: he },
  },
  supportedLngs: ['en', 'he'],
  lng: savedLanguage,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
  missingKeyHandler: (_lngs, _namespace, key) => {
    if (import.meta.env.DEV) {
      console.warn(`[i18n] Missing translation key: ${key}`)
    }
  },
})

export default i18n
