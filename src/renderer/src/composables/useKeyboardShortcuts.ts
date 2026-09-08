import { ref } from 'vue'
import { readerHost } from '../platform/readerHost'

const BOSS_KEY_STORAGE_KEY = 'reader_boss_key'
const DEFAULT_BOSS_KEY = 'F12'

const loadSavedBossKey = (): string => {
  try {
    return localStorage.getItem(BOSS_KEY_STORAGE_KEY)?.trim() || DEFAULT_BOSS_KEY
  } catch {
    return DEFAULT_BOSS_KEY
  }
}

const bossKey = ref(loadSavedBossKey())

export function useKeyboardShortcuts() {
  const setBossKey = async (
    accelerator: string
  ): Promise<{ success: boolean; error?: string }> => {
    const normalized = accelerator.trim()
    const result = await readerHost.setBossKey(normalized)
    if (!result.success) return result

    bossKey.value = normalized
    localStorage.setItem(BOSS_KEY_STORAGE_KEY, normalized)
    return { success: true }
  }

  const syncBossKey = async (): Promise<void> => {
    const result = await readerHost.setBossKey(bossKey.value)
    if (!result.success) {
      console.warn(`无法恢复老板键 ${bossKey.value}: ${result.error || '未知错误'}`)
    }
  }

  const resetBossKey = (): Promise<{ success: boolean; error?: string }> =>
    setBossKey(DEFAULT_BOSS_KEY)

  return {
    bossKey,
    defaultBossKey: DEFAULT_BOSS_KEY,
    setBossKey,
    syncBossKey,
    resetBossKey
  }
}
