# GradPath Content Authoring Specification

All curriculum content lives in `content/courses/<course-slug>/` as plain text files, separate from the UI.
`npm run content:validate` checks every file against this specification and `npm run content:build`
compiles the content into `supabase/seed.sql` (idempotent upserts with deterministic UUIDs).

```
content/courses/<course-slug>/
  course.yaml                         # course metadata, modules and ordered lesson outline
  resources.yaml                      # curated external learning resources
  lessons/<module-slug>/<lesson-slug>.md
  questions/<module-slug>.yaml        # practice question bank for the module
  flashcards/<module-slug>.yaml       # curriculum flashcards for the module
```

Slugs are lowercase kebab-case. Every lesson listed in `course.yaml` must have a lesson file, and every
lesson file must be listed in `course.yaml`.

## Academic integrity rules (mandatory)

1. **Never invent** authors, journals, papers, publication dates, DOIs, statistics, URLs, official course
   requirements, lecturer instructions, examination dates or University of Ghana policies.
2. Cite only works you are certain exist (standard textbooks, standards documents, well-known seminal
   papers). Use APA 7. If unsure of a detail (edition, year), omit the reference rather than guess.
3. Do not state precise statistics (percentages, market sizes, user counts) unless they are widely
   established facts. Prefer qualitative statements ("mobile money is widely used in Ghana").
4. Hypothetical businesses and scenarios must be labelled **Illustrative scenario** and must not be
   presented as real organisations or real events. Real-organisation case studies must describe only
   well-documented public facts.
5. Content is **original explanation**. Do not reproduce copyrighted textbook passages.
6. Content is supplementary study material, not official University of Ghana teaching material.
7. Financial, legal and regulatory content is educational, not advice. Security exercises must only be
   performed on systems the student owns or is explicitly authorised to test.

## Lesson file (`lessons/<module-slug>/<lesson-slug>.md`)

YAML front matter followed by Markdown. Sections are level-2 headings (`##`). The following headings are
**required, spelled exactly**, and are parsed into structured fields:

| Heading | Format |
|---|---|
| `## Introduction` | 1-3 paragraphs that motivate the lesson |
| `## Learning Objectives` | bullet list, each starting with a measurable verb (Explain, Compare, Apply, Evaluate…) |
| `## Prerequisite Knowledge` | bullet list (may say "None beyond …") |
| `## Key Terminology` | bullet list, each `- **Term**: definition` |
| `## Common Misconceptions` | bullet list, each misconception followed by the correction |
| `## Common Examination Mistakes` | bullet list |
| `## Critical Thinking Questions` | numbered list |
| `## Practical Exercises` | numbered list; each exercise has a clear task and expected output |
| `## Key Takeaways` | bullet list |
| `## Further Reading` | bullet list of APA 7 references; optional URL in angle brackets `<https://…>` |
| `## Video Resources` | bullet list `- [Title](https://…): Provider. One-sentence description.` Use only official pages you are confident exist (e.g. provider learning portals or official channels). If unsure, link the provider's official learning page instead of a specific video. |
| `## Revision Summary` | one compact paragraph plus up to 6 bullets for last-minute revision |

Every other `##` heading is treated as **teaching body** and rendered in order between *Key Terminology*
and *Common Misconceptions*. The body must contain at least four sections that together cover, where
relevant: detailed explanation, theories, frameworks and models, step-by-step procedures, worked
examples (mathematical/technical where applicable), a **Ghanaian business application**, an
**international case study**, and a diagram. Recommended headings:

- `## Detailed Explanation` (use `###` sub-headings freely)
- `## Theories, Frameworks and Models`
- `## Step-by-Step Guide` / `## Worked Example`
- `## Ghanaian Business Application`
- `## International Case Study`
- `## Diagram`

Diagrams use fenced Mermaid blocks (```` ```mermaid ````) with simple `flowchart TD`/`flowchart LR`
syntax (quote labels containing punctuation: `A["Label (x)"]`), or Markdown tables. Mathematical content
uses plain text and inline code (no LaTeX).

Front matter:

```yaml
---
title: "Research Paradigms: Positivism, Interpretivism and Pragmatism"
summary: One sentence describing what the student will be able to do after the lesson.
estimatedMinutes: 40          # realistic study time, 25-60
difficulty: intermediate       # introductory | intermediate | advanced
source: supplementary          # supplementary (default for authored content)
---
```

Quote any front-matter value that contains a colon.

Length: the whole lesson should be **1,800-3,000 words**; the teaching body alone at least 1,100 words.
Write in clear British academic English for postgraduate learners. Teach students to analyse, evaluate,
justify and apply, not only to memorise.

## Question bank (`questions/<module-slug>.yaml`)

All questions are labelled in the app as **supplementary practice questions**. Never present them as
official or past examination questions.

```yaml
module: foundations-of-research
questions:
  - id: q01                       # unique within the file
    lesson: meaning-and-purpose-of-research   # lesson slug, or omit for module-level questions
    type: mcq                     # mcq | true_false | short_answer | scenario | matching | essay | case_analysis
    bloom: understand             # recall | understand | apply | analyse | evaluate
    difficulty: medium            # easy | medium | hard
    objective: Distinguish research methodology from research methods
    prompt: Which statement best describes research methodology?
    options:                      # mcq / scenario: exactly 4 options
      - The specific tools used to collect data
      - The overall philosophy and justification for how research is conducted
      - The statistical software used for analysis
      - The list of references in a thesis
    answer: 1                     # zero-based index of the correct option
    explanation: Methodology is the reasoned justification ... (why the answer is right AND why distractors are wrong)
```

Type-specific fields:

- `true_false`: `answer: true` or `answer: false`.
- `short_answer`: `answers: [accepted, alternative spellings]`; short (1-4 word) answers only;
  matching is case- and punctuation-insensitive.
- `scenario`: like `mcq` plus `scenario: |` (a short realistic situation the prompt refers to).
- `matching`: `pairs:` list of `{ left: ..., right: ... }` (3-6 correct pairs; the app shuffles).
- `essay` and `case_analysis`: no auto-marking. Provide `marks` (e.g. 20), `case: |` (case_analysis only),
  `structure:` (suggested answer outline, list of strings), `rubric:` list of
  `{ criterion, marks, descriptor }` whose marks sum to `marks`, and `modelAnswer: |` (model answer
  guidance, 150-350 words).

Every question needs `explanation` (for essay/case types, a short note on what examiners look for).

Per module the file must contain **at least 6 objective questions per lesson** (a mix of mcq,
true_false, scenario, short_answer and matching, spanning at least three Bloom levels), plus at least
**1 essay or case_analysis** question at module level. Avoid repetitive or trivial questions; every
explanation must teach.

## Flashcards (`flashcards/<module-slug>.yaml`)

```yaml
module: foundations-of-research
cards:
  - lesson: meaning-and-purpose-of-research
    front: What is the difference between research methods and research methodology?
    back: Methods are the techniques for collecting/analysing data; methodology is the justified strategy and philosophy behind choosing them.
```

At least **5 cards per lesson**, testing understanding rather than trivia.

## Resources (`resources.yaml`)

```yaml
resources:
  - title: Google Scholar
    description: Search engine for scholarly literature across disciplines.
    provider: Google
    url: https://scholar.google.com/
    category: database            # database | course | documentation | tool | guide | standard | organisation | video | reference
    module: literature-review     # optional module slug
    difficulty: introductory      # introductory | intermediate | advanced
    stage: foundation             # foundation | core | advanced | revision
    accessType: unknown           # free | freemium | paid | registration | unknown (use unknown unless certain)
```

Verification status and the last-verified date are **not** written by authors. `npm run
content:verify-links` checks every URL in resources, further reading and video sections and records the
result in `content/link-verification.json`; unreachable links are shown as *unverified* in the app.

## Punctuation

Do not use em dashes (—) or en dashes (–) as punctuation; they make the writing read as machine-generated. Use a
comma, colon, full stop or parentheses instead, and an ordinary hyphen for ranges (`15-20 hours`, `pp. 77-101`).
Write labels as `**Term**: definition` and links as `- [Title](https://…): Provider. Description.`
