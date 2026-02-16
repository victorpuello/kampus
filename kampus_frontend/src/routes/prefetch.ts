type RoutePrefetcher = {
  prefix: string
  load: () => Promise<unknown>
}

const prefetchedPrefixes = new Set<string>()

const routePrefetchers: RoutePrefetcher[] = [
  { prefix: '/notifications', load: () => import('../pages/Notifications') },
  { prefix: '/students', load: () => import('../pages/StudentList') },
  { prefix: '/planning', load: () => import('../pages/planning/PlanningModule') },
  { prefix: '/grades/preschool', load: () => import('../pages/PreschoolGrades') },
  { prefix: '/grades', load: () => import('../pages/Grades') },
  { prefix: '/attendance', load: () => import('../pages/attendance/AttendanceHome') },
  { prefix: '/discipline/cases', load: () => import('../pages/DisciplineCases') },
  { prefix: '/novelties', load: () => import('../pages/NoveltiesInbox') },
  { prefix: '/promotion', load: () => import('../pages/PromotionWorkflow') },
  { prefix: '/commissions', load: () => import('../pages/CommissionsWorkflow') },
  { prefix: '/academic-config', load: () => import('../pages/AcademicConfigPanel') },
]

const normalizePath = (path: string) => path.split('?')[0].split('#')[0]

export const prefetchRouteByPath = (path: string) => {
  const normalizedPath = normalizePath(path)
  const match = routePrefetchers.find((item) => normalizedPath.startsWith(item.prefix))
  if (!match || prefetchedPrefixes.has(match.prefix)) return

  prefetchedPrefixes.add(match.prefix)
  void match.load().catch(() => {
    prefetchedPrefixes.delete(match.prefix)
  })
}
