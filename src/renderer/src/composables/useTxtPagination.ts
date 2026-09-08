import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useReader, type LineItem } from './useReader'
import { useSettings } from './useSettings'

interface TxtPaginationOptions {
  loadNextChunk: (needAlign?: boolean) => Promise<void>
  loadPrevChunk: (container?: HTMLElement | null, chunkSize?: number) => Promise<void>
  getExactOffset: (useScrollPosition?: boolean) => number
  autoSaveProgress: () => void
  updateReadingStatus: () => void
}

export function useTxtPagination(options: TxtPaginationOptions) {
  const { loadNextChunk, loadPrevChunk, getExactOffset, autoSaveProgress, updateReadingStatus } = options
  const {
    currentBookType,
    readingMode,
    lines,
    isLoading,
    isEndReached,
    isTopReached,
    currentTxtPageAnchor
  } = useReader()
  const { readerSettings } = useSettings()

  const txtPages = ref<LineItem[][]>([])
  const currentTxtPageIndex = ref(0)
  let rebuildTimer: ReturnType<typeof setTimeout> | null = null
  let isTurningPage = false

  const currentTxtPageLines = computed(() => txtPages.value[currentTxtPageIndex.value] || [])

  const updatePageAnchor = () => {
    const firstLine = currentTxtPageLines.value[0]
    currentTxtPageAnchor.value = firstLine?.sourceOffset ?? firstLine?.approxOffset ?? 0
  }

  const getPageMeasureWidth = () => {
    const readerContent = document.querySelector('.reader-content') as HTMLElement | null
    if (!readerContent) return 900
    return Math.min(readerContent.clientWidth * 0.92, 900)
  }

  const createMeasureBox = () => {
    const box = document.createElement('div')
    const s = readerSettings.value
    box.style.position = 'fixed'
    box.style.left = '-10000px'
    box.style.top = '0'
    box.style.visibility = 'hidden'
    box.style.pointerEvents = 'none'
    box.style.width = `${getPageMeasureWidth()}px`
    box.style.fontSize = `${s.fontSize}px`
    box.style.lineHeight = String(s.lineHeight)
    box.style.fontFamily = s.fontFamily
    box.style.whiteSpace = 'pre-wrap'
    box.style.wordBreak = 'break-all'
    box.style.boxSizing = 'border-box'
    document.body.appendChild(box)
    return box
  }

  const getAvailablePageHeight = () => {
    const readerContent = document.querySelector('.reader-content') as HTMLElement | null
    return readerContent ? readerContent.clientHeight : window.innerHeight
  }

  const measureLineHeight = (box: HTMLElement, text: string) => {
    box.textContent = text || ' '
    return Math.max(24, Math.ceil(box.getBoundingClientRect().height))
  }

  const getSafeTextEnd = (text: string, end: number): number => {
    if (end <= 0 || end >= text.length) return end
    const previousCode = text.charCodeAt(end - 1)
    const nextCode = text.charCodeAt(end)
    return previousCode >= 0xd800 && previousCode <= 0xdbff && nextCode >= 0xdc00 && nextCode <= 0xdfff
      ? end - 1
      : end
  }

  const createPageFragment = (line: LineItem, start: number, end: number): LineItem => ({
    id: start === 0 && end === line.text.length ? line.id : `${line.id}-fragment-${start}-${end}`,
    text: line.text.slice(start, end),
    approxOffset: line.approxOffset,
    sourceLineId: line.id,
    sourceText: line.text,
    sourceStartIndex: start,
    sourceOffset: line.approxOffset
  })

  const rebuildTxtPages = async (
    preferredAnchor = currentTxtPageAnchor.value,
    preserveCurrentPage = false
  ) => {
    if (currentBookType.value !== 'txt' || readingMode.value !== 'page') return
    const currentFirstItem = preserveCurrentPage ? currentTxtPageLines.value[0] : undefined
    const preferredSourceLineId = currentFirstItem?.sourceLineId ?? currentFirstItem?.id
    const preferredSourceStart = currentFirstItem?.sourceStartIndex ?? 0
    await nextTick()

    const pageHeight = Math.max(1, getAvailablePageHeight() - 4)
    if (pageHeight <= 0 || lines.value.length === 0) {
      txtPages.value = []
      currentTxtPageIndex.value = 0
      currentTxtPageAnchor.value = 0
      return
    }

    const measureBox = createMeasureBox()
    const pages: LineItem[][] = []
    let page: LineItem[] = []
    let usedHeight = 0
    const heightCache = new Map<string, number>()

    try {
      for (const line of lines.value) {
        const measure = (text: string): number => {
          const cached = heightCache.get(text)
          if (cached !== undefined) return cached
          const height = measureLineHeight(measureBox, text)
          heightCache.set(text, height)
          return height
        }

        if (line.text.length === 0) {
          const emptyLineHeight = measure('')
          if (page.length > 0 && usedHeight + emptyLineHeight > pageHeight) {
            pages.push(page)
            page = []
            usedHeight = 0
          }
          page.push(createPageFragment(line, 0, 0))
          usedHeight += emptyLineHeight
          continue
        }

        let start = 0
        while (start < line.text.length) {
          let availableHeight = pageHeight - usedHeight
          if (page.length > 0 && availableHeight < measure('字')) {
            pages.push(page)
            page = []
            usedHeight = 0
            availableHeight = pageHeight
          }

          const remainingText = line.text.slice(start)
          if (measure(remainingText) <= availableHeight) {
            page.push(createPageFragment(line, start, line.text.length))
            usedHeight += measure(remainingText)
            start = line.text.length
            continue
          }

          let low = start + 1
          let high = line.text.length
          let bestEnd = start
          while (low <= high) {
            const midpoint = Math.floor((low + high) / 2)
            const candidateEnd = getSafeTextEnd(line.text, midpoint)
            if (candidateEnd <= start) {
              low = midpoint + 1
              continue
            }
            const candidateHeight = measure(line.text.slice(start, candidateEnd))
            if (candidateHeight <= availableHeight) {
              bestEnd = candidateEnd
              low = midpoint + 1
            } else {
              high = midpoint - 1
            }
          }

          if (bestEnd === start) {
            bestEnd = start + (line.text.codePointAt(start)! > 0xffff ? 2 : 1)
          }

          const fragment = createPageFragment(line, start, bestEnd)
          page.push(fragment)
          usedHeight += measure(fragment.text)
          start = bestEnd

          if (start < line.text.length) {
            pages.push(page)
            page = []
            usedHeight = 0
          }
        }
      }

      if (page.length > 0) pages.push(page)
    } finally {
      measureBox.remove()
    }

    txtPages.value = pages

    let pageIndex = -1
    if (preferredSourceLineId) {
      pageIndex = pages.findIndex((candidatePage) =>
        candidatePage.some((item) => {
          const sourceLineId = item.sourceLineId ?? item.id
          const sourceStart = item.sourceStartIndex ?? 0
          const sourceEnd = sourceStart + item.text.length
          return (
            sourceLineId === preferredSourceLineId &&
            preferredSourceStart >= sourceStart &&
            preferredSourceStart <= sourceEnd
          )
        })
      )
    }

    if (pageIndex < 0) {
      pageIndex = 0
      for (let i = 0; i < pages.length; i++) {
        const firstLineOffset = pages[i][0]?.sourceOffset ?? pages[i][0]?.approxOffset ?? 0
        if (firstLineOffset === preferredAnchor) {
          pageIndex = i
          break
        }
        if (firstLineOffset > preferredAnchor) break
        pageIndex = i
      }
    }
    currentTxtPageIndex.value =
      pages.length > 0 ? pageIndex : Math.min(currentTxtPageIndex.value, Math.max(0, pages.length - 1))
    updatePageAnchor()
    updateReadingStatus()
  }

  const scheduleRebuildTxtPages = () => {
    if (rebuildTimer) clearTimeout(rebuildTimer)
    rebuildTimer = setTimeout(() => {
      rebuildTxtPages(currentTxtPageAnchor.value, true)
    }, 80)
  }

  const pageTxtBy = async (direction: 1 | -1) => {
    if (currentBookType.value !== 'txt' || readingMode.value !== 'page' || isTurningPage) return
    isTurningPage = true

    try {
      if (direction > 0) {
        if (currentTxtPageIndex.value < txtPages.value.length - 1) {
          currentTxtPageIndex.value++
        } else if (!isEndReached.value && !isLoading.value) {
          const oldLength = lines.value.length
          await loadNextChunk()
          await rebuildTxtPages(currentTxtPageAnchor.value, true)
          if (lines.value.length > oldLength && currentTxtPageIndex.value < txtPages.value.length - 1) {
            currentTxtPageIndex.value++
          }
        }
      } else {
        if (currentTxtPageIndex.value > 0) {
          currentTxtPageIndex.value--
        } else if (!isTopReached.value && !isLoading.value) {
          const oldFirstAnchor = currentTxtPageAnchor.value
          await loadPrevChunk(null)
          await rebuildTxtPages(oldFirstAnchor, true)
          if (currentTxtPageIndex.value > 0) currentTxtPageIndex.value--
        }
      }

      updatePageAnchor()
      autoSaveProgress()
      updateReadingStatus()
    } finally {
      window.setTimeout(() => {
        isTurningPage = false
      }, 120)
    }
  }

  watch(
    () => [lines.value.length, readerSettings.value.fontSize, readerSettings.value.lineHeight, readerSettings.value.fontFamily],
    () => {
      if (currentBookType.value === 'txt' && readingMode.value === 'page') scheduleRebuildTxtPages()
    },
    { deep: false }
  )

  watch(readingMode, async (newMode, oldMode) => {
    if (currentBookType.value !== 'txt') return

    if (newMode === 'page') {
      const anchor = oldMode === 'scroll' ? getExactOffset(true) : currentTxtPageAnchor.value
      currentTxtPageAnchor.value = anchor
      await rebuildTxtPages(anchor)
    } else if (oldMode === 'page') {
      const anchor = currentTxtPageAnchor.value
      await nextTick()

      const scroller = document.querySelector('.scroller') as HTMLElement | null
      if (scroller && lines.value.length > 0) {
        const targetIndex = Math.max(
          0,
          lines.value.findIndex((line) => (line.approxOffset ?? 0) >= anchor)
        )
        const scrollRange = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
        scroller.scrollTop = scrollRange * (targetIndex / Math.max(1, lines.value.length - 1))
      }

      updateReadingStatus()
    }
  })

  const onResize = () => scheduleRebuildTxtPages()

  onMounted(() => {
    window.addEventListener('resize', onResize)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', onResize)
    if (rebuildTimer) clearTimeout(rebuildTimer)
  })

  return {
    txtPages,
    currentTxtPageIndex,
    currentTxtPageLines,
    rebuildTxtPages,
    pageTxtBy
  }
}
