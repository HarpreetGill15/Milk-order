import { Minus, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '../lib/utils'

/**
 * − [number] + control. Keeps its own text while the field is focused so clearing it to type a
 * new number doesn't snap back to "0" mid-edit; commits on every valid change.
 */
export function Stepper({ label, value, onChange, size = 'lg' }: { label?: string; value: number; onChange: (value: number) => void; size?: 'lg' | 'sm' }) {
  const [text, setText] = useState(String(value))
  const [focused, setFocused] = useState(false)
  useEffect(() => { if (!focused) setText(String(value)) }, [value, focused])

  const commit = (next: number) => onChange(Math.max(0, Math.round(next)))
  const big = size === 'lg'
  const buttonClass = cn('flex shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 active:bg-slate-200', big ? 'h-14 w-14' : 'h-10 w-10')

  return (
    <div className="flex items-center gap-2">
      {label && <span className={cn('font-semibold text-slate-600', big ? 'w-16 text-base' : 'w-12 text-xs')}>{label}</span>}
      <button type="button" aria-label={`Less ${label ?? ''}`} className={buttonClass} onClick={() => commit(value - 1)}><Minus className={big ? 'h-6 w-6' : 'h-4 w-4'} /></button>
      <input
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={label}
        className={cn('w-0 min-w-0 flex-1 rounded-xl border text-center font-bold tabular-nums', big ? 'h-14 text-2xl' : 'h-10 text-lg')}
        value={text}
        onFocus={event => { setFocused(true); event.target.select() }}
        onBlur={() => { setFocused(false); setText(String(value)) }}
        onChange={event => {
          const digits = event.target.value.replace(/\D/g, '')
          setText(digits)
          if (digits !== '') commit(Number(digits))
        }}
      />
      <button type="button" aria-label={`More ${label ?? ''}`} className={buttonClass} onClick={() => commit(value + 1)}><Plus className={big ? 'h-6 w-6' : 'h-4 w-4'} /></button>
    </div>
  )
}
