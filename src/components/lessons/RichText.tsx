import { useEffect, useMemo, useRef } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { renderInline, renderMarkdown } from '@/lib/markdown'
import { cn } from '@/lib/utils'

let diagramCounter = 0

/** Render ```mermaid placeholders inside `root` (Mermaid is loaded only when a diagram is present). */
async function hydrateDiagrams(root: HTMLElement, dark: boolean): Promise<void> {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('.mermaid-block:not([data-rendered])'))
  if (blocks.length === 0) return
  const { default: mermaid } = await import('mermaid')
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'neutral', fontFamily: 'Inter Variable, sans-serif' })
  for (const block of blocks) {
    block.dataset.rendered = 'true'
    const source = decodeURIComponent(block.dataset.diagram ?? '')
    try {
      diagramCounter += 1
      const { svg } = await mermaid.render(`gp-diagram-${diagramCounter}`, source)
      // Mermaid's strict security level sanitises the generated SVG.
      block.innerHTML = svg
      block.setAttribute('role', 'img')
      block.setAttribute('aria-label', 'Diagram')
    } catch {
      block.insertAdjacentHTML('beforeend', '<p class="mermaid-note">This diagram could not be drawn; its text source is shown instead.</p>')
    }
  }
}

interface RichTextProps {
  markdown: string
  inline?: boolean
  className?: string
}

/** Sanitised Markdown (lessons, notes, explanations). */
export function RichText({ markdown, inline = false, className }: RichTextProps) {
  const { resolved } = useTheme()
  const html = useMemo(() => (inline ? renderInline(markdown) : renderMarkdown(markdown)), [markdown, inline])
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!inline && ref.current) void hydrateDiagrams(ref.current, resolved === 'dark')
  }, [html, inline, resolved])

  if (inline) {
    // Content is sanitised by DOMPurify in renderInline.
    return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
  }
  // Content is sanitised by DOMPurify in renderMarkdown.
  return <div ref={ref} className={cn('prose-gp', className)} dangerouslySetInnerHTML={{ __html: html }} />
}
