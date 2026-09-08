import { app, shell, BrowserWindow, ipcMain, dialog, globalShortcut } from 'electron'
import { join } from 'path'
import { electronApp, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import path from 'path'

// 引入文件处理和编码库
import * as fs from 'node:fs'
import jschardet from 'jschardet'
import iconv from 'iconv-lite'

import { getFileSize, clearFileCache } from './fileReader'
import { generateToc } from './tocParser'

//用来给文件路径生成唯一的缓存文件名
import { createHash } from 'node:crypto'
import windowStateKeeper from 'electron-window-state'

// ============================================================
// ============================================================
// 🛡️ 编码净化器：专治各种不服和奇葩编码
function sanitizeEncoding(detectedEncoding: string | null | undefined): string {
  if (!detectedEncoding) return 'utf-8'

  const enc = detectedEncoding.toUpperCase()

  // 1. 过滤掉引起崩溃的 SIG 尾巴
  if (enc === 'UTF-8-SIG') return 'utf-8'

  // 2. 强制将老旧的中文编码升格为最全的 GB18030，杜绝生僻字变问号
  if (enc === 'GB2312' || enc === 'GBK' || enc === 'CP936') {
    return 'gb18030'
  }

  // 3. 处理 ASCII（其实也就是基础的 UTF-8）
  if (enc === 'ASCII') return 'utf-8'

  // 4. 拦截 iconv-lite 不支持的 UTF-32，强行 fallback 防止软件崩溃
  if (enc.includes('UTF-32')) {
    console.warn('警告：遇到不支持的 UTF-32 编码，尝试使用 utf-8 强行读取')
    return 'utf-8'
  }

  // 其他编码（如 BIG5, UTF-16LE 等），直接转小写交给 iconv-lite
  return enc.toLowerCase()
}

//定义一个变量来存储主窗口，方便后续访问
let mainWindow: BrowserWindow | null = null
let currentBossKey = 'F12'
let isBossKeyRegistered = false
const APP_USER_MODEL_ID = 'com.electron.reader'
const APP_DISPLAY_NAME = '阅读器'

function releaseBossKey(): void {
  if (isBossKeyRegistered) globalShortcut.unregister(currentBossKey)
  isBossKeyRegistered = false
}

function registerBossKey(): void {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return
  if (isBossKeyRegistered) return
  try {
    isBossKeyRegistered = globalShortcut.register(currentBossKey, toggleBossKey)
  } catch {
    isBossKeyRegistered = false
  }
}

function toggleBossKey(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return

  if (mainWindow.isVisible()) {
    mainWindow.hide()
    return
  }

  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function setBossKey(accelerator: string): { success: boolean; error?: string } {
  const normalized = accelerator.trim()
  if (!normalized) return { success: false, error: '快捷键不能为空' }
  if (normalized === currentBossKey && isBossKeyRegistered) return { success: true }

  // Test the replacement before releasing the working shortcut.
  if (normalized !== currentBossKey || !isBossKeyRegistered) {
    try {
      if (!globalShortcut.register(normalized, toggleBossKey)) {
        return { success: false, error: '快捷键已被其他程序占用或系统不支持，请更换组合键（例如 Ctrl+Shift+F12）' }
      }
    } catch {
      return { success: false, error: '无效的快捷键，请重新设置' }
    }
  }
  if (normalized !== currentBossKey) releaseBossKey()
  currentBossKey = normalized
  isBossKeyRegistered = true
  if (mainWindow?.isMinimized()) releaseBossKey()
  return { success: true }
}

function createWindow(): void {
  const mainWindowState = windowStateKeeper({
    defaultWidth: 1000, // 你原本的默认宽度
    defaultHeight: 750  // 你原本的默认高度
  })

  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,

    show: false,
    backgroundColor: '#e9eaec',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#f3f3f4',
      symbolColor: '#77777d',
      height: 38
    },
    autoHideMenuBar: true, // 隐藏菜单栏，更像原生应用
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false, // 为了简化 IPC 通信，暂时关闭沙箱（生产环境可优化）
      contextIsolation: true // 必须开启，保证安全
    }
  })

  mainWindowState.manage(mainWindow)

  mainWindow.on('minimize', releaseBossKey)
  mainWindow.on('restore', registerBossKey)
  mainWindow.on('show', registerBossKey)
  mainWindow.on('focus', registerBossKey)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    releaseBossKey()
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 热更新对renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// 处理 "打开文件对话框" 请求
ipcMain.handle('file:open', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    title: '选择要导入的书籍文件'
  })

  if (result.canceled) {
    return null // 用户取消了选择
  } else {
    return result.filePaths
  }
})

ipcMain.handle('shortcut:setBossKey', (_event, accelerator: string) => setBossKey(accelerator))

ipcMain.handle('file:selectCover', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    title: '选择书籍封面',
    filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] }]
  })

  if (result.canceled || result.filePaths.length === 0) return { success: false, canceled: true }

  const filePath = result.filePaths[0]
  try {
    const fileInfo = await fs.promises.stat(filePath)
    if (fileInfo.size > 10 * 1024 * 1024) {
      return { success: false, error: '图片文件不能超过 10 MB' }
    }

    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp'
    }
    const mimeType = mimeTypes[path.extname(filePath).toLowerCase()]
    if (!mimeType) return { success: false, error: '不支持这种图片格式' }

    const imageBuffer = await fs.promises.readFile(filePath)
    return { success: true, dataUrl: `data:${mimeType};base64,${imageBuffer.toString('base64')}` }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// 获取文件信息并检测编码
ipcMain.handle('file:getInfo', async (_, filePath: string) => {
  try {
    const size = getFileSize(filePath)
    return { size, exists: true } // 不再在这里探测编码了！
  } catch (error) {
    return { size: 0, exists: false, error: String(error) }
  }
})

// 👇 新增：读取文件片段 (核心性能接口)
// 👇 升级版：读取文件片段 (自带安全边界对齐黑科技！)
ipcMain.handle('file:readChunk', async (_, params) => {
  // 👇 接收前端传来的 needAlign 开关
  const { filePath, offset, size, encoding, needAlign } = params
  try {
    const fd = await fs.promises.open(filePath, 'r')
    try {
      const buffer = Buffer.alloc(size)
      const { bytesRead } = await fd.read(buffer, 0, size, offset)

      if (bytesRead === 0) {
        return { success: true, content: '', bytesRead: 0, realOffset: offset }
      }

      let startIdx = 0
      // 🌟 核心修复：只有前端明确要求对齐 (needAlign 为 true) 且不是从头读时，才去切掉半截！
      if (needAlign && offset > 0) {
        const previousByte = Buffer.alloc(1)
        const { bytesRead: previousBytesRead } = await fd.read(previousByte, 0, 1, offset - 1)

        // 已经位于完整行开头时直接保留该行；只有落在行中间才向后寻找换行符。
        if (previousBytesRead > 0 && previousByte[0] !== 10) {
          startIdx = buffer.indexOf(10) // 寻找 \n
          if (startIdx !== -1 && startIdx < bytesRead) {
            startIdx += 1
          } else {
            startIdx = 0
          }
        }
      }

      const validBuffer = buffer.subarray(startIdx, bytesRead)

      const safeEncoding = sanitizeEncoding(encoding)
      const content = iconv.decode(validBuffer, safeEncoding)

      return {
        success: true,
        content,
        bytesRead: bytesRead - startIdx,
        realOffset: offset + startIdx
      }
    } finally {
      await fd.close()
    }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// 可选：关闭文件时清理缓存
ipcMain.handle('file:close', async (_, filePath: string) => {
  clearFileCache(filePath)
  return true
})

// 处理 "读取文件内容" 请求
ipcMain.handle('file:read', async (_, filePath: string) => {
  try {
    // 1. 读取原始二进制数据 (Buffer)
    const buffer = await fs.promises.readFile(filePath)

    // 2. 检测编码 (如果没装 jschardet，可以直接跳过检测，默认尝试 gbk 或 utf-8，但建议保留检测)
    let encoding = 'utf-8'
    if (typeof jschardet !== 'undefined') {
      const detected = jschardet.detect(buffer)
      // jschardet 可能返回 'GB2312' 或 'GBK'，iconv-lite 都支持
      if (detected.encoding && detected.confidence > 0.8) {
        encoding = detected.encoding
      }
    }

    encoding = sanitizeEncoding(encoding)

    console.log(`检测到编码: ${encoding}, 准备解码...`)

    // 3. 【关键】使用 iconv-lite 进行解码
    // iconv.decode(buffer, encoding) 会返回正确的字符串
    const content = iconv.decode(buffer, encoding)
    return content
  } catch (error) {
    console.error('读取文件失败:', error)
    try {
      const buffer = await fs.promises.readFile(filePath)
      return iconv.decode(buffer, 'gbk')
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      throw new Error('无法读取文件：编码不支持或文件损坏')
    }
  }
})

// 3. 扫描文件夹获取书单
ipcMain.handle('book:scan', async (_, dirPath: string) => {
  try {
    const files = await fs.promises.readdir(dirPath)
    const books: ScanBookResult[] = []

    for (const file of files) {
      if (file.endsWith('.txt') || file.endsWith('.md')) {
        books.push({
          fileName: file,
          fullPath: join(dirPath, file),
          cover: null // 暂时留空，前端用默认图
        })
      }
    }
    return books
  } catch (error) {
    console.error('扫描文件夹失败:', error)
    return []
  }
})

const tocParserVersion = 'native-rules-v1'

// 👇 带有永久缓存能力的 AI 目录解析器
// 👇 完美符合规范的 AI 目录解析器 (带永久缓存)
ipcMain.handle('book:parseTOC', async (_, filePath: string) => {
  const extension = path.extname(filePath).toLowerCase()
  if (extension !== '.txt' && extension !== '.md') {
    return { success: false, error: '标题识别仅用于 TXT 和 Markdown 文本' }
  }

  // ==========================================
  // 1. 缓存拦截机制 (直接在最外层 await，不需要包进 Promise)
  // ==========================================
  const fileHash = createHash('md5').update(`${tocParserVersion}:${filePath}`).digest('hex')
  const cacheDir = join(app.getPath('userData'), 'toc_caches')
  const cachePath = join(cacheDir, `${fileHash}.json`)

  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true })
  }

  // 如果发现缓存文件，直接读取并秒回！
  if (fs.existsSync(cachePath)) {
    try {
      const cachedData = await fs.promises.readFile(cachePath, 'utf-8')
      console.log('✨ 命中目录缓存，极速打开！')
      return JSON.parse(cachedData) // 直接 return 结束战斗！
    } catch (e) {
      console.warn('读取缓存失败，降级重新解析', e)
    }
  }

  console.log('未命中目录缓存，使用原生规则解析...')
  const result = await generateToc(filePath)
  if (result.success) {
    fs.promises
      .writeFile(cachePath, JSON.stringify(result), 'utf-8')
      .catch((error) => console.error('写入缓存失败:', error))
  }
  return result
})

// 定义进度文件的存储路径 (存在系统用户数据目录，极其安全)
const progressFilePath = join(app.getPath('userData'), 'reading_progress.json')
const getImportedTextsDir = (): string => join(app.getPath('userData'), 'imported_texts')

const isPathInside = (parentPath: string, candidatePath: string): boolean => {
  const relativePath = path.relative(parentPath, candidatePath)
  return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
}

const deleteProgressEntries = async (filePaths: string[]): Promise<void> => {
  let progressMap: Record<string, number | string> = {}
  try {
    const fileData = await fs.promises.readFile(progressFilePath, 'utf-8')
    progressMap = JSON.parse(fileData)
  } catch {
    return
  }

  filePaths.forEach((filePath) => delete progressMap[filePath])
  await fs.promises.writeFile(progressFilePath, JSON.stringify(progressMap), 'utf-8')
}

// TXT 与 Markdown 使用应用托管副本，阅读过程不再依赖用户最初导入的文件。
ipcMain.handle('file:importTextCopy', async (_event, sourcePath: string) => {
  try {
    const extension = path.extname(sourcePath).toLowerCase()
    if (extension !== '.txt' && extension !== '.md') {
      return { success: false, error: '仅支持托管 TXT 和 Markdown 文本' }
    }

    const importedTextsDir = getImportedTextsDir()
    await fs.promises.mkdir(importedTextsDir, { recursive: true })

    const fileHash = createHash('md5').update(sourcePath).digest('hex')
    const managedPath = join(importedTextsDir, `${fileHash}${extension}`)
    await fs.promises.copyFile(sourcePath, managedPath)

    return { success: true, path: managedPath }
  } catch (error) {
    console.error('创建文本托管副本失败:', error)
    return { success: false, error: String(error) }
  }
})

// 👇 补回：获取进度的接口 (就是它导致了报错！)
ipcMain.handle('file:getProgress', async (_, filePath: string) => {
  try {
    const fileData = await fs.promises.readFile(progressFilePath, 'utf-8')
    const progressMap = JSON.parse(fileData)
    return progressMap[filePath] || 0 // 如果没读过，默认从 0 开始
  } catch (e) {
    // 第一次打开，文件不存在很正常，直接返回 0
    return 0
  }
})

// 👇 补回：保存进度的接口 (退回书架时会用到)
ipcMain.handle('file:saveProgress', async (_, data: { filePath: string; offset: number }) => {
  try {
    let progressMap: Record<string, number> = {}
    try {
      const fileData = await fs.promises.readFile(progressFilePath, 'utf-8')
      progressMap = JSON.parse(fileData)
    } catch (e) {
      // 忽略文件不存在的错误
    }

    progressMap[data.filePath] = data.offset
    await fs.promises.writeFile(progressFilePath, JSON.stringify(progressMap), 'utf-8')
    return true
  } catch (error) {
    console.error('保存进度失败:', error)
    return false
  }
})

ipcMain.handle('file:deleteProgress', async (_, filePath: string) => {
  try {
    await deleteProgressEntries([filePath])
    return true
  } catch (error) {
    console.error('删除阅读进度失败:', error)
    return false
  }
})

ipcMain.handle('file:migrateProgress', async (_, paths: { from: string; to: string }) => {
  try {
    let progressMap: Record<string, number | string> = {}
    try {
      const fileData = await fs.promises.readFile(progressFilePath, 'utf-8')
      progressMap = JSON.parse(fileData)
    } catch {
      return true
    }

    if (progressMap[paths.from] !== undefined && progressMap[paths.to] === undefined) {
      progressMap[paths.to] = progressMap[paths.from]
    }
    delete progressMap[paths.from]
    await fs.promises.writeFile(progressFilePath, JSON.stringify(progressMap), 'utf-8')
    return true
  } catch (error) {
    console.error('迁移阅读进度失败:', error)
    return false
  }
})

// 二号引擎(.mobi等文件读取)专属桥梁 (完整读取二进制文件)
ipcMain.handle('file:readBuffer', async (_, filePath: string) => {
  try {
    // 直接读取整个文件的 Buffer，不进行任何编码转换！
    const buffer = await fs.promises.readFile(filePath)
    return { success: true, data: buffer }
  } catch (error) {
    console.error('读取 EPUB 二进制失败:', error)
    return { success: false, error: String(error) }
  }
})

const mobiConversionCacheVersion = 'mobi-epub-v2'

// 👇 新增：删除指定书籍的转换缓存
ipcMain.handle(
  'file:deleteCache',
  async (_event, params: string | { filePath: string; sourcePath?: string }) => {
  try {
    const userDataPath = app.getPath('userData')
    const cacheDir = path.join(userDataPath, 'book_cache')
    const filePath = typeof params === 'string' ? params : params.filePath
    const sourcePath = typeof params === 'string' ? undefined : params.sourcePath
    const relatedPaths = [...new Set([filePath, sourcePath].filter(Boolean) as string[])]
    const fileHashes = relatedPaths.flatMap((relatedPath) => [
      createHash('md5').update(relatedPath).digest('hex'),
      createHash('md5').update(`${mobiConversionCacheVersion}:${relatedPath}`).digest('hex')
    ])
    let deletedCount = 0

    relatedPaths.forEach(clearFileCache)
    await deleteProgressEntries(relatedPaths)

    if (fs.existsSync(cacheDir)) {
      const files = fs.readdirSync(cacheDir)

      for (const file of files) {
        if (fileHashes.some((fileHash) => file.includes(fileHash))) {
          const targetPath = path.join(cacheDir, file)
          fs.unlinkSync(targetPath)
          deletedCount++
        }
      }
    }

    const tocCacheDir = path.join(userDataPath, 'toc_caches')
    if (fs.existsSync(tocCacheDir)) {
      const parserVersions = [
        '',
        'chapter-model-re-rules-v1:',
        'chapter-model-re-quantized-rules-v2:',
        `${tocParserVersion}:`
      ]
      for (const relatedPath of relatedPaths) {
        for (const parserVersion of parserVersions) {
          const tocHash = createHash('md5').update(`${parserVersion}${relatedPath}`).digest('hex')
          const tocCachePath = path.join(tocCacheDir, `${tocHash}.json`)
          if (fs.existsSync(tocCachePath)) {
            fs.unlinkSync(tocCachePath)
            deletedCount++
          }
        }
      }
    }

    const importedTextsDir = getImportedTextsDir()
    if (isPathInside(importedTextsDir, filePath) && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      deletedCount++
    }

    console.log(`清理完毕，共删除 ${deletedCount} 个相关缓存文件`)
    return true
  } catch (error: unknown) {
    console.error('清除缓存失败:', error instanceof Error ? error.message : String(error))
    return false
  }
  }
)

// 4. 应用程序生命周期管理
app.whenReady().then(() => {
  app.setName(APP_DISPLAY_NAME)
  // 设置应用 ID (Windows)
  electronApp.setAppUserModelId(APP_USER_MODEL_ID)

  // 默认打开开发者工具 (开发环境下)
  if (is.dev) {
    // mainWindow?.webContents.openDevTools()
    // 如果你希望启动时自动打开控制台，取消上面这行的注释
  }

  createWindow()

  app.on('activate', function () {
    // macOS 特有：点击 Dock 图标且无窗口时，重新创建窗口
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  releaseBossKey()
})

// 当所有窗口关闭时退出应用 (macOS 除外)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

interface ScanBookResult {
  fileName: string
  fullPath: string
  cover: null | string // 未来可以扩展为封面图路径
}
