import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { NoveltyCaseForm } from '../components/novelties/NoveltyCaseForm'

export default function NoveltyCaseNewPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initial = useMemo(() => {
    const studentParam = searchParams.get('student')
    const institutionParam = searchParams.get('institution')
    const typeParam = searchParams.get('type')
    const reasonParam = searchParams.get('reason')
    const effectiveDateParam = searchParams.get('effective_date')

    const studentId = studentParam ? Number(studentParam) : undefined
    const institutionId = institutionParam ? Number(institutionParam) : undefined
    const typeId = typeParam ? Number(typeParam) : undefined
    const reasonId = reasonParam ? Number(reasonParam) : undefined

    return {
      studentId: studentId && Number.isFinite(studentId) ? studentId : undefined,
      institutionId: institutionId && Number.isFinite(institutionId) ? institutionId : undefined,
      typeId: typeId && Number.isFinite(typeId) ? typeId : undefined,
      reasonId: reasonId && Number.isFinite(reasonId) ? reasonId : undefined,
      effectiveDate: effectiveDateParam || undefined,
    }
  }, [searchParams])

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Nueva novedad</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">Crea un caso (borrador o radicado)</p>
        </div>
      </div>

      <div className="mt-6">
        <NoveltyCaseForm
          initial={initial}
          onCancel={() => navigate('/novelties')}
          onCreated={(caseId) => navigate(`/novelties/${caseId}`)}
        />
      </div>
    </div>
  )
}
