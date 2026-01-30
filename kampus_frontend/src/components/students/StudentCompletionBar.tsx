import type { StudentCompletion } from '../../services/students'

const progressBarColor = (percent: number): string => {
  if (percent >= 90) return 'bg-emerald-500'
  if (percent >= 70) return 'bg-amber-500'
  return 'bg-red-500'
}

export function StudentCompletionBar({ completion }: { completion: StudentCompletion }) {
  const percent = completion.percent
  const display = percent === null ? '—' : `${percent}%`

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/40">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Progreso de diligenciamiento</div>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{display}</div>
        </div>

        {percent !== null && (
          <div className="w-44 max-w-[50vw]">
            <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className={`h-2 rounded-full ${progressBarColor(percent)}`}
                style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {completion.message ? (
        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">{completion.message}</div>
      ) : null}
    </div>
  )
}
