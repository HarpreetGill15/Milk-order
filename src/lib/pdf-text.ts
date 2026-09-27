import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import type { PDFPageProxy } from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

/** Rebuilds text lines by grouping text items that share (roughly) the same y-position, left to right. */
async function pageLines(page: PDFPageProxy): Promise<string[]> {
  const content = await page.getTextContent()
  const rows = new Map<number, { x: number; text: string }[]>()
  for (const item of content.items) {
    if (!('str' in item) || !item.str.trim()) continue
    const y = Math.round(item.transform[5])
    const bucket = [...rows.keys()].find(existing => Math.abs(existing - y) <= 2) ?? y
    const cells = rows.get(bucket) ?? []
    cells.push({ x: item.transform[4], text: item.str })
    rows.set(bucket, cells)
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, cells]) => cells.sort((a, b) => a.x - b.x).map(cell => cell.text).join(' ').replace(/\s{2,}/g, ' ').trim())
}

export async function pdfToLines(file: File): Promise<string[]> {
  const document = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
  const lines: string[] = []
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) lines.push(...await pageLines(await document.getPage(pageNumber)))
  return lines
}
