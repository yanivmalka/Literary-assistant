import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  Feather,
  FolderOpen,
  Trash2,
  Map,
  FileText,
  Brain,
  CheckCircle,
  AlertTriangle,
  Check,
} from 'lucide-react'
import { useTheme, type AccentColor, type ExtractionProgressStyle } from '@/components/ThemeProvider'
import ThemeToggle from '@/components/ThemeToggle'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import SwordProgressBar from '@/components/documents/SwordProgressBar'

/**
 * Dev-only reference page for the refined Quillwright visual direction.
 * Uses the real ThemeProvider (dark mode, accent, progress style), the real
 * i18n instance (language/RTL), and the real shared ui/ primitives — so it
 * doubles as the implementation reference once the direction is approved.
 * Not linked from any in-app navigation; not wrapped in ProtectedRoute.
 */

const ACCENT_OPTIONS: AccentColor[] = ['indigo', 'forest', 'ember', 'rose']
const ACCENT_SWATCH_CLASSES: Record<AccentColor, string> = {
  indigo: 'bg-[hsl(245_32%_30%)] dark:bg-[hsl(245_55%_74%)]',
  forest: 'bg-[hsl(155_35%_28%)] dark:bg-[hsl(155_45%_62%)]',
  ember: 'bg-[hsl(28_60%_36%)] dark:bg-[hsl(30_65%_64%)]',
  rose: 'bg-[hsl(350_45%_42%)] dark:bg-[hsl(350_55%_70%)]',
}

const PROGRESS_OPTIONS: ExtractionProgressStyle[] = ['bar', 'sword', 'minimal']

type SampleEntity = {
  initial: string
  name: string
  role: string
  summary: string
  tintHue: number
  mentions: number
  badge: 'confirmed' | 'review' | 'contradiction'
}

const ENTITIES_EN: SampleEntity[] = [
  { initial: 'S', name: 'Senna Vael', role: 'Protagonist', summary: 'Exiled cartographer who can read ley-lines by touch. Carries her father’s unfinished map of the Ashfall coast.', tintHue: 265, mentions: 142, badge: 'confirmed' },
  { initial: 'K', name: 'Kestrel Orn', role: 'Antagonist', summary: 'Commands the Ashfall Legion; motives contested by readers.', tintHue: 25, mentions: 88, badge: 'contradiction' },
  { initial: 'M', name: 'Mira Tolen', role: 'Supporting', summary: "Senna's sister; keeper of the family's cartography guild.", tintHue: 45, mentions: 61, badge: 'confirmed' },
  { initial: 'T', name: 'The Cartographer', role: 'Mythic figure', summary: 'Referenced across three eras; identity still unresolved.', tintHue: 230, mentions: 37, badge: 'review' },
  { initial: 'D', name: 'Dorin Vael', role: 'Deceased', summary: "Senna's father; his final map drives the second act.", tintHue: 265, mentions: 54, badge: 'confirmed' },
  { initial: 'A', name: 'Aeliss Row', role: 'Ally', summary: 'Ex-legion scout who defects in Chapter 14.', tintHue: 45, mentions: 29, badge: 'confirmed' },
]

const ENTITIES_HE: SampleEntity[] = [
  { initial: 'ס', name: 'סנה וֵאל', role: 'גיבורת הסיפור', summary: 'קרטוגרפית מוגלה שיכולה לחוש בקווי לֵיי במגע. נושאת עמה את המפה הבלתי גמורה של אביה לחוף האפר.', tintHue: 265, mentions: 142, badge: 'confirmed' },
  { initial: 'ק', name: 'קסטרל אורן', role: 'האנטגוניסט', summary: 'מפקד לגיון האפר; המניעים שלו שנויים במחלוקת.', tintHue: 25, mentions: 88, badge: 'contradiction' },
  { initial: 'מ', name: 'מירה טולן', role: 'דמות משנה', summary: 'אחותה של סנה; שומרת גילדת הקרטוגרפיה המשפחתית.', tintHue: 45, mentions: 61, badge: 'confirmed' },
  { initial: 'ה', name: 'הקרטוגרף', role: 'דמות אגדית', summary: 'מוזכר בשלוש תקופות שונות; זהותו טרם נפתרה.', tintHue: 230, mentions: 37, badge: 'review' },
  { initial: 'ד', name: 'דורין וֵאל', role: 'נפטר', summary: 'אביה של סנה; המפה האחרונה שלו מניעה את המערכה השנייה.', tintHue: 265, mentions: 54, badge: 'confirmed' },
  { initial: 'א', name: 'אליס רואו', role: 'בת ברית', summary: 'סיירת לשעבר בלגיון שערקה בפרק 14.', tintHue: 45, mentions: 29, badge: 'confirmed' },
]

const QUOTE_EN = 'She had drawn the mountains from memory alone, and no map since had ever agreed with her.'
const QUOTE_HE = 'היא ציירה את ההרים מהזיכרון בלבד, ואף מפה מאז לא הסכימה איתה.'

type SampleDoc = { name: string; status: 'indexed' | 'extracting' | 'queued' | 'failed'; words?: number; entities?: number }

const DOCS_EN: SampleDoc[] = [
  { name: 'Ashfall — Part One.docx', status: 'indexed', words: 48210, entities: 214 },
  { name: 'Ashfall — Part Two.docx', status: 'extracting' },
  { name: 'Ashfall — Outline & Notes.pdf', status: 'queued', words: 12880 },
  { name: 'Ashfall — Appendix.pdf', status: 'failed' },
]

const DOCS_HE: SampleDoc[] = [
  { name: 'אפר — חלק ראשון.docx', status: 'indexed', words: 48210, entities: 214 },
  { name: 'אפר — חלק שני.docx', status: 'extracting' },
  { name: 'אפר — תקציר והערות.pdf', status: 'queued', words: 12880 },
  { name: 'אפר — נספח.pdf', status: 'failed' },
]

function badgeVariant(badge: SampleEntity['badge']): 'success' | 'warning' | 'danger' {
  if (badge === 'confirmed') return 'success'
  if (badge === 'review') return 'warning'
  return 'danger'
}

export default function DesignPreviewPage() {
  const { t, i18n } = useTranslation()
  const { theme, themeSettings, updateThemeSettings } = useTheme()
  const isRtl = i18n.dir() === 'rtl'
  const entities = isRtl ? ENTITIES_HE : ENTITIES_EN
  const docs = isRtl ? DOCS_HE : DOCS_EN
  const quote = isRtl ? QUOTE_HE : QUOTE_EN
  const [featured, ...rest] = entities

  const badgeLabel = {
    confirmed: t('ui.designPreview.badgeConfirmed'),
    review: t('ui.designPreview.badgeReview'),
    contradiction: t('ui.designPreview.badgeContradiction'),
  }

  const statStrip = [
    { count: 24, label: t('ui.designPreview.tabCharacters') },
    { count: 9, label: t('ui.designPreview.tabLocations') },
    { count: 12, label: t('ui.designPreview.tabAbilities') },
    { count: 7, label: t('ui.designPreview.tabObjects') },
    { count: 31, label: t('ui.designPreview.tabEvents') },
  ]

  const docMeta = (doc: SampleDoc) => {
    if (doc.status === 'failed') return t('ui.designPreview.scanFailedDescription')
    if (doc.words == null) return null
    const parts = [`${doc.words.toLocaleString()} ${t('ui.designPreview.wordsLabel')}`]
    if (doc.entities != null) parts.push(`${doc.entities} ${t('ui.designPreview.entitiesExtractedLabel')}`)
    return parts.join(' · ')
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Preview banner — makes clear this is not real production chrome */}
      <div className="bg-primary text-primary-foreground text-xs font-semibold text-center py-1.5 px-4">
        {t('ui.designPreview.badge')}
      </div>

      {/* Mock header — mirrors Header.tsx structure with static sample data,
          not the real component (which depends on auth/wallet state). */}
      <header className="border-b border-border bg-card px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-9">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
              <Map className="h-4 w-4 text-primary-foreground" />
            </span>
            <h1 className="font-display text-lg font-semibold tracking-tight">{t('app.title')}</h1>
          </div>
          <nav className="flex items-center gap-6">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground border-b-2 border-primary pb-[3px]">
              <FolderOpen className="h-4 w-4" />
              {t('ui.designPreview.navProjects')}
            </span>
            <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground border-b-2 border-transparent pb-[3px]">
              <Trash2 className="h-4 w-4" />
              {t('ui.designPreview.navTrash')}
            </span>
            <span className="flex items-center gap-1.5 text-sm font-semibold text-primary border-b-2 border-transparent pb-[3px]">
              <Feather className="h-4 w-4" />
              {t('ui.designPreview.navQuills')}
            </span>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LanguageSwitcher />
          <Link
            to="/"
            className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <ArrowLeft className={`h-4 w-4 ${isRtl ? 'rotate-180' : ''}`} />
            {t('ui.designPreview.backToApp')}
          </Link>
        </div>
      </header>

      <div className="max-w-[1360px] mx-auto px-6 md:px-8 py-8 space-y-12">
        {/* Hero — no card, no border. Just typographic hierarchy. */}
        <div className="max-w-2xl">
          <p className="text-xs font-bold text-primary uppercase tracking-[0.08em] mb-2">
            {t('ui.designPreview.knowledgeHubProject')}
          </p>
          <h2 className="font-display text-[2rem] leading-tight font-semibold tracking-tight mb-3">
            {t('ui.designPreview.title')}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{t('ui.designPreview.subtitle')}</p>
        </div>

        {/* Main two-column composition: knowledge dossier + narrow sidebar */}
        <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
          {/* Knowledge Hub — asymmetric dossier, not a uniform card grid */}
          <section>
            <div className="flex items-end justify-between gap-4 mb-1">
              <h3 className="font-display text-xl font-semibold tracking-tight">{t('ui.designPreview.knowledgeHubTitle')}</h3>
              <Button size="sm">{t('ui.designPreview.askQuestion')}</Button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">{t('ui.designPreview.knowledgeHubCaption')}</p>
            <div className="lit-rule mb-5" />

            {/* Metadata stat strip — plain text, not boxed stat tiles */}
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 mb-6 text-sm">
              {statStrip.map((stat, i) => (
                <span key={stat.label} className="flex items-baseline gap-1.5">
                  <span className="font-display font-semibold text-foreground">{stat.count}</span>
                  <span className={i === 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}>{stat.label}</span>
                </span>
              ))}
            </div>

            {/* Featured entity — larger, pull-quote treatment */}
            <Card className="p-6 mb-4 bg-primary-soft/40 border-primary/15">
              <div className="flex items-start gap-4">
                <div
                  className="h-14 w-14 rounded-xl flex items-center justify-center font-display font-bold text-xl flex-shrink-0"
                  style={{
                    backgroundColor: `hsl(${featured.tintHue} 45% ${theme === 'dark' ? '25%' : '90%'})`,
                    color: `hsl(${featured.tintHue} 45% ${theme === 'dark' ? '78%' : '36%'})`,
                  }}
                >
                  {featured.initial}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-primary">{t('ui.designPreview.featured')}</span>
                    <Badge variant={badgeVariant(featured.badge)}>{badgeLabel[featured.badge]}</Badge>
                  </div>
                  <h4 className="font-display text-lg font-semibold mt-0.5">{featured.name}</h4>
                  <p className="text-xs text-muted-foreground mb-2">{featured.role} · {featured.mentions} {t('ui.designPreview.mentions')}</p>
                  <p className="lit-quote ps-3 text-[13px] italic text-foreground/85 leading-relaxed">{featured.summary}</p>
                </div>
              </div>
            </Card>

            {/* Remaining entities — a divided list, not repeated cards */}
            <div className="divide-y divide-border border-t border-border">
              {rest.map((entity, i) => (
                <div key={entity.name} className="flex items-center gap-4 py-3">
                  <span className="font-display italic text-muted-foreground/60 text-sm w-5 flex-shrink-0 tabular-nums">
                    {String(i + 2).padStart(2, '0')}
                  </span>
                  <div
                    className="h-9 w-9 rounded-lg flex items-center justify-center font-display font-bold text-xs flex-shrink-0"
                    style={{
                      backgroundColor: `hsl(${entity.tintHue} 45% ${theme === 'dark' ? '25%' : '92%'})`,
                      color: `hsl(${entity.tintHue} 45% ${theme === 'dark' ? '75%' : '38%'})`,
                    }}
                  >
                    {entity.initial}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-display font-semibold text-sm">{entity.name}</span>
                      <span className="text-xs text-muted-foreground">{entity.role}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{entity.summary}</p>
                  </div>
                  <Badge variant={badgeVariant(entity.badge)} className="flex-shrink-0">{badgeLabel[entity.badge]}</Badge>
                  <span className="text-xs text-muted-foreground w-16 text-end flex-shrink-0 hidden sm:block">
                    {entity.mentions} {t('ui.designPreview.mentions')}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Sidebar — manuscript excerpt + condensed, real-feeling settings */}
          <aside className="space-y-8">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-primary mb-2">{t('ui.designPreview.quoteLabel')}</p>
              <p className="lit-quote ps-4 font-display italic text-[15px] leading-relaxed text-foreground/90">
                {quote}
              </p>
            </div>

            <div>
              <h3 className="font-display text-base font-semibold mb-0.5">{t('ui.designPreview.appearanceTitle')}</h3>
              <p className="text-xs text-muted-foreground mb-4">{t('ui.designPreview.appearanceTagline')}</p>

              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <span className="block text-sm font-semibold">{t('ui.designPreview.modeLabel')}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">{t('ui.designPreview.modeDesc')}</span>
                  </div>
                  <ThemeToggle />
                </div>

                <div className="border-t border-border pt-4">
                  <span className="block text-sm font-semibold">{t('ui.designPreview.accentLabel')}</span>
                  <span className="block text-xs text-muted-foreground mt-0.5 mb-2.5">{t('ui.designPreview.accentDesc')}</span>
                  <div className="flex items-center gap-2.5">
                    {ACCENT_OPTIONS.map((accent) => (
                      <button
                        key={accent}
                        type="button"
                        onClick={() => updateThemeSettings({ accent })}
                        aria-label={t(`ui.theme.accent.${accent}`)}
                        aria-pressed={themeSettings.accent === accent}
                        className={`h-6 w-6 rounded-full flex items-center justify-center transition-shadow ${ACCENT_SWATCH_CLASSES[accent]} ${
                          themeSettings.accent === accent ? 'ring-2 ring-offset-2 ring-offset-background ring-ring' : ''
                        }`}
                      >
                        {themeSettings.accent === accent && <Check className="h-3 w-3 text-primary-foreground" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-border pt-4">
                  <span className="block text-sm font-semibold">{t('ui.designPreview.progressLabel')}</span>
                  <span className="block text-xs text-muted-foreground mt-0.5 mb-2.5">{t('ui.designPreview.progressDesc')}</span>
                  <div className="flex flex-col gap-1 items-start">
                    {PROGRESS_OPTIONS.map((style) => (
                      <button
                        key={style}
                        type="button"
                        onClick={() => updateThemeSettings({ extractionProgressStyle: style })}
                        className={`px-2.5 py-1 -ms-2.5 rounded-md text-xs font-semibold transition-colors ${
                          themeSettings.extractionProgressStyle === style
                            ? 'text-primary bg-primary-soft'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {t(`ui.extraction.progressStyle${style.charAt(0).toUpperCase()}${style.slice(1)}`)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>

        {/* Documents — editorial log, not a stack of identical cards */}
        <section>
          <div className="flex items-end justify-between gap-4 mb-1">
            <h3 className="font-display text-xl font-semibold tracking-tight">{t('ui.designPreview.documentsTitle')}</h3>
            <Button size="sm">{t('ui.designPreview.uploadManuscript')}</Button>
          </div>
          <p className="text-sm text-muted-foreground mb-4">{t('ui.designPreview.documentsCaption')}</p>
          <div className="lit-rule mb-5" />

          <div className="divide-y divide-border border-t border-b border-border">
            {docs.map((doc) => {
              if (doc.status === 'extracting') {
                return (
                  <div key={doc.name} className="extraction-progress-processing bg-primary-soft/50 -mx-4 px-4 py-4 rounded-md my-1">
                    <div className="flex items-center gap-3 mb-2 z-10 relative">
                      <Brain className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="font-display font-semibold text-sm">{doc.name}</span>
                      <Badge variant="accent">{t('ui.designPreview.statusExtracting')} · 63%</Badge>
                    </div>
                    <div className="z-10 relative">
                      {themeSettings.extractionProgressStyle === 'sword' ? (
                        <>
                          <SwordProgressBar percentage={63} />
                          <p className="text-[11px] text-muted-foreground mt-1.5 italic">{t('ui.designPreview.swordCaption')}</p>
                        </>
                      ) : themeSettings.extractionProgressStyle === 'minimal' ? (
                        <div className="w-full h-0.5 bg-border rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: '63%' }} />
                        </div>
                      ) : (
                        <div className="w-full h-2.5 bg-primary/15 rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: '63%' }} />
                        </div>
                      )}
                    </div>
                  </div>
                )
              }

              const icon =
                doc.status === 'indexed' ? (
                  <CheckCircle className="h-4 w-4 text-success flex-shrink-0" />
                ) : doc.status === 'failed' ? (
                  <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
                ) : (
                  <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )

              return (
                <div key={doc.name} className="flex items-center gap-3 py-3.5">
                  {icon}
                  <div className="min-w-0 flex-1">
                    <span className="font-display font-semibold text-sm">{doc.name}</span>
                    {docMeta(doc) && (
                      <span className="text-xs text-muted-foreground ms-2">{docMeta(doc)}</span>
                    )}
                  </div>
                  <Badge
                    variant={doc.status === 'indexed' ? 'success' : doc.status === 'failed' ? 'danger' : 'neutral'}
                    className="flex-shrink-0"
                  >
                    {t(`ui.designPreview.status${doc.status.charAt(0).toUpperCase()}${doc.status.slice(1)}`)}
                  </Badge>
                  {doc.status === 'failed' ? (
                    <Button size="sm" className="flex-shrink-0">{t('ui.designPreview.retry')}</Button>
                  ) : doc.status === 'indexed' ? (
                    <Button variant="secondary" size="sm" className="flex-shrink-0">{t('ui.designPreview.view')}</Button>
                  ) : (
                    <Button variant="secondary" size="sm" className="flex-shrink-0">{t('ui.designPreview.cancel')}</Button>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* Forms + primitives — kept compact, side by side */}
        <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
          <div>
            <h3 className="font-display text-lg font-semibold tracking-tight mb-4">{t('ui.designPreview.formTitle')}</h3>
            <Card className="p-6">
              <div className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">
                    {t('ui.designPreview.formEmail')}
                  </label>
                  <Input type="email" placeholder="you@example.com" readOnly />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">
                    {t('ui.designPreview.formPassword')}
                  </label>
                  <Input type="password" placeholder="••••••••••" readOnly />
                </div>
                <Button className="w-full">{t('ui.designPreview.formSubmit')}</Button>
                <div className="flex items-center gap-3">
                  <div className="flex-1 border-t border-border" />
                  <span className="text-xs font-semibold text-muted-foreground">{t('ui.designPreview.formOr')}</span>
                  <div className="flex-1 border-t border-border" />
                </div>
                <Button variant="secondary" className="w-full">{t('ui.designPreview.formGoogle')}</Button>
              </div>
            </Card>
          </div>

          <div>
            <h3 className="font-display text-lg font-semibold tracking-tight mb-0.5">{t('ui.designPreview.primitivesTitle')}</h3>
            <p className="text-xs text-muted-foreground mb-4">{t('ui.designPreview.primitivesSubtitle')}</p>
            <Card className="p-6 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm">{t('ui.designPreview.buttonPrimary')}</Button>
                <Button variant="secondary" size="sm">{t('ui.designPreview.buttonSecondary')}</Button>
                <Button variant="ghost" size="sm">{t('ui.designPreview.buttonGhost')}</Button>
                <Button variant="destructive" size="sm">{t('ui.designPreview.buttonDestructive')}</Button>
              </div>
              <Input placeholder={t('ui.designPreview.inputFieldPlaceholder')} readOnly />
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="success">{t('ui.designPreview.badgeConfirmed')}</Badge>
                <Badge variant="warning">{t('ui.designPreview.badgeReview')}</Badge>
                <Badge variant="danger">{t('ui.designPreview.badgeContradiction')}</Badge>
                <Badge variant="info">{t('ui.designPreview.badgeInfo')}</Badge>
              </div>
              <div className="rounded-md border border-border p-4">
                <div className="font-display font-semibold text-sm mb-1">{t('ui.designPreview.sampleCardTitle')}</div>
                <p className="text-xs text-muted-foreground">{t('ui.designPreview.sampleCardBody')}</p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
