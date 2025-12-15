export type PermissionLike = {
  codename: string
  name?: string
  app_label?: string
  model?: string
}

const ACTION_ES: Record<string, string> = {
  view: 'Ver',
  add: 'Crear',
  change: 'Editar',
  delete: 'Eliminar',
}

const APP_ES: Record<string, string> = {
  core: 'Sistema',
  users: 'Usuarios',
  students: 'Estudiantes',
  teachers: 'Docentes',
  academic: 'Académico',
  communications: 'Comunicaciones',
  discipline: 'Convivencia',
  reports: 'Reportes',
  config: 'Configuración',
  auth: 'Autenticación',
}

const MODEL_ES: Record<string, string> = {
  user: 'Usuario',
  teacher: 'Docente',
  student: 'Estudiante',
  institution: 'Institución',
  campus: 'Sede',
  dimension: 'Dimensión',
  performanceindicator: 'Indicador de desempeño',
  achievement: 'Logro',
  achievementdefinition: 'Definición de logro',
  group: 'Grupo',
  enrollment: 'Matrícula',
  studentdocument: 'Documento del estudiante',
  subject: 'Asignatura',
}

const toWords = (s: string) =>
  s
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const titleCase = (s: string) =>
  toWords(s)
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

export const formatAppLabelEs = (appLabel?: string) => {
  if (!appLabel) return ''
  return APP_ES[appLabel] || titleCase(appLabel)
}

export const formatModelEs = (model?: string) => {
  if (!model) return ''
  return MODEL_ES[model] || titleCase(model)
}

export const formatPermissionNameEs = (p: PermissionLike) => {
  const raw = (p.name || '').trim()

  // Translate default Django permission names (commonly in English)
  // Examples: "Can view teacher", "Can add user"...
  const m = /^Can\s+(view|add|change|delete)\s+(.+)$/i.exec(raw)
  if (m) {
    const action = ACTION_ES[m[1].toLowerCase()] || titleCase(m[1].toLowerCase())
    const modelToken = m[2].trim().toLowerCase().replace(/\s+/g, '')
    const model = MODEL_ES[modelToken] || titleCase(m[2])
    return `${action} ${model}`
  }

  // If backend already provides a non-empty (possibly Spanish) name, keep it.
  if (raw) return raw

  // Fallback to codename shape: view_model, add_model, change_model, delete_model
  const codename = (p.codename || '').trim()
  const parts = codename.split('_')
  if (parts.length >= 2) {
    const verb = parts[0]
    const action = ACTION_ES[verb] || titleCase(verb)
    const modelKey = parts.slice(1).join('_').toLowerCase().replace(/_/g, '')
    const model = MODEL_ES[modelKey] || formatModelEs(p.model) || titleCase(parts.slice(1).join('_'))
    return `${action} ${model}`
  }

  return codename || 'Permiso'
}

export const formatPermissionGroupEs = (appLabel: string, model: string) => {
  const app = formatAppLabelEs(appLabel)
  const m = formatModelEs(model)
  if (app && m) return `${app} / ${m}`
  if (app) return app
  return m || `${appLabel}.${model}`
}
