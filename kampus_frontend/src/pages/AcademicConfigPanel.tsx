import { FormEvent, useEffect, useState } from 'react'
import { academicApi, AcademicYear, Grade } from '../services/academic'

export default function AcademicConfigPanel() {
  const [years, setYears] = useState<AcademicYear[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [yearInput, setYearInput] = useState('')
  const [gradeInput, setGradeInput] = useState('')

  const load = async () => {
    const [y, g] = await Promise.all([academicApi.listYears(), academicApi.listGrades()])
    setYears(y.data)
    setGrades(g.data)
  }

  useEffect(() => {
    load()
  }, [])

  const onAddYear = async (e: FormEvent) => {
    e.preventDefault()
    const y = parseInt(yearInput, 10)
    if (!y) return
    await academicApi.createYear(y)
    setYearInput('')
    await load()
  }

  const onAddGrade = async (e: FormEvent) => {
    e.preventDefault()
    if (!gradeInput.trim()) return
    await academicApi.createGrade(gradeInput.trim())
    setGradeInput('')
    await load()
  }

  return (
    <div className="p-6 space-y-8">
      <h2 className="text-xl font-semibold">Configuración Académica</h2>
      <div className="grid md:grid-cols-2 gap-6">
        <section className="border rounded p-4 space-y-3">
          <h3 className="font-medium">Años lectivos</h3>
          <form onSubmit={onAddYear} className="flex items-center gap-2">
            <input
              className="border rounded px-3 py-2 w-40"
              placeholder="2025"
              value={yearInput}
              onChange={(e) => setYearInput(e.target.value)}
            />
            <button className="bg-blue-600 text-white rounded px-3 py-2">Agregar</button>
          </form>
          <ul className="list-disc pl-5 text-sm">
            {years.map((y) => (
              <li key={y.id}>{y.year}</li>
            ))}
          </ul>
        </section>

        <section className="border rounded p-4 space-y-3">
          <h3 className="font-medium">Grados</h3>
          <form onSubmit={onAddGrade} className="flex items-center gap-2">
            <input
              className="border rounded px-3 py-2 w-60"
              placeholder="Primero, Octavo, 11°"
              value={gradeInput}
              onChange={(e) => setGradeInput(e.target.value)}
            />
            <button className="bg-blue-600 text-white rounded px-3 py-2">Agregar</button>
          </form>
          <ul className="list-disc pl-5 text-sm">
            {grades.map((g) => (
              <li key={g.id}>{g.name}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

