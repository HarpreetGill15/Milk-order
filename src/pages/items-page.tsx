import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button, Card, Chip } from '../components/button'
import { deleteItem, newItemFromText, saveItem, saveItems } from '../data/api'
import { useItems } from '../data/hooks'
import { DEFAULT_ORDER_STEP } from '../lib/item-detect'
import { SIZE_LABEL } from '../lib/item-filters'
import { cn } from '../lib/utils'
import { BRANDS, SIZES, type Brand, type Item, type Size } from '../types'

export function ItemsPage() {
  const { items, loading } = useItems()
  const [newName, setNewName] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const missingCodes = items.filter(item => item.active && !item.code && !item.vendorCode).length

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta
    if (target < 0 || target >= items.length) return
    const reordered = [...items]
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
    void saveItems(reordered.map((item, walkOrder) => ({ ...item, walkOrder })).filter((item, i) => item.walkOrder !== items[i].walkOrder || i === index || i === target))
  }

  const add = () => {
    if (!newName.trim()) return
    void saveItem(newItemFromText(newName, items.reduce((max, item) => Math.max(max, item.walkOrder), -1) + 1))
    setNewName('')
  }

  if (loading) return <p className="text-slate-500">Loading…</p>
  const shown = items.filter(item => showInactive || item.active)

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-bold">Items ({items.length})</h1>
          <Chip className="ml-auto" active={showInactive} onClick={() => setShowInactive(!showInactive)}>Show inactive</Chip>
        </div>
        <p className="text-sm text-slate-500">The list order here is the cooler walk order used when counting. Items are created automatically from sales reports. <b>Safety stock</b> is how many units should still be in the cooler when the next truck arrives.</p>
        {missingCodes > 0 && <p className="text-sm text-amber-700">{missingCodes} active item{missingCodes === 1 ? ' has' : 's have'} no UPC or vendor code — those print without a barcode.</p>}
        <form className="flex gap-2" onSubmit={event => { event.preventDefault(); add() }}>
          <input className="h-11 min-w-0 flex-1 rounded-xl border px-3" placeholder="Add item, e.g. Lactantia 2L 2%" value={newName} onChange={event => setNewName(event.target.value)} />
          <Button type="submit" disabled={!newName.trim()}><Plus className="h-4 w-4" /> Add</Button>
        </form>
      </Card>

      <div className="space-y-2">
        {shown.map(item => {
          const index = items.indexOf(item)
          return <ItemCard key={item.id} item={item} onUp={index > 0 ? () => move(index, -1) : undefined} onDown={index < items.length - 1 ? () => move(index, 1) : undefined} />
        })}
      </div>
    </div>
  )
}

function ItemCard({ item, onUp, onDown }: { item: Item; onUp?: () => void; onDown?: () => void }) {
  const update = (patch: Partial<Item>) => void saveItem({ ...item, ...patch })
  const setSize = (size: Size) => {
    // Follow the new size's crate count unless the step was customised by hand.
    const step = item.orderStep === DEFAULT_ORDER_STEP[item.size] ? DEFAULT_ORDER_STEP[size] : item.orderStep
    update({ size, orderStep: step })
  }
  return (
    <Card className={cn('space-y-3 p-3', !item.active && 'opacity-60')}>
      <div className="flex items-start gap-2">
        <div className="flex flex-col">
          <button className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30" disabled={!onUp} onClick={onUp} aria-label="Move up"><ArrowUp className="h-4 w-4" /></button>
          <button className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30" disabled={!onDown} onClick={onDown} aria-label="Move down"><ArrowDown className="h-4 w-4" /></button>
        </div>
        <div className="min-w-0 flex-1">
          <TextField className="w-full font-semibold" value={item.name} onSave={name => name && update({ name })} />
          {item.aliases.length > 0 && <p className="mt-1 text-xs text-slate-400">Also matches: {item.aliases.join(', ')}</p>}
        </div>
        <button className="p-1 text-slate-400 hover:text-red-600" aria-label="Delete item" onClick={() => { if (confirm(`Delete ${item.name}? Past counts and sales for it stay but won't show.`)) void deleteItem(item.id) }}><Trash2 className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        <Field label="Brand">
          <select className="h-10 w-full rounded-lg border px-1" value={item.brand} onChange={event => update({ brand: event.target.value as Brand })}>{BRANDS.map(brand => <option key={brand}>{brand}</option>)}</select>
        </Field>
        <Field label="Size">
          <select className="h-10 w-full rounded-lg border px-1" value={item.size} onChange={event => setSize(event.target.value as Size)}>{SIZES.map(size => <option key={size} value={size}>{SIZE_LABEL[size]}</option>)}</select>
        </Field>
        <Field label="Per crate"><NumberField value={item.orderStep} min={1} onSave={orderStep => update({ orderStep })} /></Field>
        <Field label="Safety stock (units)"><NumberField value={item.safetyStock ?? 0} onSave={safetyStock => update({ safetyStock })} /></Field>
        <Field label="UPC"><TextField className="w-full font-mono" value={item.code} placeholder="none" onSave={code => update({ code: code.replace(/\s/g, '') })} /></Field>
        <Field label="Vendor code"><TextField className="w-full font-mono" value={item.vendorCode ?? ''} placeholder="none" onSave={vendorCode => update({ vendorCode: vendorCode.replace(/\s/g, '') })} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={item.active} onChange={event => update({ active: event.target.checked })} /> Active (counted and ordered)</label>
    </Card>
  )
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={cn('block text-xs font-medium text-slate-500', className)}>{label}<div className="mt-0.5">{children}</div></label>
}

/** Text input that saves on blur/Enter instead of every keystroke. */
function TextField({ value, onSave, className, placeholder }: { value: string; onSave: (value: string) => void; className?: string; placeholder?: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => { if (draft !== null && draft.trim() !== value) onSave(draft.trim()); setDraft(null) }
  return <input className={cn('h-10 rounded-lg border px-2', className)} placeholder={placeholder} value={draft ?? value} onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} />
}

function NumberField({ value, onSave, min = 0 }: { value: number; onSave: (value: number) => void; min?: number }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    const number = Number(draft)
    if (draft !== null && draft !== '' && Number.isFinite(number) && number !== value) onSave(Math.max(min, Math.round(number)))
    setDraft(null)
  }
  return <input inputMode="numeric" className="h-10 w-full rounded-lg border px-2 tabular-nums" value={draft ?? String(value)} onChange={event => setDraft(event.target.value.replace(/\D/g, ''))} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} />
}
