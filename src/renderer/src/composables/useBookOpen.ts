import type { BookInfo } from './useBookshelf'
import { useBookshelf } from './useBookshelf'
import { useReader } from './useReader'
import { useSettings } from './useSettings'
import { readerHost } from '../platform/readerHost'

interface BookOpenCallbacks {
  loadEpubBook: (fullPath: string) => Promise<void>
  loadMobiBook: (fullPath: string) => Promise<void>
  loadPdfBook: (fullPath: string) => Promise<void>
  loadTxtBook: (fullPath: string) => Promise<void>
}

export function useBookOpen(callbacks: BookOpenCallbacks) {
  const { loadEpubBook, loadMobiBook, loadPdfBook, loadTxtBook } = callbacks
  const { bookList } = useBookshelf()
  const { restoreBookSettings } = useSettings()

  const {
    currentView,
    currentBookTitle,
    currentBookPath,
    currentBookType,
    isLoading,
    isParsing,
    tocList,
    fileSize,
    isSidebarOpen,
    isToolbarVisible,
    isSettingsPanelOpen,
    readingProgressText,
    activeChapterTitle,
    sliderProgress,
    lines,
    isEndReached,
    leftoverText,
    topLeftoverText,
    epubBook,
    epubCfi
  } = useReader()

  const goReader = (title: string) => {
    currentView.value = 'reader'
    currentBookTitle.value = title
  }

  const fillEpubCoverInBackground = (book: BookInfo) => {
    if (book.cover || !epubBook.value) return

    epubBook.value
      .coverUrl()
      .then(async (url) => {
        if (!url) return

        const response = await fetch(url)
        const blob = await response.blob()
        const reader = new FileReader()
        reader.onloadend = () => {
          const targetBook = bookList.value.find((b) => b.fullPath === book.fullPath)
          if (targetBook) targetBook.cover = reader.result as string
        }
        reader.readAsDataURL(blob)
      })
      .catch((e) => console.warn('后台补全封面失败', e))
  }

  const openBook = async (book: BookInfo) => {
    isSidebarOpen.value = false
    isToolbarVisible.value = false
    isSettingsPanelOpen.value = false

    book.lastReadAt = Date.now()

    await restoreBookSettings(book.fullPath)
    goReader(book.fileName)
    currentBookPath.value = book.fullPath

    readingProgressText.value = '...'
    activeChapterTitle.value = ''
    sliderProgress.value = 0
    epubCfi.value = ''

    lines.value = []
    isEndReached.value = false
    leftoverText.value = ''
    topLeftoverText.value = ''
    tocList.value = []

    isLoading.value = true
    isParsing.value = false
    const extension = book.fullPath.split('.').pop()?.toLowerCase() || ''
    const format = extension || book.format || 'txt'
    book.format = format
    currentBookType.value =
      format === 'epub'
        ? 'epub'
        : format === 'pdf'
          ? 'pdf'
          : format === 'mobi' || format === 'azw3'
            ? 'mobi'
            : 'txt'

    try {
      const finalPathToLoad = book.fullPath

      const info = await readerHost.getFileInfo(finalPathToLoad)
      if (!info.exists) throw new Error('文件不存在')
      fileSize.value = info.size

      const targetBook = bookList.value.find((b) => b.fullPath === book.fullPath)
      if (targetBook && !targetBook.size) targetBook.size = info.size

      if (currentBookType.value === 'epub') {
        await loadEpubBook(finalPathToLoad)
        isLoading.value = false
        fillEpubCoverInBackground(book)
      } else if (currentBookType.value === 'mobi') {
        await loadMobiBook(finalPathToLoad)
        isLoading.value = false
      } else if (currentBookType.value === 'pdf') {
        await loadPdfBook(finalPathToLoad)
        isLoading.value = false
      } else {
        isLoading.value = false
        await loadTxtBook(finalPathToLoad)
      }
    } catch (error) {
      lines.value = [{ id: 'error', text: '读取失败：' + error }]
      isLoading.value = false
    }
  }

  return {
    openBook
  }
}
