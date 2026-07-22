export const MOCK_EXAM_DURATION_SECONDS = 120 * 60

export function remainingSeconds(startedAtMs: number, nowMs: number, durationSeconds = MOCK_EXAM_DURATION_SECONDS): number {
  const elapsed = Math.floor(Math.max(0, nowMs - startedAtMs) / 1000)
  return Math.max(0, durationSeconds - elapsed)
}

export function shouldAutoSubmit(seconds: number): boolean {
  return seconds <= 0
}

export function formatRemaining(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
