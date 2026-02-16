import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { coreApi, type Institution, type User } from '../services/core'
import { reportsApi, type ReportJob } from '../services/reports'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Label } from '../components/ui/Label'
import { Toast, type ToastType } from '../components/ui/Toast'
import { Save, Upload, Building2, Users } from 'lucide-react'
import { useAuthStore } from '../store/auth'

export default function InstitutionSettings() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isTeacher = user?.role === 'TEACHER'

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [institution, setInstitution] = useState<Institution | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [clearLogo, setClearLogo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [letterheadPreview, setLetterheadPreview] = useState<string | null>(null)
  const [letterheadFile, setLetterheadFile] = useState<File | null>(null)
  const [clearLetterhead, setClearLetterhead] = useState(false)
  const letterheadInputRef = useRef<HTMLInputElement>(null)

  const [rectorSignaturePreview, setRectorSignaturePreview] = useState<string | null>(null)
  const [rectorSignatureFile, setRectorSignatureFile] = useState<File | null>(null)
  const [clearRectorSignature, setClearRectorSignature] = useState(false)
  const rectorSignatureInputRef = useRef<HTMLInputElement>(null)
  const [rectorsList, setRectorsList] = useState<User[]>([])
  const [secretariesList, setSecretariesList] = useState<User[]>([])
  
  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false
  })

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }, [])

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  const pollJobUntilFinished = async (
    jobId: number,
    onUpdate?: (job: ReportJob) => void
  ): Promise<ReportJob> => {
    const delaysMs = [400, 700, 1000, 1500, 2000, 2500, 3000, 3500]
    for (let i = 0; i < 60; i++) {
      const res = await reportsApi.getJob(jobId)
      const job = res.data
      onUpdate?.(job)
      if (job.status === 'SUCCEEDED' || job.status === 'FAILED' || job.status === 'CANCELED') {
        return job
      }
      const delay = delaysMs[Math.min(i, delaysMs.length - 1)]
      await sleep(delay)
    }
    throw new Error('Timeout esperando la generación del PDF')
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

  const loadUsersLists = useCallback(async () => {
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
  }, [])

  const loadInstitution = useCallback(async () => {
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

        // Reset clear flags to avoid unintended clears after reloading data
        setClearLogo(false)
        setClearLetterhead(false)
        setClearRectorSignature(false)
        setLogoFile(null)
        setLetterheadFile(null)
        setRectorSignatureFile(null)
        setIsDirty(false)
      }
    } catch (err) {
      console.error(err)
      showToast('Error al cargar la información de la institución', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    if (isTeacher) return
    void loadInstitution()
    void loadUsersLists()
  }, [isTeacher, loadInstitution, loadUsersLists])

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    setIsDirty(true)
  }

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setClearLogo(false)
      setLogoFile(file)
      setIsDirty(true)
      const reader = new FileReader()
      reader.onloadend = () => {
        setLogoPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleClearLogo = () => {
    setClearLogo(true)
    setLogoFile(null)
    setLogoPreview(null)
    setIsDirty(true)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleLetterheadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setClearLetterhead(false)
      setLetterheadFile(file)
      setIsDirty(true)
      const reader = new FileReader()
      reader.onloadend = () => {
        setLetterheadPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleClearLetterhead = () => {
    setClearLetterhead(true)
    setLetterheadFile(null)
    setLetterheadPreview(null)
    setIsDirty(true)
    if (letterheadInputRef.current) letterheadInputRef.current.value = ''
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

    setClearRectorSignature(false)
    setRectorSignatureFile(file)
    setIsDirty(true)
    const reader = new FileReader()
    reader.onloadend = () => {
      setRectorSignaturePreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleClearRectorSignature = () => {
    setClearRectorSignature(true)
    setRectorSignatureFile(null)
    setRectorSignaturePreview(null)
    setIsDirty(true)
    if (rectorSignatureInputRef.current) rectorSignatureInputRef.current.value = ''
  }

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target
    setFormData(prev => ({ ...prev, [name]: checked }))
    setIsDirty(true)
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
      
      if (clearLogo) data.append('logo', '')
      else if (logoFile) data.append('logo', logoFile)

      if (clearLetterhead) data.append('pdf_letterhead_image', '')
      else if (letterheadFile) data.append('pdf_letterhead_image', letterheadFile)

      if (clearRectorSignature) data.append('pdf_rector_signature_image', '')
      else if (rectorSignatureFile) data.append('pdf_rector_signature_image', rectorSignatureFile)

      if (institution) {
        await coreApi.updateInstitution(institution.id, data)
        showToast('Institución actualizada correctamente', 'success')
      } else {
        await coreApi.createInstitution(data)
        showToast('Institución creada correctamente', 'success')
      }
      
      await loadInstitution()
    } catch (err) {
      console.error(err)
      showToast('Error al guardar la institución', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-6 text-slate-700 dark:text-slate-200">Cargando...</div>

  const handlePreviewLetterheadPdf = async () => {
    setSaving(true)
    try {
      showToast('Generando PDF de prueba…', 'info')

      const created = await reportsApi.createJob({
        report_type: 'DUMMY',
        params: {
          note: 'Preview membrete institucional',
          generated_at: new Date().toISOString(),
        },
      })

      const job = await pollJobUntilFinished(created.data.id)
      if (job.status !== 'SUCCEEDED') {
        showToast(job.error_message || 'No se pudo generar el PDF de prueba', 'error')
        return
      }

      const res = await reportsApi.downloadJob(job.id)
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
      const headers = res.headers as Record<string, string | undefined>
      const filename =
        getFilenameFromContentDisposition(headers?.['content-disposition']) ||
        job.output_filename ||
        'preview_membrete.pdf'

      downloadBlob(blob, filename)
      showToast('PDF de prueba listo.', 'success')
    } catch (err) {
      console.error(err)
      showToast('Error generando el PDF de prueba', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handlePreviewLetterheadHtml = async () => {
    setSaving(true)
    try {
      showToast('Generando preview HTML…', 'info')

      const created = await reportsApi.createJob({
        report_type: 'DUMMY',
        params: {
          note: 'Preview HTML membrete institucional',
          generated_at: new Date().toISOString(),
        },
      })

      const res = await reportsApi.previewJobHtml(created.data.id)
      let html = typeof res.data === 'string' ? res.data : String(res.data)

      // When opening HTML as a Blob URL, relative URLs like /media/... won't resolve.
      // Inject a <base> tag pointing to the API origin so images/styles load correctly.
      const apiBase = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')
      const baseTag = `<base href="${apiBase}/">`
      if (/<head\b[^>]*>/i.test(html)) {
        html = html.replace(/<head\b([^>]*)>/i, `<head$1>${baseTag}`)
      } else {
        html = `${baseTag}\n${html}`
      }

      const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
      const url = window.URL.createObjectURL(blob)

      window.open(url, '_blank', 'noopener,noreferrer')
      window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000)

      showToast('Preview HTML abierto.', 'success')
    } catch (err) {
      console.error(err)
      showToast('Error generando el preview HTML', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
      />

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/40">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-slate-100 p-2.5 dark:bg-slate-900">
            <Building2 className="h-6 w-6 text-slate-700 dark:text-slate-200" />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Configuración de la Institución
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Actualiza los datos institucionales, responsables y elementos usados en certificados y reportes.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
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

        <Card>
          <CardHeader>
            <CardTitle>Logo / Escudo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
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
                <p className="mt-1">Formatos: PNG, JPG, GIF. Tamaño máximo: 2MB.</p>
                <div className="mt-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClearLogo}
                    disabled={!logoPreview}
                  >
                    Eliminar logo
                  </Button>
                </div>
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
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
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
                  <div className="mt-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleClearLetterhead}
                      disabled={!letterheadPreview}
                    >
                      Eliminar membrete
                    </Button>
                  </div>
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

            <div className="flex flex-col gap-2">
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Para ver el resultado real, guarda cambios y genera un PDF de prueba.
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePreviewLetterheadPdf}
                  disabled={saving}
                >
                  Generar PDF de prueba
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePreviewLetterheadHtml}
                  disabled={saving}
                >
                  Ver preview HTML
                </Button>
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
                  <div className="mt-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleClearRectorSignature}
                      disabled={!rectorSignaturePreview}
                    >
                      Eliminar firma
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="sticky bottom-0 z-10 -mx-2 mt-2 border-t border-slate-200 bg-white/95 px-2 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
          <div className="flex items-center justify-between gap-3">
            <div
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                isDirty
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              {isDirty ? 'Cambios sin guardar' : 'Sin cambios'}
            </div>
            <Button type="submit" disabled={saving || !isDirty}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
