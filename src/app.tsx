import { Route, Routes } from 'react-router-dom'
import { AppShell } from './components/app-shell'
import { CalendarPage } from './pages/calendar-page'
import { CountPage } from './pages/count-page'
import { HomePage } from './pages/home-page'
import { ItemsPage } from './pages/items-page'
import { OrderPage } from './pages/order-page'
import { PrintPage } from './pages/print-page'
import { PromosPage } from './pages/promos-page'
import { SalesPage } from './pages/sales-page'
import { ScanPage } from './pages/scan-page'

export default function App() {
  return (
    <Routes>
      <Route path="/print/:orderDate" element={<PrintPage />} />
      <Route path="/scan/:orderDate" element={<ScanPage />} />
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="/count" element={<CountPage />} />
        <Route path="/order" element={<OrderPage />} />
        <Route path="/sales" element={<SalesPage />} />
        <Route path="/items" element={<ItemsPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/promos" element={<PromosPage />} />
      </Route>
    </Routes>
  )
}
