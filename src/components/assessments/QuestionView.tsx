// Renders one assessment question for answering or for review after submission.
import { CheckCircle2, CircleSlash, XCircle } from 'lucide-react'
import { RichText } from '@/components/lessons/RichText'
import { Badge } from '@/components/ui/badge'
import { Input, Textarea } from '@/components/ui/form-controls'
import { choiceOptions, describeCorrectAnswer, isObjective, matchingOptions } from '@/lib/assessment'
import { cn } from '@/lib/utils'
import type { AnswerResponse, AttemptQuestion } from '@/types/database'

const TYPE_LABEL: Record<AttemptQuestion['type'], string> = {
  mcq: 'Multiple choice',
  true_false: 'True or false',
  short_answer: 'Short answer',
  scenario: 'Scenario',
  matching: 'Matching',
  essay: 'Essay',
  case_analysis: 'Case analysis',
}

interface QuestionViewProps {
  question: AttemptQuestion
  index: number
  response: AnswerResponse | undefined
  onChange?: (response: AnswerResponse) => void
  /** Review mode: inputs are disabled and correctness/explanations are shown. */
  review?: boolean
}

function optionTone(review: boolean, selected: boolean, correct: boolean | undefined) {
  if (!review) return selected ? 'border-primary bg-accent' : 'hover:bg-muted/60'
  if (correct) return 'border-success bg-success/8'
  if (selected) return 'border-danger bg-danger/8'
  return 'opacity-80'
}

export function QuestionView({ question: q, index, response, onChange, review = false }: QuestionViewProps) {
  const name = `q-${q.id}`
  const correct = q.correct

  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">Question {index + 1}</legend>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Question {index + 1}</span>
        <Badge>{TYPE_LABEL[q.type]}</Badge>
        <Badge className="capitalize">{q.bloom}</Badge>
        <span>
          {q.marks} mark{Number(q.marks) === 1 ? '' : 's'}
        </span>
        {review && isObjective(q) ? (
          q.isCorrect ? (
            <Badge tone="success">
              <CheckCircle2 aria-hidden /> Correct
            </Badge>
          ) : (q.points ?? 0) > 0 ? (
            <Badge tone="warning">Partly correct · {q.points}/{q.maxPoints}</Badge>
          ) : (
            <Badge tone="danger">
              <XCircle aria-hidden /> {response ? 'Incorrect' : 'Not answered'}
            </Badge>
          )
        ) : null}
      </div>

      {q.scenario ? (
        <div className="mb-3 rounded-lg border-l-4 border-primary/50 bg-surface-2 p-3 text-sm">
          <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Scenario</p>
          <RichText markdown={q.scenario} className="font-sans text-sm" />
        </div>
      ) : null}
      {q.case ? (
        <div className="mb-3 max-h-80 overflow-y-auto rounded-lg border bg-surface-2 p-4 text-sm">
          <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Case</p>
          <RichText markdown={q.case} className="font-sans text-sm" />
        </div>
      ) : null}

      <RichText markdown={q.prompt} className="mb-4 font-sans text-[15px] font-medium" />

      {q.type === 'mcq' || q.type === 'scenario' ? (
        <div className="flex flex-col gap-2" role="radiogroup">
          {choiceOptions(q).map((o) => {
            const selected = response && 'option' in response && response.option === o.id
            const isKey = review && correct?.option === o.id
            return (
              <label key={o.id} className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors', optionTone(review, Boolean(selected), isKey))}>
                <input
                  type="radio"
                  name={name}
                  value={o.id}
                  checked={Boolean(selected)}
                  disabled={review}
                  onChange={() => onChange?.({ option: o.id })}
                  className="mt-0.5 size-4 accent-[var(--color-primary)]"
                />
                <span>
                  <span className="mr-1.5 font-semibold uppercase">{o.id}.</span>
                  <RichText markdown={o.text} inline />
                </span>
              </label>
            )
          })}
        </div>
      ) : null}

      {q.type === 'true_false' ? (
        <div className="grid grid-cols-2 gap-2" role="radiogroup">
          {[true, false].map((v) => {
            const selected = response && 'value' in response && response.value === v
            const isKey = review && correct?.value === v
            return (
              <label key={String(v)} className={cn('flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm font-medium', optionTone(review, Boolean(selected), isKey))}>
                <input
                  type="radio"
                  name={name}
                  checked={Boolean(selected)}
                  disabled={review}
                  onChange={() => onChange?.({ value: v })}
                  className="size-4 accent-[var(--color-primary)]"
                />
                {v ? 'True' : 'False'}
              </label>
            )
          })}
        </div>
      ) : null}

      {q.type === 'short_answer' ? (
        <Input
          aria-label="Your answer"
          placeholder="Type a short answer"
          value={response && 'text' in response ? response.text : ''}
          disabled={review}
          maxLength={200}
          onChange={(e) => onChange?.({ text: e.target.value })}
        />
      ) : null}

      {q.type === 'matching' ? (
        <div className="flex flex-col gap-2">
          {matchingOptions(q).left.map((l) => {
            const pairs = response && 'pairs' in response ? response.pairs : {}
            const chosen = pairs[l.id] ?? ''
            const keyPairs = (correct?.pairs ?? {}) as Record<string, string>
            const ok = review && chosen === keyPairs[l.id]
            return (
              <div key={l.id} className={cn('grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-2 sm:items-center', review && (ok ? 'border-success' : 'border-danger'))}>
                <span className="font-medium">
                  <RichText markdown={l.text} inline />
                </span>
                <select
                  aria-label={`Match for ${l.text}`}
                  value={chosen}
                  disabled={review}
                  onChange={(e) => onChange?.({ pairs: { ...pairs, [l.id]: e.target.value } })}
                  className="h-9 w-full rounded-md border bg-surface px-2 text-sm"
                >
                  <option value="">Choose a match…</option>
                  {matchingOptions(q).right.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.text}
                    </option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>
      ) : null}

      {q.type === 'essay' || q.type === 'case_analysis' ? (
        <div className="flex flex-col gap-3">
          {q.structure.length ? (
            <details className="rounded-lg border bg-surface-2 p-3 text-sm" open={!review}>
              <summary className="cursor-pointer font-medium">Suggested answer structure</summary>
              <ul className="mt-2 list-disc pl-5 text-muted-foreground">
                {q.structure.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </details>
          ) : null}
          <Textarea
            aria-label="Your answer"
            rows={review ? 6 : 12}
            placeholder="Write your answer. Extended responses are self-assessed against the rubric after you submit."
            value={response && 'text' in response ? response.text : ''}
            disabled={review}
            onChange={(e) => onChange?.({ text: e.target.value })}
          />
          {q.rubric.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <caption className="mb-1 text-left text-xs font-semibold">Marking rubric ({q.marks} marks)</caption>
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="py-1.5 pr-3 font-medium">Criterion</th>
                    <th className="py-1.5 pr-3 font-medium">Marks</th>
                    <th className="py-1.5 font-medium">What good looks like</th>
                  </tr>
                </thead>
                <tbody>
                  {q.rubric.map((r) => (
                    <tr key={r.criterion} className="border-b align-top">
                      <td className="py-1.5 pr-3 font-medium">{r.criterion}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{r.marks}</td>
                      <td className="py-1.5 text-muted-foreground">{r.descriptor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {review ? (
        <div className="mt-4 flex flex-col gap-2 rounded-lg bg-surface-2 p-3 text-sm">
          {isObjective(q) && describeCorrectAnswer(q) ? (
            <p>
              <span className="font-semibold">Correct answer: </span>
              {describeCorrectAnswer(q)}
            </p>
          ) : null}
          {q.explanation ? (
            <div>
              <span className="font-semibold">Explanation: </span>
              <RichText markdown={q.explanation} className="mt-1 font-sans text-sm" />
            </div>
          ) : null}
          {q.modelAnswer ? (
            <details>
              <summary className="cursor-pointer font-semibold">Model answer guidance</summary>
              <RichText markdown={q.modelAnswer} className="mt-2 font-sans text-sm" />
            </details>
          ) : null}
          {!q.explanation && !q.modelAnswer ? (
            <p className="inline-flex items-center gap-1 text-muted-foreground">
              <CircleSlash className="size-3.5" aria-hidden /> Answers are not revealed for this assessment.
            </p>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  )
}
