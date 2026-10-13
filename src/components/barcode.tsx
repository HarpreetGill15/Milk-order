import JsBarcode from 'jsbarcode'
import { useEffect, useRef, useState } from 'react'
import { cn } from '../lib/utils'

/**
 * Scannable barcode for an item's UPC or vendor code. Uses UPC/EAN symbology when the digits
 * validate as one (12/13 digits with a correct check digit) and CODE128 otherwise — CODE128 reads
 * on any RF gun and has no checksum requirement, so vendor codes always print.
 *
 * `fill` stretches it to the container's width (phone scan mode); otherwise it's print-sized.
 */
export function Barcode({ value, height = 48, fill = false, className }: { value: string; height?: number; fill?: boolean; className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    // Narrower bars for long codes so a 13-digit UPC fits its column on the order sheet.
    const options = { width: fill ? 4 : value.length > 10 ? 1.6 : 2, height, fontSize: fill ? 28 : 14, margin: fill ? 16 : 4, background: '#ffffff', lineColor: '#000000' }
    const formats = /^\d{12}$/.test(value) ? ['UPC', 'CODE128'] : /^\d{13}$/.test(value) ? ['EAN13', 'CODE128'] : ['CODE128']
    for (const format of formats) {
      try {
        JsBarcode(svg, value, { ...options, format })
        if (fill) {
          // JsBarcode sets a viewBox, so dropping the fixed size lets CSS scale it to the screen.
          svg.removeAttribute('width')
          svg.removeAttribute('height')
        }
        setFailed(false)
        return
      } catch { /* try the next format */ }
    }
    setFailed(true)
  }, [value, height, fill])

  if (failed) return <span className="font-mono text-sm">{value}</span>
  return <svg ref={svgRef} className={cn(fill && 'block h-auto w-full', className)} />
}
