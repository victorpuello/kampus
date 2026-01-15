import { cn } from '../../lib/utils'

type PillProps = {
  text: string
  className?: string
}

const withDarkPillVariants = (className: string) => {
  if (className.includes('dark:')) return className

  const hasAll = (tokens: string[]) => tokens.every((t) => className.includes(t))

  if (hasAll(['bg-slate-50', 'text-slate-700', 'border-slate-200'])) {
    return `${className} dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700`
  }
  if (hasAll(['bg-emerald-50', 'text-emerald-700', 'border-emerald-200'])) {
    return `${className} dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-900/40`
  }
  if (hasAll(['bg-sky-50', 'text-sky-700', 'border-sky-200'])) {
    return `${className} dark:bg-sky-950/30 dark:text-sky-200 dark:border-sky-900/50`
  }
  if (hasAll(['bg-blue-50', 'text-blue-700', 'border-blue-200'])) {
    return `${className} dark:bg-blue-950/30 dark:text-blue-200 dark:border-blue-900/50`
  }
  if (hasAll(['bg-amber-50', 'text-amber-800', 'border-amber-200'])) {
    return `${className} dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900/50`
  }
  if (hasAll(['bg-red-50', 'text-red-700', 'border-red-200'])) {
    return `${className} dark:bg-red-950/30 dark:text-red-200 dark:border-red-900/50`
  }

  return className
}

export function Pill({ text, className }: PillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        className ? withDarkPillVariants(className) : undefined,
      )}
    >
      {text}
    </span>
  )
}
