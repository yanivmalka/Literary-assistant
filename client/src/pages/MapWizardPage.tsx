import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { MATERIALS, MAP_TYPES } from '@/lib/types'
import type { MapMaterial, MapType } from '@/lib/types'

export default function MapWizardPage() {
  const { t } = useTranslation()
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [material, setMaterial] = useState<MapMaterial>('parchment')
  const [mapType, setMapType] = useState<MapType>('world')
  const [description, setDescription] = useState('')
  const [mapName, setMapName] = useState('')
  const [creating, setCreating] = useState(false)
  const handleCreate = async () => {
    if (!projectId) return
    setCreating(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('maps')
      .insert({
        project_id: projectId,
        user_id: user.id,
        name: mapName.trim() || 'Untitled Map',
        material,
        map_type: mapType,
        description: description.trim() || null,
        canvas_state: { markers: [], regions: [], viewportX: 0, viewportY: 0, scale: 1 },
      })
      .select()
      .single()

    setCreating(false)

    if (!error && data) {
      navigate(`/projects/${projectId}/maps/${data.id}`)
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Progress indicator */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-2 w-16 rounded-full transition-colors ${
              s <= step ? 'bg-primary' : 'bg-muted'
            }`}
          />
        ))}
      </div>

      {/* Step 1: Material */}
      {step === 1 && (
        <div>
          <h2 className="text-2xl font-bold text-center mb-2">
            {t('maps.wizard.materialTitle')}
          </h2>
          <p className="text-center text-muted-foreground mb-8">
            {t('maps.wizard.materialSubtitle')}
          </p>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {MATERIALS.map(({ value, labelKey, bgColor, textColor, image }) => (
              <button
                key={value}
                onClick={() => setMaterial(value)}
                className={`relative aspect-square border-2 rounded-lg overflow-hidden transition-all ${
                  material === value
                    ? 'ring-2 ring-primary ring-offset-2 scale-105'
                    : 'hover:scale-102'
                }`}
                style={{ borderColor: material === value ? undefined : 'transparent' }}
              >
                <img
                  src={`${import.meta.env.BASE_URL}${image}`}
                  alt={t(labelKey)}
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={(e) => {
                    // Fallback to solid color if image not found
                    (e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
                <div
                  className="absolute inset-0 flex items-end justify-center pb-3"
                  style={{ backgroundColor: `${bgColor}40` }}
                >
                  <span
                    className="font-semibold text-sm px-2 py-1 rounded backdrop-blur-sm"
                    style={{ color: textColor, backgroundColor: `${bgColor}CC` }}
                  >
                    {t(labelKey)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Map Type */}
      {step === 2 && (
        <div>
          <h2 className="text-2xl font-bold text-center mb-2">
            {t('maps.wizard.typeTitle')}
          </h2>
          <p className="text-center text-muted-foreground mb-8">
            {t('maps.wizard.typeSubtitle')}
          </p>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {MAP_TYPES.map(({ value, labelKey }) => (
              <button
                key={value}
                onClick={() => setMapType(value)}
                className={`p-6 border-2 rounded-lg text-center transition-all ${
                  mapType === value
                    ? 'border-primary ring-2 ring-primary ring-offset-2 scale-105'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <span className="font-medium">{t(labelKey)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Description */}
      {step === 3 && (
        <div>
          <h2 className="text-2xl font-bold text-center mb-2">
            {t('maps.wizard.descriptionTitle')}
          </h2>
          <p className="text-center text-muted-foreground mb-8">
            {t('maps.wizard.descriptionSubtitle')}
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Map Name</label>
              <input
                type="text"
                value={mapName}
                onChange={(e) => setMapName(e.target.value)}
                className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="e.g. The Realm of Eldoria"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                rows={6}
                placeholder="Describe the general layout: continents, major geographical features, position of key locations..."
              />
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between mt-8">
        <button
          onClick={() => step > 1 ? setStep(step - 1) : navigate(-1)}
          className="flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-accent transition-colors"
        >
          <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
          {t('common.back')}
        </button>

        {step < 3 ? (
          <button
            onClick={() => setStep(step + 1)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            {t('common.next')}
            <ArrowLeft className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
          </button>
        ) : (
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            {creating ? t('common.loading') : t('common.create')}
          </button>
        )}
      </div>
    </div>
  )
}
