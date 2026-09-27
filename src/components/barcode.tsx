import JsBarcode from 'jsbarcode'
import { useEffect, useRef, useState } from 'react'

/**
 * Scannable barcode for an item's UPC or vendor code. Uses UPC/EAN symbology when the digits
 * validate as one (12/13 digits with a correct check digit) and CODE128 otherwise — CODE128 reads
 * on any RF gun and has no checksum requirement, so vendor codes always print.
 */
export function Barcode({ value, height = 48 }: { value: string; height?: number }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!svgRef.current) return
    const options = { width: 2, height, fontSize: 14, margin: 4, background: '#ffffff', lineColor: '#000000' }
    const formats = /^\d{12}$/.test(value) ? ['UPC', 'CODE128'] : /^\d{13}$/.test(value) ? ['EAN13', 'CODE128'] : ['CODE128']
    for (const format of formats) {
      try {
        JsBarcode(svgRef.current, value, { ...options, format })
        setFailed(false)
        return
      } catch { /* try the next format */ }
    }
    setFailed(true)
  }, [value, height])

  if (failed) return <span className="font-mono text-sm">{value}</span>
  return <svg ref={svgRef} />
}
