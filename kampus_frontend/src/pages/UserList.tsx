import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { usersApi } from '../services/users'
import type { User } from '../services/users'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Plus, Search, UserCog, Trash2 } from 'lucide-react'
import { Input } from '../components/ui/Input'
import { ConfirmationModal } from '../components/ui/ConfirmationModal'

export default function UserList() {
  const [data, setData] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  
  // Modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [userToDelete, setUserToDelete] = useState<number | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = () => {
    setLoading(true)
    usersApi
      .getAll()
      .then((res) => {
        setData(res.data)
        setError(null)
      })
      .catch(() => setError('No se pudo cargar la lista de usuarios'))
      .finally(() => setLoading(false))
  }

  const filteredData = data.filter(u => 
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const openDeleteModal = (id: number) => {
    setUserToDelete(id)
    setDeleteModalOpen(true)
  }

  const confirmDelete = async () => {
    if (userToDelete === null) return

    setIsDeleting(true)
    try {
      await usersApi.delete(userToDelete)
      setData(prev => prev.filter(u => u.id !== userToDelete))
      setDeleteModalOpen(false)
      setUserToDelete(null)
    } catch (error) {
      console.error('Error deleting user:', error)
      alert('Error al eliminar el usuario')
    } finally {
      setIsDeleting(false)
    }
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'SUPERADMIN': return 'bg-purple-100 text-purple-700'
      case 'ADMIN': return 'bg-red-100 text-red-700'
      case 'COORDINATOR': return 'bg-orange-100 text-orange-700'
      case 'TEACHER': return 'bg-emerald-100 text-emerald-700'
      case 'STUDENT': return 'bg-blue-100 text-blue-700'
      default: return 'bg-slate-100 text-slate-700'
    }
  }

  const getRoleLabel = (role: string) => {
    const roles: Record<string, string> = {
      'SUPERADMIN': 'Super Admin',
      'ADMIN': 'Administrador',
      'COORDINATOR': 'Coordinador',
      'SECRETARY': 'Secretaría',
      'TEACHER': 'Docente',
      'PARENT': 'Acudiente',
      'STUDENT': 'Estudiante',
    }
    return roles[role] || role
  }

  if (loading) return <div className="p-6">Cargando usuarios...</div>
  if (error) return <div className="p-6 text-red-600">{error}</div>

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Usuarios del Sistema</h2>
          <p className="text-slate-500">Administración general de cuentas y roles.</p>
        </div>
        <Link to="/users/new">
          <Button className="w-full md:w-auto">
            <Plus className="mr-2 h-4 w-4" /> Nuevo Usuario
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <CardTitle>Listado General</CardTitle>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
              <Input 
                placeholder="Buscar usuario..." 
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                <tr>
                  <th className="px-6 py-3">Usuario</th>
                  <th className="px-6 py-3">Rol</th>
                  <th className="px-6 py-3">Email</th>
                  <th className="px-6 py-3">Estado</th>
                  <th className="px-6 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-slate-500">
                      No se encontraron usuarios.
                    </td>
                  </tr>
                ) : (
                  filteredData.map((user) => (
                    <tr key={user.id} className="bg-white border-b hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center mr-3 text-slate-600">
                            <UserCog className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="font-medium text-slate-900">
                              {user.first_name} {user.last_name}
                            </div>
                            <div className="text-xs text-slate-500">@{user.username}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(user.role)}`}>
                          {getRoleLabel(user.role)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{user.email}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                          {user.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Link to={`/users/${user.id}`}>
                            <Button variant="ghost" size="sm">Editar</Button>
                          </Link>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => openDeleteModal(user.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <ConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={confirmDelete}
        title="Eliminar Usuario"
        description="¿Estás seguro de que deseas eliminar este usuario? Esta acción no se puede deshacer y eliminará permanentemente la cuenta y todos los datos asociados."
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="destructive"
        loading={isDeleting}
      />
    </div>
  )
}
