import { useAnnotation } from './useAnnotation'
import { removeBookLocalStorageData, useBookshelf } from './useBookshelf'
import { useModal } from './useModal'
import { useReader } from './useReader'
import { cleanBookTitle } from '../utils/formatter'
import { useBookmark } from './useBookmark'
import { readerHost } from '../platform/readerHost'

interface ReadingSessionOptions {
  getExactOffset: () => number
  saveEpubPageAnchor: () => void
}

export function useReadingSession(options: ReadingSessionOptions) {
  const { getExactOffset, saveEpubPageAnchor } = options
  const { showModal } = useModal()
  const { bookList } = useBookshelf()
  const { isBookmarkMenuOpen } = useBookmark()

  const {
    currentView,
    currentBookTitle,
    currentBookPath,
    currentBookType,
    fileSize,
    isSidebarOpen,
    isToolbarVisible,
    isSettingsPanelOpen,
    readingProgressText,
    activeChapterTitle,
    sliderProgress,
    lines,
    isEndReached,
    isTopReached,
    topOffset,
    bottomOffset,
    currentTxtPageAnchor,
    leftoverText,
    topLeftoverText,
    epubBook,
    epubRendition,
    epubCfi,
    mobiView,
    mobiLocation,
    currentPdfPage,
    pdfTotalPages
  } = useReader()

  const {
    isTopMenuOpen,
    txtHighlights,
    epubHighlights,
    hlTrigger,
    isAnnotationPanelOpen,
    isAnnotationInputOpen
  } = useAnnotation()

  let saveTimer: ReturnType<typeof setTimeout> | null = null

  const calculateCurrentProgress = () => {
    if (currentBookType.value === 'txt') {
      const rawOffset = getExactOffset()
      const offset = Math.max(0, Math.min(rawOffset, fileSize.value || rawOffset))
      const progress =
        fileSize.value > 0 ? parseFloat(((offset / fileSize.value) * 100).toFixed(2)) : 0

      return {
        offset,
        progress
      }
    }

    if (currentBookType.value === 'epub' && epubCfi.value) {
      let progress = 0
      if (epubBook.value && epubBook.value.locations.length() > 0) {
        progress = parseFloat(
          (epubBook.value.locations.percentageFromCfi(epubCfi.value) * 100).toFixed(2)
        )
      }

      return {
        offset: epubCfi.value,
        progress
      }
    }

    if (currentBookType.value === 'pdf') {
      const progress =
        pdfTotalPages.value > 0
          ? parseFloat(((currentPdfPage.value / pdfTotalPages.value) * 100).toFixed(2))
          : 0

      return {
        offset: currentPdfPage.value,
        progress
      }
    }

    if (currentBookType.value === 'mobi') {
      return {
        offset: mobiLocation.value,
        progress: parseFloat(readingProgressText.value.replace('%', '')) || 0
      }
    }

    return {
      offset: 0,
      progress: 0
    }
  }

  const updateBookshelfProgress = (filePath: string, progress: number) => {
    const targetBook = bookList.value.find((b) => b.fullPath === filePath)
    if (targetBook) {
      targetBook.progress = progress
    }
  }

  const autoSaveProgress = () => {
    if (saveTimer) clearTimeout(saveTimer)

    saveTimer = setTimeout(() => {
      if (!currentBookPath.value || !readerHost.isAvailable()) return

      const { offset, progress } = calculateCurrentProgress()
      readerHost.saveProgress({
        filePath: currentBookPath.value,
        offset,
        progress
      })

      updateBookshelfProgress(currentBookPath.value, progress)
    }, 2000)
  }

  const goShelf = async (options: { skipSave?: boolean } = {}) => {
    const pathToClose = currentBookPath.value

    if (currentBookType.value === 'epub' && !options.skipSave) {
      saveEpubPageAnchor()
    }

    if (pathToClose && readerHost.isAvailable() && !options.skipSave) {
      const { offset, progress } = calculateCurrentProgress()
      await readerHost.saveProgress({
        filePath: pathToClose,
        offset,
        progress
      })

      updateBookshelfProgress(pathToClose, progress)
    }

    if (epubBook.value) {
      epubBook.value.destroy()
      epubBook.value = null
      epubRendition.value = null
      epubCfi.value = ''
    }

    mobiView.value?.close()
    mobiView.value?.remove()
    mobiView.value = null
    mobiLocation.value = ''

    currentBookPath.value = ''
    epubHighlights.value = []
    txtHighlights.value = []
    hlTrigger.value = 0

    isSidebarOpen.value = false
    isToolbarVisible.value = false
    isSettingsPanelOpen.value = false
    isAnnotationPanelOpen.value = false
    isAnnotationInputOpen.value = false
    isBookmarkMenuOpen.value = false

    currentView.value = 'shelf'
    currentBookTitle.value = ''

    readingProgressText.value = '0.00%'
    activeChapterTitle.value = ''
    sliderProgress.value = 0

    lines.value = []
    topOffset.value = 0
    bottomOffset.value = 0
    currentTxtPageAnchor.value = 0
    isEndReached.value = false
    isTopReached.value = true
    leftoverText.value = ''
    topLeftoverText.value = ''

    if (readerHost.isAvailable() && pathToClose) {
      await readerHost.closeFile(pathToClose)
    }
  }

  const deleteCurrentBook = async () => {
    isTopMenuOpen.value = false
    const confirmed = await showModal({
      title: '',
      message: `确认将《${cleanBookTitle(currentBookTitle.value)}》移出书架吗？`,
      confirmText: '确认',
      cancelText: '取消',
      isDestructive: true
    })

    if (!confirmed) return

    try {
      const filePath = currentBookPath.value
      const targetBook = bookList.value.find((book) => book.fullPath === filePath)

      await goShelf({ skipSave: true })
      const didDelete = await readerHost.deleteBookCache({
        filePath,
        sourcePath: targetBook?.sourcePath
      })
      if (!didDelete) throw new Error('应用数据清理失败')

      removeBookLocalStorageData(filePath, targetBook?.sourcePath)
      bookList.value = bookList.value.filter((book) => book.fullPath !== filePath)
    } catch (error) {
      console.error('删除通讯失败:', error)
      await showModal({
        title: '删除失败',
        message: '无法完整清理这本书的数据，请稍后再试。',
        type: 'alert'
      })
    }
  }

  return {
    autoSaveProgress,
    goShelf,
    deleteCurrentBook
  }
}
