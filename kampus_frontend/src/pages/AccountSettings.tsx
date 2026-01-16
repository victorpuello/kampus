import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Label } from '../components/ui/Label'
import { Toast, type ToastType } from '../components/ui/Toast'
import { usersApi } from '../services/users'
import { useAuthStore } from '../store/auth'

export default function AccountSettings() {
  const user = useAuthStore((s) => s.user)
  const fetchMe = useAuthStore((s) => s.fetchMe)

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

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  const canRender = !!user?.id

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
    } catch (e: any) {
      console.error(e)
      const detail = e?.response?.data?.detail
      showToast(detail || 'Error al actualizar la contraseña', 'error')
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
