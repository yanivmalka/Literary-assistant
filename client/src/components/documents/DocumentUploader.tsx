import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, FileText, X } from 'lucide-react'
import { useDocumentStore } from '@/stores/documentStore'
import { Button } from '@/components/ui/Button'

interface DocumentUploaderProps {
  projectId: string
  documentId?: string // if provided, uploads as new version
  onUploadComplete?: () => void
}

export default function DocumentUploader({ projectId, documentId, onUploadComplete }: DocumentUploaderProps) {
  const { t } = useTranslation()
  const { uploading, uploadDocument } = useDocumentStore()
  const [dragOver, setDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  const validTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]

  const validateFile = (file: File): boolean => {
    if (!validTypes.includes(file.type)) {
      setError(t('documents.upload.invalidType'))
      return false
    }
    if (file.size > 50 * 1024 * 1024) {
      setError(t('documents.upload.tooLarge'))
      return false
    }
    setError(null)
    return true
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && validateFile(file)) {
      setSelectedFile(file)
    }
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && validateFile(file)) {
      setSelectedFile(file)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) return
    const result = await uploadDocument(projectId, selectedFile, documentId)
    if (result.success) {
      setSelectedFile(null)
      onUploadComplete?.()
    } else {
      setError(t(result.error || 'ui.documents.uploadFailed', {
        defaultValue: t('ui.documents.uploadFailed'),
      }))
    }
  }

  return (
    <div className="w-full">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
          ${dragOver ? 'border-primary bg-primary-soft/40' : 'border-border hover:border-primary/50'}
        `}
        onClick={() => document.getElementById('doc-file-input')?.click()}
      >
        <input
          id="doc-file-input"
          name="document-file"
          type="file"
          accept=".pdf,.docx"
          onChange={handleFileSelect}
          className="hidden"
        />

        {selectedFile ? (
          <div className="flex items-center justify-center gap-3">
            <FileText className="h-8 w-8 text-primary" />
            <div className="text-start">
              <p className="font-display font-semibold text-sm">{selectedFile.name}</p>
              <p className="text-sm text-muted-foreground">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setSelectedFile(null) }}
              className="p-1 hover:bg-muted rounded transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <Upload className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">{t('documents.upload.dropzone')}</p>
            <p className="text-xs text-muted-foreground/70 mt-1">PDF, DOCX • {t('documents.upload.maxSize')}</p>
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-destructive mt-2">{error}</p>
      )}

      {/* Upload button */}
      {selectedFile && (
        <Button onClick={handleUpload} disabled={uploading} className="mt-4 w-full">
          {uploading ? t('documents.upload.uploading') : t('documents.upload.confirm')}
        </Button>
      )}
    </div>
  )
}
