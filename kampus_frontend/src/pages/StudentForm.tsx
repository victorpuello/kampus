import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { studentsApi, familyMembersApi } from '../services/students'
import type { FamilyMember } from '../services/students'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Label } from '../components/ui/Label'
import { ArrowLeft, Save, User, Home, Activity, Heart, Users, Plus, Trash2, Edit2, X } from 'lucide-react'
import { colombiaData } from '../data/colombia'
import { epsList, ethnicityList } from '../data/socioeconomic'

function FamilyMemberForm({ 
    studentId, 
    member, 
    onSave, 
    onCancel 
}: { 
    studentId: number, 
    member?: FamilyMember, 
    onSave: () => void, 
    onCancel: () => void 
}) {
    const [loading, setLoading] = useState(false)
    const [formData, setFormData] = useState({
        full_name: member?.full_name || '',
        document_number: member?.document_number || '',
        relationship: member?.relationship || '',
        phone: member?.phone || '',
        email: member?.email || '',
        address: member?.address || '',
        is_main_guardian: member?.is_main_guardian || false,
        is_head_of_household: member?.is_head_of_household || false,
    })

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = e.target
        setFormData(prev => ({ ...prev, [name]: checked }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            const payload = { ...formData, student: studentId }
            if (member) {
                await familyMembersApi.update(member.id, payload)
            } else {
                await familyMembersApi.create(payload)
            }
            onSave()
        } catch (error: any) {
            console.error(error)
            const msg = error.response?.data ? JSON.stringify(error.response.data) : 'Error al guardar familiar'
            alert(msg)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-4 border-b">
                    <h3 className="text-lg font-semibold">{member ? 'Editar Familiar' : 'Nuevo Familiar'}</h3>
                    <button onClick={onCancel}><X className="h-5 w-5 text-slate-500" /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Nombre Completo</Label>
                            <Input name="full_name" value={formData.full_name} onChange={handleChange} required />
                        </div>
                        <div className="space-y-2">
                            <Label>Parentesco</Label>
                            <select name="relationship" value={formData.relationship} onChange={handleChange} className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" required>
                                <option value="">Seleccione...</option>
                                <option value="Madre">Madre</option>
                                <option value="Padre">Padre</option>
                                <option value="Abuelo/a">Abuelo/a</option>
                                <option value="Tío/a">Tío/a</option>
                                <option value="Hermano/a">Hermano/a</option>
                                <option value="Acudiente">Acudiente</option>
                                <option value="Otro">Otro</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label>Documento</Label>
                            <Input name="document_number" value={formData.document_number} onChange={handleChange} />
                        </div>
                        <div className="space-y-2">
                            <Label>Teléfono</Label>
                            <Input name="phone" value={formData.phone} onChange={handleChange} />
                        </div>
                        <div className="space-y-2">
                            <Label>Email</Label>
                            <Input name="email" type="email" value={formData.email} onChange={handleChange} />
                        </div>
                        <div className="space-y-2">
                            <Label>Dirección</Label>
                            <Input name="address" value={formData.address} onChange={handleChange} />
                        </div>
                    </div>
                    <div className="flex gap-6 pt-2">
                        <label className="flex items-center space-x-2 cursor-pointer">
                            <input type="checkbox" name="is_main_guardian" checked={formData.is_main_guardian} onChange={handleCheckboxChange} className="h-4 w-4 rounded border-slate-300" />
                            <span className="text-sm text-slate-700">Acudiente Principal</span>
                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer">
                            <input type="checkbox" name="is_head_of_household" checked={formData.is_head_of_household} onChange={handleCheckboxChange} className="h-4 w-4 rounded border-slate-300" />
                            <span className="text-sm text-slate-700">Cabeza de Familia</span>
                        </label>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
                        <Button type="submit" disabled={loading}>{loading ? 'Guardando...' : 'Guardar'}</Button>
                    </div>
                </form>
            </div>
        </div>
    )
}

export default function StudentForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEditing = !!id

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('identification')

  const [selectedDepartment, setSelectedDepartment] = useState('')
  const [selectedCity, setSelectedCity] = useState('')

  // Family Members State
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([])
  const [showFamilyModal, setShowFamilyModal] = useState(false)
  const [editingMember, setEditingMember] = useState<FamilyMember | undefined>(undefined)

  const [formData, setFormData] = useState({
    // User info (flattened)
    username: '', // Read-only for display
    email: '',
    first_name: '',
    last_name: '',
    
    // Identification
    document_type: 'TI',
    document_number: '',
    place_of_issue: '',
    nationality: 'Colombiana',
    birth_date: '',
    sex: '',
    blood_type: '',
    
    // Residence & Contact
    address: '',
    neighborhood: '',
    phone: '',
    living_with: '',
    stratum: '',
    
    // Socioeconomic
    ethnicity: '',
    sisben_score: '',
    eps: '',
    is_victim_of_conflict: false,
    
    // Disability & Support
    has_disability: false,
    disability_description: '',
    disability_type: '',
    support_needs: '',
  })

  useEffect(() => {
    if (isEditing && id) {
      setLoading(true)
      studentsApi.get(Number(id))
        .then(res => {
          const student = res.data
          
          // Parse place_of_issue if possible
          let dept = ''
          let city = ''
          if (student.place_of_issue) {
            const parts = student.place_of_issue.split(' - ')
            if (parts.length === 2) {
                city = parts[0]
                dept = parts[1]
            } else {
                // Try to find exact match in cities if format is different
                // Or just leave it as is in the state but dropdowns might be empty
                city = student.place_of_issue
            }
          }

          setSelectedDepartment(dept)
          setSelectedCity(city)
          
          setFamilyMembers(student.family_members || [])

          setFormData({
            username: student.user?.username || '',
            email: student.user?.email || '',
            first_name: student.user?.first_name || '',
            last_name: student.user?.last_name || '',
            
            document_type: student.document_type || 'TI',
            document_number: student.document_number || '',
            place_of_issue: student.place_of_issue || '',
            nationality: student.nationality || 'Colombiana',
            birth_date: student.birth_date || '',
            sex: student.sex || '',
            blood_type: student.blood_type || '',
            
            address: student.address || '',
            neighborhood: student.neighborhood || '',
            phone: student.phone || '',
            living_with: student.living_with || '',
            stratum: student.stratum || '',
            
            ethnicity: student.ethnicity || '',
            sisben_score: student.sisben_score || '',
            eps: student.eps || '',
            is_victim_of_conflict: student.is_victim_of_conflict || false,
            
            has_disability: student.has_disability || false,
            disability_description: student.disability_description || '',
            disability_type: student.disability_type || '',
            support_needs: student.support_needs || '',
          })
        })
        .catch((err) => {
          console.error(err)
          setError('Error al cargar el estudiante')
        })
        .finally(() => setLoading(false))
    }
  }, [id, isEditing])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target
    setFormData(prev => ({ ...prev, [name]: checked }))
  }

  const handleDepartmentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const dept = e.target.value
    setSelectedDepartment(dept)
    setSelectedCity('') // Reset city when department changes
    // Update formData immediately or wait for submit? 
    // Better to update formData on submit or useEffect, but let's keep it simple
  }

  const handleCityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const city = e.target.value
    setSelectedCity(city)
  }

  const refreshFamilyMembers = async () => {
    if (!id) return
    try {
        const res = await studentsApi.get(Number(id))
        setFamilyMembers(res.data.family_members || [])
    } catch (error) {
        console.error(error)
    }
  }

  const handleDeleteFamilyMember = async (memberId: number) => {
    if (!confirm('¿Estás seguro de eliminar este familiar?')) return
    try {
        await familyMembersApi.delete(memberId)
        refreshFamilyMembers()
    } catch (error) {
        console.error(error)
        alert('Error al eliminar familiar')
    }
  }

  const handleSaveStep = async (nextTab?: string) => {
    setLoading(true)
    setError(null)

    try {
      // Construct place_of_issue
      let finalPlaceOfIssue = formData.place_of_issue
      if (selectedDepartment && selectedCity) {
        finalPlaceOfIssue = `${selectedCity} - ${selectedDepartment}`
      } else if (selectedCity) {
        finalPlaceOfIssue = selectedCity
      }

      const payload = {
        ...formData,
        place_of_issue: finalPlaceOfIssue,
        birth_date: formData.birth_date || null,
      }

      if (isEditing) {
        await studentsApi.update(Number(id), payload)
        if (nextTab) setActiveTab(nextTab)
        else navigate('/students')
      } else {
        const res = await studentsApi.create(payload)
        const newId = res.data.user.id
        // Navigate to edit mode but keep state
        navigate(`/students/${newId}`, { replace: true })
        if (nextTab) setActiveTab(nextTab)
      }
    } catch (err: any) {
      console.error(err)
      setError(err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Error al guardar el estudiante')
    } finally {
      setLoading(false)
    }
  }

  const tabs = [
    { id: 'identification', label: 'Identificación', icon: User },
    { id: 'residence', label: 'Residencia', icon: Home },
    { id: 'socioeconomic', label: 'Socioeconómico', icon: Activity },
    { id: 'support', label: 'Apoyos', icon: Heart },
    { id: 'family', label: 'Familia', icon: Users },
  ]

  if (loading && isEditing && !formData.first_name) return <div className="p-6">Cargando...</div>

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/students')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">
          {isEditing ? 'Editar Estudiante' : 'Nuevo Estudiante'}
        </h2>
      </div>

      <div className="flex space-x-1 rounded-xl bg-slate-100 p-1">
        {tabs.map((tab) => {
            const Icon = tab.icon
            return (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full rounded-lg py-2.5 text-sm font-medium leading-5 flex items-center justify-center gap-2
                    ${activeTab === tab.id 
                        ? 'bg-white text-blue-700 shadow'
                        : 'text-slate-600 hover:bg-white/[0.12] hover:text-blue-600'
                    }`}
                >
                    <Icon className="h-4 w-4" />
                    <span className="hidden md:inline">{tab.label}</span>
                </button>
            )
        })}
      </div>

      <div className="space-y-6">
        {error && (
          <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
            {error}
          </div>
        )}

        {/* IDENTIFICATION TAB */}
        <div className={activeTab === 'identification' ? 'block' : 'hidden'}>
            <Card>
            <CardHeader><CardTitle>Datos de Identificación</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {isEditing && (
                    <div className="space-y-2">
                        <Label>Usuario (Sistema)</Label>
                        <Input name="username" value={formData.username || ''} readOnly disabled />
                    </div>
                )}
                <div className="space-y-2">
                    <Label>Email</Label>
                    <Input name="email" type="email" value={formData.email} onChange={handleChange} />
                </div>
                <div className="space-y-2">
                    <Label>Nombres</Label>
                    <Input name="first_name" value={formData.first_name} onChange={handleChange} required />
                </div>
                <div className="space-y-2">
                    <Label>Apellidos</Label>
                    <Input name="last_name" value={formData.last_name} onChange={handleChange} required />
                </div>
                
                <div className="col-span-full border-t my-2"></div>

                <div className="space-y-2">
                    <Label>Tipo Documento</Label>
                    <select name="document_type" value={formData.document_type} onChange={handleChange} className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                        <option value="TI">Tarjeta de Identidad</option>
                        <option value="CC">Cédula de Ciudadanía</option>
                        <option value="RC">Registro Civil</option>
                        <option value="CE">Cédula de Extranjería</option>
                        <option value="NES">NES</option>
                    </select>
                </div>
                <div className="space-y-2">
                    <Label>Número Documento</Label>
                    <Input name="document_number" value={formData.document_number} onChange={handleChange} />
                </div>
                
                <div className="space-y-2">
                    <Label>Departamento de Expedición</Label>
                    <select 
                        value={selectedDepartment} 
                        onChange={handleDepartmentChange}
                        className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                        <option value="">Seleccione Departamento...</option>
                        {colombiaData.map((dept) => (
                            <option key={dept.departamento} value={dept.departamento}>
                                {dept.departamento}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="space-y-2">
                    <Label>Ciudad de Expedición</Label>
                    <select 
                        value={selectedCity} 
                        onChange={handleCityChange}
                        disabled={!selectedDepartment}
                        className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                    >
                        <option value="">Seleccione Ciudad...</option>
                        {selectedDepartment && colombiaData.find(d => d.departamento === selectedDepartment)?.ciudades.map((city) => (
                            <option key={city} value={city}>
                                {city}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="space-y-2">
                    <Label>Nacionalidad</Label>
                    <Input name="nationality" value={formData.nationality} onChange={handleChange} />
                </div>
                <div className="space-y-2">
                    <Label>Fecha de Nacimiento</Label>
                    <Input type="date" name="birth_date" value={formData.birth_date} onChange={handleChange} />
                </div>
                <div className="space-y-2">
                    <Label>Sexo</Label>
                    <select name="sex" value={formData.sex} onChange={handleChange} className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                        <option value="">Seleccione...</option>
                        <option value="M">Masculino</option>
                        <option value="F">Femenino</option>
                    </select>
                </div>
                <div className="space-y-2">
                    <Label>Tipo de Sangre</Label>
                    <select 
                        name="blood_type" 
                        value={formData.blood_type} 
                        onChange={handleChange} 
                        className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                        <option value="">Seleccione...</option>
                        <option value="O+">O+</option>
                        <option value="O-">O-</option>
                        <option value="A+">A+</option>
                        <option value="A-">A-</option>
                        <option value="B+">B+</option>
                        <option value="B-">B-</option>
                        <option value="AB+">AB+</option>
                        <option value="AB-">AB-</option>
                    </select>
                </div>
            </CardContent>
            <div className="flex justify-end p-4 border-t bg-slate-50 rounded-b-lg">
                <Button onClick={() => handleSaveStep('residence')} disabled={loading}>
                    Guardar y Continuar
                </Button>
            </div>
            </Card>
        </div>

        {/* RESIDENCE TAB */}
        <div className={activeTab === 'residence' ? 'block' : 'hidden'}>
            <Card>
            <CardHeader><CardTitle>Residencia y Contacto</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Dirección de Residencia</Label>
                    <Input name="address" value={formData.address} onChange={handleChange} />
                </div>
                <div className="space-y-2">
                    <Label>Barrio / Vereda</Label>
                    <Input name="neighborhood" value={formData.neighborhood} onChange={handleChange} />
                </div>
                <div className="space-y-2">
                    <Label>Teléfono</Label>
                    <Input name="phone" value={formData.phone} onChange={handleChange} />
                </div>
                <div className="space-y-2">
                    <Label>Con quién vive</Label>
                    <select 
                        name="living_with" 
                        value={formData.living_with} 
                        onChange={handleChange} 
                        className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                        <option value="">Seleccione...</option>
                        <option value="Madre">Madre</option>
                        <option value="Padre">Padre</option>
                        <option value="Ambos Padres">Ambos Padres</option>
                        <option value="Abuelos">Abuelos</option>
                        <option value="Tíos">Tíos</option>
                        <option value="Hermanos">Hermanos</option>
                        <option value="Tutor Legal">Tutor Legal</option>
                        <option value="Otro">Otro</option>
                    </select>
                </div>
                <div className="space-y-2">
                    <Label>Estrato</Label>
                    <Input name="stratum" value={formData.stratum} onChange={handleChange} />
                </div>
            </CardContent>
            <div className="flex justify-between p-4 border-t bg-slate-50 rounded-b-lg">
                <Button variant="outline" onClick={() => setActiveTab('identification')}>Anterior</Button>
                <Button onClick={() => handleSaveStep('socioeconomic')} disabled={loading}>
                    Guardar y Continuar
                </Button>
            </div>
            </Card>
        </div>

        {/* SOCIOECONOMIC TAB */}
        <div className={activeTab === 'socioeconomic' ? 'block' : 'hidden'}>
            <Card>
            <CardHeader><CardTitle>Información Socioeconómica</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>SISBÉN (Puntaje/Nivel)</Label>
                    <Input name="sisben_score" value={formData.sisben_score} onChange={handleChange} />
                </div>
                <div className="space-y-2">
                    <Label>EPS</Label>
                    <Input 
                        name="eps" 
                        value={formData.eps} 
                        onChange={handleChange} 
                        list="eps-list" 
                        placeholder="Escriba o seleccione..."
                    />
                    <datalist id="eps-list">
                        {epsList.map((eps) => (
                            <option key={eps} value={eps} />
                        ))}
                    </datalist>
                </div>
                <div className="space-y-2">
                    <Label>Etnia</Label>
                    <select 
                        name="ethnicity" 
                        value={formData.ethnicity} 
                        onChange={handleChange} 
                        className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                        <option value="">Seleccione...</option>
                        {ethnicityList.map((eth) => (
                            <option key={eth} value={eth}>{eth}</option>
                        ))}
                    </select>
                </div>
                <div className="space-y-2 flex items-center pt-6">
                    <label className="flex items-center space-x-2 cursor-pointer">
                        <input type="checkbox" name="is_victim_of_conflict" checked={formData.is_victim_of_conflict} onChange={handleCheckboxChange} className="h-4 w-4 rounded border-slate-300" />
                        <span className="text-sm text-slate-700">¿Víctima del conflicto?</span>
                    </label>
                </div>
            </CardContent>
            <div className="flex justify-between p-4 border-t bg-slate-50 rounded-b-lg">
                <Button variant="outline" onClick={() => setActiveTab('residence')}>Anterior</Button>
                <Button onClick={() => handleSaveStep('support')} disabled={loading}>
                    Guardar y Continuar
                </Button>
            </div>
            </Card>
        </div>

        {/* SUPPORT TAB */}
        <div className={activeTab === 'support' ? 'block' : 'hidden'}>
            <Card>
            <CardHeader><CardTitle>Desarrollo Integral y Apoyos</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                    <input type="checkbox" name="has_disability" checked={formData.has_disability} onChange={handleCheckboxChange} className="h-4 w-4 rounded border-slate-300" />
                    <Label>¿Tiene alguna discapacidad o condición especial?</Label>
                </div>

                {formData.has_disability && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-6 border-l-2 border-slate-200">
                        <div className="space-y-2">
                            <Label>Tipo de Discapacidad</Label>
                            <select name="disability_type" value={formData.disability_type} onChange={handleChange} className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                                <option value="">Seleccione...</option>
                                <option value="FISICA">Física</option>
                                <option value="INTELECTUAL">Intelectual</option>
                                <option value="SENSORIAL">Sensorial (Auditiva/Visual)</option>
                                <option value="MULTIPLE">Múltiple</option>
                                <option value="OTRA">Otra</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label>Descripción</Label>
                            <Input name="disability_description" value={formData.disability_description} onChange={handleChange} placeholder="Detalles de la condición..." />
                        </div>
                    </div>
                )}

                <div className="space-y-2">
                    <Label>Apoyos Requeridos</Label>
                    <textarea 
                        name="support_needs" 
                        value={formData.support_needs} 
                        onChange={handleChange} 
                        className="flex min-h-[80px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                        placeholder="Trabajo en aula, casa, terapias, etc."
                    />
                </div>
            </CardContent>
            <div className="flex justify-between p-4 border-t bg-slate-50 rounded-b-lg">
                <Button variant="outline" onClick={() => setActiveTab('socioeconomic')}>Anterior</Button>
                <Button onClick={() => handleSaveStep('family')} disabled={loading}>
                    Guardar y Continuar
                </Button>
            </div>
            </Card>
        </div>

        {/* FAMILY TAB */}
        <div className={activeTab === 'family' ? 'block' : 'hidden'}>
            <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle>Referencias Familiares</CardTitle>
                    {isEditing && (
                        <Button size="sm" onClick={() => { setEditingMember(undefined); setShowFamilyModal(true); }} type="button">
                            <Plus className="h-4 w-4 mr-2" /> Agregar Familiar
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                {!isEditing ? (
                    <div className="text-center py-8 text-slate-500">
                        <p>Guarde el estudiante primero para agregar familiares.</p>
                    </div>
                ) : familyMembers.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                        <p>No hay familiares registrados.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                                <tr>
                                    <th className="px-4 py-2">Nombre</th>
                                    <th className="px-4 py-2">Parentesco</th>
                                    <th className="px-4 py-2">Teléfono</th>
                                    <th className="px-4 py-2">Acudiente</th>
                                    <th className="px-4 py-2">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {familyMembers.map((member) => (
                                    <tr key={member.id} className="border-b hover:bg-slate-50">
                                        <td className="px-4 py-2 font-medium">{member.full_name}</td>
                                        <td className="px-4 py-2">{member.relationship}</td>
                                        <td className="px-4 py-2">{member.phone}</td>
                                        <td className="px-4 py-2">
                                            {member.is_main_guardian && <span className="px-2 py-1 text-xs font-semibold text-green-700 bg-green-100 rounded-full">Principal</span>}
                                        </td>
                                        <td className="px-4 py-2 flex gap-2">
                                            <Button variant="ghost" size="sm" onClick={() => { setEditingMember(member); setShowFamilyModal(true); }} type="button">
                                                <Edit2 className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => handleDeleteFamilyMember(member.id)} type="button" className="text-red-600 hover:text-red-700 hover:bg-red-50">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>
            <div className="flex justify-between p-4 border-t bg-slate-50 rounded-b-lg">
                <Button variant="outline" onClick={() => setActiveTab('support')}>Anterior</Button>
                <Button onClick={() => navigate('/students')} disabled={loading}>
                    Finalizar
                </Button>
            </div>
            </Card>
        </div>

        {showFamilyModal && id && (
            <FamilyMemberForm 
                studentId={Number(id)} 
                member={editingMember} 
                onSave={() => { setShowFamilyModal(false); refreshFamilyMembers(); }} 
                onCancel={() => setShowFamilyModal(false)} 
            />
        )}
      </div>
    </div>
  )
}
