// utils/markdown.ts

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function applyInlineMarkdown(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
}

function renderTable(lines: string[]): string {
  const rows = lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\||\|$/g, '').split('|').map((cell) => applyInlineMarkdown(cell.trim())))

  if (rows.length < 2) return ''

  const header = rows[0]
  const body = rows.slice(2)

  const thead = `<tr>${header.map((cell) => `<th>${cell}</th>`).join('')}</tr>`
  const tbody = body
    .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`)
    .join('')

  return `<table class="md-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`
}

export function markdownToHtml(markdown: string): string {
  if (!markdown) return ''

  const escaped = escapeHtml(markdown).replace(/\r\n/g, '\n')
  const codeBlocks: string[] = []

  let text = escaped.replace(/```([\s\S]*?)```/g, (_match, code: string) => {
    const key = `__CODE_BLOCK_${codeBlocks.length}__`
    codeBlocks.push(`<pre class="md-code-block"><code>${code.trim()}</code></pre>`)
    return key
  })

  const lines = text.split('\n')
  const parts: string[] = []

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim()

    if (!line) continue

    if (/^__CODE_BLOCK_\d+__$/.test(line)) {
      parts.push(line)
      continue
    }

    if (/^\|.+\|$/.test(line) && i + 1 < lines.length && /^\|?[-\s|:]+\|?$/.test(lines[i + 1].trim())) {
      const tableLines = [line, lines[i + 1].trim()]
      i += 2
      while (i < lines.length && /^\|.+\|$/.test(lines[i].trim())) {
        tableLines.push(lines[i].trim())
        i += 1
      }
      i -= 1
      parts.push(renderTable(tableLines))
      continue
    }

    if (/^###\s+/.test(line)) {
      parts.push(`<h3 class="md-h3">${applyInlineMarkdown(line.replace(/^###\s+/, ''))}</h3>`)
      continue
    }
    if (/^##\s+/.test(line)) {
      parts.push(`<h2 class="md-h2">${applyInlineMarkdown(line.replace(/^##\s+/, ''))}</h2>`)
      continue
    }
    if (/^#\s+/.test(line)) {
      parts.push(`<h1 class="md-h1">${applyInlineMarkdown(line.replace(/^#\s+/, ''))}</h1>`)
      continue
    }
    if (/^>\s+/.test(line)) {
      parts.push(`<blockquote class="md-blockquote">${applyInlineMarkdown(line.replace(/^>\s+/, ''))}</blockquote>`)
      continue
    }
    if (/^[-*]\s+/.test(line)) {
      const listItems = [line]
      while (i + 1 < lines.length && /^[-*]\s+/.test(lines[i + 1].trim())) {
        listItems.push(lines[i + 1].trim())
        i += 1
      }
      parts.push(`<ul class="md-list">${listItems.map((item) => `<li>${applyInlineMarkdown(item.replace(/^[-*]\s+/, ''))}</li>`).join('')}</ul>`)
      continue
    }
    if (/^\d+\.\s+/.test(line)) {
      const listItems = [line]
      while (i + 1 < lines.length && /^\d+\.\s+/.test(lines[i + 1].trim())) {
        listItems.push(lines[i + 1].trim())
        i += 1
      }
      parts.push(`<ol class="md-list md-list--ordered">${listItems.map((item) => `<li>${applyInlineMarkdown(item.replace(/^\d+\.\s+/, ''))}</li>`).join('')}</ol>`)
      continue
    }

    parts.push(`<p class="md-paragraph">${applyInlineMarkdown(line)}</p>`)
  }

  let html = parts.join('')
  codeBlocks.forEach((block, index) => {
    html = html.replace(`__CODE_BLOCK_${index}__`, block)
  })

  return html
}
