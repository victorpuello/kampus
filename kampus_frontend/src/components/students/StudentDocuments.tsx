import { useCallback, useEffect, useState } from 'react'
import { documentsApi, studentsApi, type FamilyMember, type StudentDocument } from '../../services/students'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Input } from '../ui/Input'
import { Label } from '../ui/Label'
import { FileText, Trash2, Upload, Eye, ChevronLeft, ChevronRight, ScanLine, Smartphone } from 'lucide-react'
import IdentityImageEditor from './IdentityImageEditor'
import DocumentViewerModal from '../documents/DocumentViewerModal'

interface StudentDocumentsProps {
  studentId: number
}

export default function StudentDocuments({ studentId }: StudentDocumentsProps) {
  const [documents, setDocuments] = useState<StudentDocument[]>([])
  const [guardianIdentityDocs, setGuardianIdentityDocs] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadMode, setUploadMode] = useState<'single' | 'double'>('single')
  const [singleUploadType, setSingleUploadType] = useState<'image' | 'pdf'>('image')
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1)
  const [editorResetKey, setEditorResetKey] = useState(0)
  
  // Upload Form
  const [file, setFile] = useState<File | null>(null)
  const [frontFile, setFrontFile] = useState<File | null>(null)
  const [backFile, setBackFile] = useState<File | null>(null)
  const [docType, setDocType] = useState('OTHER')
  const [description, setDescription] = useState('')
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerTitle, setViewerTitle] = useState('Documento')
  const [viewerSourceUrl, setViewerSourceUrl] = useState('')
  const canContinueCapture = uploadMode === 'single' ? !!file : !!frontFile && !!backFile

  const docTypeOptions = [
    { value: 'IDENTITY', label: 'Identidad' },
    { value: 'GUARDIAN_IDENTITY', label: 'ID acudiente' },
    { value: 'VACCINES', label: 'Vacunas' },
    { value: 'EPS', label: 'EPS' },
    { value: 'ACADEMIC', label: 'Académico' },
    { value: 'PHOTO', label: 'Foto' },
    { value: 'OTHER', label: 'Otro' },
  ]

  const validateMaxSize = (selectedFile: File | null): boolean => {
    if (!selectedFile) return true
    if (selectedFile.size > 5 * 1024 * 1024) {
      alert('El archivo excede el tamaño máximo de 5MB')
      return false
    }
    return true
  }

  const loadDocuments = useCallback(async () => {
    setLoading(true)
    try {
      // Ideally we would have an endpoint to list documents for a student
      // For now, we might need to fetch the student details which includes documents
      // Or assume we have a list endpoint. 
      // Based on previous context, `studentsApi.get(id)` returns a student object which has a `documents` array.
      // Let's use that for now.
      const response = await studentsApi.get(studentId)
      setDocuments(response.data.documents || [])

      const fm = response.data.family_members || []
      setGuardianIdentityDocs(
        fm.filter((m) => !!((m.identity_document_download_url || m.identity_document || '').trim()))
      )
    } catch (error) {
      console.error('Error loading documents:', error)
    } finally {
      setLoading(false)
    }
  }, [studentId])

  useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  const closeViewer = () => {
    setViewerOpen(false)
    setViewerTitle('Documento')
    setViewerSourceUrl('')
  }

  const openIntegratedViewer = (url: string, title: string) => {
    if (!url || url === '#') return

    setViewerOpen(true)
    setViewerTitle(title)
    setViewerSourceUrl(url)
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (uploadMode === 'single' && !file) return
    if (uploadMode === 'double' && (!frontFile || !backFile)) return

    setUploading(true)

    try {
      const formData = new FormData()
      formData.append('student', String(studentId))
      formData.append('document_type', docType)
      formData.append('description', description)

      if (uploadMode === 'double') {
        const response = await documentsApi.composeIdentityPdf(frontFile as File, backFile as File)
        const pdfBlob = response.data
        const mergedFile = new File([pdfBlob], `documento_doble_cara_${Date.now()}.pdf`, { type: 'application/pdf' })
        formData.append('file', mergedFile)
      } else {
        formData.append('file', file as File)
      }

      await documentsApi.create(formData)
      setFile(null)
      setFrontFile(null)
      setBackFile(null)
      setDescription('')
      setDocType('OTHER')
      setUploadMode('single')
      setSingleUploadType('image')
      setWizardStep(1)
      setEditorResetKey((prev) => prev + 1)
      loadDocuments() // Reload list
    } catch (error) {
      console.error('Error uploading document:', error)
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Está seguro de eliminar este documento?')) return
    try {
      await documentsApi.delete(id)
      loadDocuments()
    } catch (error) {
      console.error('Error deleting document:', error)
    }
  }

  const getDocTypeName = (type: string) => {
    const types: Record<string, string> = {
      'IDENTITY': 'Documento de Identidad',
      'GUARDIAN_IDENTITY': 'Documento de identidad del acudiente',
      'VACCINES': 'Carnet de Vacunas',
      'EPS': 'Certificado EPS',
      'ACADEMIC': 'Certificado Académico',
      'PHOTO': 'Foto',
      'OTHER': 'Otro'
    }
    return types[type] || type
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-sky-600 dark:text-sky-400" />
            Cargar Nuevo Documento
          </CardTitle>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Asistente rápido para celular: elige tipo, captura y sube en 3 pasos.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpload} className="space-y-5">
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((step) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => setWizardStep(step as 1 | 2 | 3)}
                  className={`h-11 rounded-lg border text-sm font-medium ${wizardStep === step ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-sky-400 dark:bg-sky-950/40 dark:text-sky-300' : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'}`}
                >
                  {step === 1 ? '1. Tipo' : step === 2 ? '2. Captura' : '3. Subir'}
                </button>
              ))}
            </div>

            {wizardStep === 1 ? (
              <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                <Label>¿Qué documento vas a cargar?</Label>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {docTypeOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setDocType(option.value)}
                      className={`min-h-12 rounded-lg border px-3 text-sm font-medium ${docType === option.value ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-sky-400 dark:bg-sky-950/40 dark:text-sky-300' : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="flex justify-end">
                  <Button type="button" onClick={() => setWizardStep(2)} className="h-11 px-5">
                    Continuar
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : null}

            {wizardStep === 2 ? (
              <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                <div className="space-y-2">
                  <Label>Modo de captura</Label>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        setUploadMode('single')
                        setFrontFile(null)
                        setBackFile(null)
                      }}
                      className={`h-12 rounded-lg border px-3 text-sm font-medium ${uploadMode === 'single' ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-sky-400 dark:bg-sky-950/40 dark:text-sky-300' : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'}`}
                    >
                      1 cara
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUploadMode('double')
                        setFile(null)
                      }}
                      className={`h-12 rounded-lg border px-3 text-sm font-medium ${uploadMode === 'double' ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-sky-400 dark:bg-sky-950/40 dark:text-sky-300' : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'}`}
                    >
                      2 caras (anverso + reverso)
                    </button>
                  </div>
                </div>

                {uploadMode === 'single' ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSingleUploadType('image')
                          setFile(null)
                          setEditorResetKey((prev) => prev + 1)
                        }}
                        className={`h-12 rounded-lg border px-3 text-sm font-medium ${singleUploadType === 'image' ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-sky-400 dark:bg-sky-950/40 dark:text-sky-300' : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'}`}
                      >
                        <span className="inline-flex items-center gap-2"><Smartphone className="h-4 w-4" /> Foto guiada</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSingleUploadType('pdf')
                          setFile(null)
                        }}
                        className={`h-12 rounded-lg border px-3 text-sm font-medium ${singleUploadType === 'pdf' ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-sky-400 dark:bg-sky-950/40 dark:text-sky-300' : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'}`}
                      >
                        PDF existente
                      </button>
                    </div>

                    {singleUploadType === 'image' ? (
                      <IdentityImageEditor
                        key={`single-${editorResetKey}`}
                        label="Imagen del documento"
                        initialFile={file}
                        maxSizeMb={5}
                        onProcessedFileChange={setFile}
                      />
                    ) : (
                      <div className="space-y-2">
                        <Label>Archivo PDF</Label>
                        <Input
                          type="file"
                          onChange={(e) => {
                            const selectedFile = e.target.files ? e.target.files[0] : null
                            if (!validateMaxSize(selectedFile)) {
                              e.target.value = ''
                              setFile(null)
                              return
                            }
                            setFile(selectedFile)
                          }}
                          accept=".pdf,application/pdf"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <IdentityImageEditor
                      key={`front-${editorResetKey}`}
                      label="Anverso"
                      initialFile={frontFile}
                      maxSizeMb={5}
                      onProcessedFileChange={setFrontFile}
                    />
                    <IdentityImageEditor
                      key={`back-${editorResetKey}`}
                      label="Reverso"
                      initialFile={backFile}
                      maxSizeMb={5}
                      onProcessedFileChange={setBackFile}
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400 md:col-span-2">
                      Ajusta la rotación y esquinas antes de continuar. El sistema generará un PDF con ambas caras.
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2">
                  <Button type="button" variant="outline" onClick={() => setWizardStep(1)} className="h-11 px-4">
                    <ChevronLeft className="mr-2 h-4 w-4" /> Volver
                  </Button>
                  <Button type="button" onClick={() => setWizardStep(3)} disabled={!canContinueCapture} className="h-11 px-5">
                    Confirmar y seguir
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : null}

            {wizardStep === 3 ? (
              <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200">
                  Documento listo: <span className="font-semibold">{getDocTypeName(docType)}</span>
                </div>
                <div className="space-y-2">
                  <Label>Descripción (opcional)</Label>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Ej: Certificado de notas 2023"
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Formatos permitidos: PDF, JPG, PNG, WebP. Tamaño máximo 5MB.</p>
                <div className="flex items-center justify-between gap-2">
                  <Button type="button" variant="outline" onClick={() => setWizardStep(2)} className="h-11 px-4">
                    <ChevronLeft className="mr-2 h-4 w-4" /> Captura
                  </Button>
                  <Button type="submit" disabled={uploading || !canContinueCapture} className="h-11 px-5">
                    <Upload className="mr-2 h-4 w-4" />
                    {uploading ? 'Subiendo...' : 'Subir Documento'}
                  </Button>
                </div>
              </div>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documentos Registrados</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-4 text-slate-500 dark:text-slate-400">Cargando documentos...</div>
          ) : documents.length === 0 && guardianIdentityDocs.length === 0 ? (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">No hay documentos registrados.</div>
          ) : (
            <div className="space-y-6">
              {guardianIdentityDocs.length > 0 ? (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3">
                    Documentos de identidad de acudientes
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {guardianIdentityDocs.map((m) => (
                      <div
                        key={`guardian-id-${m.id}`}
                        className="border rounded-lg p-4 flex flex-col justify-between bg-slate-50 hover:bg-slate-100 transition-colors dark:border-slate-800 dark:bg-slate-900/40 dark:hover:bg-slate-800/50"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="p-2 bg-blue-100 rounded-full text-blue-600 dark:bg-sky-950/40 dark:text-sky-300">
                            <FileText className="h-5 w-5" />
                          </div>
                        </div>
                        <div>
                          <h4 className="font-medium text-slate-900 dark:text-slate-100">Documento de identidad</h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            {m.relationship || 'Acudiente'} · {m.full_name || '—'}
                          </p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Doc: {m.document_number || '—'}</p>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => openIntegratedViewer(m.identity_document_download_url || m.identity_document || '#', `Documento acudiente · ${m.full_name || 'Sin nombre'}`)}
                            className="w-full text-sm text-blue-600 hover:underline flex items-center justify-center dark:text-sky-400"
                          >
                            <Eye className="mr-1 h-3 w-3" /> Ver Documento
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {documents.length > 0 ? (
                <div>
                  {guardianIdentityDocs.length > 0 ? (
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3">
                      Documentos del estudiante
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="border rounded-lg p-4 flex flex-col justify-between bg-slate-50 hover:bg-slate-100 transition-colors dark:border-slate-800 dark:bg-slate-900/40 dark:hover:bg-slate-800/50"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="p-2 bg-blue-100 rounded-full text-blue-600 dark:bg-sky-950/40 dark:text-sky-300">
                            <FileText className="h-5 w-5" />
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 dark:hover:text-red-300"
                            onClick={() => handleDelete(doc.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div>
                          <h4 className="font-medium text-slate-900 dark:text-slate-100">{getDocTypeName(doc.document_type)}</h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{doc.description || 'Sin descripción'}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                            Subido: {new Date(doc.uploaded_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => openIntegratedViewer(doc.file_download_url || doc.file || '#', `${getDocTypeName(doc.document_type)} · ${new Date(doc.uploaded_at).toLocaleDateString()}`)}
                            className="w-full text-sm text-blue-600 hover:underline flex items-center justify-center dark:text-sky-400"
                          >
                            <Eye className="mr-1 h-3 w-3" /> Ver Documento
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <DocumentViewerModal
        isOpen={viewerOpen}
        onClose={closeViewer}
        title={viewerTitle}
        sourceUrl={viewerSourceUrl}
      />
    </div>
  )
}