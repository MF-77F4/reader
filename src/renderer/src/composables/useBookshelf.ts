// src/renderer/src/composables/useBookshelf.ts
import { ref, computed, watch } from 'vue'
import { useModal } from './useModal'
import { cleanBookTitle } from '../utils/formatter'
import { readerHost } from '../platform/readerHost'

// 1. 抽离接口：把书籍的数据结构独立出来
export interface BookInfo {
  fileName: string
  fullPath: string
  sourcePath?: string
  cover: string | null
  format?: string
  isPinned?: boolean
  lastReadAt?: number
  size?: number
  progress?: number
  customTitle?: string
  categoryId?: string
}

export interface BookCategory {
  id: string
  name: string
  createdAt: number
}

// 2. 🌟 全局单例状态：保证无论在哪个组件里操作，书架都是同一份数据！
const bookList = ref<BookInfo[]>([])
const bookCategories = ref<BookCategory[]>([])
const isImportingBook = ref(false)
const activeMenuPath = ref<string | null>(null)

const inferBookFormat = (book: BookInfo) => {
  const extension = book.fullPath.split('.').pop()?.toLowerCase()
  return extension || book.format || 'txt'
}

export const removeBookLocalStorageData = (...filePaths: Array<string | undefined>) => {
  const prefixes = [
    'txt_hl_',
    'epub_hl_',
    'mobi_hl_',
    'epub_page_anchor_',
    'bookmarks_',
    'manual_toc_',
    'reader_book_settings_'
  ]

  filePaths.filter(Boolean).forEach((filePath) => {
    prefixes.forEach((prefix) => localStorage.removeItem(`${prefix}${filePath}`))
  })
}

const migrateBookLocalStorageData = (from: string, to: string) => {
  const prefixes = [
    'txt_hl_',
    'epub_hl_',
    'mobi_hl_',
    'epub_page_anchor_',
    'bookmarks_',
    'manual_toc_',
    'reader_book_settings_'
  ]

  prefixes.forEach((prefix) => {
    const oldKey = `${prefix}${from}`
    const newKey = `${prefix}${to}`
    const oldData = localStorage.getItem(oldKey)

    if (oldData !== null && localStorage.getItem(newKey) === null) {
      localStorage.setItem(newKey, oldData)
    }
    localStorage.removeItem(oldKey)
  })
}

export function useBookshelf() {
  const { showModal, showPrompt } = useModal()

  // 挂载时加载本地缓存
  const loadBookshelf = async () => {
    const savedCategories = localStorage.getItem('my_book_categories')
    if (savedCategories) {
      try {
        bookCategories.value = JSON.parse(savedCategories) as BookCategory[]
      } catch (error) {
        console.error('读取书籍分类缓存失败:', error)
      }
    }

    const savedBooks = localStorage.getItem('my_bookshelf')
    if (savedBooks) {
      try {
        bookList.value = (JSON.parse(savedBooks) as BookInfo[]).map((book) => ({
          ...book,
          format: inferBookFormat(book)
        }))

        for (const book of bookList.value) {
          if (book.sourcePath || (book.format !== 'txt' && book.format !== 'md')) continue

          const sourcePath = book.fullPath
          const copyResult = await readerHost.importTextCopy(sourcePath)
          if (!copyResult.success || !copyResult.path) continue

          const didMigrateProgress = await readerHost.migrateProgress({
            from: sourcePath,
            to: copyResult.path
          })
          if (!didMigrateProgress) continue

          migrateBookLocalStorageData(sourcePath, copyResult.path)
          book.sourcePath = sourcePath
          book.fullPath = copyResult.path
        }
      } catch (error) {
        console.error('读取书架缓存失败:', error)
      }
    }
  }

  // 监听书架变动并自动保存（替代 App.vue 里的 watch）
  watch(
    bookList,
    (newList) => {
      localStorage.setItem('my_bookshelf', JSON.stringify(newList))
    },
    { deep: true }
  )

  watch(
    bookCategories,
    (newCategories) => {
      localStorage.setItem('my_book_categories', JSON.stringify(newCategories))
    },
    { deep: true }
  )

  // 书架自动排序计算属性
  const sortedBookList = computed(() => {
    return [...bookList.value].sort((a, b) => {
      if (a.isPinned !== b.isPinned) {
        return a.isPinned ? -1 : 1
      }
      const timeA = a.lastReadAt || 0
      const timeB = b.lastReadAt || 0
      return timeB - timeA
    })
  })

  // === 以下是书籍交互方法 ===

  const togglePin = (book: BookInfo) => {
    book.isPinned = !book.isPinned
    activeMenuPath.value = null
  }

  const toggleMenu = (path: string) => {
    activeMenuPath.value = activeMenuPath.value === path ? null : path
  }

  const renameBook = async (book: BookInfo) => {
    activeMenuPath.value = null
    const newName = await showPrompt({
      title: '重命名书籍',
      defaultValue: book.customTitle || cleanBookTitle(book.fileName),
      placeholder: '请输入新的书名'
    })
    if (newName && newName.trim()) {
      book.customTitle = newName.trim()
    }
  }

  const compressCover = (dataUrl: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => {
        const scale = Math.min(1, 720 / image.naturalWidth, 1080 / image.naturalHeight)
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))

        const context = canvas.getContext('2d')
        if (!context) {
          reject(new Error('无法处理封面图片'))
          return
        }

        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.86))
      }
      image.onerror = () => reject(new Error('无法读取封面图片'))
      image.src = dataUrl
    })

  const setBookCover = async (book: BookInfo): Promise<void> => {
    activeMenuPath.value = null
    const result = await readerHost.selectCoverImage()
    if (result.canceled) return

    if (!result.success || !result.dataUrl) {
      await showModal({
        title: '设置封面失败',
        message: result.error || '无法读取这张图片，请换一张重试。',
        type: 'alert'
      })
      return
    }

    try {
      book.cover = await compressCover(result.dataUrl)
    } catch (error) {
      console.error('封面图片处理失败:', error)
      await showModal({
        title: '设置封面失败',
        message: '无法处理这张图片，请换一张重试。',
        type: 'alert'
      })
    }
  }

  const createCategory = async () => {
    const defaultName = `默认分类${bookCategories.value.length + 1}`
    const categoryName = await showPrompt({
      title: '新建分类',
      placeholder: defaultName
    })
    if (categoryName === null) return null
    const name = categoryName.trim() || defaultName

    if (bookCategories.value.some((category) => category.name === name)) {
      await showModal({
        title: '分类已存在',
        message: `“${name}”已经在分类列表中。`,
        type: 'alert'
      })
      return null
    }

    const category: BookCategory = {
      id: `category-${Date.now()}`,
      name,
      createdAt: Date.now()
    }
    bookCategories.value.push(category)
    return category
  }

  const renameCategory = async (category: BookCategory) => {
    const categoryName = await showPrompt({
      title: '重命名分类',
      defaultValue: category.name,
      placeholder: '请输入分类名称'
    })
    const name = categoryName?.trim()
    if (!name || name === category.name) return

    if (bookCategories.value.some((item) => item.id !== category.id && item.name === name)) {
      await showModal({
        title: '分类已存在',
        message: `“${name}”已经在分类列表中。`,
        type: 'alert'
      })
      return
    }

    category.name = name
  }

  const assignBookCategory = (book: BookInfo, categoryId?: string) => {
    book.categoryId = categoryId
    activeMenuPath.value = null
  }

  const deleteCategory = async (category: BookCategory) => {
    const confirmed = await showModal({
      title: '删除分类',
      message: `确认删除“${category.name}”吗？分类中的书籍会恢复为未分类。`,
      confirmText: '删除',
      cancelText: '取消',
      isDestructive: true
    })
    if (!confirmed) return false

    bookList.value.forEach((book) => {
      if (book.categoryId === category.id) book.categoryId = undefined
    })
    bookCategories.value = bookCategories.value.filter((item) => item.id !== category.id)
    return true
  }

  const deleteBook = async (book: BookInfo) => {
    const confirmed = await showModal({
      title: '',
      message: `确认将本书移出书架吗？`,
      confirmText: '确认',
      cancelText: '取消',
      isDestructive: true
    })

    if (!confirmed) {
      activeMenuPath.value = null
      return
    }

    try {
      const didDelete = await readerHost.deleteBookCache({
        filePath: book.fullPath,
        sourcePath: book.sourcePath
      })
      if (!didDelete) throw new Error('应用数据清理失败')

      removeBookLocalStorageData(book.fullPath, book.sourcePath)

      bookList.value = bookList.value.filter((b) => b.fullPath !== book.fullPath)
      activeMenuPath.value = null
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
    bookList,
    bookCategories,
    isImportingBook,
    activeMenuPath,
    loadBookshelf,
    sortedBookList,
    togglePin,
    toggleMenu,
    renameBook,
    setBookCover,
    createCategory,
    renameCategory,
    deleteCategory,
    assignBookCategory,
    deleteBook
  }
}
