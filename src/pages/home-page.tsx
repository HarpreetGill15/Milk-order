import { CalendarDays, ClipboardList, Milk, ShoppingCart, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card } from '../components/button'
import { usePlanner } from '../data/hooks'
import { addDaysIso, prettyDate, todayIso } from '../lib/dates'
import { DayNotes } from '../components/day-notes'

export function HomePage() {
  const { planner, items, weeks, counts } = usePlanner()
  const today = todayIso()
  const orderDay = planner.schedule.nextOrderDay(today)
  const deliveries = planner.schedule.plansFor(orderDay)
  const active = items.filter(item => item.active)
  // Holidays in the next two weeks — the reminder to check delivery changes.
  const upcoming = Array.from({ length: 14 }, (_, i) => addDaysIso(today, i))
    .map(date => ({ date, marks: planner.calendar.marks(date) }))
    .filter(({ marks }) => marks.length > 0)
  const todaysCount = counts.find(count => count.date === today)
  const counted = active.filter(item => todaysCount?.entries[item.id]).length

  return (
    <div className="space-y-4">
      <Card className="bg-brand-600 text-white">
        <p className="text-sm opacity-80">{orderDay === today ? 'Today is an order day' : 'Next order day'}</p>
        <p className="text-2xl font-bold">{prettyDate(orderDay)}</p>
        <p className="mt-1 text-sm opacity-90">
          {deliveries.map(d => `Delivery ${prettyDate(d.deliveryDate)} (lasts through ${prettyDate(d.coversDates[d.coversDates.length - 1])})`).join(' · ')}
        </p>
        <p className="mt-2 text-xs opacity-80">Count before 10am, then review and print the order.</p>
      </Card>

      {upcoming.length > 0 && (
        <Card className="border-l-4 border-violet-500">
          <p className="font-semibold">Coming up</p>
          <ul className="mt-1 space-y-1 text-sm">
            {upcoming.map(({ date, marks }) => <li key={date} className="flex flex-wrap items-center gap-2"><span className="w-24 font-medium">{prettyDate(date)}</span><DayNotes marks={marks} /></li>)}
          </ul>
          <Link to="/calendar" className="mt-2 inline-block text-sm font-semibold text-brand-600">Check delivery days →</Link>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile to="/count" icon={ClipboardList} title="Count" detail={active.length ? `${counted} / ${active.length} counted today` : 'No items yet'} />
        <Tile to="/order" icon={ShoppingCart} title="Order" detail="Review & print" />
        <Tile to="/sales" icon={Upload} title="Sales reports" detail={`${weeks.length} week${weeks.length === 1 ? '' : 's'} uploaded`} />
        <Tile to="/items" icon={Milk} title="Items" detail={`${active.length} active`} />
        <Tile to="/calendar" icon={CalendarDays} title="Calendar" detail="Holidays & delivery days" />
      </div>

      {items.length === 0 && (
        <Card>
          <h2 className="font-bold">Getting started</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
            <li>Upload last week's 7-day sales report — this creates the item list.</li>
            <li>On Items, add each item's UPC or vendor code and put them in cooler walk order.</li>
            <li>On order days, count on the phone, then review and print the order on the computer.</li>
          </ol>
        </Card>
      )}
    </div>
  )
}

function Tile({ to, icon: Icon, title, detail }: { to: string; icon: typeof Milk; title: string; detail: string }) {
  return (
    <Link to={to}>
      <Card className="h-full transition hover:ring-2 hover:ring-brand-500">
        <Icon className="h-6 w-6 text-brand-600" />
        <p className="mt-2 font-bold">{title}</p>
        <p className="text-sm text-slate-500">{detail}</p>
      </Card>
    </Link>
  )
}
