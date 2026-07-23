export interface Option {
  id: string
  text: string
}

export interface Question {
  chapter_no: number
  chapter_code: string
  chapter_title: string
  section_no: number
  section_code: string
  section_title: string
  question_no: number
  question: string
  options: Option[]
  answer: string
  law_reference?: string
}

export interface QuestionFilter {
  chapterNo?: number
  sectionNo?: number
}

export interface SelectionOptions extends QuestionFilter {
  count: number
  wrongKeys?: string[]
  rng?: () => number
  order?: 'random' | 'sequential'
}

const requiredStrings = ['chapter_code', 'chapter_title', 'section_code', 'section_title', 'question', 'answer'] as const

export function questionKey(question: Pick<Question, 'chapter_no' | 'section_no' | 'question_no'>): string {
  return `c${question.chapter_no}-s${question.section_no}-q${question.question_no}`
}

export function validateQuestionBank(value: unknown): Question[] {
  if (!Array.isArray(value)) throw new Error('Question bank must be an array')
  const keys = new Set<string>()
  value.forEach((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`Question ${index} must be an object`)
    const question = item as Partial<Question>
    if (![question.chapter_no, question.section_no, question.question_no].every(Number.isInteger)) throw new Error(`Question ${index} has invalid numbering`)
    if (!requiredStrings.every((key) => typeof question[key] === 'string' && question[key].trim())) throw new Error(`Question ${index} has invalid text`)
    if (!Array.isArray(question.options) || question.options.length < 2 || question.options.some((option) => !option || typeof option.id !== 'string' || !/^[A-D]$/.test(option.id) || typeof option.text !== 'string' || !option.text.trim())) throw new Error(`Question ${index} has invalid options`)
    if (new Set(question.options.map((option) => option.id)).size !== question.options.length) throw new Error(`Question ${index} has invalid options`)
    if (!question.options.some((option) => option.id === question.answer)) throw new Error(`Question ${index} answer is not an option`)
    const key = questionKey(question as Question)
    if (keys.has(key)) throw new Error(`Question ${index} has duplicate key`)
    keys.add(key)
  })
  return value as Question[]
}

export function filterQuestions(questions: Question[], filter: QuestionFilter = {}): Question[] {
  return questions.filter((question) =>
    (filter.chapterNo === undefined || question.chapter_no === filter.chapterNo)
    && (filter.sectionNo === undefined || question.section_no === filter.sectionNo),
  )
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1))
    ;[copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]]
  }
  return copy
}

export function selectQuestions(questions: Question[], options: SelectionOptions): Question[] {
  const candidates = filterQuestions(questions, options)
  const random = options.rng ?? Math.random
  const wrong = new Set(options.wrongKeys ?? [])
  const prioritized = candidates.filter((question) => wrong.has(questionKey(question)))
  const remaining = candidates.filter((question) => !wrong.has(questionKey(question)))
  const order = (items: Question[]) => options.order === 'sequential'
    ? [...items].sort((left, right) => left.chapter_no - right.chapter_no || left.section_no - right.section_no || left.question_no - right.question_no)
    : shuffle(items, random)
  return [...order(prioritized), ...order(remaining)].slice(0, Math.max(0, Math.min(options.count, candidates.length)))
}

/** 建立固定題組：十章各十題，題目不足時拒絕建卷。 */
export function buildMockExam(questions: Question[], rng: () => number = Math.random): Question[] {
  const chapters = Array.from({ length: 10 }, (_, index) => index + 1)
  const selected = chapters.flatMap((chapterNo) => {
    const chapterQuestions = filterQuestions(questions, { chapterNo })
    if (chapterQuestions.length < 10) {
      throw new Error(`第 ${chapterNo} 章題數不足 10 題，無法建立模擬考`)
    }
    return selectQuestions(chapterQuestions, { count: 10, rng })
  })
  return shuffle(selected, rng)
}
