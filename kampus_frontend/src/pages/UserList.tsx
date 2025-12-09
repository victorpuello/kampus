import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { usersApi } from '../services/users'
import type { User } from '../services/users'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Plus, Search, UserCog, Trash2, Shield, Users, CheckCircle } from 'lucide-react'
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

  // Stats
  const totalUsers = data.length
  const activeUsers = data.filter(u => u.is_active).length
  const adminUsers = data.filter(u => ['SUPERADMIN', 'ADMIN'].includes(u.role)).length

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
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-blue-100 rounded-lg">
              <UserCog className="h-6 w-6 text-blue-600" />
            </div>
            Usuarios del Sistema
          </h2>
          <p className="text-slate-500 mt-1">Administración general de cuentas y roles.</p>
        </div>
        <Link to="/users/new">
          <Button className="w-full md:w-auto bg-blue-600 hover:bg-blue-700">
            <Plus className="mr-2 h-4 w-4" /> Nuevo Usuario
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-slate-500">Total Usuarios</p>
              <Users className="h-4 w-4 text-slate-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{totalUsers}</div>
            <p className="text-xs text-slate-500 mt-1">
              Cuentas registradas
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-slate-500">Usuarios Activos</p>
              <CheckCircle className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{activeUsers}</div>
            <p className="text-xs text-slate-500 mt-1">
              Con acceso al sistema
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-slate-500">Administradores</p>
              <Shield className="h-4 w-4 text-purple-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{adminUsers}</div>
            <p className="text-xs text-slate-500 mt-1">
              Con privilegios elevados
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-white">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <CardTitle className="text-lg font-semibold text-slate-900">Listado General</CardTitle>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input 
                placeholder="Buscar por nombre, email..." 
                className="pl-9 border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 font-semibold">Usuario</th>
                  <th className="px-6 py-4 font-semibold">Rol</th>
                  <th className="px-6 py-4 font-semibold">Email</th>
                  <th className="px-6 py-4 font-semibold">Estado</th>
                  <th className="px-6 py-4 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center py-4">
                        <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                          <Search className="h-6 w-6 text-slate-400" />
                        </div>
                        <p className="font-medium text-slate-900">No se encontraron usuarios</p>
                        <p className="text-sm text-slate-500 mt-1">Intenta ajustar los filtros de búsqueda</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredData.map((user) => (
                    <tr key={user.id} className="bg-white hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center mr-3 text-slate-600 shadow-sm border border-slate-200">
                            <span className="font-bold text-sm">{user.first_name[0]}{user.last_name[0]}</span>
                          </div>
                          <div>
                            <div className="font-medium text-slate-900 uppercase">
                              {user.first_name} {user.last_name}
                            </div>
                            <div className="text-xs text-slate-500 font-mono bg-slate-50 px-1.5 py-0.5 rounded w-fit mt-0.5">@{user.username}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getRoleBadgeColor(user.role).replace('bg-', 'bg-opacity-10 bg-').replace('text-', 'border-').replace('border-', 'border-opacity-20 border-')}`}>
                          {getRoleLabel(user.role)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{user.email}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${user.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${user.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                          {user.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link to={`/users/${user.id}`}>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-blue-50 hover:text-blue-600">
                              <span className="sr-only">Editar</span>
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-pencil"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                            </Button>
                          </Link>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                            onClick={() => openDeleteModal(user.id)}
                          >
                            <span className="sr-only">Eliminar</span>
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
