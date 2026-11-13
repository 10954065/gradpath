import { describe, expect, it } from 'vitest'
import { extractUrl, parseKeyTerm, parseLesson, parseList, parseVideo, splitSections } from '@/lib/content/lessonParser'

const filler = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')

function lessonFixture(bodyWords = 320): string {
  return `---
title: "Research Paradigms: An Overview"
summary: Compare paradigms.
estimatedMinutes: 40
difficulty: intermediate
---

## Introduction
Why paradigms matter.

## Learning Objectives
- Explain positivism
- Compare interpretivism
- Justify a paradigm

## Prerequisite Knowledge
- None beyond the previous lesson

## Key Terminology
- **Positivism**: knowledge from observable, measurable facts.
- **Interpretivism** — meaning constructed by people.
- **Pragmatism:** what works for the question.
- **Paradigm**: a shared world view.

## Detailed Explanation
${filler(bodyWords)}

\`\`\`mermaid
flowchart TD
## not a heading
\`\`\`

## Theories, Frameworks and Models
${filler(bodyWords)}

## Ghanaian Business Application
${filler(bodyWords)}

## International Case Study
${filler(bodyWords)}

## Common Misconceptions
- Myth one. Correction.
- Myth two. Correction.

## Common Examination Mistakes
- Mistake one
- Mistake two

## Critical Thinking Questions
1. Question one?
2. Question two?

## Practical Exercises
1. Write a paragraph.
   Expected output: a justified paradigm choice.
   - sub point

## Key Takeaways
- One
- Two
- Three

## Further Reading
- Saunders, M., Lewis, P., & Thornhill, A. (2019). *Research methods for business students* (8th ed.). Pearson.
- APA Style. <https://apastyle.apa.org/>

## Video Resources
- [APA Style videos](https://apastyle.apa.org/) — APA. Official guidance.

## Revision Summary
Paradigms shape design.

- Positivism: measurement
`
}

describe('lessonParser', () => {
  it('parses every structured section of a valid lesson', () => {
    const { lesson, issues } = parseLesson('fixture.md', lessonFixture())

    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(lesson).not.toBeNull()
    expect(lesson?.title).toBe('Research Paradigms: An Overview')
    expect(lesson?.objectives).toHaveLength(3)
    expect(lesson?.keyTerms.map((k) => k.term)).toEqual(['Positivism', 'Interpretivism', 'Pragmatism', 'Paradigm'])
    expect(lesson?.body.map((b) => b.heading)).toEqual([
      'Detailed Explanation',
      'Theories, Frameworks and Models',
      'Ghanaian Business Application',
      'International Case Study',
    ])
    expect(lesson?.exercises[0]).toContain('Expected output')
    expect(lesson?.exercises).toHaveLength(1)
    expect(lesson?.furtherReading[1]?.url).toBe('https://apastyle.apa.org/')
    expect(lesson?.videos[0]?.title).toBe('APA Style videos')
  })

  it('does not treat headings inside code fences as sections', () => {
    const sections = splitSections('## A\ntext\n```\n## B\n```\n## C\nmore')
    expect(sections.map((s) => s.heading)).toEqual(['A', 'C'])
  })

  it('reports missing required sections and short bodies as errors', () => {
    const broken = lessonFixture(50).replace(/## Key Takeaways[\s\S]*?## Further Reading/, '## Further Reading')
    const { lesson, issues } = parseLesson('broken.md', broken)

    expect(lesson).toBeNull()
    const messages = issues.map((i) => i.message)
    expect(messages).toContain('Missing required section "## Key Takeaways"')
    expect(messages.some((m) => m.startsWith('Teaching body is too short'))).toBe(true)
  })

  it('rejects a lesson without front matter', () => {
    const { lesson, issues } = parseLesson('x.md', '## Introduction\nHello')
    expect(lesson).toBeNull()
    expect(issues[0]?.message).toMatch(/front matter/i)
  })

  it('parses list items with continuation lines', () => {
    expect(parseList('- one\n  continued\n- two\n1. three')).toEqual(['one\ncontinued', 'two', 'three'])
  })

  it('parses key terms, urls and videos in supported formats', () => {
    expect(parseKeyTerm('**CIA triad**: confidentiality, integrity, availability')).toEqual({
      term: 'CIA triad',
      definition: 'confidentiality, integrity, availability',
    })
    expect(parseKeyTerm('no bold here')).toBeNull()
    expect(extractUrl('See https://owasp.org/www-project-top-ten/.')).toBe('https://owasp.org/www-project-top-ten/')
    expect(extractUrl('no link')).toBeNull()
    expect(parseVideo('[Intro](https://example.org/v) — Provider. Desc')).toEqual({
      title: 'Intro',
      url: 'https://example.org/v',
      description: 'Provider. Desc',
    })
    // Current authoring format uses a colon instead of a dash.
    expect(parseVideo('[Intro](https://example.org/v): Provider. Desc')).toEqual({
      title: 'Intro',
      url: 'https://example.org/v',
      description: 'Provider. Desc',
    })
  })
})
