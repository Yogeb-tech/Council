/**
 * Turn a memo's Markdown into what an email app can show.
 *
 * Memos use a small Markdown subset (the format MEMO_SYSTEM_PROMPT asks
 * for, and that MemoMarkdown renders on the page): "#" to "####" headings,
 * "- " or "* " bullets, and **bold**. Most email apps show Markdown as raw
 * symbols, so the email carries two versions, as DeepSpace's `email/send`
 * allows: HTML for apps that render it, and clean plain text for the rest.
 *
 * The memo is AI output built from user-written arguments, so every piece
 * of text is HTML-escaped before it goes into a tag. Nothing from the memo
 * can add markup, links or attributes to the email.
 */

type Block = { kind: 'heading'; text: string } | { kind: 'list'; items: string[] } | { kind: 'paragraph'; text: string }

/** Split memo Markdown into headings, bullet lists and paragraphs. */
export function parseMemo(markdown: string): Block[] {
  const blocks: Block[] = []
  let list: string[] = []
  const flush = () => {
    if (list.length) blocks.push({ kind: 'list', items: list })
    list = []
  }
  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd()
    const bullet = /^\s*[-*] (.*)$/.exec(line)
    if (bullet) {
      list.push(bullet[1])
      continue
    }
    flush()
    if (!line.trim()) continue
    const heading = /^#{1,4} (.*)$/.exec(line)
    blocks.push(heading ? { kind: 'heading', text: heading[1] } : { kind: 'paragraph', text: line.trim() })
  }
  flush()
  return blocks
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Escape, then turn **bold** into <strong>. */
function inlineHtml(text: string): string {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part) =>
      part.startsWith('**') && part.endsWith('**') && part.length > 4
        ? `<strong>${escapeHtml(part.slice(2, -2))}</strong>`
        : escapeHtml(part),
    )
    .join('')
}

const stripBold = (text: string) => text.replace(/\*\*([^*]+)\*\*/g, '$1')

/** The memo as email-safe HTML (inline styles only; email apps drop <style>). */
export function memoToHtml(markdown: string): string {
  return parseMemo(markdown)
    .map((b) => {
      if (b.kind === 'heading') {
        return `<h2 style="margin:20px 0 6px;font-size:16px;line-height:1.3;color:#1f1a14">${inlineHtml(b.text)}</h2>`
      }
      if (b.kind === 'list') {
        const items = b.items.map((i) => `<li style="margin:0 0 4px">${inlineHtml(i)}</li>`).join('')
        return `<ul style="margin:0 0 12px;padding-left:20px">${items}</ul>`
      }
      return `<p style="margin:0 0 12px">${inlineHtml(b.text)}</p>`
    })
    .join('\n')
}

/** The memo as readable plain text: no "#" or "**", bullets as "•". */
export function memoToPlainText(markdown: string): string {
  return parseMemo(markdown)
    .map((b) => {
      if (b.kind === 'heading') return stripBold(b.text).toUpperCase()
      if (b.kind === 'list') return b.items.map((i) => `• ${stripBold(i)}`).join('\n')
      return stripBold(b.text)
    })
    .join('\n\n')
}
