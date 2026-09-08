import { useAnnotation } from './useAnnotation'
import { useReader } from './useReader'
import { useSettings } from './useSettings'
import { useBookmark } from './useBookmark'
import { expandSelectionToParagraph } from '../utils/paragraphSelection'

interface ContentSelectionOptions {
  closeAllSecondaryMenus: () => void
  toggleToolbar: () => void
  pageTxtBy?: (direction: 1 | -1) => Promise<void>
  pagePdfBy?: (direction: 1 | -1) => Promise<void>
}

export function useContentSelection(options: ContentSelectionOptions) {
  const { closeAllSecondaryMenus, toggleToolbar, pageTxtBy, pagePdfBy } = options

  const {
    isTopMenuOpen,
    isHighlightMenuOpen,
    txtHighlights,
    isAnnotationPanelOpen,
    isAnnotationInputOpen,
    selectionMenuState,
    currentSelectionRange,
    currentTxtSelection
  } = useAnnotation()

  const { isFontMenuOpen } = useSettings()
  const { isBookmarkMenuOpen } = useBookmark()
  const { currentBookType, lines, readingMode, isToolbarVisible } = useReader()

  let contentStartX = 0
  let contentStartY = 0
  let hadSelectionBefore = false
  let wasPanelOpenOnMouseDown = false
  let wasToolbarVisibleOnMouseDown = false
  let pendingSingleClickTimer: ReturnType<typeof setTimeout> | null = null
  let paragraphSelectionTarget: EventTarget | null = null
  let paragraphSelectionLockUntil = 0

  const onContentMouseDown = (e: MouseEvent) => {
    wasToolbarVisibleOnMouseDown = isToolbarVisible.value
    wasPanelOpenOnMouseDown =
      isAnnotationPanelOpen.value ||
      isHighlightMenuOpen.value ||
      isBookmarkMenuOpen.value ||
      isTopMenuOpen.value ||
      isFontMenuOpen.value

    selectionMenuState.value.visible = false
    isAnnotationPanelOpen.value = false
    isAnnotationInputOpen.value = false

    contentStartX = e.clientX
    contentStartY = e.clientY
    const sel = window.getSelection()
    hadSelectionBefore = !!(sel && sel.toString().trim().length > 0)
  }

  const collectTxtSelection = (range: Range) => {
    let isOverlapping = false
    const targetIds: string[] = []
    let overlapType = 'none'
    const selectedSegments: {
      lineText: string
      startIndex: number
      endIndex: number
      offset: number
    }[] = []

    const lineElements = document.querySelectorAll('.line-item')

    lineElements.forEach((lineEl) => {
      try {
        if (!range.intersectsNode(lineEl)) return

        const lineText = lineEl.getAttribute('data-raw-text')
        if (!lineText) return

        const intersectionRange = document.createRange()
        intersectionRange.selectNodeContents(lineEl)

        if (lineEl.contains(range.startContainer)) {
          intersectionRange.setStart(range.startContainer, range.startOffset)
        }
        if (lineEl.contains(range.endContainer)) {
          intersectionRange.setEnd(range.endContainer, range.endOffset)
        }

        const prefixRange = document.createRange()
        prefixRange.setStart(lineEl, 0)
        prefixRange.setEnd(intersectionRange.startContainer, intersectionRange.startOffset)

        const fragmentStart = Number(lineEl.getAttribute('data-source-start')) || 0
        const rawStart = fragmentStart + prefixRange.toString().length
        const rawEnd = rawStart + intersectionRange.toString().length

        const lineId = lineEl.getAttribute('data-line-id')
        const lineData = lines.value.find((l) => l.id === lineId)
        const elementOffset = Number(lineEl.getAttribute('data-line-offset'))
        const currentLineOffset = Number.isFinite(elementOffset)
          ? elementOffset
          : lineData?.approxOffset || 0

        if (rawStart < rawEnd) {
          selectedSegments.push({
            lineText,
            startIndex: rawStart,
            endIndex: rawEnd,
            offset: currentLineOffset
          })

          const existingHls = txtHighlights.value.filter(
            (h) => h.lineText === lineText && Math.abs(h.offset - currentLineOffset) < 100000
          )

          for (const hl of existingHls) {
            if (rawStart < hl.endIndex && rawEnd > hl.startIndex) {
              isOverlapping = true
              if (!targetIds.includes(hl.id)) targetIds.push(hl.id)
              if (hl.type === 'annotate') overlapType = 'annotate'
              else if (overlapType !== 'annotate') overlapType = 'highlight'
            }
          }
        }
      } catch (err) {}
    })

    currentTxtSelection.value = selectedSegments

    return {
      isOverlapping,
      targetIds,
      overlapType
    }
  }

  const onContentMouseUp = (e: MouseEvent) => {
    const mouseX = e.clientX
    const mouseY = e.clientY
    const contentRect = (e.currentTarget as HTMLElement | null)?.getBoundingClientRect()
    const targetEl = e.target as HTMLElement

    setTimeout(() => {
      if (Date.now() < paragraphSelectionLockUntil && paragraphSelectionTarget) {
        expandSelectionToParagraph(window.getSelection(), document, paragraphSelectionTarget)
      }
      const selection = window.getSelection()
      const text = selection ? selection.toString().trim() : ''

      if (text.length > 0 && selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        currentSelectionRange.value = range.cloneRange()

        let isOverlapping = false
        let targetIds: string[] = []
        let overlapType = 'none'

        if (currentBookType.value === 'txt') {
          const txtSelection = collectTxtSelection(range)
          isOverlapping = txtSelection.isOverlapping
          targetIds = txtSelection.targetIds
          overlapType = txtSelection.overlapType
        }

        const rects = range.getClientRects()
        const firstRect = rects.length > 0 ? rects[0] : range.getBoundingClientRect()

        selectionMenuState.value = {
          visible: true,
          x: firstRect.left + firstRect.width / 2,
          y: Math.max(firstRect.top - 58, 60),
          anchorTop: firstRect.top,
          anchorBottom: firstRect.bottom,
          text,
          isOverlappingMark: isOverlapping,
          overlapType,
          targetCfis: targetIds
        }
      } else {
        if (targetEl.classList.contains('highlight-marker')) return
        selectionMenuState.value.visible = false

        const diffX = Math.abs(mouseX - contentStartX)
        const diffY = Math.abs(mouseY - contentStartY)

        if (diffX <= 5 && diffY <= 5 && !hadSelectionBefore) {
          if (e.detail > 1) return
          if (pendingSingleClickTimer) clearTimeout(pendingSingleClickTimer)
          pendingSingleClickTimer = setTimeout(() => {
            pendingSingleClickTimer = null
            closeAllSecondaryMenus()
            if (wasToolbarVisibleOnMouseDown) {
              toggleToolbar()
              return
            }
            if (!wasPanelOpenOnMouseDown) {
              if (
                currentBookType.value === 'txt' &&
                readingMode.value === 'page' &&
                pageTxtBy &&
                contentRect
              ) {
                const ratio = (mouseX - contentRect.left) / contentRect.width

                if (ratio < 0.35) {
                  pageTxtBy(-1)
                } else if (ratio > 0.65) {
                  pageTxtBy(1)
                } else {
                  toggleToolbar()
                }
              } else if (
                currentBookType.value === 'pdf' &&
                readingMode.value === 'page' &&
                pagePdfBy &&
                contentRect
              ) {
                const ratio = (mouseX - contentRect.left) / contentRect.width

                if (ratio < 0.35) {
                  pagePdfBy(-1)
                } else if (ratio > 0.65) {
                  pagePdfBy(1)
                } else {
                  toggleToolbar()
                }
              } else {
                toggleToolbar()
              }
            }
          }, 30)
        }
      }
    }, 50)
  }

  const onContentDoubleClick = (e: MouseEvent): void => {
    if (currentBookType.value !== 'txt') return
    if (pendingSingleClickTimer) {
      clearTimeout(pendingSingleClickTimer)
      pendingSingleClickTimer = null
    }
    paragraphSelectionTarget = e.target
    paragraphSelectionLockUntil = Date.now() + 220

    setTimeout(() => {
      if (expandSelectionToParagraph(window.getSelection(), document, paragraphSelectionTarget)) {
        onContentMouseUp(e)
      }
    }, 0)
  }

  return {
    onContentMouseDown,
    onContentMouseUp,
    onContentDoubleClick
  }
}
