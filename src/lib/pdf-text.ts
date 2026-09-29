import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import type { PDFPageProxy } from 'pdfjs-dist'
import type { PdfCell } from './sales-parse'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

/** Groups a page's text pieces into rows by (roughly) shared y-position, top to bottom, left to right. */
async function pageRows(page: PDFPageProxy): Promise<PdfCell[][]> {
  const content = await page.getTextContent()
  const rows = new Map<number, PdfCell[]>()
  for (const item of content.items) {
    if (!('str' in item) || !item.str.trim()) continue
    const y = Math.round(item.transform[5])
    const bucket = [...rows.keys()].find(existing => Math.abs(existing - y) <= 3) ?? y
    const cells = rows.get(bucket) ?? []
    cells.push({ x: item.transform[4], width: item.width, text: item.str.trim() })
    rows.set(bucket, cells)
  }
  return [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, cells]) => cells.sort((a, b) => a.x - b.x))
}

export async function pdfToRows(file: File): Promise<PdfCell[][]> {
  const document = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
  const rows: PdfCell[][] = []
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) rows.push(...await pageRows(await document.getPage(pageNumber)))
  return rows
}
