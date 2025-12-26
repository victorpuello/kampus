import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { 
  LayoutDashboard, 
  Users, 
  LogOut, 
  Menu, 
  X,
  Bell,
  GraduationCap,
  Building2,
  ChevronDown,
  ChevronRight
} from 'lucide-react'
import { cn } from '../lib/utils'
import { academicApi } from '../services/academic'
import { emitNotificationsUpdated, notificationsApi, onNotificationsUpdated, type Notification } from '../services/notifications'

type NavigationChild = { name: string; href: string }
type NavigationItem =
  | {
      name: string
      href: string
      icon: any
      badgeCount?: number
      children?: never
    }
  | {
      name: string
      icon: any
      children: NavigationChild[]
      href?: never
    }

export default function DashboardLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [expandedMenus, setExpandedMenus] = useState<string[]>([])
  const [teacherHasDirectedGroup, setTeacherHasDirectedGroup] = useState<boolean>(false)
  const [unreadNotifications, setUnreadNotifications] = useState<number>(0)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [unreadNotificationItems, setUnreadNotificationItems] = useState<Notification[]>([])
  const userMenuRef = useRef<HTMLDivElement | null>(null)
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const location = useLocation()

  const canManageRbac = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN'
  const isTeacher = user?.role === 'TEACHER'

  const EXPANDED_MENU_STORAGE_KEY = 'kampus.sidebar.expandedMenu'

  const isPathActive = (href: string) => {
    if (!href) return false
    if (href === '/') return location.pathname === '/'
    return location.pathname === href || location.pathname.startsWith(href + '/')
  }

  useEffect(() => {
    let mounted = true

    if (!isTeacher || !user?.id) {
      setTeacherHasDirectedGroup(false)
      return
    }

    ;(async () => {
      try {
        const yearsRes = await academicApi.listYears()
        const activeYear = yearsRes.data.find((y) => y.status === 'ACTIVE')
        const groupsRes = await academicApi.listGroups({
          director: user.id,
          ...(activeYear ? { academic_year: activeYear.id } : {}),
        })
        if (!mounted) return
        setTeacherHasDirectedGroup(groupsRes.data.length > 0)
      } catch {
        if (!mounted) return
        setTeacherHasDirectedGroup(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [isTeacher, user?.id])

  useEffect(() => {
    let mounted = true
    let interval: any = null

    const load = async () => {
      try {
        const res = await notificationsApi.unreadCount()
        if (!mounted) return
        setUnreadNotifications(res.data.unread || 0)
      } catch {
        if (!mounted) return
        setUnreadNotifications(0)
      }
    }

    // Only poll when authenticated
    if (user?.id) {
      load()
      interval = setInterval(load, 30000)
    } else {
      setUnreadNotifications(0)
    }

    return () => {
      mounted = false
      if (interval) clearInterval(interval)
    }
  }, [user?.id])

  useEffect(() => {
    let mounted = true

    const refresh = async () => {
      if (!user?.id) return
      try {
        const res = await notificationsApi.unreadCount()
        if (!mounted) return
        setUnreadNotifications(res.data.unread || 0)
      } catch {
        // ignore
      }
    }

    const unsubscribe = onNotificationsUpdated(() => {
      refresh()
      if (userMenuOpen) {
        loadUnreadNotificationsPreview()
      }
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [user?.id, userMenuOpen])

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (!userMenuOpen) return
      const el = userMenuRef.current
      if (!el) return
      if (e.target instanceof Node && !el.contains(e.target)) {
        setUserMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [userMenuOpen])

  useEffect(() => {
    // Close user menu on navigation
    setUserMenuOpen(false)
  }, [location.pathname])

  const loadUnreadNotificationsPreview = async () => {
    try {
      const res = await notificationsApi.list()
      const unread = (res.data || []).filter((n) => !n.is_read)
      setUnreadNotificationItems(unread.slice(0, 5))
    } catch {
      setUnreadNotificationItems([])
    }
  }

  const handleUnreadNotificationClick = (n: Notification) => {
    setUserMenuOpen(false)

    // Optimistic UI
    setUnreadNotificationItems((prev) => prev.filter((x) => x.id !== n.id))
    setUnreadNotifications((prev) => Math.max(0, (prev || 0) - 1))

    // Best-effort server update
    notificationsApi.markRead(n.id).catch(() => {
      // If it fails, the notifications screen will reflect the real state.
    })

    emitNotificationsUpdated()
  }

  const getMenuDomId = (name: string) => `submenu-${name.toLowerCase().replace(/\s+/g, '-')}`

  const toggleMenu = (name: string) => {
    setExpandedMenus((prev) => {
      const isOpen = prev.includes(name)
      if (isOpen) {
        try {
          localStorage.removeItem(EXPANDED_MENU_STORAGE_KEY)
        } catch {
          // ignore
        }
        return prev.filter((n) => n !== name)
      }

      // Accordion behavior: keep only one menu open.
      // The active menu (current route) will be re-added by the auto-expand effect if needed.
      try {
        localStorage.setItem(EXPANDED_MENU_STORAGE_KEY, name)
      } catch {
        // ignore
      }
      return [name]
    })
  }

  const navigation: NavigationItem[] = useMemo(() => {
    if (isTeacher) {
      const items: NavigationItem[] = [
        { name: 'Dashboard', href: '/', icon: LayoutDashboard },
        { name: 'Notificaciones', href: '/notifications', icon: Bell, badgeCount: unreadNotifications },
      ]

      items.push({
        name: 'Académico',
        icon: GraduationCap,
        children: [
          { name: 'Planeación', href: '/planning' },
          { name: 'Calificaciones', href: '/grades' },
          { name: 'Solicitudes (Notas)', href: '/edit-requests/grades' },
          { name: 'Solicitudes (Planeación)', href: '/edit-requests/planning' },
          { name: 'Asignación', href: '/my-assignment' },
        ],
      })

      if (teacherHasDirectedGroup) {
        items.push({ name: 'Estudiantes', href: '/students', icon: Users })
      }

      return items
    }

    const managementChildren: NavigationChild[] = [
      { name: 'Estudiantes', href: '/students' },
      { name: 'Matrículas', href: '/enrollments' },
      { name: 'Reportes', href: '/enrollments/reports' },
      { name: 'Docentes', href: '/teachers' },
      { name: 'Usuarios', href: '/users' },
      ...(canManageRbac ? [{ name: 'Permisos', href: '/rbac' }] : []),
    ]

    return [
      { name: 'Dashboard', href: '/', icon: LayoutDashboard },
      { name: 'Notificaciones', href: '/notifications', icon: Bell, badgeCount: unreadNotifications },
      {
        name: 'Gestión',
        icon: Users,
        children: managementChildren,
      },
      {
        name: 'Académico',
        icon: GraduationCap,
        children: [
          { name: 'Configuración', href: '/academic-config' },
          { name: 'Planeación', href: '/planning' },
          { name: 'Calificaciones', href: '/grades' },
          { name: 'Solicitudes (Notas)', href: '/edit-requests/grades' },
          { name: 'Solicitudes (Planeación)', href: '/edit-requests/planning' },
        ],
      },
      {
        name: 'Configuración',
        icon: Building2,
        children: [
          { name: 'Institución', href: '/institution' },
          { name: 'Sedes', href: '/campuses' },
        ],
      },
    ]
  }, [canManageRbac, isTeacher, teacherHasDirectedGroup, unreadNotifications])

  useEffect(() => {
    // Ensure the active submenu is expanded so the user can see where they are.
    const activeParents = navigation
      .filter((item): item is Extract<NavigationItem, { children: NavigationChild[] }> => 'children' in item)
      .filter((item) => item.children.some((c) => isPathActive(c.href)))
      .map((item) => item.name)

    if (activeParents.length === 0) {
      // If route doesn't require an expanded submenu, restore last user selection.
      let stored: string | null = null
      try {
        stored = localStorage.getItem(EXPANDED_MENU_STORAGE_KEY)
      } catch {
        stored = null
      }

      if (!stored) return
      const exists = navigation.some(
        (item) => 'children' in item && item.name === stored
      )
      if (!exists) return

      setExpandedMenus((prev) => (prev.length > 0 ? prev : [stored as string]))
      return
    }

    setExpandedMenus((prev) => {
      const next = new Set(prev)
      activeParents.forEach((p) => next.add(p))
      return Array.from(next)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, navigation])

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-60 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-slate-900 focus:ring-2 focus:ring-blue-500"
      >
        Saltar al contenido
      </a>
      {/* Mobile sidebar backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-200 ease-in-out lg:translate-x-0",
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
              aria-label="Cerrar menú"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              if (item.children) {
                const isExpanded = expandedMenus.includes(item.name)
                const isActive = item.children.some(child => isPathActive(child.href))
                const menuDomId = getMenuDomId(item.name)
                
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
                      aria-expanded={isExpanded}
                      aria-controls={menuDomId}
                    >
                      <div className="flex items-center">
                        <item.icon className={cn("w-5 h-5 mr-3", isActive ? "text-blue-600" : "text-slate-400")} />
                        {item.name}
                      </div>
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    
                    {isExpanded && (
                      <div id={menuDomId} className="mt-1 ml-4 space-y-1 border-l-2 border-slate-100 pl-4">
                        {item.children.map(child => {
                           const isChildActive = isPathActive(child.href)
                           return (
                             <Link
                               key={child.name}
                               to={child.href}
                               onClick={() => setIsSidebarOpen(false)}
                               className={cn(
                                 "block px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                                 isChildActive
                                   ? "text-blue-700 bg-blue-50"
                                   : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                               )}
                               aria-current={isChildActive ? 'page' : undefined}
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

              const isActive = isPathActive(item.href)
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setIsSidebarOpen(false)}
                  className={cn(
                    "flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors",
                    isActive 
                      ? "bg-blue-50 text-blue-700" 
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <item.icon className={cn("w-5 h-5 mr-3", isActive ? "text-blue-600" : "text-slate-400")} />
                  <span className="flex-1">{item.name}</span>
                  {!!item.badgeCount && item.badgeCount > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                      {item.badgeCount}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>

          {/* User Profile & Logout */}
          <div className="p-4 border-t border-slate-100">
            <div ref={userMenuRef} className="relative">
              {userMenuOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-2 rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {user?.first_name || user?.username}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{user?.email || 'Usuario'}</p>
                  </div>

                  <div className="p-2 space-y-1">
                    <Link
                      to="/account"
                      className="flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <span>Mi cuenta</span>
                      <span className="text-xs text-slate-400">Perfil y contraseña</span>
                    </Link>

                    <Link
                      to="/notifications"
                      className="flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <span className="flex items-center">
                        <Bell className="w-4 h-4 mr-2 text-slate-400" />
                        Notificaciones
                      </span>
                      {!!unreadNotifications && unreadNotifications > 0 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                          {unreadNotifications}
                        </span>
                      )}
                    </Link>

                    {unreadNotificationItems.length > 0 && (
                      <div className="px-3 py-2">
                        <p className="text-xs font-semibold text-slate-500 uppercase">Pendientes</p>
                        <div className="mt-2 space-y-1">
                          {unreadNotificationItems.map((n) => (
                            <Link
                              key={n.id}
                              to={n.url || '/notifications'}
                              className="block rounded-md border border-slate-100 px-3 py-2 hover:bg-slate-50"
                              title={n.title}
                              onClick={() => handleUnreadNotificationClick(n)}
                            >
                              <p className="text-sm font-medium text-slate-800 line-clamp-1">{n.title}</p>
                              <p className="text-xs text-slate-500 line-clamp-1">{n.body}</p>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="p-2 border-t border-slate-100">
                    <button
                      className="w-full flex items-center px-3 py-2 rounded-md text-sm font-medium text-slate-700 hover:text-red-700 hover:bg-red-50"
                      onClick={logout}
                      type="button"
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      Cerrar sesión
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                className={cn(
                  "w-full flex items-center p-4 rounded-lg border transition-colors",
                  userMenuOpen
                    ? "bg-white border-slate-200"
                    : "bg-slate-50 border-slate-100 hover:bg-slate-100"
                )}
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                onClick={async () => {
                  const next = !userMenuOpen
                  setUserMenuOpen(next)
                  if (next) {
                    await loadUnreadNotificationsPreview()
                  }
                }}
              >
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold">
                  {user?.first_name?.[0] || user?.username?.[0] || 'U'}
                </div>
                <div className="ml-3 flex-1 overflow-hidden text-left">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {user?.first_name || user?.username}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{user?.email || 'Usuario'}</p>
                </div>
                <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", userMenuOpen ? "rotate-180" : "")} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen w-full lg:ml-64">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between h-16 px-4 bg-white border-b border-slate-200">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="text-slate-500 hover:text-slate-700"
            aria-label="Abrir menú"
          >
            <Menu className="w-6 h-6" />
          </button>
          <span className="font-semibold text-slate-900">Kampus</span>
          <div className="w-6" /> {/* Spacer for centering */}
        </header>

        {/* Page Content */}
        <main id="main-content" tabIndex={-1} className="flex-1 p-4 lg:p-8 overflow-auto">
          <div className="w-full mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
