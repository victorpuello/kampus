import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { coreApi, type ConfigImportResult, type Institution, type User } from '../services/core'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Label } from '../components/ui/Label'
import { Toast, type ToastType } from '../components/ui/Toast'
import { Download, Save, Upload, Building2, Users } from 'lucide-react'
import { useAuthStore } from '../store/auth'

export default function InstitutionSettings() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isTeacher = user?.role === 'TEACHER'

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [institution, setInstitution] = useState<Institution | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [letterheadPreview, setLetterheadPreview] = useState<string | null>(null)
  const [letterheadFile, setLetterheadFile] = useState<File | null>(null)
  const letterheadInputRef = useRef<HTMLInputElement>(null)

  const [rectorSignaturePreview, setRectorSignaturePreview] = useState<string | null>(null)
  const [rectorSignatureFile, setRectorSignatureFile] = useState<File | null>(null)
  const rectorSignatureInputRef = useRef<HTMLInputElement>(null)
  const [rectorsList, setRectorsList] = useState<User[]>([])
  const [secretariesList, setSecretariesList] = useState<User[]>([])
  
  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false
  })

  const [exportingConfig, setExportingConfig] = useState(false)
  const [includeMedia, setIncludeMedia] = useState(false)

  const [importingConfig, setImportingConfig] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [dryRunImport, setDryRunImport] = useState(true)
  const [overwriteImport, setOverwriteImport] = useState(false)
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)
  const [lastImportResult, setLastImportResult] = useState<ConfigImportResult | null>(null)

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  const getFilenameFromContentDisposition = (value?: string) => {
    if (!value) return null
    const match = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"|filename=([^;]+)/i.exec(value)
    const raw = match?.[1] || match?.[2] || match?.[3]
    if (!raw) return null
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  }

  const handleExportConfig = async () => {
    setExportingConfig(true)
    try {
      const res = await coreApi.exportConfig(includeMedia)
      const blob = res.data as Blob
      const headers = res.headers as Record<string, string | undefined>
      const cd = headers?.['content-disposition']
      const filename =
        getFilenameFromContentDisposition(cd) ||
        `kampus_config_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`

      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)

      showToast('Exportación descargada correctamente', 'success')
    } catch (err) {
      console.error(err)
      showToast('Error al exportar la configuración', 'error')
    } finally {
      setExportingConfig(false)
    }
  }

  const handleImportConfig = async () => {
    if (!importFile) {
      showToast('Selecciona un archivo JSON para importar', 'error')
      return
    }
    if (overwriteImport && !confirmOverwrite) {
      showToast('Debes confirmar el borrado antes de usar overwrite', 'error')
      return
    }

    setImportingConfig(true)
    try {
      const res = await coreApi.importConfig(importFile, {
        dryRun: dryRunImport,
        overwrite: overwriteImport,
        confirmOverwrite,
      })
      setLastImportResult(res.data)
      showToast(dryRunImport ? 'Validación completada' : 'Importación completada', 'success')
    } catch (err: unknown) {
      console.error(err)
      const maybe = err as { response?: { data?: unknown } }
      const data = maybe.response?.data
      const detail =
        typeof data === 'object' && data !== null && 'detail' in data
          ? (data as { detail?: string }).detail
          : undefined

      showToast(detail || 'Error al importar la configuración', 'error')
    } finally {
      setImportingConfig(false)
    }
  }

  const [formData, setFormData] = useState({
    name: '',
    dane_code: '',
    nit: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    rector: '' as string | number,
    secretary: '' as string | number,

    // PDF letterhead
    pdf_show_logo: true,
    pdf_logo_height_px: '60',
    pdf_header_line1: '',
    pdf_header_line2: '',
    pdf_header_line3: '',
    pdf_footer_text: '',
  })

  useEffect(() => {
    if (isTeacher) return
    loadInstitution()
    loadUsersLists()
  }, [isTeacher])

  if (isTeacher) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-slate-900 dark:text-slate-100">Institución</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600 dark:text-slate-300">No tienes permisos para acceder a la configuración de la institución.</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/')}>Volver al Dashboard</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const loadUsersLists = async () => {
    try {
      const [rectorsRes, secretariesRes] = await Promise.all([
        coreApi.listRectors(),
        coreApi.listSecretaries(),
      ])
      setRectorsList(rectorsRes.data)
      setSecretariesList(secretariesRes.data)
    } catch (err) {
      console.error('Error loading users lists:', err)
    }
  }

  const loadInstitution = async () => {
    try {
      const res = await coreApi.listInstitutions()
      if (res.data.length > 0) {
        const inst = res.data[0]
        setInstitution(inst)
        setFormData({
          name: inst.name || '',
          dane_code: inst.dane_code || '',
          nit: inst.nit || '',
          address: inst.address || '',
          phone: inst.phone || '',
          email: inst.email || '',
          website: inst.website || '',
          rector: inst.rector || '',
          secretary: inst.secretary || '',

          pdf_show_logo: inst.pdf_show_logo ?? true,
          pdf_logo_height_px: String(inst.pdf_logo_height_px ?? 60),
          pdf_header_line1: inst.pdf_header_line1 || '',
          pdf_header_line2: inst.pdf_header_line2 || '',
          pdf_header_line3: inst.pdf_header_line3 || '',
          pdf_footer_text: inst.pdf_footer_text || '',
        })
        if (inst.logo) {
          setLogoPreview(inst.logo)
        }

        if (inst.pdf_letterhead_image) {
          setLetterheadPreview(inst.pdf_letterhead_image)
        }

        if (inst.pdf_rector_signature_image) {
          setRectorSignaturePreview(inst.pdf_rector_signature_image)
        }
      }
    } catch (err) {
      console.error(err)
      showToast('Error al cargar la información de la institución', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setLogoFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setLogoPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleLetterheadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setLetterheadFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setLetterheadPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleRectorSignatureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')
    if (!isPng) {
      showToast('La firma del rector debe ser un archivo PNG.', 'error')
      e.target.value = ''
      return
    }

    setRectorSignatureFile(file)
    const reader = new FileReader()
    reader.onloadend = () => {
      setRectorSignaturePreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target
    setFormData(prev => ({ ...prev, [name]: checked }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const data = new FormData()
      
      // Add all form fields except rector and secretary
      const { rector, secretary, ...restData } = formData
      Object.entries(restData).forEach(([key, value]) => {
        // FormData expects strings/files
        if (typeof value === 'boolean') {
          data.append(key, value ? 'true' : 'false')
        } else {
          data.append(key, String(value ?? ''))
        }
      })
      
      // Handle rector (required)
      if (rector) {
        data.append('rector', rector.toString())
      }
      
      // Handle secretary (optional) - send null if empty
      if (secretary) {
        data.append('secretary', secretary.toString())
      } else {
        data.append('secretary', '')
      }
      
      if (logoFile) {
        data.append('logo', logoFile)
      }

      if (letterheadFile) {
        data.append('pdf_letterhead_image', letterheadFile)
      }

      if (rectorSignatureFile) {
        data.append('pdf_rector_signature_image', rectorSignatureFile)
      }

      if (institution) {
        await coreApi.updateInstitution(institution.id, data)
        showToast('Institución actualizada correctamente', 'success')
      } else {
        await coreApi.createInstitution(data)
        showToast('Institución creada correctamente', 'success')
      }
      
      loadInstitution()
    } catch (err) {
      console.error(err)
      showToast('Error al guardar la institución', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-6 text-slate-700 dark:text-slate-200">Cargando...</div>

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
      />

      <div className="flex items-center gap-4">
        <Building2 className="h-8 w-8 text-slate-700 dark:text-slate-200" />
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Configuración de la Institución
          </h2>
          <p className="text-slate-500 dark:text-slate-400">Administra la información básica de tu institución educativa.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Respaldo de configuración</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Exporta la configuración institucional y académica a un archivo JSON.
              </p>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeMedia}
                  onChange={(e) => setIncludeMedia(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950 dark:focus:ring-sky-400"
                />
                <span className="text-sm text-slate-700 dark:text-slate-200">Incluir archivos (logo) en el JSON</span>
              </label>
              <Button type="button" onClick={handleExportConfig} disabled={exportingConfig}>
                <Download className="mr-2 h-4 w-4" />
                {exportingConfig ? 'Exportando...' : 'Exportar configuración'}
              </Button>
            </div>

            <div className="space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Importa un archivo JSON previamente exportado.
              </p>
              <div className="space-y-2">
                <Label htmlFor="config-file">Archivo JSON</Label>
                <Input
                  id="config-file"
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dryRunImport}
                    onChange={(e) => setDryRunImport(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950 dark:focus:ring-sky-400"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-200">Solo validar (dry-run)</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overwriteImport}
                    onChange={(e) => {
                      const next = e.target.checked
                      setOverwriteImport(next)
                      if (!next) setConfirmOverwrite(false)
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950 dark:focus:ring-sky-400"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-200">Borrar configuración existente (overwrite)</span>
                </label>
                {overwriteImport && (
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmOverwrite}
                      onChange={(e) => setConfirmOverwrite(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950 dark:focus:ring-sky-400"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-200">
                      Confirmo que se borrará la configuración actual
                    </span>
                  </label>
                )}
              </div>

              <Button type="button" variant="outline" onClick={handleImportConfig} disabled={importingConfig}>
                <Upload className="mr-2 h-4 w-4" />
                {importingConfig ? 'Importando...' : 'Importar configuración'}
              </Button>

              {lastImportResult && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-200">
                  <p className="font-medium">Resultado</p>
                  <p className="mt-1">Dry-run: {lastImportResult.dry_run ? 'Sí' : 'No'}</p>
                  <p>Overwrite: {lastImportResult.overwrite ? 'Sí' : 'No'}</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Logo / Escudo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div 
                className="h-32 w-32 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center bg-slate-50 overflow-hidden cursor-pointer hover:border-slate-400 transition-colors dark:border-slate-700 dark:bg-slate-900/40 dark:hover:border-slate-500"
                onClick={() => fileInputRef.current?.click()}
              >
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" className="h-full w-full object-contain" />
                ) : (
                  <div className="text-center text-slate-400 dark:text-slate-400">
                    <Upload className="h-8 w-8 mx-auto mb-1" />
                    <span className="text-xs">Subir logo</span>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoChange}
                className="hidden"
              />
              <div className="text-sm text-slate-500 dark:text-slate-400">
                <p>Haz clic en el recuadro para subir el escudo o logo de la institución.</p>
                <p className="mt-1">Formatos: PNG, JPG, GIF. Tamaño máximo: 2MB</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Membrete para reportes PDF</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Imagen de membrete (opcional)</Label>
              <div className="flex items-center gap-6">
                <div
                  className="h-32 w-64 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center bg-slate-50 overflow-hidden cursor-pointer hover:border-slate-400 transition-colors dark:border-slate-700 dark:bg-slate-900/40 dark:hover:border-slate-500"
                  onClick={() => letterheadInputRef.current?.click()}
                >
                  {letterheadPreview ? (
                    <img src={letterheadPreview} alt="Membrete" className="h-full w-full object-contain" />
                  ) : (
                    <div className="text-center text-slate-400 dark:text-slate-400">
                      <Upload className="h-8 w-8 mx-auto mb-1" />
                      <span className="text-xs">Subir membrete</span>
                    </div>
                  )}
                </div>

                <input
                  ref={letterheadInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLetterheadChange}
                  className="hidden"
                />

                <div className="text-sm text-slate-500 dark:text-slate-400">
                  <p>Si subes una imagen, se usará como encabezado (ancho completo) en los PDFs.</p>
                  <p className="mt-1">Recomendado: PNG/JPG horizontal.</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="pdf_show_logo"
                    checked={formData.pdf_show_logo}
                    onChange={handleCheckboxChange}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950 dark:focus:ring-sky-400"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-200">Mostrar escudo/logo en PDFs</span>
                </label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pdf_logo_height_px">Alto del logo (px)</Label>
                <Input
                  id="pdf_logo_height_px"
                  name="pdf_logo_height_px"
                  type="number"
                  min={10}
                  max={200}
                  value={formData.pdf_logo_height_px}
                  onChange={handleChange}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="pdf_header_line1">Encabezado (línea 1)</Label>
                <Input
                  id="pdf_header_line1"
                  name="pdf_header_line1"
                  value={formData.pdf_header_line1}
                  onChange={handleChange}
                  placeholder="Si está vacío, se usa el nombre de la institución"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="pdf_header_line2">Encabezado (línea 2)</Label>
                <Input
                  id="pdf_header_line2"
                  name="pdf_header_line2"
                  value={formData.pdf_header_line2}
                  onChange={handleChange}
                  placeholder="Opcional"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="pdf_header_line3">Encabezado (línea 3)</Label>
                <Input
                  id="pdf_header_line3"
                  name="pdf_header_line3"
                  value={formData.pdf_header_line3}
                  onChange={handleChange}
                  placeholder="Opcional"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="pdf_footer_text">Pie de página</Label>
                <Input
                  id="pdf_footer_text"
                  name="pdf_footer_text"
                  value={formData.pdf_footer_text}
                  onChange={handleChange}
                  placeholder="Opcional"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Firma del rector (PNG) — certificados</Label>
              <div className="flex items-center gap-6">
                <div
                  className="h-32 w-64 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center bg-slate-50 overflow-hidden cursor-pointer hover:border-slate-400 transition-colors dark:border-slate-700 dark:bg-slate-900/40 dark:hover:border-slate-500"
                  onClick={() => rectorSignatureInputRef.current?.click()}
                >
                  {rectorSignaturePreview ? (
                    <img src={rectorSignaturePreview} alt="Firma del rector" className="h-full w-full object-contain" />
                  ) : (
                    <div className="text-center text-slate-400 dark:text-slate-400">
                      <Upload className="h-8 w-8 mx-auto mb-1" />
                      <span className="text-xs">Subir firma (PNG)</span>
                    </div>
                  )}
                </div>

                <input
                  ref={rectorSignatureInputRef}
                  type="file"
                  accept="image/png,.png"
                  onChange={handleRectorSignatureChange}
                  className="hidden"
                />

                <div className="text-sm text-slate-500 dark:text-slate-400">
                  <p>Se usa en certificados/reportes. Debe ser PNG (ideal: fondo transparente).</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Información General</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="name">Nombre de la Institución *</Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Ej: Institución Educativa San José"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dane_code">Código DANE</Label>
              <Input
                id="dane_code"
                name="dane_code"
                value={formData.dane_code}
                onChange={handleChange}
                placeholder="Ej: 123456789012"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nit">NIT</Label>
              <Input
                id="nit"
                name="nit"
                value={formData.nit}
                onChange={handleChange}
                placeholder="Ej: 900123456-1"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contacto</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="address">Dirección</Label>
              <Input
                id="address"
                name="address"
                value={formData.address}
                onChange={handleChange}
                placeholder="Ej: Calle 10 # 20-30, Barrio Centro"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono</Label>
              <Input
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="Ej: (601) 123 4567"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Correo Electrónico</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="Ej: contacto@institucion.edu.co"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="website">Sitio Web</Label>
              <Input
                id="website"
                name="website"
                type="url"
                value={formData.website}
                onChange={handleChange}
                placeholder="Ej: https://www.institucion.edu.co"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Personal Directivo
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rector">Rector *</Label>
              <select
                id="rector"
                name="rector"
                value={formData.rector}
                onChange={handleChange}
                required
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:ring-offset-slate-950 dark:focus-visible:ring-slate-300"
              >
                <option value="">Seleccione un rector</option>
                {rectorsList.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.first_name} {user.last_name} ({user.username})
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Solo usuarios con rol Administrador o Docente pueden ser rector.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="secretary">Secretario/a (Opcional)</Label>
              <select
                id="secretary"
                name="secretary"
                value={formData.secretary}
                onChange={handleChange}
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:ring-offset-slate-950 dark:focus-visible:ring-slate-300"
              >
                <option value="">Sin secretario asignado</option>
                {secretariesList.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.first_name} {user.last_name} ({user.username})
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Solo usuarios con rol Secretaría pueden ser asignados.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Guardando...' : 'Guardar Cambios'}
          </Button>
        </div>
      </form>
    </div>
  )
}
