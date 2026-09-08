import { nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useAnnotation } from './useAnnotation'
import { useBookshelf } from './useBookshelf'
import { useReader } from './useReader'
import { useSettings } from './useSettings'
import { useBookmark } from './useBookmark'

interface ReaderUiControllerOptions {
  applyDashedUnderline: () => void
  applyEpubSettings: () => void
}

export function useReaderUiController(options: ReaderUiControllerOptions) {
  const { applyDashedUnderline, applyEpubSettings } = options

  const { activeMenuPath, loadBookshelf } = useBookshelf()
  const {
    readerSettings,
    isFontMenuOpen,
    loadSettings
  } = useSettings()
  const {
    isTopMenuOpen,
    isHighlightMenuOpen,
    isAnnotationPanelOpen,
    currentViewingNote,
    epubHighlights
  } = useAnnotation()
  const { isBookmarkMenuOpen } = useBookmark()
  const {
    currentTime,
    currentBookType,
    isSidebarOpen,
    isToolbarVisible,
    isSettingsPanelOpen,
    epubRendition,
    readingMode
  } = useReader()

  let timeInterval: ReturnType<typeof setInterval> | null = null
  let windowResizeTimer: ReturnType<typeof setTimeout> | null = null
  let annotationResizeVersion = 0

  const closeAllSecondaryMenus = () => {
    if (activeMenuPath.value) activeMenuPath.value = null
    if (isHighlightMenuOpen.value || isBookmarkMenuOpen.value) {
      isHighlightMenuOpen.value = false
      isBookmarkMenuOpen.value = false
      isTopMenuOpen.value = true
    } else if (isTopMenuOpen.value) {
      isTopMenuOpen.value = false
    }
    if (isFontMenuOpen.value) isFontMenuOpen.value = false
  }

  const closeSecondaryMenusToToolbar = (): boolean => {
    const hasSecondaryMenu =
      isSidebarOpen.value ||
      isSettingsPanelOpen.value ||
      isFontMenuOpen.value ||
      isTopMenuOpen.value ||
      isHighlightMenuOpen.value ||
      isBookmarkMenuOpen.value

    if (!hasSecondaryMenu) return false

    isSidebarOpen.value = false
    isSettingsPanelOpen.value = false
    isFontMenuOpen.value = false
    isTopMenuOpen.value = false
    isHighlightMenuOpen.value = false
    isBookmarkMenuOpen.value = false
    return true
  }

  const updateTime = () => {
    const now = new Date()
    const hours = now.getHours().toString().padStart(2, '0')
    const minutes = now.getMinutes().toString().padStart(2, '0')
    currentTime.value = `${hours}:${minutes}`
  }

  const onWindowResize = () => {
    if (currentBookType.value === 'epub') {
      if (windowResizeTimer) clearTimeout(windowResizeTimer)
      windowResizeTimer = setTimeout(() => {
        const viewer = document.querySelector('.epub-viewer') as HTMLElement
        if (viewer && epubRendition.value) {
          epubRendition.value.resize(viewer.clientWidth, viewer.clientHeight)
          setTimeout(() => {
            if (typeof applyDashedUnderline === 'function') applyDashedUnderline()
          }, 50)
        }
      }, 100)
    }
  }

  const hideToolbarOnScroll = () => {
    if (isToolbarVisible.value || isSidebarOpen.value) {
      isToolbarVisible.value = false
      isSettingsPanelOpen.value = false
      isSidebarOpen.value = false
      isTopMenuOpen.value = false
      isHighlightMenuOpen.value = false
      isFontMenuOpen.value = false
    }
  }

  const toggleToolbar = () => {
    if (isToolbarVisible.value) {
      isToolbarVisible.value = false
      isSettingsPanelOpen.value = false
      isSidebarOpen.value = false
      isFontMenuOpen.value = false
      isTopMenuOpen.value = false
      isHighlightMenuOpen.value = false
    } else {
      isToolbarVisible.value = true
      isSettingsPanelOpen.value = false
      isSidebarOpen.value = false
      isFontMenuOpen.value = false
      isTopMenuOpen.value = false
      isHighlightMenuOpen.value = false
    }
  }

  onMounted(() => {
    loadSettings()
    loadBookshelf()
    document.addEventListener('click', closeAllSecondaryMenus)
    updateTime()
    timeInterval = setInterval(updateTime, 1000)
    window.addEventListener('resize', onWindowResize)
  })

  onUnmounted(() => {
    document.removeEventListener('click', closeAllSecondaryMenus)
    window.removeEventListener('resize', onWindowResize)
    if (timeInterval) clearInterval(timeInterval)
    if (windowResizeTimer) clearTimeout(windowResizeTimer)
  })

  watch(isAnnotationPanelOpen, async () => {
    const resizeVersion = ++annotationResizeVersion
    const scrollContainer = document.querySelector('.epub-container') as HTMLElement | null
    const previousScrollTop = scrollContainer?.scrollTop
    const annotationAnchor = currentViewingNote.value
      ? epubHighlights.value.find((highlight) => highlight.id === currentViewingNote.value?.id)?.cfis[0]
      : undefined
    const epubAnchor = annotationAnchor || epubRendition.value?.location?.start?.cfi

    await nextTick()

    if (currentBookType.value === 'epub' && epubRendition.value) {
      // EPUB.js already renders the active section. Resize it once after the drawer
      // layout settles, then restore the visible CFI so the current page stays stable.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      if (resizeVersion !== annotationResizeVersion) return

      const viewer = document.querySelector('.epub-viewer') as HTMLElement
      if (viewer) {
        if (readingMode.value === 'scroll') {
          epubRendition.value.resize(viewer.clientWidth, viewer.clientHeight)

          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
          if (resizeVersion !== annotationResizeVersion) return

          const resizedScrollContainer = document.querySelector('.epub-container') as HTMLElement | null
          if (resizedScrollContainer && previousScrollTop !== undefined) {
            resizedScrollContainer.scrollTop = previousScrollTop
          }
        } else {
          const resizeWithAnchor = epubRendition.value.resize as unknown as (
            width: number,
            height: number,
            epubcfi?: string
          ) => void
          resizeWithAnchor.call(epubRendition.value, viewer.clientWidth, viewer.clientHeight, epubAnchor)
        }
      }
    } else {
      window.dispatchEvent(new Event('resize'))
    }

    setTimeout(() => {
      if (typeof applyDashedUnderline === 'function') applyDashedUnderline()
    }, 50)
  })

  watch(isSidebarOpen, async (newVal) => {
    await nextTick()

    if (newVal) {
      window.dispatchEvent(new Event('resize'))

      setTimeout(() => {
        const activeEl = document.querySelector('.toc-item.active-chapter') as HTMLElement
        const listEl = document.querySelector('.toc-list') as HTMLElement

        if (activeEl && listEl) {
          const scrollToY =
            activeEl.offsetTop -
            listEl.offsetTop -
            listEl.clientHeight / 2 +
            activeEl.clientHeight / 2

          listEl.scrollTo({
            top: scrollToY,
            behavior: 'auto'
          })
        }
      }, 100)
    }
  })

  watch(
    () => readerSettings.value,
    () => {
      if (typeof applyEpubSettings === 'function') applyEpubSettings()
    },
    { deep: true }
  )

  return {
    closeAllSecondaryMenus,
    closeSecondaryMenusToToolbar,
    hideToolbarOnScroll,
    toggleToolbar
  }
}
