import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { 
  LayoutDashboard, 
  Users, 
  LogOut, 
  Menu, 
  X,
  GraduationCap,
  Briefcase,
  Shield,
  Building2,
  MapPinned,
  ChevronDown,
  ChevronRight
} from 'lucide-react'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/Button'

export default function DashboardLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [expandedMenus, setExpandedMenus] = useState<string[]>([])
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const location = useLocation()

  const toggleMenu = (name: string) => {
    setExpandedMenus(prev => 
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    )
  }

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { 
      name: 'Estudiantes', 
      icon: Users,
      children: [
        { name: 'Directorio', href: '/students' },
        { name: 'Matrículas', href: '/enrollments' },
        { name: 'Reportes', href: '/enrollments/reports' },
      ]
    },
    { name: 'Docentes', href: '/teachers', icon: Briefcase },
    { name: 'Usuarios', href: '/users', icon: Shield },
    { name: 'Académico', href: '/academic-config', icon: GraduationCap },
    { name: 'Institución', href: '/institution', icon: Building2 },
    { name: 'Sedes', href: '/campuses', icon: MapPinned },
  ]

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile sidebar backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Sidebar Header */}
          <div className="flex items-center justify-between h-16 px-6 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">K</span>
              </div>
              <span className="text-xl font-bold text-slate-900">Kampus</span>
            </div>
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="lg:hidden text-slate-500 hover:text-slate-700"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              if (item.children) {
                const isExpanded = expandedMenus.includes(item.name)
                const isActive = item.children.some(child => location.pathname === child.href)
                
                return (
                  <div key={item.name}>
                    <button
                      onClick={() => toggleMenu(item.name)}
                      className={cn(
                        "w-full flex items-center justify-between px-4 py-3 text-sm font-medium rounded-lg transition-colors",
                        isActive 
                          ? "bg-blue-50 text-blue-700" 
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      )}
                    >
                      <div className="flex items-center">
                        <item.icon className={cn("w-5 h-5 mr-3", isActive ? "text-blue-600" : "text-slate-400")} />
                        {item.name}
                      </div>
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    
                    {isExpanded && (
                      <div className="mt-1 ml-4 space-y-1 border-l-2 border-slate-100 pl-4">
                        {item.children.map(child => {
                           const isChildActive = location.pathname === child.href
                           return (
                             <Link
                               key={child.name}
                               to={child.href}
                               className={cn(
                                 "block px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                                 isChildActive
                                   ? "text-blue-700 bg-blue-50"
                                   : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                               )}
                             >
                               {child.name}
                             </Link>
                           )
                        })}
                      </div>
                    )}
                  </div>
                )
              }

              const isActive = location.pathname === item.href
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    "flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors",
                    isActive 
                      ? "bg-blue-50 text-blue-700" 
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <item.icon className={cn("w-5 h-5 mr-3", isActive ? "text-blue-600" : "text-slate-400")} />
                  {item.name}
                </Link>
              )
            })}
          </nav>

          {/* User Profile & Logout */}
          <div className="p-4 border-t border-slate-100">
            <div className="flex items-center p-4 bg-slate-50 rounded-lg mb-4">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold">
                {user?.first_name?.[0] || user?.username?.[0] || 'U'}
              </div>
              <div className="ml-3 overflow-hidden">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {user?.first_name || user?.username}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {user?.email || 'Usuario'}
                </p>
              </div>
            </div>
            <Button 
              variant="outline" 
              className="w-full justify-start text-slate-600 hover:text-red-600 hover:bg-red-50 hover:border-red-200"
              onClick={logout}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Cerrar sesión
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen w-full">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between h-16 px-4 bg-white border-b border-slate-200">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="text-slate-500 hover:text-slate-700"
          >
            <Menu className="w-6 h-6" />
          </button>
          <span className="font-semibold text-slate-900">Kampus</span>
          <div className="w-6" /> {/* Spacer for centering */}
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-8 overflow-auto">
          <div className="w-full mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
