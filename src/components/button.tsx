import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '../lib/utils'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }>(({ className, variant = 'primary', ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
      variant === 'primary' && 'bg-brand-600 text-white hover:bg-brand-700',
      variant === 'secondary' && 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50',
      variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
      variant === 'ghost' && 'text-slate-600 hover:bg-slate-100',
      className,
    )}
    {...props}
  />
))
Button.displayName = 'Button'

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl bg-white p-4 shadow-card', className)} {...props} />
}

export function Chip({ active, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return <button className={cn('min-h-9 shrink-0 whitespace-nowrap rounded-full px-3 text-sm font-medium ring-1 transition', active ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200', className)} {...props} />
}
