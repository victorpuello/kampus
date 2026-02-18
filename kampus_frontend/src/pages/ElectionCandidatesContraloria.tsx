import { useEffect, useMemo, useState } from 'react'

import { Button } from '../components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card'
import { ConfirmationModal } from '../components/ui/ConfirmationModal'
import { Input } from '../components/ui/Input'
import {
  electionsApi,
  type ElectionEligibleStudentItem,
  getApiErrorMessage,
  type ElectionManageCandidateItem,
  type ElectionProcessItem,
  type ElectionRoleItem,
} from '../services/elections'
import { useAuthStore } from '../store/auth'

export default function ElectionCandidatesContraloria() {
  const user = useAuthStore((s) => s.user)
  const canManage = user?.role === 'SUPERADMIN' || user?.role === 'ADMIN'

  const [processes, setProcesses] = useState<ElectionProcessItem[]>([])
  const [roles, setRoles] = useState<ElectionRoleItem[]>([])
  const [items, setItems] = useState<ElectionManageCandidateItem[]>([])
  const [selectedProcess, setSelectedProcess] = useState('')
  const [roleId, setRoleId] = useState('')
  const [name, setName] = useState('')
  const [number, setNumber] = useState('')
  const [grade, setGrade] = useState('6')
  const [proposal, setProposal] = useState('')
  const [displayOrder, setDisplayOrder] = useState('1')
  const [studentSearch, setStudentSearch] = useState('')
  const [studentSuggestions, setStudentSuggestions] = useState<ElectionEligibleStudentItem[]>([])
  const [studentSearchLoading, setStudentSearchLoading] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState<ElectionEligibleStudentItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [candidateToDelete, setCandidateToDelete] = useState<ElectionManageCandidateItem | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const roleOptions = useMemo(() => {
    return roles
      .filter((item) => item.code === 'CONTRALOR')
      .filter((item) => !selectedProcess || String(item.process) === selectedProcess)
  }, [roles, selectedProcess])

  const getProcessName = (processId: number) => {
    return processes.find((process) => process.id === processId)?.name || `Jornada #${processId}`
  }

  const loadData = async () => {
    if (!canManage) return
    setLoading(true)
    setError(null)
    try {
      const processId = selectedProcess ? Number(selectedProcess) : undefined
      const [processResponse, roleResponse, candidateResponse] = await Promise.all([
        electionsApi.listProcesses(),
        electionsApi.listRoles(processId),
        electionsApi.listContraloriaCandidates(processId),
      ])
      setProcesses(processResponse.results)
      setRoles(roleResponse.results)
      setItems(candidateResponse.results)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible cargar candidaturas de Contraloría.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, selectedProcess])

  useEffect(() => {
    if (!canManage) return

    const query = studentSearch.trim()
    if (query.length < 2) {
      setStudentSuggestions([])
      setStudentSearchLoading(false)
      return
    }

    const timeoutId = window.setTimeout(async () => {
      setStudentSearchLoading(true)
      try {
        const selectedRoleProcessId = roleId
          ? roles.find((item) => item.id === Number(roleId))?.process
          : undefined
        const processId = selectedRoleProcessId ?? (selectedProcess ? Number(selectedProcess) : undefined)
        const response = await electionsApi.listEligibleStudents({
          role_code: 'CONTRALOR',
          q: query,
          process_id: processId,
          limit: 10,
          show_blocked: true,
        })
        setStudentSuggestions([...(response.results || []), ...(response.blocked_results || [])])
      } catch {
        setStudentSuggestions([])
      } finally {
        setStudentSearchLoading(false)
      }
    }, 250)

    return () => window.clearTimeout(timeoutId)
  }, [canManage, selectedProcess, studentSearch, roleId, roles])

  const onSelectStudent = (student: ElectionEligibleStudentItem) => {
    setSelectedStudent(student)
    setStudentSearch(student.full_name)
    setName(student.full_name)
    setGrade(student.grade)
    setStudentSuggestions([])
  }

  const onCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canManage) return

    const parsedRoleId = Number(roleId)
    const parsedOrder = Number(displayOrder || '1')
    if (!Number.isFinite(parsedRoleId) || parsedRoleId <= 0) {
      setError('Debes seleccionar el cargo de Contraloría.')
      return
    }
    if (!name.trim()) {
      setError('Debes ingresar el nombre de la candidatura.')
      return
    }
    if (!selectedStudent) {
      setError('Debes seleccionar un estudiante elegible desde la búsqueda predictiva.')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await electionsApi.createContraloriaCandidate({
        role: parsedRoleId,
        name: name.trim(),
        student_id_ref: selectedStudent?.student_id,
        student_document_number: selectedStudent?.document_number || '',
        number: number.trim(),
        grade: grade.trim(),
        proposal: proposal.trim(),
        display_order: Number.isFinite(parsedOrder) && parsedOrder > 0 ? parsedOrder : 1,
        is_active: true,
      })

      setName('')
      setNumber('')
      setGrade('6')
      setProposal('')
      setDisplayOrder('1')
      setSelectedStudent(null)
      setStudentSearch('')
      setStudentSuggestions([])
      setSuccess('Candidatura de Contraloría registrada correctamente.')
      await loadData()
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible registrar la candidatura de Contraloría.'))
    } finally {
      setSaving(false)
    }
  }

  const onDeleteCandidate = async (candidate: ElectionManageCandidateItem) => {
    if (!canManage) return
    setCandidateToDelete(candidate)
  }

  const onConfirmDeleteCandidate = async () => {
    if (!canManage || !candidateToDelete) return

    setDeletingId(candidateToDelete.id)
    setError(null)
    setSuccess(null)

    try {
      await electionsApi.deleteContraloriaCandidate(candidateToDelete.id)
      setSuccess('Candidatura eliminada correctamente.')
      await loadData()
      setCandidateToDelete(null)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible eliminar la candidatura de Contraloría.'))
    } finally {
      setDeletingId(null)
    }
  }

  if (!canManage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sin permisos</CardTitle>
          <CardDescription>Solo superadmin y administrador pueden gestionar Gobierno Escolar.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Candidatos de Contraloría</CardTitle>
          <CardDescription>Registra candidaturas de Contraloría (grados 6 a 11).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Filtrar por jornada</label>
            <select
              value={selectedProcess}
              onChange={(event) => setSelectedProcess(event.target.value)}
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="">Todas las jornadas</option>
              {processes.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>

          <form className="grid gap-3 md:grid-cols-2" onSubmit={onCreate}>
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Cargo (Contraloría)</label>
              <select
                value={roleId}
                onChange={(event) => setRoleId(event.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="">Selecciona un cargo</option>
                {roleOptions.map((item) => (
                  <option key={item.id} value={item.id}>{item.process_name} · {item.title}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Buscar estudiante elegible</label>
              <Input
                value={studentSearch}
                onChange={(event) => {
                  const value = event.target.value
                  setStudentSearch(value)
                  setName(value)
                  setSelectedStudent(null)
                }}
                placeholder="Escribe nombre o documento..."
              />
              {studentSearchLoading ? <p className="text-xs text-slate-500 dark:text-slate-400">Buscando estudiantes...</p> : null}
              {!studentSearchLoading && studentSearch.trim().length >= 2 && studentSuggestions.length > 0 ? (
                <div className="max-h-44 overflow-auto rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
                  {studentSuggestions.map((student) => (
                    <button
                      key={`${student.student_id}-${student.enrollment_id}`}
                      type="button"
                      disabled={Boolean(student.is_blocked)}
                      onClick={() => onSelectStudent(student)}
                      className={`block w-full border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 dark:border-slate-800 ${
                        student.is_blocked
                          ? 'cursor-not-allowed bg-slate-50 text-slate-500 opacity-80 dark:bg-slate-900/50 dark:text-slate-400'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-900'
                      }`}
                    >
                      <p className="font-medium text-slate-700 dark:text-slate-200">
                        {student.full_name}
                        {student.is_blocked ? <span className="ml-2 text-xs font-semibold text-amber-600 dark:text-amber-300">(No elegible)</span> : null}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Doc: {student.document_number || '—'} · Grado: {student.grade || '—'} · Grupo: {student.group || '—'} · Jornada: {student.shift || '—'}
                      </p>
                      {student.is_blocked ? (
                        <p className="text-xs text-amber-700 dark:text-amber-300">{student.block_reason || 'No disponible para este cargo.'}</p>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Nombre</label>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Número</label>
              <Input value={number} onChange={(event) => setNumber(event.target.value)} />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Grado</label>
              <Input value={grade} onChange={(event) => setGrade(event.target.value)} />
              {selectedStudent ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">Documento seleccionado: {selectedStudent.document_number || '—'}</p>
              ) : null}
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Orden</label>
              <Input type="number" min={1} value={displayOrder} onChange={(event) => setDisplayOrder(event.target.value)} />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Propuesta</label>
              <textarea
                value={proposal}
                onChange={(event) => setProposal(event.target.value)}
                className="min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div className="md:col-span-2">
              <Button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Registrar candidatura'}</Button>
            </div>
          </form>

          {error ? <p className="text-sm text-red-600 dark:text-red-300">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-600 dark:text-emerald-300">{success}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Listado de candidaturas de Contraloría</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">Cargando candidaturas...</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                <thead className="bg-slate-50 dark:bg-slate-900/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Nombre</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Número</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Grado</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Cargo</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-950/40">
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{item.name}</td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{item.number}</td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{item.grade}</td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{item.role_title}</td>
                      <td className="px-3 py-2">
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={deletingId === item.id}
                          onClick={() => onDeleteCandidate(item)}
                        >
                          {deletingId === item.id ? 'Eliminando...' : 'Eliminar'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmationModal
        isOpen={Boolean(candidateToDelete)}
        onClose={() => {
          if (!deletingId) {
            setCandidateToDelete(null)
          }
        }}
        onConfirm={() => void onConfirmDeleteCandidate()}
        title="Eliminar candidatura de Contraloría"
        description={
          candidateToDelete
            ? `¿Estás seguro de eliminar la candidatura de ${candidateToDelete.name} para ${candidateToDelete.role_title} en ${getProcessName(candidateToDelete.process_id)}? Esta acción no se puede deshacer.`
            : '¿Estás seguro de eliminar esta candidatura?'
        }
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="destructive"
        loading={deletingId !== null}
      />
    </div>
  )
}
