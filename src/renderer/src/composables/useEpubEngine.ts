// src/renderer/src/composables/useEpubEngine.ts
import epub, { EpubCFI } from 'epubjs'
import { watch } from 'vue'
import { useReader } from './useReader'
import { useAnnotation } from './useAnnotation'
import { useSettings } from './useSettings'
import { useBookmark } from './useBookmark'
import { useManualToc } from './useManualToc'
import { expandSelectionToParagraph } from '../utils/paragraphSelection'
import { readerHost } from '../platform/readerHost'

// 原版的内部接口定义
interface EpubContents {
  document: Document
  window: Window
  cfiBase: string
}

interface EpubPageAnchor {
  cfi: string
  text: string
  version: 3
}

// 用来接收 App.vue 原有函数的连接器
interface EpubEngineCallbacks {
  openAnnotationPanel: (id: string) => void
  closeAllSecondaryMenus: () => void
  toggleToolbar: () => void
  hideToolbarOnScroll: () => void
  autoSaveProgress: () => void
  updateReadingStatus: () => void
  onKeyDown: (event: KeyboardEvent) => boolean
}

export function useEpubEngine(callbacks: EpubEngineCallbacks) {
  // 1. 接入已经抽离的状态
  const { currentBookType, currentBookPath, epubBook, epubRendition, epubCfi, tocList, readingMode, isToolbarVisible } = useReader()
  const { epubHighlights, isAnnotationPanelOpen, isAnnotationInputOpen, isHighlightMenuOpen, isTopMenuOpen, selectionMenuState, currentSelectionCfi, currentSelectionCfis, enrichEpubHighlightChapters } = useAnnotation()
  const { readerSettings, isFontMenuOpen, getSelectionPalette } = useSettings()
  const { isBookmarkMenuOpen } = useBookmark()
  const { applySavedTocAdjustments } = useManualToc()

  // 2. 接收 App.vue 传进来的 5 个调度函数，保证原有逻辑不断层
  const { openAnnotationPanel, closeAllSecondaryMenus, toggleToolbar, hideToolbarOnScroll, autoSaveProgress, updateReadingStatus } = callbacks

  let currentEpubSourcePath = ''
  let isReloadingForMode = false
  let pageAnchorTimer: ReturnType<typeof setTimeout> | null = null

  const getContentsIframe = (doc: Document) =>
    Array.from(document.querySelectorAll<HTMLIFrameElement>('.epub-viewer iframe')).find(
      (frame) => frame.contentDocument === doc
    )

  const getOuterRect = (rect: DOMRect, iframe?: HTMLIFrameElement) => {
    if (!iframe) return rect

    const iframeRect = iframe.getBoundingClientRect()
    const scaleX = iframe.clientWidth ? iframeRect.width / iframe.clientWidth : 1
    const scaleY = iframe.clientHeight ? iframeRect.height / iframe.clientHeight : 1

    return {
      left: iframeRect.left + rect.left * scaleX,
      right: iframeRect.left + rect.right * scaleX,
      top: iframeRect.top + rect.top * scaleY,
      width: rect.width * scaleX,
      height: rect.height * scaleY
    }
  }

  const syncEpubHighlightPalette = () => {
    const palette = getSelectionPalette()

    document
      .querySelectorAll<SVGSVGElement>('.epub-viewer svg[data-reader-highlight-backdrop]')
      .forEach((backdrop) => backdrop.remove())

    document
      .querySelectorAll<SVGSVGElement>('.epub-viewer svg:not([data-reader-highlight-backdrop])')
      .forEach((sourceSvg) => {
        const groups = sourceSvg.querySelectorAll<SVGGElement>(
          'g.epubjs-hl:not(.epubjs-annotate)'
        )
        if (groups.length === 0 || !sourceSvg.parentElement) return

        const backdropSvg = sourceSvg.cloneNode(false) as SVGSVGElement
        backdropSvg.dataset.readerHighlightBackdrop = 'true'
        backdropSvg.setAttribute('aria-hidden', 'true')
        backdropSvg.style.pointerEvents = 'none'
        backdropSvg.style.zIndex = '0'

        groups.forEach((group) => {
          const backdropGroup = group.cloneNode(true) as SVGGElement
          backdropGroup.removeAttribute('opacity')
          backdropGroup.removeAttribute('mix-blend-mode')
          backdropGroup.style.removeProperty('opacity')
          backdropGroup.style.removeProperty('mix-blend-mode')
          backdropGroup.setAttribute('fill', palette.fill)
          backdropGroup.setAttribute('fill-opacity', '1')

          backdropGroup.querySelectorAll<SVGRectElement>('rect').forEach((rect) => {
            rect.style.setProperty('fill', palette.fill, 'important')
            rect.style.setProperty('fill-opacity', '1', 'important')
          })

          backdropSvg.appendChild(backdropGroup)
          group.style.setProperty('opacity', '0', 'important')
        })

        sourceSvg.style.zIndex = '2'
        sourceSvg.parentElement
          .querySelectorAll<HTMLIFrameElement>('iframe')
          .forEach((iframe) => {
            iframe.style.position = 'relative'
            iframe.style.zIndex = '1'
            iframe.style.background = 'transparent'
          })
        sourceSvg.parentElement.insertBefore(backdropSvg, sourceSvg.parentElement.firstChild)
      })
  }

  const clearEpubViewerDom = () => {
    const viewer = document.getElementById('epub-viewer')
    if (viewer) viewer.innerHTML = ''
  }

  const stripEpubBackgrounds = (doc: Document) => {
    const applyTransparentBackground = (element: HTMLElement) => {
      element.removeAttribute('bgcolor')
      element.removeAttribute('background')
      element.style.setProperty('background', 'transparent', 'important')
      element.style.setProperty('background-color', 'transparent', 'important')
      element.style.setProperty('background-image', 'none', 'important')
    }

    const structuralSelector = [
      'html',
      'body',
      'main',
      'article',
      'section',
      '[role="main"]',
      '.calibre',
      '.calibre1',
      '.chapter',
      '.page',
      '.body',
      '.main',
      '.container',
      '.content',
      '.book',
      '.text'
    ].join(',')

    doc.querySelectorAll<HTMLElement>(structuralSelector).forEach(applyTransparentBackground)
    doc
      .querySelectorAll<HTMLElement>('[bgcolor], [background]')
      .forEach(applyTransparentBackground)

    const viewportArea = Math.max(1, doc.documentElement.clientWidth * doc.documentElement.clientHeight)
    doc.querySelectorAll<HTMLElement>('[style*="background" i]').forEach((element) => {
      const rect = element.getBoundingClientRect()
      const isLargeSurface = rect.width * rect.height > viewportArea * 0.35
      if (element === doc.body || element === doc.documentElement || isLargeSurface) {
        applyTransparentBackground(element)
      }
    })
  }

  const disposeEpubInstance = () => {
    if (pageAnchorTimer) {
      clearTimeout(pageAnchorTimer)
      pageAnchorTimer = null
    }

    if (epubRendition.value) {
      try {
        epubRendition.value.destroy()
      } catch (e) {
        console.warn('销毁 EPUB rendition 失败，继续重建', e)
      }
      epubRendition.value = null
    }

    if (epubBook.value) {
      try {
        epubBook.value.destroy()
      } catch (e) {
        console.warn('销毁 EPUB book 失败，继续重建', e)
      }
      epubBook.value = null
    }

    clearEpubViewerDom()
  }

  const getEpubPageAnchorKey = () => `epub_page_anchor_${currentBookPath.value}`

  const readSavedEpubPageAnchor = (): EpubPageAnchor | null => {
    try {
      const savedAnchor = JSON.parse(localStorage.getItem(getEpubPageAnchorKey()) || '')
      return savedAnchor?.version === 3 && typeof savedAnchor.cfi === 'string' ? savedAnchor : null
    } catch {
      return null
    }
  }

  const getVisibleEpubPageAnchor = (): EpubPageAnchor | null => {
    if (currentBookType.value !== 'epub' || !epubRendition.value) {
      return null
    }

    type EpubRenditionContents = { getContents?: () => EpubContents[] }
    const rendition = epubRendition.value as unknown as EpubRenditionContents
    const pageStartCfi = epubRendition.value.location?.start?.cfi || epubCfi.value
    const pageStartRange = pageStartCfi ? epubRendition.value.getRange(pageStartCfi) : null

    if (!pageStartRange) {
      return pageStartCfi ? { cfi: pageStartCfi, text: '', version: 3 } : null
    }

    for (const contents of rendition.getContents?.() || []) {
      const doc = contents.document
      if (!doc.body || pageStartRange.startContainer.ownerDocument !== doc) continue

      const iframe = getContentsIframe(doc)
      const viewer = document.querySelector('.epub-viewer') as HTMLElement | null
      const viewerRect = viewer?.getBoundingClientRect()
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode()

      while (node) {
        const parent = node.parentElement
        const text = node.textContent || ''
        const relation = pageStartRange.startContainer.compareDocumentPosition(node)
        const startsAtPageBeginning =
          node === pageStartRange.startContainer ||
          (relation & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

        if (startsAtPageBeginning && parent && !parent.closest('script, style') && text.trim()) {
          const words = text.matchAll(/\S+/g)

          for (const word of words) {
            const start = word.index ?? 0
            const end = start + word[0].length

            if (node === pageStartRange.startContainer && end <= pageStartRange.startOffset) {
              continue
            }

            const range = doc.createRange()
            range.setStart(node, start)
            range.setEnd(node, end)

            const isVisible = Array.from(range.getClientRects()).some((rect) => {
              const outerRect = getOuterRect(rect, iframe)
              return (
                outerRect.width > 0 &&
                outerRect.height > 0 &&
                (!viewerRect ||
                  (outerRect.right > viewerRect.left &&
                    outerRect.left < viewerRect.right &&
                    outerRect.top + outerRect.height > viewerRect.top &&
                    outerRect.top < viewerRect.bottom))
              )
            })

            if (isVisible) {
              return {
                cfi: new EpubCFI(range, contents.cfiBase).toString(),
                text: word[0].slice(0, 40),
                version: 3
              }
            }
          }
        }

        node = walker.nextNode()
      }
    }

    return { cfi: pageStartCfi, text: '', version: 3 }
  }

  const saveEpubPageAnchor = () => {
    const anchor = getVisibleEpubPageAnchor()
    if (anchor && currentBookPath.value) {
      localStorage.setItem(getEpubPageAnchorKey(), JSON.stringify(anchor))
    }
    return anchor
  }

  const scheduleSaveEpubPageAnchor = () => {
    if (pageAnchorTimer) clearTimeout(pageAnchorTimer)
    pageAnchorTimer = setTimeout(() => {
      saveEpubPageAnchor()
    }, 100)
  }

  // ==========================================================
  // 下面的四个函数 100% 复制自原版，一字未改！
  // ==========================================================

  // 🌟 核心魔法：将 epub.js 默认生成的 SVG 矩形框，强行压扁成底部的 2px 虚线！
  const applyDashedUnderline = () => {
    setTimeout(() => {
      syncEpubHighlightPalette()

      const iframe = document.querySelector('.epub-viewer iframe') as HTMLIFrameElement
      if (!iframe || !iframe.contentDocument) return

      const svg = iframe.contentDocument.querySelector('svg')
      if (!svg) return

      // 寻找我们做了标记的批注组
      const annotateGroups = svg.querySelectorAll('g.epubjs-annotate')
      
      annotateGroups.forEach(g => {
        const rects = g.querySelectorAll('rect')
        rects.forEach(rect => {
          // 只处理还没有被我们压扁过的矩形
          if (rect.getAttribute('data-modified') !== 'true') {
            const y = parseFloat(rect.getAttribute('y') || '0')
            const height = parseFloat(rect.getAttribute('height') || '0')

            // 1. 物理压扁：把矩形推到文字最底部，高度收缩为 2px
            rect.setAttribute('y', (y + height - 2).toString())
            rect.setAttribute('height', '2')

            // 2. 注入红色虚线样式
            rect.setAttribute('fill', 'none')
            rect.setAttribute('stroke', '#ff3b30')
            rect.setAttribute('stroke-width', '2')
            rect.setAttribute('stroke-dasharray', '4, 3')

            // 3. 标记为已处理，防止重复运算
            rect.setAttribute('data-modified', 'true')
          }
        })
      })
    }, 50)
  }

  //渲染 EPUB 碎块高亮，EPUB 高亮/下划线渲染器,并挂载“点击唤出取消菜单”的雷达
  const renderEpubHighlight = (id: string, cfis: string[], type: 'highlight' | 'annotate' = 'highlight') => {
    if (!epubRendition.value) return
    const palette = getSelectionPalette()
    
    cfis.forEach(cfi => {
      try {
        const dummyCallback = () => {}

        if (type === 'annotate') {
           // 🌟 终极保险：利用引擎的 styles 参数，直接在底层的 SVG 标签上焊死红色！
           epubRendition.value!.annotations.highlight(
             cfi, 
             { id }, 
             dummyCallback, 
             "epubjs-annotate",
             { "fill": "rgba(255, 59, 48, 0.3)" } // 👈 强行注入颜色
           )
        } else {
           // 普通高亮直接写入动态色，避免 epub.js 的默认黄色覆盖主题样式。
           epubRendition.value!.annotations.highlight(
             cfi,
             { id },
             dummyCallback,
             'epubjs-hl',
             {
               'fill': palette.fill,
               'fill-opacity': '1'
             }
           )
        }
      } catch (e) {
        console.error("渲染高亮失败", e)
      }
    })

    if (type === 'highlight') setTimeout(syncEpubHighlightPalette, 0)
  }

  // 🌟 6. 专属于 EPUB 的排版穿透函数
  const applyEpubSettings = () => {
    if (!epubRendition.value) return
    const s = readerSettings.value
    const color = s.isNight ? '#8e8e93' : '#1d1d1f'
    const palette = getSelectionPalette()

    // 强行用 Themes API 覆盖内部文本样式 (背景保持透明，透出外部纸张)
    epubRendition.value.themes.default({
      'html, body': {
        'background': 'transparent !important',
        'background-color': 'transparent !important',
        'background-image': 'none !important'
      },
      'main, article, section, [role="main"], .calibre, .calibre1, .chapter, .page, .body, .main, .container, .content, .book, .text': {
        'background': 'transparent !important',
        'background-color': 'transparent !important',
        'background-image': 'none !important'
      },
      '[bgcolor], [background]': {
        'background': 'transparent !important',
        'background-color': 'transparent !important',
        'background-image': 'none !important'
      },
      'body': {
        'color': `${color} !important`,
        'font-size': `${s.fontSize}px !important`,
        'line-height': `${s.lineHeight} !important`,
        'font-family': `${s.fontFamily} !important`
      },
      'p, div, span': {
        'color': `${color} !important`,
        'font-size': `${s.fontSize}px !important`,
        'line-height': `${s.lineHeight} !important`,
        'font-family': `${s.fontFamily} !important`
      },
      '::selection': {
        'background': `${palette.selection} !important`,
        'color': 'inherit !important'
      },
      '.epubjs-hl:not(.epubjs-annotate), .epubjs-hl:not(.epubjs-annotate) rect': {
        'fill': `${palette.fill} !important`,
        'fill-opacity': '1 !important'
      }
    })

    syncEpubHighlightPalette()
    setTimeout(syncEpubHighlightPalette, 0)
  }

  // ======================================================
  // 🎭 二号引擎：EPUB 装载流水线
  // ======================================================
  const loadEpubBook = async (fullPath: string, preferredLocation?: string) => {
    currentEpubSourcePath = fullPath
    disposeEpubInstance()

    const res = await readerHost.readBuffer(fullPath)
    if (!res.success || !res.data) throw new Error('EPUB 二进制读取失败')

    epubBook.value = epub(res.data.buffer as ArrayBuffer)

    const isPageMode = readingMode.value === 'page'

    // 🌟 1. 核心分流：根据模式选择不同的 flow，并强制关闭双栏！
    epubRendition.value = epubBook.value.renderTo('epub-viewer', {
      width: '100%',
      height: '100%',
      flow: isPageMode ? 'paginated' : 'scrolled-doc',
      spread: 'none', // 👈 核心指令：彻底封杀 epub.js 的“仿实体书双页展开”功能，强制单页！
      allowScriptedContent: true
    })

    // 🌟 终极修复：使用 epub.js 官方的 Themes API 挂载样式
    const layoutCss = isPageMode
      ? `
        body {
          overflow: hidden !important;
          margin: 0 auto !important;
          padding: 40px 6vw !important;
          max-width: 1000px !important;
          box-sizing: border-box !important;
        }
      `
      : `
        body {
          overflow-x: hidden !important;
          padding: 0 6vw !important;
          max-width: 1000px !important;
          margin: 0 auto !important;
          box-sizing: border-box !important;
        }
      `

    const initialPalette = getSelectionPalette()
    const epubCss = `
      ${layoutCss}
      html,
      body { 
          color: inherit;
          background: transparent !important;
          background-color: transparent !important;
          background-image: none !important;
        }
        main,
        article,
        section,
        [role="main"],
        .calibre,
        .calibre1,
        .chapter,
        .page,
        .body,
        .main,
        .container,
        .content,
        .book,
        .text,
        [bgcolor],
        [background] {
          background: transparent !important;
          background-color: transparent !important;
          background-image: none !important;
        }
        ::selection {
          background: ${initialPalette.selection};
          color: inherit;
        }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: transparent; border-radius: 10px; }
        html:hover ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); }
        ::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.35) !important; }
        ::-webkit-scrollbar-button { display: none !important; }
        
        /* 🌟 核心修复 1：普通高亮，必须排除批注类名，防止黄色污染批注！ */
        .epubjs-hl:not(.epubjs-annotate),
        .epubjs-hl:not(.epubjs-annotate) rect { 
          fill: ${initialPalette.fill} !important; 
          fill-opacity: 1 !important; 
        }

        /* 🌟 核心修复 2：批注专属淡红色。精确到 rect 子元素，彻底穿透 epub.js 的 SVG 结构 */
        .epubjs-annotate,
        .epubjs-annotate rect {
          fill: rgba(255, 59, 48, 0.3) !important;
          fill-opacity: 0.5 !important;
        }

        /* 提取公共的混合模式和鼠标事件，避免代码冗余 */
        .epubjs-hl {
          pointer-events: auto !important;
          cursor: pointer !important;
        }
      `
    const blob = new Blob([epubCss], { type: 'text/css' })
    const cssUrl = URL.createObjectURL(blob)

    epubRendition.value.themes.register('custom-theme', cssUrl)
    epubRendition.value.themes.select('custom-theme')

    // 🌟 状态锁声明
    let isChangingChapter = false
    let isRestoringPageAnchor = false

    const getEpubScrollContainer = (): HTMLElement | null =>
      document.querySelector('.epub-container') as HTMLElement | null

    const turnEpubChapterByWheel = async (event: WheelEvent): Promise<void> => {
      hideToolbarOnScroll()
      selectionMenuState.value.visible = false
      if (!epubRendition.value || isChangingChapter) return

      if (readingMode.value === 'page') {
        if (event.deltaY > 0) {
          event.preventDefault()
          await epubRendition.value.next()
        } else if (event.deltaY < 0) {
          event.preventDefault()
          await epubRendition.value.prev()
        }
        return
      }

      const scrollContainer = getEpubScrollContainer()
      if (!scrollContainer) return

      const { scrollTop, scrollHeight, clientHeight } = scrollContainer
      const isAtBottom = Math.ceil(scrollTop + clientHeight) >= scrollHeight - 5
      const isAtTop = scrollTop <= 5

      if (event.deltaY > 0 && isAtBottom) {
        event.preventDefault()
        isChangingChapter = true
        const oldCfi = epubRendition.value.location?.start?.cfi
        await epubRendition.value.next()
        if (oldCfi !== epubRendition.value.location?.start?.cfi) {
          requestAnimationFrame(() => {
            const newContainer = getEpubScrollContainer()
            if (newContainer) newContainer.scrollTop = 0
          })
        }
        isChangingChapter = false
      } else if (event.deltaY < 0 && isAtTop) {
        event.preventDefault()
        isChangingChapter = true
        const oldCfi = epubRendition.value.location?.start?.cfi
        await epubRendition.value.prev()
        if (oldCfi !== epubRendition.value.location?.start?.cfi) {
          requestAnimationFrame(() => {
            const newContainer = getEpubScrollContainer()
            if (newContainer) newContainer.scrollTop = newContainer.scrollHeight - newContainer.clientHeight
          })
        }
        isChangingChapter = false
      }
    }

    const bindEpubScrollContainer = () => {
      const scrollContainer = getEpubScrollContainer()
      if (!scrollContainer || scrollContainer.dataset.readerScrollBound === 'true') return

      scrollContainer.dataset.readerScrollBound = 'true'
      scrollContainer.addEventListener('scroll', () => {
        if (readingMode.value !== 'scroll') return
        scheduleSaveEpubPageAnchor()
        autoSaveProgress()
      })
      scrollContainer.addEventListener('wheel', turnEpubChapterByWheel, { passive: false })
    }

    const scheduleBindEpubScrollContainer = () => {
      bindEpubScrollContainer()
      requestAnimationFrame(() => {
        bindEpubScrollContainer()
        requestAnimationFrame(bindEpubScrollContainer)
      })
      window.setTimeout(bindEpubScrollContainer, 120)
      window.setTimeout(bindEpubScrollContainer, 360)
    }

    epubRendition.value.on('rendered', scheduleBindEpubScrollContainer)

    // 🌟 滚轮劫持钩子 (保留底部垫片和滚轮逻辑)
    epubRendition.value.hooks.content.register((contents: EpubContents) => {
      const doc = contents.document
      stripEpubBackgrounds(doc)
      requestAnimationFrame(() => stripEpubBackgrounds(doc))

      doc.addEventListener('keydown', (event) => {
        if (callbacks.onKeyDown(event)) event.preventDefault()
      })

      // 实现底部预留空间
      if (readingMode.value === 'scroll') {
        const viewerContainer = document.querySelector('.epub-viewer') as HTMLElement
        const realVisibleHeight = viewerContainer ? viewerContainer.clientHeight : 800
        if (doc.body && !doc.getElementById('bottom-spacer')) {
          const spacer = doc.createElement('div')
          spacer.id = 'bottom-spacer'
          spacer.style.height = `${Math.floor(realVisibleHeight / 3)}px`
          doc.body.appendChild(spacer)
        }
      }

      // EPUB 内部专属智能防误触机制
      let epubStartX = 0
      let epubStartY = 0
      let epubHadSelectionBefore = false
      let epubWasPanelOpenOnMouseDown = false
      let epubWasToolbarVisibleOnMouseDown = false
      let epubWasLinkClickOnMouseDown = false

      doc.addEventListener('mousedown', (e: MouseEvent) => {
        epubWasToolbarVisibleOnMouseDown = isToolbarVisible.value
        epubWasPanelOpenOnMouseDown =
          isAnnotationPanelOpen.value ||
          isHighlightMenuOpen.value ||
          isBookmarkMenuOpen.value ||
          isTopMenuOpen.value ||
          isFontMenuOpen.value
        epubWasLinkClickOnMouseDown =
          e.target instanceof Element && !!e.target.closest('a[href]')

        if (isHighlightMenuOpen.value || isBookmarkMenuOpen.value) {
          closeAllSecondaryMenus()
        } else {
          if (isTopMenuOpen.value) isTopMenuOpen.value = false
          if (isFontMenuOpen.value) isFontMenuOpen.value = false
        }

        selectionMenuState.value.visible = false 
        epubStartX = e.clientX
        epubStartY = e.clientY
        const sel = contents.window.getSelection()
        epubHadSelectionBefore = !!(sel && sel.toString().trim().length > 0)
      })

      doc.addEventListener('dblclick', (e: MouseEvent) => {
        if (expandSelectionToParagraph(contents.window.getSelection(), contents.document, e.target)) {
          doc.dispatchEvent(
            new MouseEvent('mouseup', {
              bubbles: true,
              clientX: e.clientX,
              clientY: e.clientY
            })
          )
        }
      })

      doc.addEventListener('mouseup', (e: MouseEvent) => {
        setTimeout(() => {
          const selection = contents.window.getSelection()
          const text = selection ? selection.toString().trim() : ''
          
          if (text.length > 0 && selection && selection.rangeCount > 0) {
            // 1. 获取原始选区，命名为 rawRange 避免冲突
            const rawRange = selection.getRangeAt(0)
            
            // 2. 🌟 核心提纯算法 (完全修复 TS 强类型报错)
            const normalizeRange = (r: Range, doc: Document): Range => {
              const newRange = doc.createRange()
              newRange.setStart(r.startContainer, r.startOffset)
              newRange.setEnd(r.endContainer, r.endOffset)

              try {
                if (newRange.startContainer.nodeType === 1) {
                  let startNode: Node | null = newRange.startContainer.childNodes[newRange.startOffset] || newRange.startContainer.firstChild
                  while (startNode && startNode.nodeType === 1) {
                    startNode = startNode.firstChild
                  }
                  if (startNode) newRange.setStart(startNode, 0)
                }

                if (newRange.endContainer.nodeType === 1) {
                  const idx = newRange.endOffset > 0 ? newRange.endOffset - 1 : 0
                  let endNode: Node | null = newRange.endContainer.childNodes[idx] || newRange.endContainer.lastChild
                  while (endNode && endNode.nodeType === 1) {
                    endNode = endNode.lastChild
                  }
                  if (endNode && endNode.nodeType === 3) {
                    newRange.setEnd(endNode, endNode.nodeValue?.length || 0)
                  }
                }
              } catch (e) {
                return r
              }
              return newRange
            }

            // 3. 将提纯后的选区命名为唯一的 range，供后续所有逻辑（CFI、嗅探、菜单定位）使用！
            const range = normalizeRange(rawRange, contents.document)

            let currentCfi = ''
            try {
              currentCfi = new EpubCFI(range, contents.cfiBase).toString()
              currentSelectionCfi.value = currentCfi
              currentSelectionCfis.value = [currentCfi]
            } catch (err) {
              currentSelectionCfi.value = ''
              currentSelectionCfis.value = []
            }
            
            let isOverlapping = false
            let targetCfis: string[] = []
            let overlapType = 'none'

            if (currentCfi && epubRendition.value) {
              const currentCfiBase = currentCfi.split('!')[0] 

              epubHighlights.value.forEach(hl => {
                // 加个安全判断，并提取数组第一个碎片的前缀
                if (!hl.cfis || hl.cfis.length === 0) return
                const hlCfiBase = hl.cfis[0].split('!')[0]
                
                if (hlCfiBase !== currentCfiBase) return 

                try {
                  // 将历史高亮的头尾碎片转化为 Range 进行数学对比
                  const hlStartRange = epubRendition.value!.getRange(hl.cfis[0])
                  const hlEndRange = epubRendition.value!.getRange(hl.cfis[hl.cfis.length - 1])
                  
                  // 由于 currentCfi 是当前整个选区的坐标，可以直接拿来比
                  if (hlStartRange && hlEndRange) {
                    const startBeforeEnd = range.compareBoundaryPoints(Range.END_TO_START, hlEndRange) === -1
                    const endAfterStart = range.compareBoundaryPoints(Range.START_TO_END, hlStartRange) === 1

                    if (startBeforeEnd && endAfterStart) {
                      isOverlapping = true
                      targetCfis.push(hl.id) // 把重叠的高亮 ID 塞进去
                      if (hl.type === 'annotate') overlapType = 'annotate'
                      else if (overlapType !== 'annotate') overlapType = 'highlight'
                    }
                  }
                } catch (e) {}
              })
            }

            // 这里的 range 已经是提纯过的干净选区了，菜单定位也会非常精准
            const rects = range.getClientRects()
            const firstRect = rects.length > 0 ? rects[0] : range.getBoundingClientRect()
            const iframe = getContentsIframe(contents.document)
            const outerFirstRect = getOuterRect(firstRect, iframe)
            
            let popupX = outerFirstRect.left + outerFirstRect.width / 2
            let popupY = outerFirstRect.top - 58

            selectionMenuState.value = {
              visible: true,
              x: popupX,
              y: Math.max(popupY, 60), 
              anchorTop: outerFirstRect.top,
              anchorBottom: outerFirstRect.top + outerFirstRect.height,
              text: text,
              isOverlappingMark: isOverlapping, 
              targetCfis: targetCfis,
              overlapType: overlapType
            }
          } else {
            // 🌟 终极截胡：基于物理光标的坐标碰撞测试 (彻底解决空心框点不中的问题)
            const clickSel = contents.window.getSelection()
            let isHit = false

            if (clickSel && clickSel.rangeCount > 0) {
              const clickRange = clickSel.getRangeAt(0)

              try {
                // 获取当前点击位置的章节 ID (CFI 前缀)
                const clickCfi = new EpubCFI(clickRange, contents.cfiBase).toString()
                const currentCfiBase = clickCfi.split('!')[0]

                for (const hl of epubHighlights.value) {
                  if (!hl.cfis || hl.cfis.length === 0) continue
                  // 确保我们只在同一个章节文件内对比，防止跨章报错
                  if (hl.cfis[0].split('!')[0] !== currentCfiBase) continue

                  try {
                    const hlStartRange = epubRendition.value!.getRange(hl.cfis[0])
                    const hlEndRange = epubRendition.value!.getRange(hl.cfis[hl.cfis.length - 1])

                    if (hlStartRange && hlEndRange) {
                      // 🌟 核心魔法：判断点击的光标是否落在高亮选区的开头之后、结尾之前
                      const afterStart = clickRange.compareBoundaryPoints(Range.START_TO_START, hlStartRange) >= 0 ||
                                         clickRange.compareBoundaryPoints(Range.END_TO_START, hlStartRange) >= 0
                      const beforeEnd = clickRange.compareBoundaryPoints(Range.END_TO_END, hlEndRange) <= 0 ||
                                        clickRange.compareBoundaryPoints(Range.START_TO_END, hlEndRange) <= 0

                      if (afterStart && beforeEnd) {
                        isHit = true
                        if (hl.type === 'annotate') {
                          // 🎯 精准命中批注！强行呼出右侧抽屉
                          openAnnotationPanel(hl.id)
                        } else {
                          // 命中普通高亮，呼出悬浮菜单
                          const iframe = document.querySelector('.epub-viewer iframe') as HTMLIFrameElement
                          const iframeRect = iframe ? iframe.getBoundingClientRect() : { top: 0, left: 0 }
                          const rect = hlStartRange.getBoundingClientRect() // 借用高亮第一行的位置弹窗
                          selectionMenuState.value = {
                            visible: true,
                            x: rect.left + rect.width / 2 + iframeRect.left,
                            y: Math.max(rect.top + iframeRect.top - 58, 60),
                            anchorTop: rect.top + iframeRect.top,
                            anchorBottom: rect.bottom + iframeRect.top,
                            text: '',
                            isOverlappingMark: true,
                            overlapType: 'highlight',
                            targetCfis: [hl.id]
                          }
                        }
                        return // 🎯 拦截成功！直接退出
                      }
                    }
                  } catch (e) {}
                }
              } catch (e) {}
            }

            // 如果光标没命中，再兜底保留原来的 SVG 查找逻辑（以防万一）
            if (!isHit) {
              const targetEl = e.target as Element
              let currNode: Element | null = targetEl
              let dataStr: string | null = null

              while (currNode && currNode !== contents.document.body) {
                if (currNode.hasAttribute && currNode.hasAttribute('data-data')) {
                  dataStr = currNode.getAttribute('data-data')
                  break
                }
                currNode = (currNode.parentElement || currNode.parentNode) as Element | null
              }

              if (dataStr) {
                try {
                  const data = JSON.parse(dataStr)
                  if (data && data.id) {
                    const hl = epubHighlights.value.find(h => h.id === data.id)
                    if (hl && hl.type === 'annotate') openAnnotationPanel(data.id)
                    else {
                      const iframe = document.querySelector('.epub-viewer iframe') as HTMLIFrameElement
                      const iframeRect = iframe ? iframe.getBoundingClientRect() : { top: 0, left: 0 }
                      const targetRect = targetEl.getBoundingClientRect()
                      selectionMenuState.value = {
                        visible: true, 
                        x: targetRect.left + targetRect.width / 2 + iframeRect.left,
                        y: Math.max(targetRect.top + iframeRect.top - 58, 60),
                        anchorTop: targetRect.top + iframeRect.top,
                        anchorBottom: targetRect.bottom + iframeRect.top,
                        text: '', 
                        isOverlappingMark: true, 
                        overlapType: 'highlight', // 👈 补上这个属性！告诉菜单现在覆盖的是普通高亮
                        targetCfis: [data.id]
                      }
                    }
                  }
                } catch (err) {}
                return
              }

              if (dataStr) { /* ... */ return }
              // 如果点的既不是选中文字，也不是批注，正常收起
              selectionMenuState.value.visible = false

              isAnnotationPanelOpen.value = false
              isAnnotationInputOpen.value = false
              isHighlightMenuOpen.value = false

              const diffX = Math.abs(e.clientX - epubStartX)
              const diffY = Math.abs(e.clientY - epubStartY)
              
              if (
                diffX <= 5 &&
                diffY <= 5 &&
                !epubHadSelectionBefore &&
                !epubWasLinkClickOnMouseDown
              ) {
                if (epubWasToolbarVisibleOnMouseDown) {
                  toggleToolbar()
                  return
                }
                if (!epubWasPanelOpenOnMouseDown) {
                if (readingMode.value === 'page') {
                  const iframe = document.querySelector('.epub-viewer iframe') as HTMLIFrameElement
                  const iframeRect = iframe ? iframe.getBoundingClientRect() : { left: 0 }
                  
                  // 1. 获取准确的屏幕绝对坐标
                  const realX = e.clientX + iframeRect.left 
                  
                  // 2. 🌟 破案关键：获取阅读器的真实宽度，但最大不能超过你设置的 1000px！
                  const viewer = document.querySelector('.epub-viewer') as HTMLElement
                  const viewerWidth = viewer ? viewer.clientWidth : window.innerWidth
                  const viewerLeft = viewer ? viewer.getBoundingClientRect().left : 0
                  
                  // 动态锁定有效阅读区域的宽度（最大 1000）和起始左坐标（居中偏移）
                  const readingAreaWidth = Math.min(viewerWidth, 1000)
                  const readingAreaLeft = viewerLeft + (viewerWidth - readingAreaWidth) / 2
                  
                  // 3. 计算点击位置在“有效文字区域”内的真实比例
                  const ratio = (realX - readingAreaLeft) / readingAreaWidth 
                  
                  if (ratio < 0.3) {
                    if (!isChangingChapter) {
                      isChangingChapter = true
                      epubRendition.value?.prev()
                      setTimeout(() => { isChangingChapter = false }, 300)
                    }
                  } else if (ratio > 0.7) {
                    if (!isChangingChapter) {
                      isChangingChapter = true
                      epubRendition.value?.next()
                      setTimeout(() => { isChangingChapter = false }, 300)
                    }
                  } else {
                    toggleToolbar() 
                  }
                } else {
                    toggleToolbar()
                  }
                }
              }
            }
          }
        }, 50)
      })

      doc.addEventListener('wheel', turnEpubChapterByWheel, { passive: false })
    })
  
    // 🌟 记忆雷达挂载
    epubRendition.value.on('relocated', (location: { start: { cfi: string } }) => {
      epubCfi.value = location.start.cfi
      if (!isRestoringPageAnchor) scheduleSaveEpubPageAnchor()
      autoSaveProgress()
      updateReadingStatus()
      applyDashedUnderline()
    })

    // 在 display 开始作画之前，把高亮数据“塞”进引擎，确保只画一次。只认准源文件的 path
    const savedHls = localStorage.getItem(`epub_hl_${currentBookPath.value}`)
    
    if (savedHls) {
      try {
        const parsed = JSON.parse(savedHls)
        
        // 🌟 数据清洗与向下兼容：
        // 如果本地存的是旧版只有 cfi 的数据，自动把它包装成新版的 id 和 cfis 数组，防止报错！
        // 👇 🌟 核心修复：补全解析字段，防止批注降级为普通高亮
        epubHighlights.value = parsed.map((hl: any) => ({
          id: hl.id || `hl-${Math.random().toString(36).substring(2)}`,
          cfis: hl.cfis || (hl.cfi ? [hl.cfi] : []), 
          text: hl.text,
          timestamp: hl.timestamp || Date.now(),
          type: hl.type || 'highlight', // 🌟 补回这行！否则重启后不知道它是批注
          note: hl.note || '',          // 🌟 补回这行！否则批注内容会被清空
          chapterTitle: hl.chapterTitle,
          chapterOrder: hl.chapterOrder
        }))

        epubHighlights.value.forEach(hl => {
          try {
            renderEpubHighlight(hl.id, hl.cfis, hl.type || 'highlight') 
          } catch (e) {
            console.warn('忽略一条渲染失败的历史高亮', e)
          }
        })
      } catch(e) {
        epubHighlights.value = []
      }
    } else {
      epubHighlights.value = []
    }

    // 🌟 执行渲染 (引擎此时会带着上面刚刚注册好的高亮数据，一次性完美渲染出来)
    const savedLocation = await readerHost.getProgress(currentBookPath.value)
    const savedPageAnchor = !preferredLocation ? readSavedEpubPageAnchor() : null
    const startLocation =
      preferredLocation ||
      savedPageAnchor?.cfi ||
      (typeof savedLocation === 'string' && savedLocation.startsWith('epubcfi')
        ? savedLocation
        : undefined)
    const preciseLocation = preferredLocation || savedPageAnchor?.cfi

    // 先应用会影响分页的排版设置，再恢复 CFI，避免重排后退回相邻页。
    isRestoringPageAnchor = !!preciseLocation
    applyEpubSettings()
    await epubRendition.value.display(startLocation)
    scheduleBindEpubScrollContainer()

    // 内容挂载后再同步一次主题。模式切换时排版会重建，必须在重排完成后
    // 再按精确 CFI 校准一次，否则长章节会停在相邻几页。
    applyEpubSettings()
    if (preciseLocation) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
      await epubRendition.value.display(preciseLocation)
      scheduleBindEpubScrollContainer()
    }
    isRestoringPageAnchor = false
    scheduleSaveEpubPageAnchor()

    // ----------- 提取目录逻辑 -----------
    const navigation = await epubBook.value.loaded.navigation
    let tocOrderCounter = 0
    const flattenNavigation = (
      items: typeof navigation.toc,
      depth = 0,
      parentIds: string[] = []
    ): typeof tocList.value =>
      items.flatMap((item, index) => {
        const id = item.id || `epub-toc-${parentIds.join('-') || 'root'}-${index}`
        const subitems = item.subitems || []

        return [
          {
            title: item.label.trim(),
            href: item.href,
            id,
            depth,
            parentIds,
            hasChildren: subitems.length > 0,
            tocOrder: tocOrderCounter++
          },
          ...flattenNavigation(subitems, depth + 1, [...parentIds, id])
        ]
      })

    tocList.value = flattenNavigation(navigation.toc)
    applySavedTocAdjustments()
    if (enrichEpubHighlightChapters()) {
      localStorage.setItem(`epub_hl_${currentBookPath.value}`, JSON.stringify(epubHighlights.value))
    }

    epubBook.value.ready.then(() => {
      // ⚠️ 删除了这里重复读取 localStorage 并导致颜色套娃覆盖的代码

      // 等待全书页码计算完毕后，强行索取当前进度并刷新 UI
      epubBook.value?.locations.generate(1600).then(() => {
        const loc = epubRendition.value?.currentLocation() as any 
        
        if (loc && loc.start) {
          epubCfi.value = loc.start.cfi
        } else if (startLocation) {
          epubCfi.value = startLocation
        }
        
        updateReadingStatus()
      })
    })
  }

  // 🌟 5. 新增：监听模式切换，一旦变化，瞬间毁掉当前引擎并带着当前进度重生！
  watch(readingMode, async () => {
    if (currentBookType.value === 'epub' && currentBookPath.value && !isReloadingForMode) {
      isReloadingForMode = true
      const currentLoc =
        saveEpubPageAnchor()?.cfi || epubRendition.value?.location?.start?.cfi || epubCfi.value

      try {
        await loadEpubBook(currentEpubSourcePath || currentBookPath.value, currentLoc)
      } finally {
        isReloadingForMode = false
      }
    }
  })

  // 抛出给外部使用的核心方法
  return {
    applyDashedUnderline,
    renderEpubHighlight,
    syncEpubHighlightPalette,
    applyEpubSettings,
    loadEpubBook,
    saveEpubPageAnchor
  }
}
