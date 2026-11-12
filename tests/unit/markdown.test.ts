import { describe, expect, it } from 'vitest'
import { plainText, renderInline, renderMarkdown, slugify } from '@/lib/markdown'

describe('renderMarkdown sanitisation', () => {
  it('removes script tags and inline event handlers', () => {
    const html = renderMarkdown('Hello <script>alert(1)</script> <img src=x onerror="alert(2)"> <b onclick="x()">bold</b>')
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/onerror|onclick/i)
    expect(html).not.toMatch(/<img/i)
    expect(html).toContain('<b>bold</b>')
  })

  it('strips javascript: and data: links but keeps https links safe', () => {
    const html = renderMarkdown('[bad](javascript:alert(1)) [data](data:text/html,x) [good](https://owasp.org/)')
    expect(html).not.toMatch(/javascript:/i)
    expect(html).not.toMatch(/href="data:/i)
    expect(html).toContain('href="https://owasp.org/"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('target="_blank"')
  })

  it('renders mermaid fences as safe placeholders', () => {
    const html = renderMarkdown('```mermaid\nflowchart TD\nA-->B\n```')
    expect(html).toContain('class="mermaid-block"')
    expect(html).toContain('data-diagram="flowchart%20TD%0AA--%3EB"')
  })

  it('renders GFM tables', () => {
    const html = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |')
    expect(html).toContain('<table>')
    expect(html).toContain('<td>2</td>')
  })

  it('sanitises inline markdown too', () => {
    expect(renderInline('**x** <script>bad()</script>')).toBe('<strong>x</strong> ')
  })
})

describe('text helpers', () => {
  it('slugifies headings', () => {
    expect(slugify('Ghanaian Business Application!')).toBe('ghanaian-business-application')
  })

  it('produces plain-text previews', () => {
    expect(plainText('## Title\n\n**Bold** text', 50)).toBe('Title Bold text')
    expect(plainText('a'.repeat(300), 10)).toHaveLength(10)
  })
})
