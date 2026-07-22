import { describe, expect, it } from 'vitest'
import { MOCK_EXAM_DURATION_SECONDS, remainingSeconds, shouldAutoSubmit } from '../../src/lib/timer'

describe('模擬考計時器', () => {
  it('以 120 分鐘作為固定考試時間', () => {
    expect(MOCK_EXAM_DURATION_SECONDS).toBe(120 * 60)
  })

  it('依開始時間計算剩餘秒數且不會低於零', () => {
    expect(remainingSeconds(1_000, 1_000)).toBe(120 * 60)
    expect(remainingSeconds(1_000, 2_500)).toBe(120 * 60 - 1)
    expect(remainingSeconds(1_000, 9_000_000)).toBe(0)
  })

  it('時間歸零時要求自動交卷', () => {
    expect(shouldAutoSubmit(1)).toBe(false)
    expect(shouldAutoSubmit(0)).toBe(true)
  })
})