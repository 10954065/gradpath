import yaml from 'js-yaml'
import {
  CONTENT_SOURCES,
  LESSON_DIFFICULTIES,
  type BodySection,
  type ContentSource,
  type KeyTerm,
  type LessonDifficulty,
  type LinkItem,
  type ParsedLesson,
  type ValidationIssue,
  type VideoItem,
} from './types'

/** Headings with a structured meaning. Every other level-2 heading is part of the teaching body. */
export const STRUCTURED_HEADINGS = {
  introduction: 'Introduction',
  objectives: 'Learning Objectives',
  prerequisites: 'Prerequisite Knowledge',
  keyTerms: 'Key Terminology',
  misconceptions: 'Common Misconceptions',
  examMistakes: 'Common Examination Mistakes',
  criticalQuestions: 'Critical Thinking Questions',
  exercises: 'Practical Exercises',
  takeaways: 'Key Takeaways',
  furtherReading: 'Further Reading',
  videos: 'Video Resources',
  revisionSummary: 'Revision Summary',
} as const

type StructuredKey = keyof typeof STRUCTURED_HEADINGS

const HEADING_TO_KEY: ReadonlyMap<string, StructuredKey> = new Map(
  (Object.entries(STRUCTURED_HEADINGS) as [StructuredKey, string][]).map(([key, heading]) => [
    heading.toLowerCase(),
    key,
  ]),
)

export const MIN_BODY_WORDS = 1100
export const MIN_TOTAL_WORDS = 1800
const HARD_MIN_BODY_WORDS = 700

interface RawSection {
  heading: string
  content: string
}

export interface LessonParseResult {
  lesson: ParsedLesson | null
  issues: ValidationIssue[]
}

function normalise(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

export function countWords(markdown: string): number {
  const stripped = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`|[\]()-]/g, ' ')
    .trim()
  if (!stripped) return 0
  return stripped.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
}

function splitFrontMatter(text: string): { data: Record<string, unknown>; body: string } | null {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text)
  if (!match) return null
  const loaded = yaml.load(match[1] ?? '')
  const data = loaded && typeof loaded === 'object' ? (loaded as Record<string, unknown>) : {}
  return { data, body: text.slice(match[0].length) }
}

/** Split markdown into level-2 sections, ignoring headings inside fenced code blocks. */
export function splitSections(body: string): RawSection[] {
  const sections: RawSection[] = []
  let current: RawSection | null = null
  let inFence = false
  for (const line of body.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    const heading = !inFence ? /^##\s+(.+?)\s*#*\s*$/.exec(line) : null
    if (heading && !line.startsWith('###')) {
      if (current) sections.push(current)
      current = { heading: (heading[1] ?? '').trim(), content: '' }
      continue
    }
    if (current) current.content += `${line}\n`
  }
  if (current) sections.push(current)
  return sections.map((s) => ({ ...s, content: s.content.trim() }))
}

const LIST_ITEM = /^\s{0,3}(?:[-*+]|\d+[.)])\s+(.*)$/
const TOP_LEVEL_ITEM = /^ ?(?:[-*+]|\d+[.)])\s+(.*)$/

/** Parse top-level list items; indented lines and nested lists are kept with their parent item. */
export function parseList(markdown: string): string[] {
  const items: string[] = []
  let current: string | null = null
  for (const line of markdown.split('\n')) {
    const match = TOP_LEVEL_ITEM.exec(line)
    if (match) {
      if (current !== null) items.push(current.trim())
      current = match[1] ?? ''
    } else if (current !== null) {
      if (line.trim() === '') current += '\n'
      else current += `\n${line.replace(/^ {2,4}/, '')}`
    }
  }
  if (current !== null) items.push(current.trim())
  return items.map((i) => i.replace(/\n{3,}/g, '\n\n')).filter(Boolean)
}

/** Paragraph text that precedes the first list item in a section. */
function leadingParagraphs(markdown: string): string {
  const lines = markdown.split('\n')
  const firstItem = lines.findIndex((l) => LIST_ITEM.test(l))
  return (firstItem === -1 ? markdown : lines.slice(0, firstItem).join('\n')).trim()
}

export function parseKeyTerm(item: string): KeyTerm | null {
  const patterns = [
    /^\*\*(.+?):\*\*\s*([\s\S]+)$/,
    /^\*\*(.+?)\*\*\s*[:—–-]\s*([\s\S]+)$/,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(item)
    if (match) return { term: (match[1] ?? '').trim(), definition: (match[2] ?? '').trim() }
  }
  return null
}

export function extractUrl(text: string): string | null {
  const angle = /<(https?:\/\/[^>\s]+)>/.exec(text)
  if (angle) return angle[1] ?? null
  const md = /\]\((https?:\/\/[^)\s]+)\)/.exec(text)
  if (md) return md[1] ?? null
  const bare = /(https?:\/\/[^\s)>\]]+)/.exec(text)
  return bare ? (bare[1] ?? '').replace(/[.,;]+$/, '') : null
}

export function parseVideo(item: string): VideoItem | null {
  const match = /^\[(.+?)\]\((https?:\/\/[^)\s]+)\)\s*(?:[:—–-]\s*)?([\s\S]*)$/.exec(item)
  if (!match) return null
  return { title: (match[1] ?? '').trim(), url: match[2] ?? '', description: (match[3] ?? '').trim() }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function parseLesson(fileName: string, rawText: string): LessonParseResult {
  const issues: ValidationIssue[] = []
  const error = (message: string) => issues.push({ file: fileName, message, severity: 'error' })
  const warn = (message: string) => issues.push({ file: fileName, message, severity: 'warning' })

  const text = normalise(rawText)
  let split: ReturnType<typeof splitFrontMatter>
  try {
    split = splitFrontMatter(text)
  } catch (e) {
    error(`Front matter is not valid YAML: ${(e as Error).message}`)
    return { lesson: null, issues }
  }
  if (!split) {
    error('Missing YAML front matter (--- ... ---)')
    return { lesson: null, issues }
  }
  const { data, body } = split

  const title = asString(data.title)
  const summary = asString(data.summary)
  const estimatedMinutes = Number(data.estimatedMinutes ?? 30)
  const difficulty = (asString(data.difficulty) || 'intermediate') as LessonDifficulty
  const source = (asString(data.source) || 'supplementary') as ContentSource
  if (!title) error('Front matter `title` is required')
  if (!summary) error('Front matter `summary` is required')
  if (!Number.isFinite(estimatedMinutes) || estimatedMinutes < 5 || estimatedMinutes > 180)
    error('Front matter `estimatedMinutes` must be a number between 5 and 180')
  if (!LESSON_DIFFICULTIES.includes(difficulty)) error(`Unknown difficulty "${difficulty}"`)
  if (!CONTENT_SOURCES.includes(source)) error(`Unknown content source "${source}"`)

  const sections = splitSections(body)
  const structured = new Map<StructuredKey, string>()
  const bodySections: BodySection[] = []
  for (const section of sections) {
    const key = HEADING_TO_KEY.get(section.heading.toLowerCase())
    if (key) {
      if (structured.has(key)) error(`Duplicate section "## ${section.heading}"`)
      structured.set(key, section.content)
    } else {
      bodySections.push({ heading: section.heading, markdown: section.content })
    }
  }
  for (const [key, heading] of Object.entries(STRUCTURED_HEADINGS) as [StructuredKey, string][]) {
    if (!structured.has(key)) error(`Missing required section "## ${heading}"`)
  }

  const get = (key: StructuredKey) => structured.get(key) ?? ''
  const keyTermItems = parseList(get('keyTerms'))
  const keyTerms = keyTermItems.map(parseKeyTerm)
  keyTerms.forEach((kt, i) => {
    if (!kt) error(`Key term ${i + 1} must use the format "- **Term**: definition"`)
  })
  const furtherReading: LinkItem[] = parseList(get('furtherReading')).map((item) => ({
    text: item.replace(/\s*<https?:\/\/[^>]+>\s*/g, ' ').trim(),
    url: extractUrl(item),
  }))
  const videoItems = parseList(get('videos'))
  const videos = videoItems.map(parseVideo)
  videos.forEach((v, i) => {
    if (!v) error(`Video ${i + 1} must use the format "- [Title](https://...): Provider. Description"`)
  })

  const lesson: ParsedLesson = {
    title,
    summary,
    estimatedMinutes: Math.round(estimatedMinutes),
    difficulty,
    source,
    introduction: get('introduction'),
    objectives: parseList(get('objectives')),
    prerequisites: parseList(get('prerequisites')),
    keyTerms: keyTerms.filter((k): k is KeyTerm => k !== null),
    body: bodySections,
    misconceptions: parseList(get('misconceptions')),
    examMistakes: parseList(get('examMistakes')),
    criticalQuestions: parseList(get('criticalQuestions')),
    exercises: parseList(get('exercises')),
    takeaways: parseList(get('takeaways')),
    furtherReading,
    videos: videos.filter((v): v is VideoItem => v !== null),
    revisionSummary: get('revisionSummary'),
    wordCount: countWords(body),
    bodyWordCount: bodySections.reduce((sum, s) => sum + countWords(s.markdown), 0),
  }

  const minimums: [keyof ParsedLesson, number, string][] = [
    ['objectives', 3, 'learning objectives'],
    ['prerequisites', 1, 'prerequisites'],
    ['keyTerms', 4, 'key terms'],
    ['misconceptions', 2, 'misconceptions'],
    ['examMistakes', 2, 'examination mistakes'],
    ['criticalQuestions', 2, 'critical thinking questions'],
    ['exercises', 1, 'practical exercises'],
    ['takeaways', 3, 'key takeaways'],
    ['furtherReading', 1, 'further reading entries'],
  ]
  for (const [key, min, label] of minimums) {
    const value = lesson[key]
    if (Array.isArray(value) && structured.has(key as StructuredKey) && value.length < min)
      error(`At least ${min} ${label} required (found ${value.length})`)
  }
  if (structured.has('videos') && lesson.videos.length === 0) warn('No video resources listed')
  if (!lesson.introduction && structured.has('introduction')) error('Introduction is empty')
  if (!leadingParagraphs(lesson.revisionSummary) && structured.has('revisionSummary'))
    error('Revision summary needs a summary paragraph')
  if (bodySections.length < 4) error(`Teaching body needs at least 4 sections (found ${bodySections.length})`)
  if (lesson.bodyWordCount < HARD_MIN_BODY_WORDS)
    error(`Teaching body is too short: ${lesson.bodyWordCount} words (minimum ${MIN_BODY_WORDS})`)
  else if (lesson.bodyWordCount < MIN_BODY_WORDS)
    warn(`Teaching body is ${lesson.bodyWordCount} words; target at least ${MIN_BODY_WORDS}`)
  if (lesson.wordCount < MIN_TOTAL_WORDS) warn(`Lesson is ${lesson.wordCount} words; target ${MIN_TOTAL_WORDS}+`)

  return { lesson: issues.some((i) => i.severity === 'error') ? null : lesson, issues }
}
