// src/composables/useModal.ts
//弹窗的数据和调用方法
import { ref } from 'vue'

// 🌟 核心技巧：放在函数外，形成全局单例状态。这样全应用共享同一个弹窗！
const modalState = ref({
  visible: false,
  title: '',
  message: '',
  type: 'confirm' as 'confirm' | 'alert' | 'prompt',
  inputValue: '',
  inputPlaceholder: '',
  confirmText: '确定',
  cancelText: '取消',
  isDestructive: false,
  onConfirm: () => {},
  onCancel: () => {}
})

export function useModal() {
  const showModal = (options: {
    title: string
    message: string
    type?: 'confirm' | 'alert'
    confirmText?: string
    cancelText?: string
    isDestructive?: boolean
  }): Promise<boolean> => {
    return new Promise((resolve) => {
      modalState.value = {
        visible: true,
        title: options.title,
        message: options.message,
        type: options.type || 'confirm',
        inputValue: '',
        inputPlaceholder: '',
        confirmText: options.confirmText || '确定',
        cancelText: options.cancelText || '取消',
        isDestructive: options.isDestructive || false,
        onConfirm: () => {
          modalState.value.visible = false
          resolve(true)
        },
        onCancel: () => {
          modalState.value.visible = false
          resolve(false)
        }
      }
    })
  }

  const showPrompt = (options: { 
    title: string, 
    message?: string, 
    defaultValue?: string, 
    placeholder?: string 
  }): Promise<string | null> => {
    return new Promise((resolve) => {
      modalState.value = {
        visible: true,
        title: options.title,
        message: options.message || '',
        type: 'prompt',
        inputValue: options.defaultValue || '',
        inputPlaceholder: options.placeholder || '',
        confirmText: '确定',
        cancelText: '取消',
        isDestructive: false,
        onConfirm: () => {
          modalState.value.visible = false
          resolve(modalState.value.inputValue)
        },
        onCancel: () => {
          modalState.value.visible = false
          resolve(null)
        }
      }
    }
  )}

  return { modalState, showModal, showPrompt }
}