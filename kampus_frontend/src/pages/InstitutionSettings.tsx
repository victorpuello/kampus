import { useEffect, useState, useRef } from 'react'
import { coreApi, type Institution, type User } from '../services/core'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Label } from '../components/ui/Label'
import { Toast, type ToastType } from '../components/ui/Toast'
import { Save, Upload, Building2, Users } from 'lucide-react'

export default function InstitutionSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [institution, setInstitution] = useState<Institution | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [rectorsList, setRectorsList] = useState<User[]>([])
  const [secretariesList, setSecretariesList] = useState<User[]>([])
  
  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false
  })

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
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
  })

  useEffect(() => {
    loadInstitution()
    loadUsersLists()
  }, [])

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
        })
        if (inst.logo) {
          setLogoPreview(inst.logo)
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const data = new FormData()
      
      // Add all form fields except rector and secretary
      const { rector, secretary, ...restData } = formData
      Object.entries(restData).forEach(([key, value]) => {
        data.append(key, value as string)
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

  if (loading) return <div className="p-6">Cargando...</div>

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
      />

      <div className="flex items-center gap-4">
        <Building2 className="h-8 w-8 text-slate-700" />
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">
            Configuración de la Institución
          </h2>
          <p className="text-slate-500">Administra la información básica de tu institución educativa.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Logo / Escudo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div 
                className="h-32 w-32 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center bg-slate-50 overflow-hidden cursor-pointer hover:border-slate-400 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" className="h-full w-full object-contain" />
                ) : (
                  <div className="text-center text-slate-400">
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
              <div className="text-sm text-slate-500">
                <p>Haz clic en el recuadro para subir el escudo o logo de la institución.</p>
                <p className="mt-1">Formatos: PNG, JPG, GIF. Tamaño máximo: 2MB</p>
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
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Seleccione un rector</option>
                {rectorsList.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.first_name} {user.last_name} ({user.username})
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">
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
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Sin secretario asignado</option>
                {secretariesList.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.first_name} {user.last_name} ({user.username})
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">
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
