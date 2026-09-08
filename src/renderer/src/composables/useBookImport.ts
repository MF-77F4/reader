import epub from 'epubjs'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.js?url'
import { useBookshelf, type BookInfo } from './useBookshelf'
import { useModal } from './useModal'
import { readerHost } from '../platform/readerHost'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

export function useBookImport() {
  const { showModal } = useModal()
  const { bookList, isImportingBook } = useBookshelf()

  const extractEpubCover = async (fileData: ArrayBuffer | Uint8Array): Promise<string | null> => {
    try {
      const book = epub(fileData as ArrayBuffer)
      const coverUrl = await book.coverUrl()
      if (!coverUrl) return null

      const response = await fetch(coverUrl)
      const blob = await response.blob()

      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.readAsDataURL(blob)
      })
    } catch (e) {
      console.error('EPUB 封面提取失败', e)
      return null
    }
  }

  const extractPdfCover = async (fileData: ArrayBuffer | Uint8Array): Promise<string | null> => {
    try {
      const pdf = await pdfjsLib.getDocument({ data: fileData }).promise
      const page = await pdf.getPage(1)
      const viewport = page.getViewport({ scale: 1.0 })

      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      if (!context) return null

      const targetWidth = 100
      const scale = targetWidth / viewport.width
      canvas.width = targetWidth
      canvas.height = viewport.height * scale

      await page.render({
        canvasContext: context,
        viewport: page.getViewport({ scale })
      }).promise

      return canvas.toDataURL('image/jpeg', 0.6)
    } catch (e) {
      console.error('PDF 封面提取失败', e)
      return null
    }
  }

  const handleScanBooks = async (categoryId?: string) => {
    if (!readerHost.isAvailable()) return

    try {
      isImportingBook.value = true
      const filePaths = await readerHost.openFile()
      if (!filePaths || filePaths.length === 0) {
        isImportingBook.value = false
        return
      }

      const newBooks: BookInfo[] = []

      for (const fullPath of filePaths) {
        const parts = fullPath.split(/[\\/]/)
        const fileName = parts.pop() || '未知文件'

        if (bookList.value.some((b) => (b.sourcePath || b.fullPath) === fullPath)) {
          await showModal({
            title: '重复导入',
            message: `《${fileName}》已经存在于您的书架中了。`,
            type: 'alert'
          })
          continue
        }

        const dotIndex = fileName.lastIndexOf('.')
        const format = dotIndex > -1 ? fileName.substring(dotIndex + 1).toLowerCase() : 'unknown'

        let fileSize = 0
        try {
          const info = await readerHost.getFileInfo(fullPath)
          if (info && info.size) fileSize = info.size
        } catch (e) {}

        let coverBase64: string | null = null

        if (format === 'pdf' || format === 'epub') {
          const res = await readerHost.readBuffer(fullPath)
          if (res.success && res.data) {
            const safeBuffer = (res.data.buffer || res.data) as ArrayBuffer | Uint8Array

            if (format === 'pdf') {
              coverBase64 = await extractPdfCover(safeBuffer)
            } else if (format === 'epub') {
              coverBase64 = await extractEpubCover(safeBuffer)
            }
          }
        }

        let managedPath = fullPath
        if (format === 'txt' || format === 'md') {
          const copyResult = await readerHost.importTextCopy(fullPath)
          if (!copyResult.success || !copyResult.path) {
            await showModal({
              title: '导入失败',
              message: `《${fileName}》无法复制到应用书库：${copyResult.error || '未知错误'}`,
              type: 'alert'
            })
            continue
          }
          managedPath = copyResult.path
        }

        newBooks.push({
          fileName,
          fullPath: managedPath,
          sourcePath: managedPath === fullPath ? undefined : fullPath,
          cover: coverBase64,
          format,
          size: fileSize,
          progress: 0,
          lastReadAt: Date.now(),
          categoryId
        })
      }

      bookList.value = [...bookList.value, ...newBooks]
      isImportingBook.value = false
    } catch (error) {
      console.error(error)
      isImportingBook.value = false
    }
  }

  return {
    handleScanBooks
  }
}
