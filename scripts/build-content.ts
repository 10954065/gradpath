/**
 * Validate curriculum content and (without --check) compile it into supabase/seed.sql.
 *
 *   npm run content:validate                      # validate everything
 *   npm run content:validate -- --course csit-601  # validate one course
 *   npm run content:build                         # validate and write seed.sql + CURRICULUM_STATUS.md
 */
import { loadContent, type LoadedCourse } from './content/loadContent'

const args = process.argv.slice(2)
const checkOnly = args.includes('--check')
const courseFlag = args.indexOf('--course')
const course = courseFlag >= 0 ? args[courseFlag + 1] : undefined
const quiet = args.includes('--quiet')
const partial = args.includes('--partial')

function summarise(c: LoadedCourse): string {
  const lessons = c.modules.flatMap((m) => m.lessons)
  const written = lessons.filter((l) => l.parsed).length
  const questions = c.modules.reduce((n, m) => n + m.questions.length, 0)
  const cards = c.modules.reduce((n, m) => n + m.flashcards.length, 0)
  const words = lessons.reduce((n, l) => n + (l.parsed?.wordCount ?? 0), 0)
  return `${c.outline.code.padEnd(9)} lessons ${String(written).padStart(3)}/${String(lessons.length).padEnd(3)} questions ${String(questions).padStart(4)}  flashcards ${String(cards).padStart(4)}  resources ${String(c.resources.length).padStart(3)}  words ${words}`
}

async function main(): Promise<void> {
  const { courses, issues } = loadContent({ course })
  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')

  if (!quiet) {
    for (const i of issues) console.log(`${i.severity === 'error' ? 'ERROR' : 'warn '} ${i.file}: ${i.message}`)
  }
  console.log('')
  for (const c of courses) console.log(summarise(c))
  console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`)

  // --partial seeds whatever validates (invalid files are skipped, never seeded as placeholders).
  if (errors.length && !(partial && !checkOnly)) process.exit(1)
  if (checkOnly) return

  const { writeSeed, loadLinkVerification } = await import('./content/writeSeed')
  const { writeCurriculumStatus } = await import('./content/writeCurriculumStatus')
  writeSeed(courses)
  const links = loadLinkVerification()
  const verified = new Set(Object.entries(links).filter(([, v]) => v.status === 'verified').map(([url]) => url))
  writeCurriculumStatus(courses, Object.keys(links).length ? verified : undefined)
}

main().catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
