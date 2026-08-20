import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, Image, X, Download } from 'lucide-react'
import { useMapStore } from '@/stores/mapStore'
import { supabase } from '@/lib/supabase'


export default function UploadPanel() {
  const { t } = useTranslation()
  const { currentMap, setFinalImageUrl } = useMapStore()
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(currentMap?.final_image_url || null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (selectedFile: File) => {
    if (!selectedFile.type.startsWith('image/')) return
    setFile(selectedFile)
    const reader = new FileReader()
    reader.onload = (e) => setPreview(e.target?.result as string)
    reader.readAsDataURL(selectedFile)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) handleFileSelect(droppedFile)
  }

  const handleUpload = async () => {
    if (!file || !currentMap) return
    setUploading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }

    const filePath = `${user.id}/${currentMap.id}/${Date.now()}_${file.name}`

    const { error: uploadError } = await supabase.storage
      .from('map-images')
      .upload(filePath, file)

    if (uploadError) {
      console.error('Upload error:', uploadError)
      setUploading(false)
      return
    }

    const { data: urlData } = supabase.storage
      .from('map-images')
      .getPublicUrl(filePath)

    const publicUrl = urlData.publicUrl

    // Update map record
    await supabase
      .from('maps')
      .update({ final_image_url: publicUrl })
      .eq('id', currentMap.id)

    // Save to map_images for version history
    await supabase.from('map_images').insert({
      map_id: currentMap.id,
      storage_path: filePath,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      is_current: true,
    })

    // Mark previous images as not current
    await supabase
      .from('map_images')
      .update({ is_current: false })
      .eq('map_id', currentMap.id)
      .neq('storage_path', filePath)

    setUploadedUrl(publicUrl)
    setFinalImageUrl(publicUrl)
    setUploading(false)
    setPreview(null)
    setFile(null)
  }

  const handleExport = (format: 'png' | 'jpg' | 'pdf') => {
    // Export the canvas as an image
    const stage = document.querySelector('.konvajs-content canvas') as HTMLCanvasElement
    if (!stage) return

    if (format === 'pdf') {
      import('jspdf').then(({ jsPDF }) => {
        const pdf = new jsPDF('landscape')
        const imgData = stage.toDataURL('image/jpeg', 0.95)
        const width = pdf.internal.pageSize.getWidth()
        const height = pdf.internal.pageSize.getHeight()
        pdf.addImage(imgData, 'JPEG', 0, 0, width, height)
        pdf.save(`${currentMap?.name || 'map'}.pdf`)
      })
    } else {
      const mimeType = format === 'png' ? 'image/png' : 'image/jpeg'
      const dataUrl = stage.toDataURL(mimeType, 0.95)
      const link = document.createElement('a')
      link.download = `${currentMap?.name || 'map'}.${format}`
      link.href = dataUrl
      link.click()
    }
  }

  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold mb-3">{t('editor.upload.title')}</h3>

      {/* Upload zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors mb-3"
      >
        {preview ? (
          <div className="relative">
            <img src={preview} alt={t('ui.editor.previewAlt')} className="w-full rounded" />
            <button
              onClick={(e) => { e.stopPropagation(); setPreview(null); setFile(null) }}
              className="absolute top-1 end-1 p-1 bg-black/50 rounded-full text-white"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <>
            <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">{t('editor.upload.dropzone')}</p>
          </>
        )}
      </div>

      <input
        id="file-upload"
        name="file-upload"
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFileSelect(f)
        }}
      />

      {file && (
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 mb-3"
        >
          <Image className="h-4 w-4" />
          {uploading ? t('common.loading') : t('editor.upload.confirm')}
        </button>
      )}

      {/* Current uploaded image */}
      {uploadedUrl && (
        <div className="border rounded p-2 mb-3">
          <img src={uploadedUrl} alt={t('ui.editor.finalMapAlt')} className="w-full rounded" />
        </div>
      )}

      {/* Export Section */}
      <h3 className="text-sm font-semibold mb-2 mt-4">{t('export.title')}</h3>
      <div className="flex gap-2">
        <button
          onClick={() => handleExport('png')}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 border rounded text-xs hover:bg-accent transition-colors"
        >
          <Download className="h-3 w-3" />
          PNG
        </button>
        <button
          onClick={() => handleExport('jpg')}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 border rounded text-xs hover:bg-accent transition-colors"
        >
          <Download className="h-3 w-3" />
          JPG
        </button>
        <button
          onClick={() => handleExport('pdf')}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 border rounded text-xs hover:bg-accent transition-colors"
        >
          <Download className="h-3 w-3" />
          PDF
        </button>
      </div>
    </div>
  )
}
