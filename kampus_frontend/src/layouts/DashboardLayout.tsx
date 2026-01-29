import { type ComponentType, useEffect, useMemo, useRef, useState } from 'react'
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
  FileText,
  BarChart3,
  Sun,
  Moon,
  ChevronDown,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { cn } from '../lib/utils'
import { academicApi } from '../services/academic'
import { emitNotificationsUpdated, notificationsApi, onNotificationsUpdated, type Notification } from '../services/notifications'
import { applyThemeMode, getInitialThemeMode, resolveTheme, toggleThemeMode as toggleThemeModeUtil, type ThemeMode } from '../theme/theme'

type NavigationLinkChild = { name: string; href: string }
type NavigationGroupChild = { name: string; children: NavigationLinkChild[] }
type NavigationChild = NavigationLinkChild | NavigationGroupChild
type NavigationItem =
  | {
      name: string
      href: string
      icon: ComponentType<{ className?: string }>
      badgeCount?: number
      children?: never
    }
  | {
      name: string
      icon: ComponentType<{ className?: string }>
      children: NavigationChild[]
      href?: never
    }

export default function DashboardLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isDesktop, setIsDesktop] = useState(true)
  const [expandedMenus, setExpandedMenus] = useState<string[]>([])
  const [expandedChildGroups, setExpandedChildGroups] = useState<string[]>([])
  const [teacherHasDirectedGroup, setTeacherHasDirectedGroup] = useState<boolean>(false)
  const [teacherHasPreschoolAssignments, setTeacherHasPreschoolAssignments] = useState<boolean>(false)
  const [teacherHasNonPreschoolAssignments, setTeacherHasNonPreschoolAssignments] = useState<boolean>(false)
  const [unreadNotifications, setUnreadNotifications] = useState<number>(0)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [unreadNotificationItems, setUnreadNotificationItems] = useState<Notification[]>([])
  const userMenuRef = useRef<HTMLDivElement | null>(null)
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const location = useLocation()

  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getInitialThemeMode())
  const resolvedTheme = useMemo(() => resolveTheme(themeMode), [themeMode])
  const isDarkMode = resolvedTheme === 'dark'

  useEffect(() => {
    // Keep DOM in sync (important if another tab modifies storage).
    applyThemeMode(themeMode)

    if (themeMode !== 'auto') return

    const now = new Date()
    const next = new Date(now)
    const hour = now.getHours()

    // Next switch at 06:00 or 18:00.
    if (hour < 6) {
      next.setHours(6, 0, 0, 0)
    } else if (hour < 18) {
      next.setHours(18, 0, 0, 0)
    } else {
      next.setDate(next.getDate() + 1)
      next.setHours(6, 0, 0, 0)
    }

    const ms = Math.max(0, next.getTime() - now.getTime())
    const timer = window.setTimeout(() => {
      // Re-apply to flip dark/light when boundary is reached.
      applyThemeMode('auto')
    }, ms + 50)

    return () => window.clearTimeout(timer)
  }, [themeMode])

  const toggleTheme = () => {
    setThemeMode((current) => toggleThemeModeUtil(current))
  }

  const canManageRbac = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN'
  const isTeacher = user?.role === 'TEACHER'
  const isParent = user?.role === 'PARENT'
  const isAdministrativeStaff =
    user?.role === 'ADMIN' ||
    user?.role === 'SUPERADMIN' ||
    user?.role === 'COORDINATOR' ||
    user?.role === 'SECRETARY'

  const EXPANDED_MENU_STORAGE_KEY = 'kampus.sidebar.expandedMenu'
  const COLLAPSED_SIDEBAR_STORAGE_KEY = 'kampus.sidebar.collapsed'

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')

    const update = (matches: boolean) => {
      setIsDesktop(matches)
    }

    update(mq.matches)

    const handler = (e: MediaQueryListEvent) => update(e.matches)

    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }

    // Legacy Safari fallback
    const legacyMq = mq as MediaQueryList & {
      addListener: (listener: (e: MediaQueryListEvent) => void) => void
      removeListener: (listener: (e: MediaQueryListEvent) => void) => void
    }
    legacyMq.addListener(handler)
    return () => legacyMq.removeListener(handler)
  }, [])

  const isCollapsed = isDesktop && isSidebarCollapsed

  useEffect(() => {
    try {
      const stored = localStorage.getItem(COLLAPSED_SIDEBAR_STORAGE_KEY)
      setIsSidebarCollapsed(stored === 'true')
    } catch {
      setIsSidebarCollapsed(false)
    }
  }, [])

  const toggleSidebarCollapsed = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(COLLAPSED_SIDEBAR_STORAGE_KEY, next ? 'true' : 'false')
      } catch {
        // ignore
      }
      return next
    })
  }

  const isPathActive = (href: string) => {
    if (!href) return false
    if (href === '/') return location.pathname === '/'
    return location.pathname === href || location.pathname.startsWith(href + '/')
  }

  const isChildActive = (child: NavigationChild) => {
    if ('href' in child) return isPathActive(child.href)
    return child.children.some((c) => isPathActive(c.href))
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

    if (!isTeacher || !user?.id) {
      setTeacherHasPreschoolAssignments(false)
      setTeacherHasNonPreschoolAssignments(false)
      return
    }

    ;(async () => {
      try {
        const [yearsRes, levelsRes, gradesRes] = await Promise.all([
          academicApi.listYears(),
          academicApi.listLevels(),
          academicApi.listGrades(),
        ])

        const activeYear = yearsRes.data.find((y) => y.status === 'ACTIVE')
        if (!activeYear) {
          if (!mounted) return
          setTeacherHasPreschoolAssignments(false)
          setTeacherHasNonPreschoolAssignments(false)
          return
        }

        const assignmentsRes = await academicApi.listMyAssignments({ academic_year: activeYear.id })

        const levelTypeById = new Map<number, string>()
        for (const l of levelsRes.data) levelTypeById.set(l.id, l.level_type)

        const gradeLevelByGradeId = new Map<number, number | null>()
        for (const g of gradesRes.data) gradeLevelByGradeId.set(g.id, g.level)

        const groupIds = Array.from(new Set(assignmentsRes.data.map((a) => a.group)))
        const groups = await Promise.all(groupIds.map((id) => academicApi.getGroup(id).then((r) => r.data).catch(() => null)))

        let hasPreschool = false
        let hasNonPreschool = false

        for (const group of groups.filter((g): g is NonNullable<typeof g> => g !== null)) {
          const levelId = gradeLevelByGradeId.get(group.grade) ?? null
          if (!levelId) continue
          const levelType = levelTypeById.get(levelId)
          if (levelType === 'PRESCHOOL') hasPreschool = true
          else hasNonPreschool = true
        }

        if (!mounted) return
        setTeacherHasPreschoolAssignments(hasPreschool)
        setTeacherHasNonPreschoolAssignments(hasNonPreschool)
      } catch {
        if (!mounted) return
        setTeacherHasPreschoolAssignments(false)
        setTeacherHasNonPreschoolAssignments(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [isTeacher, user?.id])

  useEffect(() => {
    let mounted = true
    let interval: ReturnType<typeof setInterval> | null = null

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
  const getChildGroupDomId = (parentName: string, groupName: string) =>
    `submenu-${parentName.toLowerCase().replace(/\s+/g, '-')}-${groupName.toLowerCase().replace(/\s+/g, '-')}`

  const getChildGroupKey = (parentName: string, groupName: string) => `${parentName}::${groupName}`

  const toggleChildGroup = (parentName: string, groupName: string) => {
    const key = getChildGroupKey(parentName, groupName)
    setExpandedChildGroups((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]))
  }

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
    if (isParent) {
      return [
        { name: 'Dashboard', href: '/', icon: LayoutDashboard },
        { name: 'Notificaciones', href: '/notifications', icon: Bell, badgeCount: unreadNotifications },
        { name: 'Convivencia', href: '/discipline/cases', icon: Users },
      ]
    }

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
          ...(teacherHasPreschoolAssignments && !teacherHasNonPreschoolAssignments
            ? [{ name: 'Calificaciones', href: '/grades/preschool' }]
            : [
                { name: 'Calificaciones', href: '/grades' },
                ...(teacherHasPreschoolAssignments
                  ? [{ name: 'Preescolar (Cualitativa)', href: '/grades/preschool' }]
                  : []),
              ]),
          { name: 'Asistencias', href: '/attendance' },
          { name: 'Asignación', href: '/my-assignment' },
          { name: 'Convivencia', href: '/discipline/cases' },
        ],
      })

      if (teacherHasDirectedGroup) {
        items.push({ name: 'Estudiantes', href: '/students', icon: Users })
      }

      items.push({
        name: 'Solicitudes',
        icon: FileText,
        children: [
          { name: 'Solicitudes (Notas)', href: '/edit-requests/grades' },
          { name: 'Solicitudes (Planeación)', href: '/edit-requests/planning' },
        ],
      })

      items.push({ name: 'Estadísticas', href: '/teacher-stats', icon: BarChart3 })

      return items
    }

    const managementChildren: NavigationChild[] = [
      { name: 'Estudiantes', href: '/students' },
      {
        name: 'Matrículas',
        children: [
          { name: 'Listado', href: '/enrollments' },
          { name: 'Carga masiva', href: '/enrollments/bulk-upload' },
        ],
      },
      { name: 'Novedades', href: '/novelties' },
      { name: 'Grupos', href: '/groups' },
      { name: 'Asistencias', href: '/attendance' },
      { name: 'Convivencia', href: '/discipline/cases' },
      { name: 'Docentes', href: '/teachers' },
    ]

    const usersChildren: NavigationChild[] = [
      { name: 'Usuarios', href: '/users' },
      ...(canManageRbac ? [{ name: 'Permisos', href: '/rbac' }] : []),
    ]

    const administrativeChildren: NavigationChild[] = [
      { name: 'Certificados', href: '/administrativos/certificados' },
      { name: 'Ingresos (Certificados)', href: '/administrativos/certificados/ingresos' },
    ]

    return [
      { name: 'Dashboard', href: '/', icon: LayoutDashboard },
      { name: 'Notificaciones', href: '/notifications', icon: Bell, badgeCount: unreadNotifications },
      {
        name: 'Gestión',
        icon: Users,
        children: managementChildren,
      },
      { name: 'Reportes', href: '/enrollments/reports', icon: FileText },
      ...(isAdministrativeStaff
        ? [
            {
              name: 'Administrativos',
              icon: FileText,
              children: administrativeChildren,
            } as NavigationItem,
          ]
        : []),
      {
        name: 'Usuarios',
        icon: Users,
        children: usersChildren,
      },
      {
        name: 'Académico',
        icon: GraduationCap,
        children: [
          { name: 'Configuración', href: '/academic-config' },
          { name: 'Planeación', href: '/planning' },
          { name: 'Calificaciones', href: '/grades' },
          {
            name: 'Solicitudes',
            children: [
              { name: 'Solicitudes (Notas)', href: '/edit-requests/grades' },
              { name: 'Solicitudes (Planeación)', href: '/edit-requests/planning' },
            ],
          },
          { name: 'Promoción anual', href: '/promotion' },
          { name: 'PAP', href: '/pap' },
        ],
      },
      {
        name: 'Configuración',
        icon: Building2,
        children: [
          { name: 'Institución', href: '/institution' },
          { name: 'Sedes', href: '/campuses' },
          ...(canManageRbac ? [{ name: 'Sistema', href: '/system' }] : []),
        ],
      },
    ]
  }, [
    canManageRbac,
    isAdministrativeStaff,
    isParent,
    isTeacher,
    teacherHasDirectedGroup,
    teacherHasNonPreschoolAssignments,
    teacherHasPreschoolAssignments,
    unreadNotifications,
  ])

  useEffect(() => {
    // Ensure the active submenu is expanded so the user can see where they are.
    const activeParents = navigation
      .filter((item): item is Extract<NavigationItem, { children: NavigationChild[] }> => 'children' in item)
      .filter((item) => item.children.some((c) => isChildActive(c)))
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

    // Ensure nested groups are expanded when active.
    const nextChildGroups: string[] = []
    navigation
      .filter((item): item is Extract<NavigationItem, { children: NavigationChild[] }> => 'children' in item)
      .forEach((item) => {
        item.children.forEach((child) => {
          if ('children' in child) {
            const hasActiveGrandchild = child.children.some((c) => isPathActive(c.href))
            if (hasActiveGrandchild) {
              nextChildGroups.push(getChildGroupKey(item.name, child.name))
            }
          }
        })
      })

    if (nextChildGroups.length > 0) {
      setExpandedChildGroups((prev) => {
        const set = new Set(prev)
        nextChildGroups.forEach((k) => set.add(k))
        return Array.from(set)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, navigation])

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-60 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-slate-900 focus:ring-2 focus:ring-blue-500 dark:focus:bg-slate-900 dark:focus:text-slate-100"
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
        "fixed inset-y-0 left-0 z-50 bg-white shadow-lg transform transition-all duration-200 ease-in-out lg:translate-x-0 dark:bg-slate-900 dark:shadow-black/30",
        'w-64',
        isCollapsed ? 'lg:w-20' : 'lg:w-64',
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Sidebar Header */}
          <div className={cn(
            'flex items-center justify-between h-16 border-b border-slate-100 dark:border-slate-800',
            isCollapsed ? 'px-4' : 'px-6'
          )}>
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">K</span>
              </div>
              {!isCollapsed && <span className="text-xl font-bold text-slate-900 dark:text-slate-100">Kampus</span>}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleSidebarCollapsed}
                className="hidden lg:inline-flex text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-100"
                aria-label={isCollapsed ? 'Expandir menú' : 'Colapsar menú'}
                title={isCollapsed ? 'Expandir menú' : 'Colapsar menú'}
              >
                {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
              </button>

              <button 
                onClick={() => setIsSidebarOpen(false)}
                className="lg:hidden text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-100"
                aria-label="Cerrar menú"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Navigation */}
          <nav className={cn('flex-1 py-6 space-y-1 overflow-y-auto', isCollapsed ? 'px-2 lg:px-2' : 'px-4 lg:px-4')}>
            {navigation.map((item) => {
              if (item.children) {
                const isExpanded = expandedMenus.includes(item.name)
                const isActive = item.children.some((child) => isChildActive(child))
                const menuDomId = getMenuDomId(item.name)
                
                return (
                  <div key={item.name}>
                    <button
                      onClick={() => {
                        if (isCollapsed) {
                          setIsSidebarCollapsed(false)
                          try {
                            localStorage.setItem(COLLAPSED_SIDEBAR_STORAGE_KEY, 'false')
                            localStorage.setItem(EXPANDED_MENU_STORAGE_KEY, item.name)
                          } catch {
                            // ignore
                          }
                          setExpandedMenus([item.name])
                          return
                        }

                        toggleMenu(item.name)
                      }}
                      className={cn(
                        "w-full flex items-center justify-between px-4 py-3 text-sm font-medium rounded-lg transition-colors",
                        isActive 
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200" 
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                      )}
                      aria-expanded={isExpanded}
                      aria-controls={menuDomId}
                      aria-label={item.name}
                      title={item.name}
                    >
                      <div className={cn('flex items-center', isCollapsed ? 'justify-center w-full' : '')}>
                        <item.icon className={cn("w-5 h-5", isActive ? "text-blue-600 dark:text-blue-300" : "text-slate-400 dark:text-slate-400", !isCollapsed && 'mr-3')} />
                        {!isCollapsed && item.name}
                      </div>
                      {!isCollapsed && (isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />)}
                    </button>
                    
                    {isExpanded && !isCollapsed && (
                      <div id={menuDomId} className="mt-1 ml-4 space-y-1 border-l-2 border-slate-100 pl-4 dark:border-slate-800">
                        {item.children.map((child) => {
                          if ('href' in child) {
                            const active = isPathActive(child.href)
                            return (
                              <Link
                                key={child.name}
                                to={child.href}
                                onClick={() => setIsSidebarOpen(false)}
                                className={cn(
                                  "block px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                                  active
                                    ? "text-blue-700 bg-blue-50 dark:text-blue-200 dark:bg-blue-950/40"
                                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800"
                                )}
                                aria-current={active ? 'page' : undefined}
                              >
                                {child.name}
                              </Link>
                            )
                          }

                          const groupKey = getChildGroupKey(item.name, child.name)
                          const isGroupExpanded = expandedChildGroups.includes(groupKey)
                          const groupDomId = getChildGroupDomId(item.name, child.name)
                          const groupHasActive = child.children.some((c) => isPathActive(c.href))

                          return (
                            <div key={child.name} className="pt-2">
                              <button
                                type="button"
                                onClick={() => toggleChildGroup(item.name, child.name)}
                                className={cn(
                                  'w-full flex items-center justify-between px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                                  groupHasActive
                                    ? 'text-blue-700 bg-blue-50 dark:text-blue-200 dark:bg-blue-950/40'
                                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800'
                                )}
                                aria-expanded={isGroupExpanded}
                                aria-controls={groupDomId}
                              >
                                <span>{child.name}</span>
                                {isGroupExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </button>

                              {isGroupExpanded && (
                                <div id={groupDomId} className="mt-1 space-y-1">
                                  {child.children.map((grandChild) => {
                                    const active = isPathActive(grandChild.href)
                                    return (
                                      <Link
                                        key={grandChild.name}
                                        to={grandChild.href}
                                        onClick={() => setIsSidebarOpen(false)}
                                        className={cn(
                                          "block px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                                          active
                                            ? "text-blue-700 bg-blue-50 dark:text-blue-200 dark:bg-blue-950/40"
                                            : "text-slate-500 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800"
                                        )}
                                        aria-current={active ? 'page' : undefined}
                                      >
                                        {grandChild.name}
                                      </Link>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
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
                    isCollapsed && 'justify-center',
                    isActive 
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200" 
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                  )}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={item.name}
                  title={item.name}
                >
                  <item.icon className={cn("w-5 h-5", isActive ? "text-blue-600 dark:text-blue-300" : "text-slate-400 dark:text-slate-400", !isCollapsed && 'mr-3')} />
                  {!isCollapsed && <span className="flex-1">{item.name}</span>}
                  {!isCollapsed && !!item.badgeCount && item.badgeCount > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/30 dark:text-blue-200 dark:border-blue-900/40">
                      {item.badgeCount}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>

          {/* User Profile & Logout */}
          <div className="p-4 border-t border-slate-100 dark:border-slate-800">
            <div ref={userMenuRef} className="relative">
              {userMenuOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-2 rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/30">
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {user?.first_name || user?.username}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user?.email || 'Usuario'}</p>
                  </div>

                  <div className="p-2 space-y-1">
                    <Link
                      to="/account"
                      className="flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <span>Mi cuenta</span>
                      <span className="text-xs text-slate-400 dark:text-slate-500">Perfil y contraseña</span>
                    </Link>

                    <Link
                      to="/notifications"
                      className="flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <span className="flex items-center">
                        <Bell className="w-4 h-4 mr-2 text-slate-400 dark:text-slate-500" />
                        Notificaciones
                      </span>
                      {!!unreadNotifications && unreadNotifications > 0 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/30 dark:text-blue-200 dark:border-blue-900/40">
                          {unreadNotifications}
                        </span>
                      )}
                    </Link>

                    {unreadNotificationItems.length > 0 && (
                      <div className="px-3 py-2">
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Pendientes</p>
                        <div className="mt-2 space-y-1">
                          {unreadNotificationItems.map((n) => (
                            <Link
                              key={n.id}
                              to={n.url || '/notifications'}
                              className="block rounded-md border border-slate-100 px-3 py-2 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                              title={n.title}
                              onClick={() => handleUnreadNotificationClick(n)}
                            >
                              <p className="text-sm font-medium text-slate-800 dark:text-slate-100 line-clamp-1">{n.title}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{n.body}</p>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      className="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                      onClick={toggleTheme}
                    >
                      <span className="flex items-center">
                        {isDarkMode ? <Sun className="w-4 h-4 mr-2 text-slate-400 dark:text-slate-500" /> : <Moon className="w-4 h-4 mr-2 text-slate-400 dark:text-slate-500" />}
                        Apariencia
                      </span>
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {themeMode === 'auto' ? `Auto (${isDarkMode ? 'Oscuro' : 'Claro'})` : isDarkMode ? 'Oscuro' : 'Claro'}
                      </span>
                    </button>
                  </div>

                  <div className="p-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      className="w-full flex items-center px-3 py-2 rounded-md text-sm font-medium text-slate-700 hover:text-red-700 hover:bg-red-50 dark:text-slate-200 dark:hover:text-red-200 dark:hover:bg-red-950/30"
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
                  isCollapsed && 'justify-center',
                  userMenuOpen
                    ? "bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-800"
                    : "bg-slate-50 border-slate-100 hover:bg-slate-100 dark:bg-slate-900/40 dark:border-slate-800 dark:hover:bg-slate-800/60"
                )}
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                onClick={async () => {
                  if (isCollapsed) {
                    setIsSidebarCollapsed(false)
                    try {
                      localStorage.setItem(COLLAPSED_SIDEBAR_STORAGE_KEY, 'false')
                    } catch {
                      // ignore
                    }
                  }

                  const next = !userMenuOpen
                  setUserMenuOpen(next)
                  if (next) {
                    await loadUnreadNotificationsPreview()
                  }
                }}
              >
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold dark:bg-blue-950/30 dark:text-blue-200">
                  {user?.first_name?.[0] || user?.username?.[0] || 'U'}
                </div>
                {!isCollapsed && (
                  <>
                    <div className="ml-3 flex-1 overflow-hidden text-left">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {user?.first_name || user?.username}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user?.email || 'Usuario'}</p>
                    </div>
                    <ChevronDown className={cn("w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform", userMenuOpen ? "rotate-180" : "")} />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div
        className={cn(
          'flex-1 flex flex-col min-h-screen w-full min-w-0',
          // Sidebar is `position: fixed`, so we reserve space using padding (not margin)
          // to avoid widening the layout and causing horizontal overflow / scale glitches.
          isCollapsed ? 'lg:pl-20' : 'lg:pl-64'
        )}
      >
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between h-16 px-4 bg-white border-b border-slate-200 dark:bg-slate-950 dark:border-slate-800">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-100"
            aria-label="Abrir menú"
          >
            <Menu className="w-6 h-6" />
          </button>
          <Link
            to="/"
            className="font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
            aria-label="Ir al dashboard"
            onClick={() => {
              setIsSidebarOpen(false)
              setUserMenuOpen(false)
            }}
          >
            Kampus
          </Link>
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
