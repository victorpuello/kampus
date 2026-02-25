import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Label } from '../components/ui/Label'
import { Toast, type ToastType } from '../components/ui/Toast'
import { academicApi, type Period, type TeacherAssignment } from '../services/academic'
import { usersApi } from '../services/users'
import { useAuthStore } from '../store/auth'

export default function AccountSettings() {
  const user = useAuthStore((s) => s.user)
  const fetchMe = useAuthStore((s) => s.fetchMe)
  const navigate = useNavigate()

  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  const [firstName, setFirstName] = useState(user?.first_name || '')
  const [lastName, setLastName] = useState(user?.last_name || '')
  const [email, setEmail] = useState(user?.email || '')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>(
    { message: '', type: 'info', isVisible: false }
  )

  const isTeacher = user?.role === 'TEACHER'
  const mustChangePassword = !!user?.must_change_password
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('')
  const [selectedPeriodId, setSelectedPeriodId] = useState('')
  const [loadingGradeSheet, setLoadingGradeSheet] = useState(false)

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  const canRender = !!user?.id

  useEffect(() => {
    if (!canRender) return
    if (!isTeacher || mustChangePassword) return

    let cancelled = false
    const load = async () => {
      try {
        const [a, p] = await Promise.all([
          academicApi.listMyAssignments(),
          academicApi.listPeriods(),
        ])

        if (cancelled) return
        const my = a.data ?? []
        setAssignments(my)
        setPeriods(p.data ?? [])

        if (!selectedAssignmentId && my.length > 0) {
          setSelectedAssignmentId(String(my[0].id))
        }
      } catch (e) {
        console.error(e)
      }
    }

    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRender, isTeacher, mustChangePassword])

  const selectedAssignment = useMemo(() => {
    if (!selectedAssignmentId) return null
    return assignments.find((a) => String(a.id) === selectedAssignmentId) ?? null
  }, [assignments, selectedAssignmentId])

  const periodsForSelectedYear = useMemo(() => {
    if (!selectedAssignment?.academic_year) return periods
    return periods.filter((p) => p.academic_year === selectedAssignment.academic_year)
  }, [periods, selectedAssignment?.academic_year])

  const handleDownloadGradeSheet = async () => {
    if (!selectedAssignment) {
      showToast('Selecciona una asignación', 'error')
      return
    }

    try {
      setLoadingGradeSheet(true)

      const teacherName = (selectedAssignment.teacher_name || `${lastName} ${firstName}`.trim()).trim()
      const subjectName =
        [selectedAssignment.area_name, selectedAssignment.subject_name]
          .filter(Boolean)
          .join(' - ') ||
        selectedAssignment.academic_load_name ||
        ''

      const period = selectedPeriodId ? Number(selectedPeriodId) : undefined
      const res = await academicApi.downloadGradeReportSheetPdf(selectedAssignment.group, {
        period,
        teacher: teacherName || undefined,
        subject: subjectName || undefined,
      })

      const blob = res.data as unknown as Blob
      const url = URL.createObjectURL(blob)
      const w = window.open(url, '_blank', 'noopener,noreferrer')
      if (!w) {
        const a = document.createElement('a')
        a.href = url
        a.download = `planilla_notas_grupo_${selectedAssignment.group}.pdf`
        document.body.appendChild(a)
        a.click()
        a.remove()
        showToast('Descargando planilla…', 'success')
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      console.error(e)
      showToast('No se pudo generar la planilla de notas', 'error')
    } finally {
      setLoadingGradeSheet(false)
    }
  }

  const usernameLabel = useMemo(() => {
    if (!user) return ''
    return user.username
  }, [user])

  const handleSaveProfile = async () => {
    if (!user?.id) return

    setSavingProfile(true)
    try {
      await usersApi.update(user.id, {
        first_name: firstName,
        last_name: lastName,
        email,
      })
      await fetchMe()
      showToast('Perfil actualizado correctamente', 'success')
    } catch (e) {
      console.error(e)
      showToast('Error al actualizar el perfil', 'error')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      showToast('Completa la contraseña actual y la nueva', 'error')
      return
    }
    if (newPassword !== confirmPassword) {
      showToast('La confirmación no coincide', 'error')
      return
    }

    setSavingPassword(true)
    try {
      await usersApi.changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      showToast('Contraseña actualizada correctamente', 'success')
    } catch (e: unknown) {
      console.error(e)
      type MaybeAxiosError = { response?: { data?: { detail?: unknown } } }
      const detail = (e as MaybeAxiosError)?.response?.data?.detail
      showToast(typeof detail === 'string' ? detail : 'Error al actualizar la contraseña', 'error')
    } finally {
      setSavingPassword(false)
    }
  }

  if (!canRender) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-slate-900 dark:text-slate-100">Mi cuenta</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600 dark:text-slate-300">No hay sesión activa.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {mustChangePassword && (
        <Card>
          <CardHeader>
            <CardTitle className="text-slate-900 dark:text-slate-100">Cambio obligatorio de contraseña</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-amber-700 dark:text-amber-300">
              Tu cuenta fue creada con una contraseña temporal. Debes cambiarla ahora para continuar usando la plataforma.
            </p>
          </CardContent>
        </Card>
      )}

      {isTeacher && !mustChangePassword && (
        <Card>
          <CardHeader>
            <CardTitle className="text-slate-900 dark:text-slate-100">Planillas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Asignación (grupo / asignatura)</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900"
                  value={selectedAssignmentId}
                  onChange={(e) => {
                    setSelectedAssignmentId(e.target.value)
                    setSelectedPeriodId('')
                  }}
                >
                  {assignments.length === 0 ? (
                    <option value="">No hay asignaciones</option>
                  ) : (
                    assignments.map((a) => (
                      <option key={a.id} value={a.id}>
                        {(a.group_name || `Grupo ${a.group}`) + ' — ' + (([a.area_name, a.subject_name].filter(Boolean).join(' - ') || a.academic_load_name) ?? 'Asignatura')}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <Label>Período (opcional)</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900"
                  value={selectedPeriodId}
                  onChange={(e) => setSelectedPeriodId(e.target.value)}
                  disabled={periodsForSelectedYear.length === 0}
                >
                  <option value="">(En blanco)</option>
                  {periodsForSelectedYear.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <Button
                className="bg-cyan-600 hover:bg-cyan-700 text-white"
                onClick={handleDownloadGradeSheet}
                disabled={loadingGradeSheet || !selectedAssignmentId}
              >
                {loadingGradeSheet ? 'Generando…' : 'Descargar planilla de notas'}
              </Button>

              <Button variant="outline" onClick={() => navigate('/groups')}>
                Ver grupos
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-slate-900 dark:text-slate-100">Mi cuenta</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Usuario</Label>
              <Input value={usernameLabel} disabled />
            </div>
            <div>
              <Label>Correo</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.com" />
            </div>
            <div>
              <Label>Nombres</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Nombres" />
            </div>
            <div>
              <Label className="dark:text-slate-100">Apellidos</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Apellidos" />
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end">
            <Button onClick={handleSaveProfile} disabled={savingProfile}>
              {savingProfile ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-slate-900 dark:text-slate-100">Cambiar contraseña</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="dark:text-slate-100">Contraseña actual</Label>
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>
            <div />
            <div>
              <Label>Nueva contraseña</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div>
              <Label>Confirmar nueva contraseña</Label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end">
            <Button onClick={handleChangePassword} disabled={savingPassword}>
              {savingPassword ? 'Actualizando...' : 'Actualizar contraseña'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast((t) => ({ ...t, isVisible: false }))}
      />
    </div>
  )
}
