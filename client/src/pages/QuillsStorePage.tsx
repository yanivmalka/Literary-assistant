import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Check, Feather, ShoppingBag, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useQuillStore } from '@/stores/quillStore'

const PACKAGES = [20, 50, 100] as const

export default function QuillsStorePage() {
  const { t } = useTranslation()
  const { wallet, loading, granting, error, loadWallet, grantQuills } = useQuillStore()
  const tokenRemainder = wallet?.token_remainder ?? 0
  const tokensUntilNextQuill = Math.max(0, 5000 - tokenRemainder)

  useEffect(() => {
    if (!wallet) loadWallet()
  }, [loadWallet, wallet])

  return (
    <div className="max-w-5xl mx-auto p-6">
      <Link
        to="/projects"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        {t('quills.backToProjects')}
      </Link>

      <div className="rounded-2xl border bg-card p-6 md:p-8 mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="rounded-xl bg-primary/10 p-3 text-primary">
              <Feather className="h-7 w-7" />
            </div>
            <h2 className="text-3xl font-bold">{t('quills.storeTitle')}</h2>
          </div>
          <p className="text-muted-foreground max-w-xl">{t('quills.storeDescription')}</p>
        </div>
        <div className="rounded-xl bg-primary/10 px-6 py-4 min-w-[170px] text-center">
          <p className="text-sm text-muted-foreground">{t('quills.currentBalance')}</p>
          <p className="text-4xl font-bold text-primary">
            {loading ? '…' : wallet?.quills_balance ?? '—'}
          </p>
          <p className="text-sm font-medium">{t('quills.namePlural')}</p>
          <div className="mt-3 border-t border-primary/20 pt-3 text-xs text-muted-foreground">
            <p>{t('quills.tokensUsedTowardNext', { tokens: tokenRemainder.toLocaleString() })}</p>
            <p>{t('quills.tokensUntilNext', { tokens: tokensUntilNextQuill.toLocaleString() })}</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{t(error)}</span>
          <button
            type="button"
            onClick={() => loadWallet()}
            disabled={loading}
            className="shrink-0 rounded-md border border-red-300 px-3 py-1.5 font-medium hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? '…' : t('quills.retry')}
          </button>
        </div>
      )}

      <div className="mb-5">
        <h3 className="text-xl font-semibold">{t('quills.choosePackage')}</h3>
        <p className="text-sm text-muted-foreground mt-1">{t('quills.demoNotice')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {PACKAGES.map((amount) => (
          <div key={amount} className="border rounded-xl bg-card p-6 flex flex-col shadow-sm">
            <ShoppingBag className="h-8 w-8 text-primary mb-4" />
            <p className="text-3xl font-bold">{amount}</p>
            <p className="text-muted-foreground mb-5">{t('quills.namePlural')}</p>
            <div className="space-y-2 text-sm text-muted-foreground mb-6 flex-1">
              <p className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" />{t('quills.packageIncludes', { tokens: amount * 5000 })}</p>
              <p className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />{t('quills.noPayment')}</p>
            </div>
            <button
              type="button"
              disabled={granting}
              onClick={() => grantQuills(amount)}
              className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {granting ? t('quills.adding') : t('quills.addPackage', { amount })}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
