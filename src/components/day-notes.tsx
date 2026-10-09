import type { DayMark } from '../lib/holidays'
import { cn } from '../lib/utils'

const boost = (value: number) => (value > 0 ? `+${value}%` : `${value}%`)

/** Short holiday/event notes for a day: "Thanksgiving −2 days · milk +20% · cream +60%", or "closed". */
export function DayNotes({ marks, className }: { marks: DayMark[]; className?: string }) {
  if (marks.length === 0) return null
  return (
    <span className={cn('inline-flex flex-wrap gap-1', className)}>
      {marks.map(mark => (
        <span key={`${mark.id}${mark.offset ?? ''}`} className={cn('rounded-full px-2 py-0.5 text-xs font-medium', mark.closed ? 'bg-red-100 text-red-700' : 'bg-violet-100 text-violet-800')}>
          {mark.label}
          {mark.closed ? ' · closed' : [mark.milk && ` · milk ${boost(mark.milk)}`, mark.cream && ` · cream ${boost(mark.cream)}`].filter(Boolean).join('')}
        </span>
      ))}
    </span>
  )
}
