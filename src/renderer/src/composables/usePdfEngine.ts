import { nextTick, onMounted, onUnmounted, watch } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.js?url'
import { useReader, type TOCItem } from './useReader'
import { useManualToc } from './useManualToc'
import { readerHost } from '../platform/readerHost'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

interface PdfOutlineItem {
  title: string
  dest: string | unknown[] | null
}

interface PdfEngineCallbacks {
  autoSaveProgress: () => void
  updateReadingStatus: () => void
}

export function usePdfEngine(callbacks: PdfEngineCallbacks) {
  const { autoSaveProgress, updateReadingStatus } = callbacks

  const {
    currentBookPath,
    tocList,
    currentPdfPage,
    pdfTotalPages,
    readingMode
  } = useReader()
  const { applySavedTocAdjustments } = useManualToc()

  let rawPdfDoc: PDFDocumentProxy | null = null
  const renderedPdfPages = new Set<number>()
  let pdfObserver: IntersectionObserver | null = null
  let resizeTimer: ReturnType<typeof setTimeout> | null = null
  let isTurningPdfPage = false

  const renderPdfPage = async (pageNum: number) => {
    if (!rawPdfDoc || renderedPdfPages.has(pageNum)) return

    try {
      const page = await rawPdfDoc.getPage(pageNum)

      const canvas = document.getElementById(`pdf-canvas-${pageNum}`) as HTMLCanvasElement
      if (!canvas) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const container = document.getElementById('pdf-scroll-container')
      const containerWidth = container ? container.clientWidth : window.innerWidth * 0.8
      const containerHeight = container ? container.clientHeight : window.innerHeight
      const unscaledViewport = page.getViewport({ scale: 1.0 })
      const widthScale = (containerWidth * 0.95) / unscaledViewport.width
      const heightScale = (containerHeight * 0.92) / unscaledViewport.height
      const scale = readingMode.value === 'page' ? Math.min(widthScale, heightScale) : widthScale
      const viewport = page.getViewport({ scale })

      const outputScale = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * outputScale)
      canvas.height = Math.floor(viewport.height * outputScale)
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`

      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined

      renderedPdfPages.add(pageNum)
      await page.render({
        canvasContext: ctx,
        transform,
        viewport
      }).promise
    } catch (error) {
      console.error(`渲染 PDF 第 ${pageNum} 页失败:`, error)
    }
  }

  const clearRenderedPdfPages = () => {
    renderedPdfPages.clear()
  }

  const goToPdfPage = async (pageNum: number) => {
    if (!rawPdfDoc || pdfTotalPages.value === 0) return

    const targetPage = Math.min(pdfTotalPages.value, Math.max(1, Math.floor(pageNum)))
    currentPdfPage.value = targetPage
    await nextTick()
    await renderPdfPage(targetPage)

    if (readingMode.value === 'scroll') {
      const targetWrapper = document.getElementById(`pdf-page-wrapper-${targetPage}`)
      targetWrapper?.scrollIntoView({ behavior: 'auto', block: 'start' })
    }

    updateReadingStatus()
    autoSaveProgress()
  }

  const pagePdfBy = async (direction: 1 | -1) => {
    if (readingMode.value !== 'page' || isTurningPdfPage) return
    isTurningPdfPage = true
    try {
      await goToPdfPage(currentPdfPage.value + direction)
    } finally {
      setTimeout(() => {
        isTurningPdfPage = false
      }, 180)
    }
  }

  const onPdfWheel = (event: WheelEvent) => {
    if (readingMode.value !== 'page' || event.deltaY === 0) return
    event.preventDefault()
    pagePdfBy(event.deltaY > 0 ? 1 : -1)
  }

  const resolvePdfPage = async (pdfDest: TOCItem['pdfDest']) => {
    if (!rawPdfDoc || !pdfDest) return null

    let resolvedDest: unknown[] | null = null
    if (typeof pdfDest === 'string') {
      resolvedDest = (await rawPdfDoc.getDestination(pdfDest)) as unknown[] | null
    } else if (Array.isArray(pdfDest)) {
      resolvedDest = pdfDest
    }

    if (!Array.isArray(resolvedDest) || resolvedDest.length === 0) return null

    type PdfRefType = Parameters<PDFDocumentProxy['getPageIndex']>[0]
    const targetRef = resolvedDest[0] as PdfRefType
    const pageIndex = await rawPdfDoc.getPageIndex(targetRef)
    return pageIndex + 1
  }

  const jumpToPdfDestination = async (item: TOCItem) => {
    const targetPage = await resolvePdfPage(item.pdfDest)
    if (!targetPage) return

    await goToPdfPage(targetPage)
  }

  const loadPdfBook = async (fullPath: string) => {
    const res = await readerHost.readBuffer(fullPath)
    if (!res.success || !res.data) throw new Error('PDF 读取失败')

    rawPdfDoc = await pdfjsLib.getDocument({ data: res.data }).promise
    pdfTotalPages.value = rawPdfDoc.numPages

    const outline = await rawPdfDoc.getOutline()
    if (outline && outline.length > 0) {
      tocList.value = (outline as unknown[]).map((item) => {
        const outlineItem = item as PdfOutlineItem
        return {
          title: outlineItem.title,
          pdfDest: outlineItem.dest
        }
      })
    } else {
      tocList.value = []
    }
    applySavedTocAdjustments()

    const savedPage = await readerHost.getProgress(currentBookPath.value)
    let pageNum = typeof savedPage === 'number' && savedPage > 0 ? Math.floor(savedPage) : 1
    if (pageNum > pdfTotalPages.value) pageNum = 1

    currentPdfPage.value = pageNum
    renderedPdfPages.clear()

    await nextTick()

    renderPdfPage(currentPdfPage.value)
    if (currentPdfPage.value < pdfTotalPages.value) {
      renderPdfPage(currentPdfPage.value + 1)
    }

    const initWrapper = document.getElementById(`pdf-page-wrapper-${currentPdfPage.value}`)
    if (initWrapper) initWrapper.scrollIntoView()

    pdfObserver?.disconnect()
    pdfObserver = new IntersectionObserver(
      (entries) => {
        if (readingMode.value !== 'scroll') return
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pageStr = entry.target.getAttribute('data-page')
            if (!pageStr) return

            const pNum = Number(pageStr)
            renderPdfPage(pNum)
            currentPdfPage.value = pNum
            updateReadingStatus()
            autoSaveProgress()
          }
        })
      },
      {
        root: document.getElementById('pdf-scroll-container'),
        rootMargin: '100% 0px 100% 0px',
        threshold: 0.1
      }
    )

    const wrappers = document.querySelectorAll('.pdf-page-wrapper')
    wrappers.forEach((wrapper) => pdfObserver?.observe(wrapper))

    if (currentPdfPage.value > 1) {
      setTimeout(() => {
        const targetWrapper = document.getElementById(`pdf-page-wrapper-${currentPdfPage.value}`)
        if (targetWrapper) targetWrapper.scrollIntoView({ behavior: 'auto' })
      }, 150)
    }

    setTimeout(async () => {
      if (!rawPdfDoc) return

      for (const item of tocList.value) {
        if (item.pdfDest) {
          try {
            const pageNumber = await resolvePdfPage(item.pdfDest)
            if (pageNumber) item.pageNumber = pageNumber
          } catch (e) {
            // 静默忽略个别解析失败的 PDF 锚点
          }
        }
      }

      updateReadingStatus()
    }, 500)
  }

  watch(readingMode, async () => {
    if (!rawPdfDoc) return
    clearRenderedPdfPages()
    await nextTick()
    await goToPdfPage(currentPdfPage.value)
    if (readingMode.value === 'scroll' && currentPdfPage.value < pdfTotalPages.value) {
      renderPdfPage(currentPdfPage.value + 1)
    }
  })

  const onResize = () => {
    if (!rawPdfDoc || readingMode.value !== 'page') return
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      clearRenderedPdfPages()
      renderPdfPage(currentPdfPage.value)
    }, 100)
  }

  onMounted(() => window.addEventListener('resize', onResize))
  onUnmounted(() => {
    window.removeEventListener('resize', onResize)
    pdfObserver?.disconnect()
    if (resizeTimer) clearTimeout(resizeTimer)
  })

  return {
    loadPdfBook,
    renderPdfPage,
    goToPdfPage,
    pagePdfBy,
    onPdfWheel,
    jumpToPdfDestination
  }
}
