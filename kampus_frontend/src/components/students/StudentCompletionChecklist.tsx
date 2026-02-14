import type { StudentCompletion } from '../../services/students'

const SECTION_LABELS: Record<string, string> = {
  identificacion: 'Identificación',
  residencia_contacto: 'Residencia y contacto',
  socioeconomica: 'Información socioeconómica',
  desarrollo_apoyos: 'Desarrollo integral y apoyos',
  salud_emergencia: 'Salud y emergencia',
  referencias_familiares: 'Referencias familiares',
  documentos: 'Documentos',
  institucional: 'Información institucional',
}

const FIELD_LABELS: Record<string, string> = {
  document_type: 'Tipo de documento',
  document_number: 'Número de documento',
  place_of_issue: 'Lugar de expedición',
  nationality: 'Nacionalidad',
  birth_date: 'Fecha de nacimiento',
  sex: 'Sexo',
  blood_type: 'Tipo de sangre',
  photo: 'Fotografía',
  address: 'Dirección',
  neighborhood: 'Barrio / vereda',
  phone: 'Teléfono',
  living_with: 'Con quién vive',
  stratum: 'Estrato',
  ethnicity: 'Etnia',
  sisben_score: 'SISBÉN',
  eps: 'EPS',
  disability_description: 'Descripción de discapacidad',
  disability_type: 'Tipo de discapacidad',
  support_needs: 'Apoyos requeridos',
  allergies: 'Alergias',
  emergency_contact_name: 'Nombre de contacto de emergencia',
  emergency_contact_phone: 'Teléfono de contacto de emergencia',
  emergency_contact_relationship: 'Parentesco de contacto de emergencia',
  guardian_identity_document: 'Acudiente principal con documento e identificación adjunta',
  IDENTITY: 'Documento de identidad',
  EPS: 'Certificado EPS / ADRES',
  VACCINES: 'Carné de vacunas',
  ACADEMIC: 'Certificado académico',
}

const prettyLabel = (raw: string) => {
  const label = FIELD_LABELS[raw]
  if (label) return label
  return raw
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

type Props = {
  studentName: string
  completion: StudentCompletion | null | undefined
}

export function StudentCompletionChecklist({ studentName, completion }: Props) {
  if (!completion) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
        No hay datos de progreso disponibles para este estudiante.
      </div>
    )
  }

  const percent = completion.percent
  const filled = Number(completion.filled ?? 0)
  const total = Number(completion.total ?? 0)
  const missingCount = Math.max(0, total - filled)
  const sections = Object.entries(completion.sections ?? {})
  const sectionsWithMissing = sections.filter(([, section]) => Array.isArray(section.missing) && section.missing.length > 0)
  const documentSection = completion.sections?.documentos

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Progreso actual</p>
            <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              {percent === null || percent === undefined ? 'N/D' : `${percent}%`}
            </p>
          </div>
          <div className="text-sm text-slate-600 dark:text-slate-300">
            <div>Completado: <span className="font-semibold">{filled}/{total}</span></div>
            <div>Faltantes: <span className="font-semibold">{missingCount}</span></div>
          </div>
        </div>

        <div className="mt-3 h-2 w-full overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
          <div
            className="h-full bg-blue-500"
            style={{ width: `${Math.min(100, Math.max(0, Number(percent ?? 0)))}%` }}
          />
        </div>

        {completion.message ? (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{completion.message}</p>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Documentos obligatorios</p>
        {documentSection ? (
          <div className="mt-3 space-y-2">
            {(documentSection.missing?.length ?? 0) === 0 ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
                Documentación al día para {studentName}.
              </div>
            ) : (
              <ul className="space-y-2">
                {(documentSection.missing ?? []).map((field) => (
                  <li
                    key={field}
                    className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200"
                  >
                    {prettyLabel(field)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No aplica para este estudiante.</p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Faltantes para llegar al 100%</p>
        {sectionsWithMissing.length === 0 ? (
          <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
            No hay faltantes. La ficha está completa.
          </div>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {sectionsWithMissing.map(([sectionKey, section]) => (
              <div key={sectionKey} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {SECTION_LABELS[sectionKey] ?? prettyLabel(sectionKey)}
                  </p>
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {section.filled}/{section.total}
                  </span>
                </div>
                <ul className="space-y-1">
                  {(section.missing ?? []).map((field) => (
                    <li key={`${sectionKey}-${field}`} className="text-sm text-slate-600 dark:text-slate-300">
                      • {prettyLabel(field)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
