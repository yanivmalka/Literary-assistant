import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Map, Users, TreePine, Sparkles, Wand2, Download, Globe } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

export default function HomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Hero Section */}
      <section className="text-center py-16 md:py-24">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-primary-soft text-primary rounded-full text-sm mb-6">
          <Wand2 className="h-4 w-4" />
          {t('home.hero.badge')}
        </div>
        <h2 className="font-display text-3xl md:text-5xl font-semibold tracking-tight mb-4 leading-tight">
          {t('home.welcome')}
        </h2>
        <p className="text-muted-foreground text-lg md:text-xl mb-8 max-w-2xl mx-auto">
          {t('home.subtitle')}
        </p>
        <Button size="md" onClick={() => navigate('/projects')} className="h-auto px-6 py-3 text-lg shadow-lg shadow-primary/20">
          {t('home.hero.cta')}
        </Button>
      </section>

      {/* Features Grid */}
      <section className="py-12">
        <h3 className="font-display text-2xl font-semibold tracking-tight text-center mb-10">{t('home.features.title')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="text-center p-6">
            <div className="w-14 h-14 bg-primary-soft rounded-xl flex items-center justify-center mx-auto mb-4">
              <Map className="h-7 w-7 text-primary" />
            </div>
            <h4 className="font-display font-semibold mb-2">{t('home.features.canvas.title')}</h4>
            <p className="text-sm text-muted-foreground">{t('home.features.canvas.description')}</p>
          </div>
          <div className="text-center p-6">
            <div className="w-14 h-14 bg-primary-soft rounded-xl flex items-center justify-center mx-auto mb-4">
              <Wand2 className="h-7 w-7 text-primary" />
            </div>
            <h4 className="font-display font-semibold mb-2">{t('home.features.prompt.title')}</h4>
            <p className="text-sm text-muted-foreground">{t('home.features.prompt.description')}</p>
          </div>
          <div className="text-center p-6">
            <div className="w-14 h-14 bg-primary-soft rounded-xl flex items-center justify-center mx-auto mb-4">
              <Download className="h-7 w-7 text-primary" />
            </div>
            <h4 className="font-display font-semibold mb-2">{t('home.features.export.title')}</h4>
            <p className="text-sm text-muted-foreground">{t('home.features.export.description')}</p>
          </div>
        </div>
      </section>

      {/* Modules Grid */}
      <section className="py-12">
        <h3 className="font-display text-2xl font-semibold tracking-tight text-center mb-2">{t('home.modules.title')}</h3>
        <p className="text-center text-muted-foreground mb-10">{t('home.modules.subtitle')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Maps - Active */}
          <Card
            onClick={() => navigate('/projects')}
            className="p-6 hover:shadow-lg transition-all cursor-pointer hover:-translate-y-1"
          >
            <Map className="h-10 w-10 text-primary mb-4" />
            <h4 className="font-display font-semibold mb-2">{t('home.maps.title')}</h4>
            <p className="text-sm text-muted-foreground">{t('home.maps.description')}</p>
            <Badge variant="accent" className="mt-3">{t('home.modules.available')}</Badge>
          </Card>

          {/* Characters - Placeholder */}
          <Card className="p-6 bg-muted/30 opacity-60 cursor-not-allowed">
            <Users className="h-10 w-10 text-muted-foreground mb-4" />
            <h4 className="font-display font-semibold mb-2">{t('home.characters.title')}</h4>
            <p className="text-sm text-muted-foreground">{t('home.characters.description')}</p>
            <Badge variant="neutral" className="mt-3">{t('common.comingSoon')}</Badge>
          </Card>

          {/* Environment - Placeholder */}
          <Card className="p-6 bg-muted/30 opacity-60 cursor-not-allowed">
            <TreePine className="h-10 w-10 text-muted-foreground mb-4" />
            <h4 className="font-display font-semibold mb-2">{t('home.environment.title')}</h4>
            <p className="text-sm text-muted-foreground">{t('home.environment.description')}</p>
            <Badge variant="neutral" className="mt-3">{t('common.comingSoon')}</Badge>
          </Card>

          {/* Magic - Placeholder */}
          <Card className="p-6 bg-muted/30 opacity-60 cursor-not-allowed">
            <Sparkles className="h-10 w-10 text-muted-foreground mb-4" />
            <h4 className="font-display font-semibold mb-2">{t('home.magic.title')}</h4>
            <p className="text-sm text-muted-foreground">{t('home.magic.description')}</p>
            <Badge variant="neutral" className="mt-3">{t('common.comingSoon')}</Badge>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border mt-12 text-center">
        <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
          <Globe className="h-4 w-4" />
          <span>{t('home.footer.languages')}</span>
        </div>
      </footer>
    </div>
  )
}
