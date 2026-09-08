// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

interface ProgressData {
  filePath: string
  offset: number | string
  progress: number
}

// 1. 定义你自己的自定义 API
const customAPI = {
  // 打开文件选择器
  openFile: () => ipcRenderer.invoke('file:open'),

  // 选择并读取书籍封面图片
  selectCoverImage: () => ipcRenderer.invoke('file:selectCover'),

  // 读取文件内容
  readFile: (filePath: string) => ipcRenderer.invoke('file:read', filePath),

  // 扫描文件夹
  scanBooks: (dirPath: string) => ipcRenderer.invoke('book:scan', dirPath),

  // 保存进度 (预留)
  saveProgress: (data: ProgressData) => ipcRenderer.invoke('file:saveProgress', data),

  getProgress: (filePath: string) => ipcRenderer.invoke('file:getProgress', filePath),

  deleteProgress: (filePath: string) => ipcRenderer.invoke('file:deleteProgress', filePath),

  migrateProgress: (paths: { from: string; to: string }) =>
    ipcRenderer.invoke('file:migrateProgress', paths),

  // 👇 新增暴露
  getFileInfo: (filePath: string) => ipcRenderer.invoke('file:getInfo', filePath),

  readChunk: (params: { filePath: string; offset: number; size: number }) =>
    ipcRenderer.invoke('file:readChunk', params),

  closeFile: (filePath: string) => ipcRenderer.invoke('file:close', filePath),

  // 暴露目录解析
  parseTOC: (filePath: string) => ipcRenderer.invoke('book:parseTOC', filePath),

  // 暴露读取二进制 Buffer 的接口
  readBuffer: (filePath: string) => ipcRenderer.invoke('file:readBuffer', filePath),

  // 导入 TXT / Markdown 时创建应用托管副本
  importTextCopy: (sourcePath: string) => ipcRenderer.invoke('file:importTextCopy', sourcePath),

  // 暴露清除缓存接口
  deleteBookCache: (params: { filePath: string; sourcePath?: string }) =>
    ipcRenderer.invoke('file:deleteCache', params),

  setBossKey: (accelerator: string) =>
    ipcRenderer.invoke('shortcut:setBossKey', accelerator)
}

// 2. 合并：将库自带的 API 和你自定义的 API 合并
// 使用展开运算符 ... 将两个对象合并为一个新对象
const api = {
  ...electronAPI, // 包含 minimize, close, copyText 等默认方法
  ...customAPI // 包含 openFile, readFile 等自定义方法
}

// 3. 暴露给渲染进程
if (process.contextIsolated) {
  try {
    // 名字依然叫 'electron'，这样 Vue 里还是用 window.electron
    contextBridge.exposeInMainWorld('electron', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = { ...electronAPI, ...api }
}
