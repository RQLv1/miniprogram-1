import { ReportDoc } from './cloudDB'

export const PDF_RENDER_VERSION = 1

const W = 595, H = 842, M = 50
const TITLE_FS = 16, BODY_FS = 11, DATE_FS = 9, LH = 18, MAX_CHARS = 28

function u16(s: string): string {
  let h = 'FEFF'
  for (let i = 0; i < s.length; i++) h += s.charCodeAt(i).toString(16).padStart(4, '0')
  return '<' + h + '>'
}

function wrap(text: string): string[] {
  const out: string[] = []
  for (const p of text.split('\n')) {
    if (!p) { out.push(''); continue }
    for (let i = 0; i < p.length; i += MAX_CHARS) out.push(p.slice(i, i + MAX_CHARS))
  }
  return out
}

function buildStream(lines: string[], isFirst: boolean, title: string, date: string): string {
  const ops: string[] = ['BT']
  let y = H - M

  if (isFirst) {
    ops.push(`/F1 ${TITLE_FS} Tf`)
    ops.push(`${M} ${y - TITLE_FS} Tm`)
    ops.push(`${u16(title)} Tj`)
    y -= TITLE_FS + LH
    if (date) {
      ops.push(`/F1 ${DATE_FS} Tf`)
      ops.push(`${M} ${y} Tm`)
      ops.push(`${u16(date)} Tj`)
      y -= LH
    }
    ops.push('ET')
    ops.push(`${M} ${y} m ${W - M} ${y} l S`)
    y -= LH
    ops.push('BT')
  }

  ops.push(`/F1 ${BODY_FS} Tf`)
  for (const line of lines) {
    ops.push(`${M} ${y} Tm`)
    if (line) ops.push(`${u16(line)} Tj`)
    y -= LH
  }
  ops.push('ET')
  return ops.join('\n')
}

export function createReportPdfBuffer(report: ReportDoc): ArrayBuffer {
  const title = report.title || '财税分析报告'
  const date = report.createdAt ? new Date(report.createdAt).toLocaleDateString('zh-CN') : ''
  const allLines = wrap(report.content || '')

  const firstCap = Math.floor((H - M * 2 - TITLE_FS - LH * 3) / LH)
  const otherCap = Math.floor((H - M * 2) / LH)

  const pages: string[][] = []
  let i = 0
  do {
    const cap = pages.length === 0 ? firstCap : otherCap
    pages.push(allLines.slice(i, i + cap))
    i += cap
  } while (i < allLines.length)

  const N = pages.length
  const fontIdx = 2 * N + 3
  const streams = pages.map((lines, idx) => buildStream(lines, idx === 0, title, date))

  const objs: string[] = []
  objs.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`)
  const kids = Array.from({ length: N }, (_, k) => `${k + 3} 0 R`).join(' ')
  objs.push(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${N} >>\nendobj`)
  for (let p = 0; p < N; p++) {
    objs.push(`${p + 3} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Contents ${N + 3 + p} 0 R /Resources << /Font << /F1 ${fontIdx} 0 R >> >> >>\nendobj`)
  }
  for (let p = 0; p < N; p++) {
    const s = streams[p]
    objs.push(`${N + 3 + p} 0 obj\n<< /Length ${s.length} >>\nstream\n${s}\nendstream\nendobj`)
  }
  objs.push(`${fontIdx} 0 obj\n<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UTF16-H /DescendantFonts [${fontIdx + 1} 0 R] >>\nendobj`)
  objs.push(`${fontIdx + 1} 0 obj\n<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /DW 1000 >>\nendobj`)

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  for (const obj of objs) {
    offsets.push(pdf.length)
    pdf += obj + '\n\n'
  }

  const xrefPos = pdf.length
  const total = objs.length + 1
  pdf += `xref\n0 ${total}\n0000000000 65535 f \n`
  for (const off of offsets) pdf += off.toString().padStart(10, '0') + ' 00000 n \n'
  pdf += `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`

  const buf = new ArrayBuffer(pdf.length)
  const view = new Uint8Array(buf)
  for (let j = 0; j < pdf.length; j++) view[j] = pdf.charCodeAt(j) & 0xff
  return buf
}
