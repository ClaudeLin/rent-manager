import { questionKey, type Question } from './questions'

export interface IgnoreQuestionAnnotation {
  question_key: string
  type: 'ignore'
  message: string
}

export interface TypoQuestionAnnotation {
  question_key: string
  type: 'typo'
  message: string
  question_replacement: {
    from: string
    to: string
  }
}

export type QuestionAnnotation = IgnoreQuestionAnnotation | TypoQuestionAnnotation

export interface QuestionAnnotationsDocument {
  schema_version: 1
  updated_at: string
  annotations: QuestionAnnotation[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const assertNoUnknownFields = (value: Record<string, unknown>, allowed: string[], label: string): void => {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key))
  if (unknown) throw new Error(`${label} has unknown field: ${unknown}`)
}

export function validateQuestionAnnotations(value: unknown, questions: Question[]): QuestionAnnotationsDocument {
  if (!isRecord(value) || value.schema_version !== 1 || typeof value.updated_at !== 'string' || !Array.isArray(value.annotations)) {
    throw new Error('Question annotations document is invalid')
  }
  assertNoUnknownFields(value, ['schema_version', 'updated_at', 'annotations'], 'Question annotations document')
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.updated_at)?.slice(1).map(Number)
  const parsedDate = dateParts ? new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2])) : null
  if (!dateParts || parsedDate?.getUTCFullYear() !== dateParts[0] || parsedDate.getUTCMonth() + 1 !== dateParts[1] || parsedDate.getUTCDate() !== dateParts[2]) {
    throw new Error('Question annotations updated_at is invalid')
  }

  const availableKeys = new Set(questions.map(questionKey))
  const seenKeys = new Set<string>()
  const annotations = value.annotations.map((item, index): QuestionAnnotation => {
    if (!isRecord(item) || typeof item.question_key !== 'string' || !availableKeys.has(item.question_key)) {
      throw new Error(`Question annotation ${index} has unknown question key`)
    }
    if (seenKeys.has(item.question_key)) throw new Error(`Question annotation ${index} has duplicate question key`)
    seenKeys.add(item.question_key)
    if (typeof item.message !== 'string' || !item.message.trim()) {
      throw new Error(`Question annotation ${index} has invalid message`)
    }
    if (item.type === 'ignore') {
      assertNoUnknownFields(item, ['question_key', 'type', 'message'], `Question annotation ${index}`)
      return { question_key: item.question_key, type: 'ignore', message: item.message }
    }
    if (item.type === 'typo' && isRecord(item.question_replacement)) {
      assertNoUnknownFields(item, ['question_key', 'type', 'message', 'question_replacement'], `Question annotation ${index}`)
      assertNoUnknownFields(item.question_replacement, ['from', 'to'], `Question annotation ${index} replacement`)
      const from = item.question_replacement.from
      const to = item.question_replacement.to
      const question = questions.find((candidate) => questionKey(candidate) === item.question_key)!
      const occurrences = typeof from === 'string' && from ? question.question.split(from).length - 1 : 0
      if (typeof from !== 'string' || !from || typeof to !== 'string' || !to || from === to || occurrences !== 1) {
        throw new Error(`Question annotation ${index} has invalid replacement`)
      }
      return {
        question_key: item.question_key,
        type: 'typo',
        message: item.message,
        question_replacement: { from, to },
      }
    }
    throw new Error(`Question annotation ${index} has invalid type`)
  })

  return { schema_version: 1, updated_at: value.updated_at, annotations }
}

export function questionAnnotationMap(document: QuestionAnnotationsDocument): Map<string, QuestionAnnotation> {
  return new Map(document.annotations.map((annotation) => [annotation.question_key, annotation]))
}

export function ignoredQuestionKeys(document: QuestionAnnotationsDocument): Set<string> {
  return new Set(document.annotations.filter((annotation) => annotation.type === 'ignore').map((annotation) => annotation.question_key))
}

export function questionAnnotationsSignature(document: QuestionAnnotationsDocument): string {
  if (!document.annotations.length) return ''
  const content = [document.schema_version, document.updated_at, ...[...document.annotations]
    .sort((left, right) => left.question_key.localeCompare(right.question_key))
    .map((annotation) => annotation.type === 'ignore'
      ? `${annotation.question_key}\u001f${annotation.type}\u001f${annotation.message}`
      : `${annotation.question_key}\u001f${annotation.type}\u001f${annotation.message}\u001f${annotation.question_replacement.from}\u001f${annotation.question_replacement.to}`),
  ].join('\u001e')
  let hash = 0x811c9dc5
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `${document.annotations.length}-${hash.toString(16).padStart(8, '0')}`
}

export function annotateQuestionText(question: Question, annotation?: QuestionAnnotation): string {
  if (!annotation || annotation.type !== 'typo') return question.question
  return question.question.replace(annotation.question_replacement.from, annotation.question_replacement.to)
}
