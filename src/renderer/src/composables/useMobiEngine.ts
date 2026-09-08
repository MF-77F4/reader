import { nextTick, watch } from 'vue'
import {
  makeBook,
  type FoliateBook,
  type FoliateLocation,
  type FoliateTocItem,
  type FoliateViewElement
} from 'foliate-js/view.js'
import { Overlayer } from 'foliate-js/overlayer.js'
import { useAnnotation } from './useAnnotation'
import { useReader, type TOCItem } from './useReader'
import { useManualToc } from './useManualToc'
import { useSettings } from './useSettings'
import { useBookmark } from './useBookmark'
import { expandSelectionToParagraph } from '../utils/paragraphSelection'
import { readerHost } from '../platform/readerHost'

interface MobiEngineCallbacks {
  autoSaveProgress: () => void
  closeAllSecondaryMenus: () => void
  toggleToolbar: () => void
  openAnnotationPanel: (id: string) => void
  onKeyDown: (event: KeyboardEvent) => boolean
}

export function useMobiEngine(callbacks: MobiEngineCallbacks) {
  const {
    currentBookPath,
    mobiView,
    mobiLocation,
    tocList,
    readingProgressText,
    activeChapterTitle,
    sliderProgress,
    readingMode,
    isToolbarVisible
  } = useReader()
  const { readerSettings, isFontMenuOpen } = useSettings()
  const { isBookmarkMenuOpen } = useBookmark()
  const { applySavedTocAdjustments } = useManualToc()
  const {
    isTopMenuOpen,
    isHighlightMenuOpen,
    epubHighlights,
    selectionMenuState,
    currentSelectionCfi,
    currentSelectionCfis,
    isAnnotationPanelOpen,
    isAnnotationInputOpen
  } = useAnnotation()
  let wheelLocked = false
  let pageTurnLocked = false
  let lastScrollDirection: 1 | -1 = 1
  let scrollBoundaryTimer: ReturnType<typeof setTimeout> | null = null

  const flattenToc = (
    items: FoliateTocItem[] = [],
    depth = 0,
    parentIds: string[] = []
  ): TOCItem[] =>
    items.flatMap((item, index) => {
      const id = `mobi-toc-${parentIds.join('-') || 'root'}-${index}`
      const subitems = item.subitems || []
      return [
        {
          title: item.label?.trim() || '未命名章节',
          href: item.href,
          id,
          depth,
          parentIds,
          hasChildren: subitems.length > 0
        },
        ...flattenToc(subitems, depth + 1, [...parentIds, id])
      ]
    })

  const updateLocation = (location: FoliateLocation) => {
    mobiLocation.value = location.cfi || ''
    const progress = Math.max(0, Math.min(100, (location.fraction ?? 0) * 100))
    readingProgressText.value = `${progress.toFixed(2)}%`
    sliderProgress.value = progress

    const title = location.tocItem?.label?.trim()
    if (title) activeChapterTitle.value = title
    callbacks.autoSaveProgress()
  }

  const closeMobiBook = () => {
    mobiView.value?.close()
    mobiView.value?.remove()
    mobiView.value = null
    mobiLocation.value = ''
  }

  const saveMobiHighlights = () => {
    if (!currentBookPath.value) return
    localStorage.setItem(`mobi_hl_${currentBookPath.value}`, JSON.stringify(epubHighlights.value))
  }

  const renderMobiHighlight = async (
    id: string,
    cfis: string[],
    type: 'highlight' | 'annotate' = 'highlight'
  ) => {
    const view = mobiView.value
    if (!view) return

    for (const cfi of cfis) {
      await view.addAnnotation({
        value: cfi,
        id,
        type,
        color: type === 'annotate' ? '#ff3b30' : '#ffd84d'
      })
    }
  }

  const removeMobiHighlight = async (cfis: string[]) => {
    const view = mobiView.value
    if (!view) return
    for (const cfi of cfis) await view.deleteAnnotation({ value: cfi })
  }

  const applyMobiSettings = () => {
    const renderer = mobiView.value?.renderer
    if (!renderer) return

    renderer.setAttribute('max-column-count', '1')
    renderer.setAttribute('max-inline-size', '900px')
    renderer.setAttribute('margin', '32px')
    if (readingMode.value === 'scroll') renderer.setAttribute('flow', 'scrolled')
    else renderer.removeAttribute('flow')

    const settings = readerSettings.value
    renderer.setStyles?.(`
      :root {
        color-scheme: ${settings.isNight ? 'dark' : 'light'};
        --theme-bg-color: transparent;
      }
      html, body {
        background: transparent !important;
      }
      body, body * {
        color: ${settings.isNight ? '#d8d8d8' : '#1d1d1f'} !important;
        -webkit-text-fill-color: ${settings.isNight ? '#d8d8d8' : '#1d1d1f'} !important;
      }
      html, body {
        font-family: ${settings.fontFamily || 'inherit'} !important;
        font-size: ${settings.fontSize}px !important;
        line-height: ${settings.lineHeight} !important;
      }
      a, a:visited {
        color: ${settings.isNight ? '#8ab4f8' : '#315f9b'} !important;
        -webkit-text-fill-color: ${settings.isNight ? '#8ab4f8' : '#315f9b'} !important;
      }
      body {
        padding: 0 !important;
      }
      img, svg {
        max-width: 100% !important;
        height: auto !important;
      }
    `)
  }

  const getFrameOffset = (doc: Document) => {
    const frame = doc.defaultView?.frameElement as HTMLElement | null
    const rect = frame?.getBoundingClientRect()
    return { left: rect?.left ?? 0, top: rect?.top ?? 0 }
  }

  const handleSelection = (event: MouseEvent, doc: Document, index: number) => {
    const selection = doc.getSelection()
    const text = selection?.toString().trim() || ''
    if (!selection || !text || selection.rangeCount === 0 || !mobiView.value) return false

    const range = selection.getRangeAt(0)
    const cfi = mobiView.value.getCFI(index, range)
    const rect = range.getBoundingClientRect()
    const offset = getFrameOffset(doc)
    const overlapping = epubHighlights.value.filter((highlight) => highlight.cfis.includes(cfi))

    currentSelectionCfi.value = cfi
    currentSelectionCfis.value = [cfi]
    selectionMenuState.value = {
      visible: true,
      x: offset.left + rect.left + rect.width / 2,
      y: Math.max(offset.top + rect.top - 58, 60),
      anchorTop: offset.top + rect.top,
      anchorBottom: offset.top + rect.bottom,
      text,
      isOverlappingMark: overlapping.length > 0,
      overlapType: overlapping.some((highlight) => highlight.type === 'annotate')
        ? 'annotate'
        : overlapping.length
          ? 'highlight'
          : 'none',
      targetCfis: overlapping.map((highlight) => highlight.id)
    }
    event.stopPropagation()
    return true
  }

  const handlePageClick = async (
    event: MouseEvent,
    doc: Document,
    wasToolbarVisible: boolean,
    wasPanelOpen: boolean
  ) => {
    if (doc.getSelection()?.toString().trim()) return

    callbacks.closeAllSecondaryMenus()
    if (wasToolbarVisible) {
      callbacks.toggleToolbar()
      return
    }
    if (wasPanelOpen) return

    if (readingMode.value !== 'page') {
      callbacks.toggleToolbar()
      return
    }

    const frameOffset = getFrameOffset(doc)
    const viewer = document.getElementById('mobi-viewer')
    const viewerRect = viewer?.getBoundingClientRect()
    const viewerWidth = viewerRect?.width || doc.documentElement.clientWidth || 1
    const readingAreaWidth = Math.min(viewerWidth, 900)
    const readingAreaLeft =
      (viewerRect?.left ?? frameOffset.left) + (viewerWidth - readingAreaWidth) / 2
    const realX = event.clientX + frameOffset.left
    const ratio = (realX - readingAreaLeft) / readingAreaWidth

    if (ratio >= 0.3 && ratio <= 0.7) {
      callbacks.toggleToolbar()
      return
    }
    if (pageTurnLocked) return

    pageTurnLocked = true
    try {
      if (ratio < 0.3) await mobiView.value?.prev()
      else await mobiView.value?.next()
    } finally {
      setTimeout(() => {
        pageTurnLocked = false
      }, 300)
    }
  }

  const getMobiClickZone = (event: MouseEvent, doc: Document) => {
    if (readingMode.value !== 'page') return 'center' as const

    const frameOffset = getFrameOffset(doc)
    const viewer = document.getElementById('mobi-viewer')
    const viewerRect = viewer?.getBoundingClientRect()
    const viewerWidth = viewerRect?.width || doc.documentElement.clientWidth || 1
    const readingAreaWidth = Math.min(viewerWidth, 900)
    const readingAreaLeft =
      (viewerRect?.left ?? frameOffset.left) + (viewerWidth - readingAreaWidth) / 2
    const ratio = (event.clientX + frameOffset.left - readingAreaLeft) / readingAreaWidth

    return ratio < 0.3 ? ('left' as const) : ratio > 0.7 ? ('right' as const) : ('center' as const)
  }

  const turnMobiScrollSection = () => {
    const renderer = mobiView.value?.renderer
    if (!renderer || readingMode.value !== 'scroll' || wheelLocked) return

    const start = renderer.start ?? 0
    const end = renderer.end ?? 0
    const viewSize = renderer.viewSize ?? Number.POSITIVE_INFINITY
    const atTop = start <= 2
    const atBottom = viewSize - end <= 2
    if (
      (lastScrollDirection > 0 && !atBottom) ||
      (lastScrollDirection < 0 && !atTop)
    ) {
      return
    }

    wheelLocked = true
    const navigation =
      lastScrollDirection > 0 ? mobiView.value?.next() : mobiView.value?.prev()
    void Promise.resolve(navigation).finally(() => {
      setTimeout(() => {
        wheelLocked = false
      }, 120)
    })
  }

  const scheduleMobiScrollBoundaryCheck = () => {
    if (scrollBoundaryTimer) clearTimeout(scrollBoundaryTimer)
    scrollBoundaryTimer = setTimeout(turnMobiScrollSection, 24)
  }

  const bindMobiDocument = (doc: Document, index: number) => {
    doc.addEventListener('keydown', (event) => {
      if (callbacks.onKeyDown(event)) event.preventDefault()
    })

    let pointerStartX = 0
    let pointerStartY = 0
    let hadSelectionOnPointerDown = false
    let wasToolbarVisibleOnPointerDown = false
    let wasPanelOpenOnPointerDown = false
    let wasLinkClickOnPointerDown = false
    let pendingToolbarTimer: ReturnType<typeof setTimeout> | null = null
    doc.addEventListener('mousedown', (event) => {
      pointerStartX = event.clientX
      pointerStartY = event.clientY
      hadSelectionOnPointerDown = !!doc.getSelection()?.toString().trim()
      wasToolbarVisibleOnPointerDown = isToolbarVisible.value
      wasPanelOpenOnPointerDown =
        isAnnotationPanelOpen.value ||
        isHighlightMenuOpen.value ||
        isBookmarkMenuOpen.value ||
        isTopMenuOpen.value ||
        isFontMenuOpen.value
      wasLinkClickOnPointerDown =
        event.target instanceof Element && !!event.target.closest('a[href]')

      if (isHighlightMenuOpen.value || isBookmarkMenuOpen.value) {
        callbacks.closeAllSecondaryMenus()
      } else {
        if (isTopMenuOpen.value) isTopMenuOpen.value = false
        if (isFontMenuOpen.value) isFontMenuOpen.value = false
      }
      selectionMenuState.value.visible = false
    })

    doc.addEventListener('dblclick', (event) => {
      if (pendingToolbarTimer) {
        clearTimeout(pendingToolbarTimer)
        pendingToolbarTimer = null
      }
      if (!expandSelectionToParagraph(doc.getSelection(), doc, event.target)) return

      setTimeout(() => {
        handleSelection(event, doc, index)
      }, 0)
    })

    doc.addEventListener('mouseup', (event) => {
      setTimeout(() => {
        if (handleSelection(event, doc, index)) return
        const moved =
          Math.abs(event.clientX - pointerStartX) > 5 || Math.abs(event.clientY - pointerStartY) > 5
        if (
          moved ||
          hadSelectionOnPointerDown ||
          wasLinkClickOnPointerDown ||
          event.detail > 1
        ) {
          return
        }

        const zone = getMobiClickZone(event, doc)
        if (zone === 'center') {
          if (pendingToolbarTimer) clearTimeout(pendingToolbarTimer)
          const clickHadToolbar = wasToolbarVisibleOnPointerDown
          const clickHadPanel = wasPanelOpenOnPointerDown
          pendingToolbarTimer = setTimeout(() => {
            pendingToolbarTimer = null
            void handlePageClick(event, doc, clickHadToolbar, clickHadPanel)
          }, 120)
        } else {
          void handlePageClick(
            event,
            doc,
            wasToolbarVisibleOnPointerDown,
            wasPanelOpenOnPointerDown
          )
        }
      }, 0)
    })
    doc.addEventListener(
      'wheel',
      (event) => {
        if (readingMode.value === 'scroll') {
          if (isToolbarVisible.value) callbacks.toggleToolbar()
          selectionMenuState.value.visible = false
          if (Math.abs(event.deltaY) < 2) return
          lastScrollDirection = event.deltaY > 0 ? 1 : -1
          scheduleMobiScrollBoundaryCheck()
          return
        }
        if (wheelLocked || Math.abs(event.deltaY) < 8) return
        event.preventDefault()
        wheelLocked = true
        void (event.deltaY > 0 ? mobiView.value?.next() : mobiView.value?.prev())
        setTimeout(() => {
          wheelLocked = false
        }, 280)
      },
      { passive: false }
    )
  }

  const loadMobiBook = async (fullPath: string) => {
    closeMobiBook()
    const result = await readerHost.readBuffer(fullPath)
    if (!result.success || !result.data) {
      throw new Error(result.error || '无法读取 MOBI/AZW3 文件')
    }

    const fileName = fullPath.split(/[\\/]/).pop() || 'book.mobi'
    const bytes = new Uint8Array(result.data)
    const file = new File([bytes], fileName)
    const book: FoliateBook = await makeBook(file)

    await nextTick()
    const container = document.getElementById('mobi-viewer')
    if (!container) throw new Error('MOBI 阅读视图尚未就绪')
    container.innerHTML = ''

    const view = document.createElement('foliate-view') as FoliateViewElement
    view.className = 'foliate-reader'
    view.addEventListener('load', (event) => {
      const detail = (event as CustomEvent<{ doc: Document; index: number }>).detail
      if (detail?.doc) bindMobiDocument(detail.doc, detail.index)
    })
    view.addEventListener('draw-annotation', (event) => {
      const detail = (
        event as CustomEvent<{
          draw: (
            renderer: typeof Overlayer.highlight | typeof Overlayer.underline,
            options?: Record<string, unknown>
          ) => void
          annotation: { type?: string; color?: string }
        }>
      ).detail
      if (detail.annotation.type === 'annotate') {
        detail.draw(Overlayer.underline, { color: '#ff3b30', width: 2 })
      } else {
        detail.draw(Overlayer.highlight, {
          color: readerSettings.value.isNight ? '#a78318' : '#ffd84d',
          opacity: 0.42
        })
      }
    })
    view.addEventListener('show-annotation', (event) => {
      const { value, range } = (
        event as CustomEvent<{ value: string; range: Range }>
      ).detail
      const highlight = epubHighlights.value.find((item) => item.cfis.includes(value))
      if (!highlight) return

      if (highlight.type === 'annotate') {
        callbacks.closeAllSecondaryMenus()
        isAnnotationInputOpen.value = false
        callbacks.openAnnotationPanel(highlight.id)
      }

      const rect = range.getBoundingClientRect()
      const ownerDocument = range.startContainer.ownerDocument
      if (!ownerDocument) return
      const offset = getFrameOffset(ownerDocument)
      selectionMenuState.value = {
        visible: highlight.type !== 'annotate',
        x: offset.left + rect.left + rect.width / 2,
        y: Math.max(offset.top + rect.top - 58, 60),
        anchorTop: offset.top + rect.top,
        anchorBottom: offset.top + rect.bottom,
        text: '',
        isOverlappingMark: true,
        overlapType: highlight.type === 'annotate' ? 'annotate' : 'highlight',
        targetCfis: [highlight.id]
      }
    })
    view.addEventListener('create-overlay', () => {
      setTimeout(() => {
        for (const highlight of epubHighlights.value) {
          void renderMobiHighlight(
            highlight.id,
            highlight.cfis,
            highlight.type === 'annotate' ? 'annotate' : 'highlight'
          )
        }
      }, 0)
    })
    view.addEventListener('relocate', (event) => {
      updateLocation((event as CustomEvent<FoliateLocation>).detail)
    })
    container.appendChild(view)
    mobiView.value = view

    await view.open(book)
    applyMobiSettings()
    view.renderer?.addEventListener('scroll', scheduleMobiScrollBoundaryCheck)
    tocList.value = flattenToc(book.toc)
    applySavedTocAdjustments()
    const savedHighlights = localStorage.getItem(`mobi_hl_${currentBookPath.value}`)
    try {
      epubHighlights.value = savedHighlights ? JSON.parse(savedHighlights) : []
    } catch {
      epubHighlights.value = []
    }

    const savedLocation = await readerHost.getProgress(currentBookPath.value)
    await view.init({
      lastLocation: typeof savedLocation === 'string' ? savedLocation : undefined,
      showTextStart: true
    })
  }

  watch([readingMode, readerSettings], applyMobiSettings, { deep: true })

  return {
    loadMobiBook,
    closeMobiBook,
    applyMobiSettings,
    renderMobiHighlight,
    removeMobiHighlight,
    saveMobiHighlights
  }
}
