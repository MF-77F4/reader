// src/renderer/src/composables/useSettings.ts
//抽离阅读器的全局设置模块。这个模块掌管着字号、行距、背景色、夜间模式以及对应的动态 CSS 样式生成。

import { ref, computed, nextTick, watch } from 'vue'
import { fontOptions } from '../utils/constants' // 复用我们第一步抽离的常量
import { useReader } from './useReader'
import parchmentBackgroundUrl from '../assets/parchment-bg.png'
import parchmentGreenBackgroundUrl from '../assets/parchment-green-bg.png'
import parchmentKraftBackgroundUrl from '../assets/parchment-kraft-bg.png'
import parchmentOrangeBackgroundUrl from '../assets/parchment-orange-bg.png'
import parchmentSepiaBackgroundUrl from '../assets/parchment-sepia-bg.png'

// 🌟 全局单例状态：保证阅读器视图和设置面板的数据始终同步
const defaultReaderSettings = {
  isNight: false,
  bgColor: '#ffffff',
  textColor: '#1d1d1f',
  bgImage: '',
  fontSize: 18,
  lineHeight: 2.2,
  fontFamily: 'inherit',
  brightness: 85
}

const readerSettings = ref({ ...defaultReaderSettings })

const isFontMenuOpen = ref(false)
const displayFontOptions = ref([...fontOptions])
const activeSettingsBookPath = ref('')
let isRestoringBookSettings = false
let isPersistenceWatcherInitialized = false
let hasCustomBrightness = false

const parchmentBackgrounds: Record<string, string> = {
  '#ffffff': parchmentBackgroundUrl,
  '#f4f4e4': parchmentSepiaBackgroundUrl,
  '#cce8cf': parchmentGreenBackgroundUrl,
  '#d7ccc8': parchmentKraftBackgroundUrl,
  '#ffe0b2': parchmentOrangeBackgroundUrl
}

const getBookSettingsKey = (filePath: string) => `reader_book_settings_${filePath}`

const darkenHexColor = (color: string, factor = 0.92): string => {
  const hex = color.replace('#', '')
  const normalized = hex.length === 3 ? hex.split('').map((part) => part + part).join('') : hex
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return 'rgba(238, 238, 240, 0.94)'

  const channels = [0, 2, 4].map((offset) =>
    Math.max(0, Math.round(parseInt(normalized.slice(offset, offset + 2), 16) * factor))
  )
  return `rgb(${channels.join(', ')})`
}

const getSelectionPalette = () => {
  const s = readerSettings.value
  const source = s.isNight ? '#1c1c1e' : s.bgColor
  const hex = source.replace('#', '')
  const normalized = hex.length === 3 ? hex.split('').map((part) => part + part).join('') : hex
  const channels = [0, 2, 4].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16))
  const [red, green, blue] = channels.every(Number.isFinite) ? channels : [253, 253, 253]
  const fillFactor = s.isNight ? 2.2 : 0.84
  const adjustedFill = [red, green, blue].map((channel) =>
    Math.max(0, Math.min(255, Math.round(channel * fillFactor)))
  )
  const fillRgb = adjustedFill.join(', ')
  const fill = `rgba(${fillRgb}, ${s.isNight ? 0.62 : 0.58})`

  return {
    fill,
    selection: fill
  }
}

export function useSettings() {
  const { readingMode } = useReader()

  // 未打开书籍时只使用默认值。旧版全局配置不再作为新书默认值。
  const loadSettings = () => {
    readerSettings.value = { ...defaultReaderSettings }
    readingMode.value = 'scroll'
  }

  const restoreBookSettings = (filePath: string) => {
    isRestoringBookSettings = true
    hasCustomBrightness = false
    activeSettingsBookPath.value = filePath
    readerSettings.value = { ...defaultReaderSettings }
    readingMode.value = 'scroll'

    const savedSettings = localStorage.getItem(getBookSettingsKey(filePath))
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings)
        hasCustomBrightness = parsed.hasCustomBrightness === true
        readerSettings.value = {
          ...defaultReaderSettings,
          ...parsed,
          brightness: hasCustomBrightness ? parsed.brightness : defaultReaderSettings.brightness
        }
        readingMode.value = parsed.mode === 'scroll' ? 'scroll' : 'page'
      } catch (e) {}
    }

    nextTick(() => {
      isRestoringBookSettings = false
    })
  }

  if (!isPersistenceWatcherInitialized) {
    isPersistenceWatcherInitialized = true
    watch(
      [() => readerSettings.value, readingMode],
      ([newSettings, newMode]) => {
        if (isRestoringBookSettings || !activeSettingsBookPath.value) return
        localStorage.setItem(
          getBookSettingsKey(activeSettingsBookPath.value),
          JSON.stringify({
            ...newSettings,
            brightness: hasCustomBrightness ? newSettings.brightness : undefined,
            hasCustomBrightness,
            mode: newMode
          })
        )
      },
      { deep: true }
    )
  }

  const markBrightnessCustomized = () => {
    hasCustomBrightness = true
  }

  // 3. 动态计算 CSS 变量 (驱动 TXT 和 PDF 的排版)
  const readerStyle = computed(() => {
    const s = readerSettings.value
    const presetBackgroundUrl = parchmentBackgrounds[s.bgColor]
    const bg =
      s.isNight
        ? '#1c1c1e'
        : s.bgImage
          ? `url(${s.bgImage})`
          : presetBackgroundUrl
            ? `${s.bgColor} url(${presetBackgroundUrl})`
            : s.bgColor
    const color = s.isNight ? '#8e8e93' : '#1d1d1f'
    const toolbarBg = s.bgImage ? 'rgba(238, 238, 240, 0.94)' : darkenHexColor(s.bgColor)
    const palette = getSelectionPalette()
    return {
      '--reader-bg': bg,
      '--reader-color': color,
      '--reader-toolbar-bg': toolbarBg,
      '--reader-font-size': `${s.fontSize}px`,
      '--reader-line-height': s.lineHeight,
      '--reader-font-family': s.fontFamily,
      '--reader-brightness': `${s.brightness}%`,
      '--reader-selection-bg': palette.selection,
      '--reader-highlight-bg': palette.fill
    }
  })

  // 4. 判断当前主题选中状态
  const isCurrentTheme = (bg: string) => {
    return readerSettings.value.bgColor === bg && !readerSettings.value.isNight && !readerSettings.value.bgImage
  }

  // 5. 字体菜单切换逻辑
  const toggleFontMenu = () => {
    if (!isFontMenuOpen.value) {
      const currentFont = readerSettings.value.fontFamily
      displayFontOptions.value = [...fontOptions].sort((a, b) => {
        if (a.value === currentFont) return -1
        if (b.value === currentFont) return 1
        return 0
      })
      isFontMenuOpen.value = true
    } else {
      isFontMenuOpen.value = false
    }
  }

  // 6. 切换预设主题
  const setPresetTheme = (bg: string, text: string) => {
    readerSettings.value.bgColor = bg
    readerSettings.value.textColor = text
    readerSettings.value.bgImage = ''
    readerSettings.value.isNight = false
  }

  // 7. 处理背景图上传
  const handleBgImageUpload = (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        readerSettings.value.bgImage = ev.target?.result as string
        readerSettings.value.isNight = false
      }
      reader.readAsDataURL(file)
    }
  }

  return {
    readerSettings,
    isFontMenuOpen,
    displayFontOptions,
    readerStyle,
    loadSettings,
    restoreBookSettings,
    isCurrentTheme,
    toggleFontMenu,
    setPresetTheme,
    handleBgImageUpload,
    markBrightnessCustomized,
    getSelectionPalette
  }
}
