import { nextTick, watch } from 'vue'
import { useAnnotation } from './useAnnotation'
import { useReader, type TOCItem } from './useReader'
import { useBookmark, type Bookmark } from './useBookmark'

interface ReaderNavigationOptions {
  getExactOffset: () => number
  loadNextChunk: (needAlign?: boolean) => Promise<void>
  rebuildTxtPages?: (preferredAnchor?: number) => Promise<void>
  goToPdfPage: (pageNum: number) => Promise<void>
  jumpToPdfDestination: (item: TOCItem) => Promise<void>
  applyDashedUnderline: () => void
  autoSaveProgress: () => void
  updateReadingStatus: () => void
  closeAllSecondaryMenus: () => void
}

export function useReaderNavigation(options: ReaderNavigationOptions) {
  const {
    getExactOffset,
    loadNextChunk,
    rebuildTxtPages,
    goToPdfPage,
    jumpToPdfDestination,
    applyDashedUnderline,
    autoSaveProgress,
    updateReadingStatus,
    closeAllSecondaryMenus
  } = options

  const {
    currentBookType,
    isLoading,
    tocList,
    fileSize,
    isSidebarOpen,
    readingProgressText,
    activeChapterTitle,
    sliderProgress,
    isProgressIndicatorVisible,
    previewChapterTitle,
    previewProgress,
    lines,
    isEndReached,
    isTopReached,
    isJumping,
    topOffset,
    bottomOffset,
    leftoverText,
    topLeftoverText,
    epubBook,
    epubRendition,
    mobiView,
    currentPdfPage,
    pdfTotalPages
  } = useReader()

  const {
    isTopMenuOpen,
    isHighlightMenuOpen
  } = useAnnotation()
  const { isBookmarkMenuOpen } = useBookmark()

  let indicatorTimer: ReturnType<typeof setTimeout> | null = null
  let isDraggingSlider = false

  const triggerProgressIndicator = (title: string, progress: string) => {
    previewChapterTitle.value = title || '未知章节'
    previewProgress.value = progress
    isProgressIndicatorVisible.value = true

    if (indicatorTimer) clearTimeout(indicatorTimer)
    indicatorTimer = setTimeout(() => {
      isProgressIndicatorVisible.value = false
    }, 2000)
  }

  const showCapsuleOnPress = () => {
    triggerProgressIndicator(activeChapterTitle.value, readingProgressText.value)
  }

  const jumpToChapter = async (item: TOCItem) => {
    if (isLoading.value || isJumping.value) return

    activeChapterTitle.value = item.title
    isSidebarOpen.value = false

    if (currentBookType.value === 'epub') {
      const target = item.cfi || item.href || item.id
      if (target && epubRendition.value) {
        epubRendition.value
          .display(target)
          .then(() => {
            if (typeof applyDashedUnderline === 'function') applyDashedUnderline()
          })
          .catch((e) => console.error('EPUB 跳转失败:', e))
      }
    } else if (currentBookType.value === 'mobi' && item.href) {
      await mobiView.value?.goTo(item.href)
    } else if (currentBookType.value === 'pdf' && item.pdfDest) {
      await jumpToPdfDestination(item)
    } else if (currentBookType.value === 'txt' && item.titleStart !== undefined) {
      isJumping.value = true

      topOffset.value = item.titleStart
      bottomOffset.value = item.titleStart
      isTopReached.value = item.titleStart <= 0

      lines.value = []
      leftoverText.value = ''
      topLeftoverText.value = ''
      isEndReached.value = false

      const scroller = document.querySelector('.scroller') as HTMLElement
      if (scroller) {
        scroller.scrollTop = 0
      }

      await loadNextChunk(true)
      await nextTick()
      await rebuildTxtPages?.(item.titleStart)

      isJumping.value = false
      autoSaveProgress()
      updateReadingStatus()
    }
  }

  const jumpToHighlight = async (hl: any) => {
    if (isLoading.value || isJumping.value) return

    isHighlightMenuOpen.value = false
    isTopMenuOpen.value = false
    closeAllSecondaryMenus()

    if (currentBookType.value === 'epub') {
      await epubRendition.value?.display(hl.jumpAnchor)

      setTimeout(() => {
        const scrollContainer = document.querySelector('.epub-container') as HTMLElement
        if (scrollContainer && scrollContainer.scrollTop > 0) {
          scrollContainer.scrollTop = Math.max(0, scrollContainer.scrollTop - 240)
        }
      }, 50)
    } else if (currentBookType.value === 'mobi') {
      await mobiView.value?.goTo(String(hl.jumpAnchor))
    } else if (currentBookType.value === 'txt') {
      isJumping.value = true
      topOffset.value = hl.jumpAnchor
      bottomOffset.value = hl.jumpAnchor
      isTopReached.value = hl.jumpAnchor <= 0

      lines.value = []
      leftoverText.value = ''
      topLeftoverText.value = ''
      isEndReached.value = false

      const scroller = document.querySelector('.scroller') as HTMLElement
      if (scroller) scroller.scrollTop = 0

      await loadNextChunk(false)
      await nextTick()
      await rebuildTxtPages?.(hl.jumpAnchor)

      isJumping.value = false
      autoSaveProgress()
      updateReadingStatus()
    }
  }

  const jumpToBookmark = async (bookmark: Bookmark) => {
    if (isLoading.value || isJumping.value) return

    isBookmarkMenuOpen.value = false
    closeAllSecondaryMenus()

    if (bookmark.type === 'epub' && typeof bookmark.anchor === 'string') {
      await epubRendition.value?.display(bookmark.anchor)
      applyDashedUnderline()
    } else if (bookmark.type === 'pdf' && typeof bookmark.anchor === 'number') {
      await goToPdfPage(bookmark.anchor)
    } else if (bookmark.type === 'mobi' && typeof bookmark.anchor === 'string') {
      await mobiView.value?.goTo(bookmark.anchor)
    } else if (bookmark.type === 'txt' && typeof bookmark.anchor === 'number') {
      isJumping.value = true
      topOffset.value = bookmark.anchor
      bottomOffset.value = bookmark.anchor
      isTopReached.value = bookmark.anchor <= 0
      lines.value = []
      leftoverText.value = ''
      topLeftoverText.value = ''
      isEndReached.value = false

      const scroller = document.querySelector('.scroller') as HTMLElement
      if (scroller) scroller.scrollTop = 0

      await loadNextChunk(true)
      await nextTick()
      await rebuildTxtPages?.(bookmark.anchor)

      isJumping.value = false
      autoSaveProgress()
      updateReadingStatus()
    }
  }

  const onProgressChange = async (e: Event) => {
    isDraggingSlider = false
    const val = parseFloat((e.target as HTMLInputElement).value)
    if (isNaN(val)) return

    if (currentBookType.value === 'txt') {
      const targetOffset = Math.floor(fileSize.value * (val / 100))
      isJumping.value = true
      topOffset.value = targetOffset
      bottomOffset.value = targetOffset
      isTopReached.value = targetOffset <= 0
      lines.value = []
      leftoverText.value = ''
      topLeftoverText.value = ''
      isEndReached.value = false

      const scroller = document.querySelector('.scroller') as HTMLElement
      if (scroller) scroller.scrollTop = 0

      await loadNextChunk(true)
      await nextTick()
      await rebuildTxtPages?.(targetOffset)

      isJumping.value = false
      autoSaveProgress()
      updateReadingStatus()
    } else if (currentBookType.value === 'epub') {
      if (epubBook.value && epubBook.value.locations.length() > 0) {
        const cfi = epubBook.value.locations.cfiFromPercentage(val / 100)
        if (cfi) await epubRendition.value?.display(cfi)
      }
    } else if (currentBookType.value === 'mobi') {
      await mobiView.value?.goToFraction(val / 100)
    } else if (currentBookType.value === 'pdf') {
      const targetPage = Math.max(1, Math.floor(pdfTotalPages.value * (val / 100)))
      await goToPdfPage(targetPage)
    }
  }

  const jumpPrevChapter = async () => {
    if (currentBookType.value === 'epub') {
      const currentRendition = epubRendition.value as any
      if (currentRendition?.location?.start?.href && tocList.value.length > 0) {
        const cleanHref = currentRendition.location.start.href.split('#')[0]
        const currentIndex = tocList.value.findIndex((t) => t.href && t.href.includes(cleanHref))
        if (currentIndex > 0) {
          await epubRendition.value?.display(tocList.value[currentIndex - 1].href)
        } else {
          await epubRendition.value?.display(tocList.value[0].href)
        }
      } else {
        await epubRendition.value?.prev()
      }
    } else if (currentBookType.value === 'mobi') {
      await mobiView.value?.prev()
    } else if (currentBookType.value === 'pdf' && currentPdfPage.value > 1) {
      await goToPdfPage(currentPdfPage.value - 1)
    } else if (currentBookType.value === 'txt' && tocList.value.length > 0) {
      const exactOffset = getExactOffset()
      let targetCh = tocList.value[0]
      for (let i = tocList.value.length - 1; i >= 0; i--) {
        const item = tocList.value[i]
        if (item.titleStart !== undefined && exactOffset > item.titleStart + 100) {
          targetCh = item
          break
        }
      }
      await jumpToChapter(targetCh)
    }

    setTimeout(() => triggerProgressIndicator(activeChapterTitle.value, readingProgressText.value), 150)
  }

  const jumpNextChapter = async () => {
    if (currentBookType.value === 'epub') {
      const currentRendition = epubRendition.value as any
      if (currentRendition?.location?.start?.href && tocList.value.length > 0) {
        const cleanHref = currentRendition.location.start.href.split('#')[0]
        const currentIndex = tocList.value.findIndex((t) => t.href && t.href.includes(cleanHref))
        if (currentIndex >= 0 && currentIndex < tocList.value.length - 1) {
          await epubRendition.value?.display(tocList.value[currentIndex + 1].href)
        } else {
          await epubRendition.value?.next()
        }
      } else {
        await epubRendition.value?.next()
      }
    } else if (currentBookType.value === 'mobi') {
      await mobiView.value?.next()
    } else if (currentBookType.value === 'pdf' && currentPdfPage.value < pdfTotalPages.value) {
      await goToPdfPage(currentPdfPage.value + 1)
    } else if (currentBookType.value === 'txt' && tocList.value.length > 0) {
      const exactOffset = getExactOffset()
      let targetCh: TOCItem | null = null

      for (let i = 0; i < tocList.value.length; i++) {
        const item = tocList.value[i]
        if (item.titleStart !== undefined && item.titleStart > exactOffset + 100) {
          targetCh = item
          break
        }
      }
      if (targetCh) await jumpToChapter(targetCh)
    }

    setTimeout(() => triggerProgressIndicator(activeChapterTitle.value, readingProgressText.value), 150)
  }

  const onProgressDrag = (e: Event) => {
    isDraggingSlider = true
    const val = parseFloat((e.target as HTMLInputElement).value)
    if (isNaN(val)) return

    const progressStr = `${val.toFixed(2)}%`
    let title = activeChapterTitle.value

    if (currentBookType.value === 'txt' && tocList.value.length > 0) {
      const targetOffset = Math.floor(fileSize.value * (val / 100))
      for (let i = tocList.value.length - 1; i >= 0; i--) {
        const item = tocList.value[i]
        if (item.titleStart !== undefined && targetOffset >= item.titleStart) {
          title = item.title
          break
        }
      }
    } else if (currentBookType.value === 'epub' && epubBook.value) {
      try {
        const cfi = epubBook.value.locations.cfiFromPercentage(val / 100)
        if (cfi) {
          const spineItem = epubBook.value.spine.get(cfi)
          if (spineItem && spineItem.href) {
            const cleanHref = spineItem.href.split('#')[0]
            const matchedItem = tocList.value.find((t) => t.href && t.href.includes(cleanHref))
            title = matchedItem ? matchedItem.title : activeChapterTitle.value
          } else {
            title = '正在解析章节...'
          }
        }
      } catch (e) {
        title = '释放以跳转至新位置...'
      }
    } else if (currentBookType.value === 'mobi') {
      const targetIndex = Math.max(
        0,
        Math.min(tocList.value.length - 1, Math.floor((tocList.value.length - 1) * (val / 100)))
      )
      title = tocList.value[targetIndex]?.title || activeChapterTitle.value
    } else if (currentBookType.value === 'pdf') {
      const targetPage = Math.max(1, Math.floor(pdfTotalPages.value * (val / 100)))
      title = `第 ${targetPage} 页`
    }

    triggerProgressIndicator(title, progressStr)
  }

  watch(
    () => parseFloat(readingProgressText.value.replace('%', '')) || 0,
    (newVal) => {
      if (!isDraggingSlider) sliderProgress.value = newVal
    }
  )

  return {
    showCapsuleOnPress,
    jumpToChapter,
    jumpToHighlight,
    jumpToBookmark,
    onProgressChange,
    jumpPrevChapter,
    jumpNextChapter,
    onProgressDrag
  }
}
