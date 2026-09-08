declare module 'foliate-js/view.js' {
  export interface FoliateTocItem {
    label?: string
    href?: string
    subitems?: FoliateTocItem[]
  }

  export interface FoliateBook {
    metadata?: {
      title?: string | Record<string, string>
      author?: unknown
      language?: string
    }
    toc?: FoliateTocItem[]
    sections: unknown[]
    getCover?: () => Promise<Blob | null>
  }

  export interface FoliateLocation {
    cfi?: string
    fraction?: number
    index?: number
    tocItem?: { label?: string }
    total?: number
  }

  export interface FoliateViewElement extends HTMLElement {
    book?: FoliateBook
    lastLocation?: FoliateLocation
    renderer?: HTMLElement & {
      setStyles?: (styles: string | string[]) => void
      start?: number
      end?: number
      viewSize?: number
    }
    open: (book: File | Blob | FoliateBook) => Promise<void>
    init: (options: { lastLocation?: string; showTextStart?: boolean }) => Promise<void>
    goTo: (target: string | number | object) => Promise<void>
    goToFraction: (fraction: number) => Promise<void>
    prev: (distance?: number) => Promise<void>
    next: (distance?: number) => Promise<void>
    getCFI: (index: number, range: Range) => string
    addAnnotation: (
      annotation: { value: string; color?: string; note?: string; id?: string; type?: string },
      remove?: boolean
    ) => Promise<{ index: number; label: string } | undefined>
    deleteAnnotation: (annotation: { value: string }) => Promise<unknown>
    showAnnotation: (annotation: { value: string }) => Promise<void>
    deselect: () => void
    close: () => void
  }

  export function makeBook(file: File | Blob | string): Promise<FoliateBook>
}

declare module 'foliate-js/overlayer.js' {
  export class Overlayer {
    static highlight: (
      rects: DOMRect[],
      options?: { color?: string; opacity?: number }
    ) => SVGElement
    static underline: (
      rects: DOMRect[],
      options?: { color?: string; width?: number; padding?: number }
    ) => SVGElement
  }
}
