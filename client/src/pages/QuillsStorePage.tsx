import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Check, Feather, ShoppingBag, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useQuillStore } from '@/stores/quillStore'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

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
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      <Link
        to="/projects"
        className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        {t('quills.backToProjects')}
      </Link>

      <Card className="p-6 md:p-8 mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="rounded-xl bg-primary-soft p-3 text-primary">
              <Feather className="h-7 w-7" />
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">{t('quills.storeTitle')}</h2>
          </div>
          <p className="text-muted-foreground max-w-xl">{t('quills.storeDescription')}</p>
        </div>
        <div className="rounded-xl bg-primary-soft px-6 py-4 min-w-[170px] text-center">
          <p className="text-sm text-muted-foreground">{t('quills.currentBalance')}</p>
          <p className="font-display text-4xl font-bold text-primary">
            {loading ? '…' : wallet?.quills_balance ?? '—'}
          </p>
          <p className="text-sm font-semibold">{t('quills.namePlural')}</p>
          <div className="mt-3 border-t border-primary/20 pt-3 text-xs text-muted-foreground">
            <p>{t('quills.tokensUsedTowardNext', { tokens: tokenRemainder.toLocaleString() })}</p>
            <p>{t('quills.tokensUntilNext', { tokens: tokensUntilNextQuill.toLocaleString() })}</p>
          </div>
        </div>
      </Card>

      {error && (
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{t(error)}</span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => loadWallet()}
            disabled={loading}
            className="shrink-0"
          >
            {loading ? '…' : t('quills.retry')}
          </Button>
        </div>
      )}

      <div className="mb-1">
        <h3 className="font-display text-xl font-semibold tracking-tight">{t('quills.choosePackage')}</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">{t('quills.demoNotice')}</p>
      <div className="lit-rule mb-5" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {PACKAGES.map((amount) => (
          <Card key={amount} className="p-6 flex flex-col">
            <ShoppingBag className="h-8 w-8 text-primary mb-4" />
            <p className="font-display text-3xl font-bold">{amount}</p>
            <p className="text-muted-foreground mb-5">{t('quills.namePlural')}</p>
            <div className="space-y-2 text-sm text-muted-foreground mb-6 flex-1">
              <p className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" />{t('quills.packageIncludes', { tokens: amount * 5000 })}</p>
              <p className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />{t('quills.noPayment')}</p>
            </div>
            <Button
              type="button"
              disabled={granting}
              onClick={() => grantQuills(amount)}
              className="w-full h-auto py-3"
            >
              {granting ? t('quills.adding') : t('quills.addPackage', { amount })}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  )
}
