import { invoke, isTauri } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import type { BookInfo, ReaderHost } from './readerHost'

function normalizeBinary(data?: number[] | Uint8Array): Uint8Array | undefined {
  if (!data) return undefined
  return data instanceof Uint8Array ? data : new Uint8Array(data)
}

export const tauriReaderHost: ReaderHost = {
  isAvailable: () => isTauri(),

  async openFile() {
    const selected = await open({
      multiple: true,
      directory: false,
      pickerMode: 'document',
      filters: [
        {
          name: '电子书',
          extensions: ['txt', 'md', 'epub', 'pdf', 'mobi', 'azw3']
        }
      ]
    })
    if (!selected) return null
    return Array.isArray(selected) ? selected : [selected]
  },

  async selectCoverImage() {
    const selected = await open({
      multiple: false,
      directory: false,
      pickerMode: 'image',
      filters: [
        {
          name: '图片',
          extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp']
        }
      ]
    })
    if (!selected || Array.isArray(selected)) return { success: false, canceled: true }
    return invoke('read_cover_image', { filePath: selected })
  },

  readFile: (filePath) => invoke<string>('read_text_file', { filePath }),
  scanBooks: (dirPath) => invoke<BookInfo[]>('scan_books', { dirPath }),
  saveProgress: (data) => invoke<boolean>('save_progress', { data }),
  getProgress: (filePath) => invoke<number | string>('get_progress', { filePath }),
  deleteProgress: (filePath) => invoke<boolean>('delete_progress', { filePath }),
  migrateProgress: (paths) => invoke<boolean>('migrate_progress', { paths }),
  getFileInfo: (filePath) => invoke('get_file_info', { filePath }),
  readChunk: (params) => invoke('read_chunk', { params }),
  closeFile: (filePath) => invoke<boolean>('close_file', { filePath }),
  parseTOC: (filePath) => invoke('parse_toc', { filePath }),

  async readBuffer(filePath) {
    const result = await invoke<{ success: boolean; data?: number[]; error?: string }>(
      'read_buffer',
      { filePath }
    )
    return { ...result, data: normalizeBinary(result.data) }
  },

  importTextCopy: (sourcePath) => invoke('import_text_copy', { sourcePath }),
  deleteBookCache: (params) => invoke<boolean>('delete_book_cache', { params }),
  async setBossKey(accelerator) {
    try {
      await invoke('set_boss_key', { accelerator })
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }
}
