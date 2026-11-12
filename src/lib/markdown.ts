import DOMPurify from 'dompurify'
import { marked, type Tokens } from 'marked'

/**
 * Markdown → sanitised HTML. All lesson and note content passes through DOMPurify, so untrusted rich text
 * can never inject scripts. External links open in a new tab with rel="noopener noreferrer".
 * ```mermaid blocks become placeholders that the MermaidBlocks component renders lazily.
 */

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const renderer = new marked.Renderer()
renderer.code = ({ text, lang }: Tokens.Code) => {
  if (lang === 'mermaid') {
    return `<div class="mermaid-block" data-diagram="${encodeURIComponent(text)}"><pre class="mermaid-source">${escapeHtml(text)}</pre></div>`
  }
  return `<pre><code${lang ? ` class="language-${escapeHtml(lang)}"` : ''}>${escapeHtml(text)}</code></pre>`
}

let hooked = false
function ensureHooks(): void {
  if (hooked) return
  hooked = true
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName !== 'A') return
    const href = node.getAttribute('href') ?? ''
    if (/^https?:\/\//i.test(href)) {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    } else if (!href.startsWith('/') && !href.startsWith('#')) {
      node.removeAttribute('href')
    }
  })
}

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'a', 'abbr', 'b', 'blockquote', 'br', 'code', 'del', 'div', 'em', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'li', 'ol', 'p',
    'pre', 's', 'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'ul',
  ],
  ALLOWED_ATTR: ['href', 'title', 'class', 'data-diagram', 'colspan', 'rowspan', 'align', 'id', 'target', 'rel'],
}

export function renderMarkdown(markdown: string): string {
  ensureHooks()
  const html = marked.parse(markdown ?? '', { renderer, gfm: true, async: false }) as string
  return DOMPurify.sanitize(html, PURIFY_CONFIG)
}

export function renderInline(markdown: string): string {
  ensureHooks()
  const html = marked.parseInline(markdown ?? '', { gfm: true, async: false }) as string
  return DOMPurify.sanitize(html, PURIFY_CONFIG)
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80)
}

/** Strip Markdown to plain text (for previews and snippets). */
export function plainText(markdown: string, max = 200): string {
  const text = (markdown ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`[\]()|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
