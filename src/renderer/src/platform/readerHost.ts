export interface BookInfo {
  fileName: string
  fullPath: string
  cover: null | string
  format?: string
}

export interface FileInfoResult {
  size: number
  exists: boolean
  encoding?: string
  error?: string
}

export interface ReadChunkParams {
  filePath: string
  offset: number
  size: number
  encoding?: string
  needAlign?: boolean
}

export interface ReadChunkResult {
  success: boolean
  content: string
  bytesRead: number
  realOffset?: number
  error?: string
}

export interface ReaderHost {
  isAvailable(): boolean
  openFile(): Promise<string[] | null>
  selectCoverImage(): Promise<{
    success: boolean
    canceled?: boolean
    dataUrl?: string
    error?: string
  }>
  readFile(filePath: string): Promise<string>
  scanBooks(dirPath: string): Promise<BookInfo[]>
  saveProgress(data: {
    filePath: string
    offset: number | string
    progress: number
  }): Promise<boolean>
  getProgress(filePath: string): Promise<number | string>
  deleteProgress(filePath: string): Promise<boolean>
  migrateProgress(paths: { from: string; to: string }): Promise<boolean>
  getFileInfo(filePath: string): Promise<FileInfoResult>
  readChunk(params: ReadChunkParams): Promise<ReadChunkResult>
  closeFile(filePath: string): Promise<boolean>
  parseTOC(filePath: string): Promise<{
    success: boolean
    encoding?: string
    toc?: Array<{ title: string; titleStart: number; titleEnd: number }>
    error?: string
  }>
  readBuffer(filePath: string): Promise<{
    success: boolean
    data?: Uint8Array
    error?: string
  }>
  importTextCopy(sourcePath: string): Promise<{
    success: boolean
    path?: string
    error?: string
  }>
  deleteBookCache(params: { filePath: string; sourcePath?: string }): Promise<boolean>
  setBossKey(accelerator: string): Promise<{ success: boolean; error?: string }>
}

function requireElectronHost(): Window['electron'] {
  if (!window.electron) {
    throw new Error('Electron reader host is unavailable')
  }
  return window.electron
}

/**
 * Compatibility adapter for the current Electron release.
 * Tauri will implement the same ReaderHost contract without changing reader engines.
 */
const electronReaderHost: ReaderHost = {
  isAvailable: () => typeof window !== 'undefined' && Boolean(window.electron),
  openFile: () => requireElectronHost().openFile(),
  selectCoverImage: () => requireElectronHost().selectCoverImage(),
  readFile: (filePath) => requireElectronHost().readFile(filePath),
  scanBooks: (dirPath) => requireElectronHost().scanBooks(dirPath),
  saveProgress: (data) => requireElectronHost().saveProgress(data),
  getProgress: (filePath) => requireElectronHost().getProgress(filePath),
  deleteProgress: (filePath) => requireElectronHost().deleteProgress(filePath),
  migrateProgress: (paths) => requireElectronHost().migrateProgress(paths),
  getFileInfo: (filePath) => requireElectronHost().getFileInfo(filePath),
  readChunk: (params) => requireElectronHost().readChunk(params),
  closeFile: (filePath) => requireElectronHost().closeFile(filePath),
  parseTOC: (filePath) => requireElectronHost().parseTOC(filePath),
  readBuffer: (filePath) => requireElectronHost().readBuffer(filePath),
  importTextCopy: (sourcePath) => requireElectronHost().importTextCopy(sourcePath),
  deleteBookCache: (params) => requireElectronHost().deleteBookCache(params),
  setBossKey: (accelerator) => requireElectronHost().setBossKey(accelerator)
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/** The only host selected by reader business code. */
export const readerHost: ReaderHost = isTauriRuntime() ? tauriReaderHost : electronReaderHost
import { tauriReaderHost } from './tauriReaderHost'
