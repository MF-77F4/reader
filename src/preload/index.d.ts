// src/preload/index.d.ts
import { ElectronAPI } from '@electron-toolkit/preload'

interface BookInfo {
  fileName: string
  fullPath: string
  cover: null | string
  format?: string
}

interface CustomAPI {
  openFile: () => Promise<string[] | null>
  selectCoverImage: () => Promise<{
    success: boolean
    canceled?: boolean
    dataUrl?: string
    error?: string
  }>
  readFile: (filePath: string) => Promise<string>
  scanBooks: (dirPath: string) => Promise<BookInfo[]>
  saveProgress: (data: {
    filePath: string
    offset: number | string
    progress: number
  }) => Promise<boolean>
  getProgress: (filePath: string) => Promise<number | string>
  deleteProgress: (filePath: string) => Promise<boolean>
  migrateProgress: (paths: { from: string; to: string }) => Promise<boolean>

  // 👇 修复点 1：给 getFileInfo 的返回值加上 encoding?: string
  getFileInfo: (
    filePath: string
  ) => Promise<{ size: number; exists: boolean; encoding?: string; error?: string }>

  readChunk: (params: {
    filePath: string
    offset: number
    size: number
    encoding?: string // 允许前端传入编码
    needAlign?: boolean // 允许前端指定是否需要对齐（默认 true）
  }) => Promise<{
    success: boolean
    content: string
    bytesRead: number
    realOffset?: number
    error?: string
  }>

  closeFile: (filePath: string) => Promise<boolean>

  // 解析目录结构（TOC）接口
  parseTOC: (filePath: string) => Promise<{
    success: boolean
    encoding?: string
    toc?: Array<{ title: string; titleStart: number; titleEnd: number }>
    error?: string
  }>

  // 读取二进制 Buffer 的接口（.mobi 等文件）
  readBuffer: (filePath: string) => Promise<{ success: boolean; data?: Uint8Array; error?: string }>

  // 创建应用托管的 TXT / Markdown 副本
  importTextCopy: (sourcePath: string) => Promise<{ success: boolean; path?: string; error?: string }>

  // 清除书籍转换缓存
  deleteBookCache: (params: { filePath: string; sourcePath?: string }) => Promise<boolean>

  setBossKey: (accelerator: string) => Promise<{ success: boolean; error?: string }>
}

declare global {
  interface Window {
    electron: ElectronAPI & CustomAPI
  }
}
