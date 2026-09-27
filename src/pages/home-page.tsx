import { ClipboardList, Milk, ShoppingCart, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card } from '../components/button'
import { useCounts, useItems, useSalesWeeks } from '../data/hooks'
import { DAY_SHORT, prettyDate, todayIso } from '../lib/dates'
import { deliveriesFor, isOrderDay, nextOrderDay } from '../lib/order-math'

export function HomePage() {
  const { items } = useItems()
  const { weeks } = useSalesWeeks()
  const { counts } = useCounts()
  const today = todayIso()
  const orderDay = isOrderDay(today) ? today : nextOrderDay(today)
  const deliveries = deliveriesFor(orderDay)
  const active = items.filter(item => item.active)
  const todaysCount = counts.find(count => count.date === today)
  const counted = active.filter(item => todaysCount?.entries[item.id]).length

  return (
    <div className="space-y-4">
      <Card className="bg-brand-600 text-white">
        <p className="text-sm opacity-80">{orderDay === today ? 'Today is an order day' : 'Next order day'}</p>
        <p className="text-2xl font-bold">{prettyDate(orderDay)}</p>
        <p className="mt-1 text-sm opacity-90">
          {deliveries.map(d => `Delivery ${prettyDate(d.deliveryDate)} (covers ${d.coversDays.map(day => DAY_SHORT[day]).join(' + ')})`).join(' · ')}
        </p>
        <p className="mt-2 text-xs opacity-80">Count before 10am, then review and print the order.</p>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile to="/count" icon={ClipboardList} title="Count" detail={active.length ? `${counted} / ${active.length} counted today` : 'No items yet'} />
        <Tile to="/order" icon={ShoppingCart} title="Order" detail="Review & print" />
        <Tile to="/sales" icon={Upload} title="Sales reports" detail={`${weeks.length} week${weeks.length === 1 ? '' : 's'} uploaded`} />
        <Tile to="/items" icon={Milk} title="Items" detail={`${active.length} active`} />
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
