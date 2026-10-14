import { CalendarDays, ClipboardList, Home, Megaphone, Milk, ShoppingCart, Upload } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { usingLocalStorage } from '../data/store'
import { cn } from '../lib/utils'

const NAV = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/count', label: 'Count', icon: ClipboardList },
  { to: '/order', label: 'Order', icon: ShoppingCart },
  { to: '/sales', label: 'Sales', icon: Upload },
  { to: '/items', label: 'Items', icon: Milk },
  { to: '/promos', label: 'Promos', icon: Megaphone },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
]

export function AppShell() {
  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <header className="no-print sticky top-0 z-20 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <span className="flex items-center gap-2 font-bold text-brand-700"><Milk className="h-5 w-5" /> Milk Order</span>
          <nav className="ml-auto hidden gap-1 md:flex">
            {NAV.map(({ to, label }) => (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => cn('rounded-lg px-3 py-2 text-sm font-medium', isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100')}>{label}</NavLink>
            ))}
          </nav>
        </div>
        {usingLocalStorage && (
          <p className="bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-800">Firebase isn't set up yet — data is saved on this device only and won't sync between phone and computer.</p>
        )}
      </header>
      <main className="mx-auto max-w-5xl px-4 py-4">
        <Outlet />
      </main>
      <nav className="no-print fixed inset-x-0 bottom-0 z-20 grid grid-cols-7 border-t bg-white md:hidden">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => cn('flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium', isActive ? 'text-brand-600' : 'text-slate-500')}>
            <Icon className="h-5 w-5" />{label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
