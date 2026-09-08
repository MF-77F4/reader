<template>
  <div class="shelf-view">
    <div class="shelf-workspace">
      <aside class="shelf-sidebar">
        <div class="sidebar-brand">
          <div class="brand-mark">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M6 4.75A2.75 2.75 0 0 1 8.75 2h8.5A2.75 2.75 0 0 1 20 4.75v14.5A2.75 2.75 0 0 1 17.25 22h-8.5A2.75 2.75 0 0 1 6 19.25z"
              />
              <path d="M9.5 6.5h7M9.5 10h7M9.5 13.5H14" />
            </svg>
          </div>
          <div>
            <div class="brand-title">阅读器</div>
            <div class="brand-subtitle">我的阅读空间</div>
          </div>
        </div>

        <button class="import-btn" :disabled="isImportingBook" @click="$emit('scan-books')">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {{ isImportingBook ? '正在添加...' : '添加书籍' }}
        </button>

        <nav class="sidebar-nav" aria-label="书架导航">
          <div class="nav-section-label">书架</div>
          <button
            v-for="item in shelfViews"
            :key="item.id"
            class="nav-item"
            :class="{ active: activeShelfView === item.id }"
            @click="activeShelfView = item.id"
          >
            <svg v-if="item.id === 'all'" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 5.5h14M5 12h14M5 18.5h14" />
            </svg>
            <svg v-else-if="item.id === 'recent'" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="8" />
              <path d="M12 7.5V12l3 2" />
            </svg>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="m12 3 2.7 5.47 6.04.88-4.37 4.26 1.03 6.02L12 16.78l-5.4 2.85 1.03-6.02-4.37-4.26 6.04-.88z"
              />
            </svg>
            <span>{{ item.label }}</span>
            <span class="nav-count">{{ item.count }}</span>
          </button>
        </nav>

        <div class="sidebar-categories">
          <div class="nav-section-label category-heading">
            <span>分类</span>
            <button v-tooltip="'新建分类'" class="category-add-btn" @click="addCategory">+</button>
          </div>
          <div v-if="bookCategories.length === 0" class="category-placeholder">
            <span>点击右上角 + 新建分类</span>
          </div>
          <div v-for="category in bookCategories" :key="category.id" class="category-row">
            <button
              class="category-nav-item"
              :class="{ active: activeShelfView === getCategoryViewId(category.id) }"
              @click="activeShelfView = getCategoryViewId(category.id)"
            >
              <span class="category-dot"></span>
              <span class="category-name">{{ category.name }}</span>
              <span class="nav-count">{{ getCategoryBookCount(category.id) }}</span>
            </button>
            <button
              v-tooltip="`重命名“${category.name}”`"
              class="category-rename-btn"
              @click="renameCategory(category)"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m14.5 5.5 4 4M5 19l3.5-.75L19 7.75a1.77 1.77 0 0 0-2.5-2.5L6.25 15.5z" />
              </svg>
            </button>
            <button
              v-tooltip="`删除“${category.name}”`"
              class="category-delete-btn"
              @click="removeCategory(category)"
            >
              ×
            </button>
          </div>
        </div>

        <div class="sidebar-footer">
          <div class="storage-label">本地书架</div>
          <div class="storage-description">{{ bookList.length }} 本书籍已保存在当前设备</div>
        </div>
      </aside>

      <main class="shelf-main">
        <header class="shelf-header">
          <div>
            <p class="header-eyebrow">LIBRARY</p>
            <h1 class="shelf-title">{{ activeViewTitle }}</h1>
            <p class="shelf-subtitle">{{ activeViewSubtitle }}</p>
          </div>

          <div class="header-tools">
            <button
              v-if="getActiveCategoryId()"
              class="category-books-btn"
              @click="openCategoryPicker"
            >
              从全部书籍添加
            </button>
            <label class="search-box">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="5.5" />
                <path d="m15.5 15.5 4 4" />
              </svg>
              <input v-model.trim="searchQuery" type="search" placeholder="搜索书籍" />
            </label>
          </div>
        </header>

        <section v-if="filteredBooks.length > 0" class="book-grid" aria-label="书籍列表">
          <article
            v-for="book in filteredBooks"
            :key="book.fullPath"
            class="book-card"
            @click="$emit('open-book', book)"
          >
            <div class="cover-container">
              <img class="book-cover" :src="book.cover || getDynamicCover(book.format)" alt="" />
              <div v-if="book.isPinned" v-tooltip="'已置顶'" class="pin-badge">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </div>
              <div class="cover-shade"></div>
              <div class="reading-progress">
                <span :style="{ width: `${Math.min(book.progress || 0, 100)}%` }"></span>
              </div>
            </div>

            <div class="book-info">
              <div v-tooltip="book.customTitle || cleanBookTitle(book.fileName)" class="book-title">
                {{ book.customTitle || cleanBookTitle(book.fileName) }}
              </div>
              <div class="book-meta">
                <span>{{ book.format?.toUpperCase() }}</span>
                <span class="meta-dot"></span>
                <span>已读 {{ (book.progress || 0).toFixed(1) }}%</span>
              </div>
            </div>

            <div
              class="book-actions"
              @click.stop
              @mouseleave="closeBookActionMenu(book.fullPath, $event)"
            >
              <button
                v-tooltip="'更多操作'"
                class="more-btn"
                @click.stop="toggleBookActionMenu(book.fullPath)"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="5" r="1" />
                  <circle cx="12" cy="12" r="1" />
                  <circle cx="12" cy="19" r="1" />
                </svg>
              </button>
              <div v-if="activeMenuPath === book.fullPath" class="action-menu">
                <button @click.stop="togglePin(book)">
                  {{ book.isPinned ? '取消置顶' : '置顶书籍' }}
                </button>
                <button @click.stop="renameBook(book)">重命名</button>
                <button @click.stop="setBookCover(book)">设置封面</button>
                <button @click.stop="toggleCategoryMenu(book.fullPath, $event)">
                  移动到分类
                  <span class="menu-arrow">›</span>
                </button>
                <button class="danger" @click.stop="deleteBook(book)">移出书架</button>
                <div
                  v-if="activeCategoryMenuPath === book.fullPath"
                  class="category-menu"
                  :class="{ 'open-left': categoryMenuOpensLeft }"
                >
                  <button
                    :class="{ selected: !book.categoryId }"
                    @click.stop="assignBookCategory(book)"
                  >
                    未分类
                  </button>
                  <button
                    v-for="category in bookCategories"
                    :key="category.id"
                    :class="{ selected: book.categoryId === category.id }"
                    @click.stop="assignBookCategory(book, category.id)"
                  >
                    {{ category.name }}
                  </button>
                  <button class="create-category-menu-btn" @click.stop="addCategoryForBook(book)">
                    + 新建分类
                  </button>
                </div>
              </div>
            </div>
          </article>
        </section>

        <section v-else class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M6 4.75A2.75 2.75 0 0 1 8.75 2h8.5A2.75 2.75 0 0 1 20 4.75v14.5A2.75 2.75 0 0 1 17.25 22h-8.5A2.75 2.75 0 0 1 6 19.25z"
              />
              <path d="M9.5 7h7M9.5 10.5h5" />
            </svg>
          </div>
          <h2>{{ searchQuery ? '没有找到这本书' : '书架还是空的' }}</h2>
          <p>
            {{ searchQuery ? '换个关键词试试。' : '从一本想读的书开始，慢慢建立你的阅读空间。' }}
          </p>
          <button
            v-if="!searchQuery"
            class="empty-import-btn"
            @click="getActiveCategoryId() ? openCategoryPicker() : $emit('scan-books')"
          >
            {{ getActiveCategoryId() ? '从全部书籍添加' : '添加第一本书' }}
          </button>
        </section>
      </main>
    </div>

    <div
      v-if="isCategoryPickerOpen"
      class="category-picker-overlay"
      @click.self="closeCategoryPicker"
    >
      <section class="category-picker">
        <header class="category-picker-header">
          <div>
            <h2>添加到“{{ activeCategoryName }}”</h2>
            <p>从全部书籍中选择，不会访问本地文件。</p>
          </div>
          <button v-tooltip="'关闭'" class="picker-close-btn" @click="closeCategoryPicker">
            ×
          </button>
        </header>

        <div v-if="availableCategoryBooks.length > 0" class="category-picker-list">
          <label
            v-for="book in availableCategoryBooks"
            :key="book.fullPath"
            class="picker-book-item"
          >
            <input v-model="selectedCategoryBookPaths" type="checkbox" :value="book.fullPath" />
            <img :src="book.cover || getDynamicCover(book.format)" alt="" />
            <span>{{ book.customTitle || cleanBookTitle(book.fileName) }}</span>
          </label>
        </div>
        <div v-else class="category-picker-empty">全部书籍都已经在这个分类中了。</div>

        <footer class="category-picker-footer">
          <button class="picker-cancel-btn" @click="closeCategoryPicker">取消</button>
          <button
            class="picker-confirm-btn"
            :disabled="selectedCategoryBookPaths.length === 0"
            @click="confirmCategoryBooks"
          >
            添加所选书籍
          </button>
        </footer>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useBookshelf, type BookCategory, type BookInfo } from '../../composables/useBookshelf'
import { cleanBookTitle, getDynamicCover } from '../../utils/formatter'

defineEmits<{
  (e: 'open-book', book: BookInfo): void
  (e: 'scan-books', categoryId?: string): void
}>()

type ShelfViewId = 'all' | 'recent' | 'pinned' | `category:${string}`

const {
  bookList,
  bookCategories,
  isImportingBook,
  sortedBookList,
  activeMenuPath,
  toggleMenu,
  togglePin,
  renameBook,
  setBookCover,
  createCategory,
  renameCategory,
  deleteCategory,
  assignBookCategory,
  deleteBook
} = useBookshelf()

const activeShelfView = ref<ShelfViewId>(bookList.value.length > 0 ? 'recent' : 'all')
const searchQuery = ref('')
const activeCategoryMenuPath = ref<string | null>(null)
const categoryMenuOpensLeft = ref(false)
const isCategoryPickerOpen = ref(false)
const selectedCategoryBookPaths = ref<string[]>([])
let hasInitializedDefaultView = bookList.value.length > 0

watch(
  () => bookList.value.length,
  (bookCount) => {
    if (hasInitializedDefaultView || bookCount === 0) return

    activeShelfView.value = 'recent'
    hasInitializedDefaultView = true
  },
  { immediate: true }
)

const recentBooks = computed(() =>
  [...bookList.value]
    .filter((book) => !!book.lastReadAt && !book.isPinned)
    .sort((left, right) => (right.lastReadAt || 0) - (left.lastReadAt || 0))
    .slice(0, 5)
)

const getCategoryViewId = (categoryId: string): `category:${string}` => `category:${categoryId}`

const getActiveCategoryId = (): string | null => {
  return activeShelfView.value.startsWith('category:')
    ? activeShelfView.value.substring('category:'.length)
    : null
}

const getCategoryBookCount = (categoryId: string): number => {
  return bookList.value.filter((book) => book.categoryId === categoryId).length
}

const addCategory = async (): Promise<void> => {
  const category = await createCategory()
  if (category) activeShelfView.value = getCategoryViewId(category.id)
}

const addCategoryForBook = async (book: BookInfo): Promise<void> => {
  const category = await createCategory()
  if (category) assignBookCategory(book, category.id)
  activeCategoryMenuPath.value = null
}

const toggleBookActionMenu = (bookPath: string): void => {
  activeCategoryMenuPath.value = null
  toggleMenu(bookPath)
}

const closeBookActionMenu = (bookPath: string, event: MouseEvent): void => {
  if (activeMenuPath.value !== bookPath) return
  activeCategoryMenuPath.value = null
  toggleMenu(bookPath)

  const bookActions = event.currentTarget as HTMLElement | null
  const focusedElement = document.activeElement
  if (focusedElement instanceof HTMLElement && bookActions?.contains(focusedElement)) {
    focusedElement.blur()
  }
}

const toggleCategoryMenu = (bookPath: string, event: MouseEvent): void => {
  if (activeCategoryMenuPath.value !== bookPath) {
    const actionMenu = (event.currentTarget as HTMLElement | null)?.closest('.action-menu')
    const actionMenuRect = actionMenu?.getBoundingClientRect()
    categoryMenuOpensLeft.value = !!actionMenuRect && actionMenuRect.right + 148 > window.innerWidth
  }
  activeCategoryMenuPath.value = activeCategoryMenuPath.value === bookPath ? null : bookPath
}

const removeCategory = async (category: BookCategory): Promise<void> => {
  const wasDeleted = await deleteCategory(category)
  if (wasDeleted && getActiveCategoryId() === category.id) activeShelfView.value = 'all'
}

const activeCategoryName = computed(() => {
  const activeCategoryId = getActiveCategoryId()
  return bookCategories.value.find((category) => category.id === activeCategoryId)?.name || '分类'
})

const availableCategoryBooks = computed(() => {
  const activeCategoryId = getActiveCategoryId()
  return activeCategoryId
    ? sortedBookList.value.filter((book) => book.categoryId !== activeCategoryId)
    : []
})

const openCategoryPicker = (): void => {
  if (!getActiveCategoryId()) return
  selectedCategoryBookPaths.value = []
  isCategoryPickerOpen.value = true
}

const closeCategoryPicker = (): void => {
  selectedCategoryBookPaths.value = []
  isCategoryPickerOpen.value = false
}

const onShelfKeydown = (event: KeyboardEvent): void => {
  if (event.key !== 'Escape') return
  if (isCategoryPickerOpen.value) closeCategoryPicker()
  else if (activeCategoryMenuPath.value) activeCategoryMenuPath.value = null
  else if (activeMenuPath.value) activeMenuPath.value = null
  else return
  event.preventDefault()
}

onMounted(() => window.addEventListener('keydown', onShelfKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onShelfKeydown))

const confirmCategoryBooks = (): void => {
  const activeCategoryId = getActiveCategoryId()
  if (!activeCategoryId) return

  bookList.value
    .filter((book) => selectedCategoryBookPaths.value.includes(book.fullPath))
    .forEach((book) => assignBookCategory(book, activeCategoryId))
  closeCategoryPicker()
}

const shelfViews = computed(() => [
  { id: 'all' as const, label: '全部书籍', count: bookList.value.length },
  {
    id: 'recent' as const,
    label: '最近阅读',
    count: recentBooks.value.length
  },
  {
    id: 'pinned' as const,
    label: '置顶书籍',
    count: bookList.value.filter((book) => book.isPinned).length
  }
])

const filteredBooks = computed(() => {
  const query = searchQuery.value.toLocaleLowerCase()

  const books = activeShelfView.value === 'recent' ? recentBooks.value : sortedBookList.value

  return books.filter((book) => {
    if (activeShelfView.value === 'pinned' && !book.isPinned) return false
    const activeCategoryId = getActiveCategoryId()
    if (activeCategoryId && book.categoryId !== activeCategoryId) return false

    const title = book.customTitle || cleanBookTitle(book.fileName)
    return !query || title.toLocaleLowerCase().includes(query)
  })
})

const activeViewTitle = computed(() => {
  if (activeShelfView.value === 'recent') return '最近阅读'
  if (activeShelfView.value === 'pinned') return '置顶书籍'
  const activeCategoryId = getActiveCategoryId()
  if (activeCategoryId) {
    return bookCategories.value.find((category) => category.id === activeCategoryId)?.name || '分类'
  }
  return '我的书架'
})

const activeViewSubtitle = computed(() => {
  if (activeShelfView.value === 'recent') return '继续上一次停下来的地方'
  if (activeShelfView.value === 'pinned') return '你最常回来的那些书'
  const activeCategoryId = getActiveCategoryId()
  if (activeCategoryId) return `${getCategoryBookCount(activeCategoryId)} 本已分类书籍`
  return `${bookList.value.length} 本书，安静地等你翻开`
})
</script>

<style scoped>
.shelf-view {
  flex: 1;
  min-height: 0;
  box-sizing: border-box;
  overflow: hidden;
  background: #f0f0f2;
}

.shelf-workspace {
  display: grid;
  grid-template-columns: 238px minmax(0, 1fr);
  height: 100%;
  overflow: hidden;
  background: #f0f0f2;
}

.shelf-sidebar {
  display: flex;
  flex-direction: column;
  padding: 18px 14px 14px;
  overflow: hidden;
  background: #f0f0f2;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 6px 20px;
}

.brand-mark,
.empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.brand-mark {
  width: 36px;
  height: 36px;
  color: #fff;
  border-radius: 11px;
  background: #28282b;
  box-shadow: 0 5px 12px rgba(0, 0, 0, 0.14);
}

.brand-mark svg,
.empty-icon svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.brand-title {
  color: #232326;
  font-size: 15px;
  font-weight: 750;
  letter-spacing: -0.01em;
}

.brand-subtitle {
  margin-top: 2px;
  color: #96969b;
  font-size: 11px;
}

.import-btn,
.empty-import-btn {
  border: none;
  cursor: pointer;
  transition: 0.2s ease;
}

.import-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  padding: 10px 12px;
  color: #fff;
  border-radius: 11px;
  background: #29292c;
  font-size: 13px;
  font-weight: 650;
  box-shadow: 0 5px 14px rgba(0, 0, 0, 0.12);
}

.import-btn:hover,
.empty-import-btn:hover {
  background: #454549;
  transform: translateY(-1px);
}

.import-btn:disabled {
  cursor: wait;
  opacity: 0.65;
}

.import-btn svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

.sidebar-nav,
.sidebar-categories {
  margin-top: 26px;
}

.nav-section-label {
  padding: 0 8px 7px;
  color: #a2a2a8;
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0.08em;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  margin: 2px 0;
  padding: 9px 9px;
  color: #67676c;
  border: none;
  border-radius: 9px;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  text-align: left;
  transition: 0.18s ease;
}

.nav-item:hover {
  color: #333337;
  background: rgba(255, 255, 255, 0.52);
}

.nav-item.active {
  color: #242427;
  background: #fff;
  box-shadow: 0 2px 9px rgba(0, 0, 0, 0.045);
  font-weight: 650;
}

.nav-item svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.nav-count {
  margin-left: auto;
  color: #aeafb4;
  font-size: 11px;
}

.category-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.category-add-btn {
  width: 19px;
  height: 19px;
  padding: 0;
  color: #b2b2b7;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 19px;
  line-height: 16px;
  transition: color 0.18s ease;
}

.category-add-btn:hover {
  color: #55555a;
}

.category-placeholder {
  padding: 9px;
  color: #adadb2;
  font-size: 11px;
  line-height: 1.45;
}

.category-row {
  position: relative;
}

.category-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 47px 8px 9px;
  color: #79797e;
  border: none;
  border-radius: 9px;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  text-align: left;
  transition: 0.18s ease;
}

.category-nav-item:hover,
.category-nav-item.active {
  color: #3d3d41;
  background: rgba(255, 255, 255, 0.62);
}

.category-nav-item.active {
  font-weight: 650;
}

.category-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.category-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #b9bdc6;
}

.category-rename-btn,
.category-delete-btn {
  position: absolute;
  top: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 21px;
  height: 21px;
  padding: 0;
  color: #b0b0b5;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  opacity: 0;
  transform: translateY(-50%);
  transition: 0.18s ease;
}

.category-rename-btn {
  right: 24px;
}

.category-delete-btn {
  right: 4px;
  color: #b0b0b5;
  font-size: 18px;
  line-height: 18px;
}

.category-row:hover .category-rename-btn,
.category-row:hover .category-delete-btn,
.category-rename-btn:focus,
.category-delete-btn:focus {
  opacity: 1;
}

.category-rename-btn:hover,
.category-delete-btn:hover {
  color: #55555a;
  background: rgba(255, 255, 255, 0.72);
}

.category-delete-btn:hover {
  color: #dc4b45;
}

.category-rename-btn svg {
  width: 13px;
  height: 13px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sidebar-footer {
  margin-top: auto;
  padding: 11px 8px 3px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.storage-label {
  color: #79797e;
  font-size: 12px;
  font-weight: 650;
}

.storage-description {
  margin-top: 4px;
  color: #aaaab0;
  font-size: 11px;
  line-height: 1.45;
}

.shelf-main {
  overflow-y: auto;
  padding: 35px 40px 42px;
  background: #fcfcfd;
  border-radius: 16px 0 0 0;
}

.shelf-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 30px;
}

.header-eyebrow {
  margin: 0 0 8px;
  color: #aaaab0;
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.18em;
}

.shelf-title {
  margin: 0;
  color: #242427;
  font-size: 31px;
  font-weight: 760;
  letter-spacing: -0.045em;
}

.shelf-subtitle {
  margin: 8px 0 0;
  color: #96969c;
  font-size: 13px;
}

.category-books-btn {
  padding: 9px 12px;
  color: #606065;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 10px;
  background: #f4f4f5;
  cursor: pointer;
  font-size: 12px;
  font-weight: 650;
  transition: 0.18s ease;
}

.category-books-btn:hover {
  color: #343438;
  background: #ececef;
}

.header-tools {
  display: flex;
  align-items: center;
  gap: 9px;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 190px;
  padding: 9px 12px;
  border: 1px solid rgba(0, 0, 0, 0.055);
  border-radius: 11px;
  background: #f4f4f5;
  transition: 0.2s ease;
}

.search-box:focus-within {
  border-color: rgba(0, 0, 0, 0.12);
  background: #fff;
  box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.035);
}

.search-box svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  fill: none;
  stroke: #a4a4a9;
  stroke-width: 1.8;
  stroke-linecap: round;
}

.search-box input {
  width: 100%;
  padding: 0;
  color: #3b3b3f;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
}

.book-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(152px, 1fr));
  gap: 26px 22px;
}

.book-card {
  position: relative;
  min-width: 0;
  cursor: pointer;
}

.cover-container {
  position: relative;
  overflow: hidden;
  aspect-ratio: 0.69;
  border-radius: 14px;
  background: #eeeef0;
  box-shadow: 0 7px 18px rgba(20, 20, 22, 0.13);
  transition:
    transform 0.24s ease,
    box-shadow 0.24s ease;
}

.book-card:hover .cover-container {
  transform: translateY(-5px);
  box-shadow: 0 15px 25px rgba(20, 20, 22, 0.17);
}

.book-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    rgba(0, 0, 0, 0.1),
    transparent 12%,
    transparent 90%,
    rgba(0, 0, 0, 0.04)
  );
  pointer-events: none;
}

.reading-progress {
  position: absolute;
  right: 8px;
  bottom: 8px;
  left: 8px;
  height: 3px;
  overflow: hidden;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.4);
}

.reading-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: rgba(255, 255, 255, 0.92);
}

.pin-badge {
  position: absolute;
  top: 9px;
  left: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: #fff;
  border-radius: 50%;
  background: rgba(40, 40, 43, 0.72);
  backdrop-filter: blur(8px);
}

.pin-badge svg {
  width: 13px;
  height: 13px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.book-info {
  padding: 11px 2px 0;
}

.book-title {
  overflow: hidden;
  color: #36363a;
  font-size: 14px;
  font-weight: 650;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.book-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 5px;
  color: #aaaab0;
  font-size: 11px;
}

.meta-dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #cacacf;
}

.book-actions {
  position: absolute;
  top: 7px;
  right: 7px;
  z-index: 4;
  opacity: 0;
  transition: opacity 0.16s ease;
}

.book-actions:has(.action-menu)::after {
  position: absolute;
  top: 28px;
  right: 0;
  width: 128px;
  height: 6px;
  content: '';
}

.book-card:hover .book-actions,
.book-actions:focus-within {
  opacity: 1;
}

.more-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  color: #fff;
  border: none;
  border-radius: 50%;
  background: rgba(35, 35, 38, 0.64);
  cursor: pointer;
  backdrop-filter: blur(8px);
}

.more-btn svg {
  width: 16px;
  height: 16px;
  fill: currentColor;
}

.action-menu {
  --submenu-gap: 0px;
  position: absolute;
  top: 34px;
  right: 0;
  width: 128px;
  padding: 4px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.13);
  backdrop-filter: blur(18px);
}

.action-menu button {
  display: block;
  width: 100%;
  padding: 8px 9px;
  color: #505055;
  border: none;
  border-radius: 7px;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  text-align: left;
}

.action-menu button:hover {
  background: #f1f1f3;
}

.menu-arrow {
  float: right;
  color: #aaaab0;
  font-size: 17px;
  line-height: 12px;
}

.category-menu {
  position: absolute;
  top: 91px;
  left: calc(100% + var(--submenu-gap));
  width: 128px;
  max-height: 220px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.13);
}

.category-menu.open-left {
  right: calc(100% + var(--submenu-gap));
  left: auto;
}

.category-menu button.selected {
  color: #252529;
  background: #ececef;
  font-weight: 650;
}

.category-menu .create-category-menu-btn {
  margin-top: 3px;
  color: #77777c;
  border-top: 1px solid #eeeeef;
  border-radius: 0 0 7px 7px;
}

.action-menu .danger {
  color: #e54843;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: calc(100% - 115px);
  color: #9b9ba1;
  text-align: center;
}

.empty-icon {
  width: 58px;
  height: 58px;
  color: #a8a8ae;
  border-radius: 18px;
  background: #f0f0f2;
}

.empty-icon svg {
  width: 27px;
  height: 27px;
}

.empty-state h2 {
  margin: 17px 0 7px;
  color: #515156;
  font-size: 19px;
  letter-spacing: -0.02em;
}

.empty-state p {
  margin: 0;
  font-size: 13px;
}

.empty-import-btn {
  margin-top: 19px;
  padding: 9px 16px;
  color: #fff;
  border-radius: 10px;
  background: #2e2e31;
  font-size: 13px;
  font-weight: 650;
}

.category-picker-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(5px);
}

.category-picker {
  display: flex;
  flex-direction: column;
  width: min(520px, 100%);
  max-height: min(620px, calc(100vh - 50px));
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 18px;
  background: rgba(252, 252, 253, 0.98);
  box-shadow: 0 20px 55px rgba(0, 0, 0, 0.16);
}

.category-picker-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 21px 22px 15px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.055);
}

.category-picker-header h2 {
  margin: 0;
  color: #353539;
  font-size: 18px;
}

.category-picker-header p {
  margin: 6px 0 0;
  color: #99999f;
  font-size: 12px;
}

.picker-close-btn {
  width: 27px;
  height: 27px;
  padding: 0;
  color: #99999f;
  border: none;
  border-radius: 50%;
  background: #f0f0f2;
  cursor: pointer;
  font-size: 21px;
  line-height: 24px;
}

.category-picker-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  padding: 11px;
}

.picker-book-item {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 8px 9px;
  color: #55555a;
  border-radius: 10px;
  cursor: pointer;
  font-size: 13px;
}

.picker-book-item:hover {
  background: #f1f1f3;
}

.picker-book-item input {
  accent-color: #444448;
}

.picker-book-item img {
  width: 30px;
  height: 43px;
  border-radius: 4px;
  object-fit: cover;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.category-picker-empty {
  padding: 42px 22px;
  color: #a0a0a6;
  font-size: 13px;
  text-align: center;
}

.category-picker-footer {
  display: flex;
  justify-content: flex-end;
  gap: 9px;
  padding: 14px 17px 17px;
  border-top: 1px solid rgba(0, 0, 0, 0.055);
}

.picker-cancel-btn,
.picker-confirm-btn {
  padding: 9px 14px;
  border: none;
  border-radius: 9px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 650;
}

.picker-cancel-btn {
  color: #66666b;
  background: #eeeeef;
}

.picker-confirm-btn {
  color: #fff;
  background: #333337;
}

.picker-confirm-btn:disabled {
  cursor: default;
  opacity: 0.4;
}

@media (max-width: 760px) {
  .shelf-view {
    padding: 0;
  }

  .shelf-workspace {
    grid-template-columns: 68px minmax(0, 1fr);
  }

  .shelf-sidebar {
    padding: 14px 8px;
  }

  .sidebar-brand {
    justify-content: center;
    padding: 1px 0 15px;
  }

  .sidebar-brand > div:not(.brand-mark),
  .nav-section-label,
  .nav-item span,
  .sidebar-categories,
  .sidebar-footer {
    display: none;
  }

  .import-btn {
    height: 38px;
    padding: 0;
    font-size: 0;
  }

  .nav-item {
    justify-content: center;
    padding: 10px;
  }

  .shelf-main {
    padding: 26px 20px 32px;
  }

  .shelf-header {
    display: block;
  }

  .search-box {
    width: auto;
    margin-top: 18px;
  }

  .header-tools {
    display: block;
  }

  .category-books-btn {
    margin-top: 18px;
  }

  .book-grid {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 22px 16px;
  }
}
</style>
