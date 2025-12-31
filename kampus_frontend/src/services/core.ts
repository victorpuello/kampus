import { api } from './api'

export interface User {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  role: string
  is_active: boolean
}

export interface Institution {
  id: number
  name: string
  dane_code: string
  nit: string
  address: string
  phone: string
  email: string
  website: string
  rector: number | null
  secretary: number | null
  rector_name?: string
  secretary_name?: string
  logo?: string | null

  // PDF letterhead fields
  pdf_letterhead_image?: string | null
  pdf_show_logo?: boolean
  pdf_logo_height_px?: number
  pdf_header_line1?: string
  pdf_header_line2?: string
  pdf_header_line3?: string
  pdf_footer_text?: string
}

export interface Campus {
  id: number
  institution: number
  institution_name?: string
  
  // Identificación
  dane_code: string
  dane_code_previous: string
  sede_number: string
  nit: string
  name: string
  sede_type: string
  status: string
  
  // Normatividad
  resolution_number: string
  resolution_date: string
  character: string
  specialty: string
  methodology: string
  
  // Ubicación
  department: string
  municipality: string
  zone: string
  neighborhood: string
  address: string
  latitude: number | null
  longitude: number | null
  
  // Oferta educativa
  levels: string[]
  shifts: string[]
  calendar: string
  
  // Contacto
  phone: string
  mobile: string
  email: string
  other_contact: string
  
  // Responsables
  director: number | null
  director_name?: string
  campus_secretary: number | null
  secretary_name?: string
  coordinator: number | null
  coordinator_name?: string
  
  is_main: boolean
}

export interface ConfigImportResult {
  dry_run: boolean
  overwrite: boolean
  created: Record<string, number>
  skipped: Record<string, number>
}

// Opciones para los selects
export const SEDE_TYPE_OPTIONS = [
  { value: 'PRINCIPAL', label: 'Principal' },
  { value: 'ANEXA', label: 'Anexa' },
  { value: 'RURAL_DISPERSA', label: 'Rural Dispersa' },
  { value: 'URBANA', label: 'Urbana' },
]

export const SEDE_STATUS_OPTIONS = [
  { value: 'ACTIVA', label: 'Activa' },
  { value: 'CERRADA', label: 'Cerrada' },
  { value: 'EN_REAPERTURA', label: 'En Reapertura' },
]

export const CHARACTER_OPTIONS = [
  { value: 'ACADEMICA', label: 'Académica' },
  { value: 'TECNICA', label: 'Técnica' },
  { value: 'TECNICA_ACADEMICA', label: 'Técnica y Académica' },
]

export const SPECIALTY_OPTIONS = [
  { value: 'ACADEMICO', label: 'Académico' },
  { value: 'TECNICO', label: 'Técnico' },
  { value: 'ARTISTICO', label: 'Artístico' },
  { value: 'COMERCIAL', label: 'Comercial' },
  { value: 'INDUSTRIAL', label: 'Industrial' },
  { value: 'AGROPECUARIO', label: 'Agropecuario' },
  { value: 'PEDAGOGICO', label: 'Pedagógico' },
]

export const METHODOLOGY_OPTIONS = [
  { value: 'TRADICIONAL', label: 'Tradicional' },
  { value: 'ESCUELA_NUEVA', label: 'Escuela Nueva' },
  { value: 'ACELERACION', label: 'Aceleración del Aprendizaje' },
  { value: 'POST_PRIMARIA', label: 'Post Primaria' },
  { value: 'TELESECUNDARIA', label: 'Telesecundaria' },
  { value: 'SAT', label: 'SAT' },
  { value: 'CAFAM', label: 'CAFAM' },
  { value: 'A_CRECER', label: 'A Crecer' },
]

export const ZONE_OPTIONS = [
  { value: 'URBANA', label: 'Urbana' },
  { value: 'RURAL', label: 'Rural' },
]

export const LEVEL_OPTIONS = [
  { value: 'PREESCOLAR', label: 'Preescolar' },
  { value: 'BASICA_PRIMARIA', label: 'Básica Primaria' },
  { value: 'BASICA_SECUNDARIA', label: 'Básica Secundaria' },
  { value: 'MEDIA', label: 'Media' },
]

export const SHIFT_OPTIONS = [
  { value: 'MANANA', label: 'Mañana' },
  { value: 'TARDE', label: 'Tarde' },
  { value: 'NOCHE', label: 'Noche' },
  { value: 'UNICA', label: 'Única' },
  { value: 'FIN_SEMANA', label: 'Fin de Semana' },
]

export const CALENDAR_OPTIONS = [
  { value: 'A', label: 'Calendario A' },
  { value: 'B', label: 'Calendario B' },
]

export const coreApi = {
  // Institutions
  listInstitutions: () => api.get<Institution[]>('/api/institutions/'),
  createInstitution: (data: FormData) => api.post<Institution>('/api/institutions/', data),
  updateInstitution: (id: number, data: FormData) => api.patch<Institution>(`/api/institutions/${id}/`, data),

  // Campuses
  listCampuses: () => api.get<Campus[]>('/api/campuses/'),
  getCampus: (id: number) => api.get<Campus>(`/api/campuses/${id}/`),
  createCampus: (data: Partial<Campus>) => api.post<Campus>('/api/campuses/', data),
  updateCampus: (id: number, data: Partial<Campus>) => api.patch<Campus>(`/api/campuses/${id}/`, data),
  deleteCampus: (id: number) => api.delete(`/api/campuses/${id}/`),

  // Users for rector/secretary/coordinator selection
  listRectors: () => api.get<User[]>('/api/users/rectors/'),
  listSecretaries: () => api.get<User[]>('/api/users/secretaries/'),
  listCoordinators: () => api.get<User[]>('/api/users/coordinators/'),

  // Config export/import
  exportConfig: (includeMedia = false) =>
    api.get('/api/config/export/', {
      params: { include_media: includeMedia ? 1 : 0 },
      responseType: 'blob',
    }),

  importConfig: (
    file: File,
    opts?: { overwrite?: boolean; confirmOverwrite?: boolean; dryRun?: boolean }
  ) => {
    const data = new FormData()
    data.append('file', file)
    data.append('overwrite', opts?.overwrite ? 'true' : 'false')
    data.append('confirm_overwrite', opts?.confirmOverwrite ? 'true' : 'false')
    data.append('dry_run', opts?.dryRun ? 'true' : 'false')
    return api.post<ConfigImportResult>('/api/config/import/', data)
  },
}
