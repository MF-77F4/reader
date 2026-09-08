<!-- src/components/common/AppleModal.vue -->
<template>
  <div v-if="modalState.visible" class="apple-modal-overlay" @click.self="modalState.onCancel">
    <div class="apple-modal-box" @click.stop>
      <div class="apple-modal-content">
        <div v-if="modalState.title" class="apple-modal-title">{{ modalState.title }}</div>
        <div v-if="modalState.message" class="apple-modal-message">{{ modalState.message }}</div>
        <input
          v-if="modalState.type === 'prompt'"
          v-model="modalState.inputValue"
          class="apple-modal-input"
          :placeholder="modalState.inputPlaceholder"
          autofocus
        />
      </div>
      <div class="apple-modal-actions">
        <button
          v-if="modalState.type !== 'alert'"
          class="apple-btn cancel"
          :class="{ 'destructive-cancel': modalState.isDestructive }"
          @click="modalState.onCancel"
        >
          {{ modalState.cancelText }}
        </button>
        <button
          class="apple-btn confirm"
          :class="{ destructive: modalState.isDestructive }"
          @click="modalState.onConfirm"
        >
          {{ modalState.confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useModal } from '../../composables/useModal'

// 直接获取单例状态即可渲染
const { modalState } = useModal()
</script>

<style scoped>
/* ==========================================
   🌟 弹窗输入框样式 (提取自书架样式部分)
   ========================================== */
.apple-modal-input {
  width: 100%;
  padding: 10px;
  margin-top: 10px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  font-size: 15px;
  outline: none;
  box-sizing: border-box;
  background: #f5f5f7;
  color: #1d1d1f;
  transition: all 0.2s;
}
.apple-modal-input:focus {
  border-color: #8e8e93;
  background: #fff;
}
.is-night-mode .apple-modal-input {
  background: #1c1c1e;
  border-color: rgba(255, 255, 255, 0.1);
  color: #fff;
}

/* ==========================================
   🌟 Apple 风格完美弹窗核心结构与色彩
   ========================================== */
.apple-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: fadeIn 0.2s ease-out;
}

.apple-modal-box {
  width: 290px;
  background: rgba(248, 247, 247, 0.98);
  backdrop-filter: blur(20px);
  border-radius: 18px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  padding: 24px 20px 20px 20px;
  animation: scaleUp 0.2s ease-out;
}

.apple-modal-content {
  text-align: center;
  margin-bottom: 24px;
}

.apple-modal-title {
  font-size: 17px;
  font-weight: 600;
  color: #000;
  margin-bottom: 8px;
}

.apple-modal-message {
  font-size: 16px;
  font-weight: 500;
  color: #333;
  line-height: 1.5;
}

.apple-modal-actions {
  display: flex;
  gap: 12px;
}

.apple-btn {
  flex: 1;
  border: none;
  padding: 10px 0;
  font-size: 15px;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 600;
  transition:
    transform 0.1s,
    opacity 0.2s,
    background 0.2s;
}

.apple-btn:active {
  transform: scale(0.95);
}

/* 1. 普通取消按钮 (浅灰底 + 深灰字) */
.apple-btn.cancel {
  background: #f2f2f7;
  color: #1d1d1f;
}
.apple-btn.cancel:hover {
  background: #e5e5ea;
}

/* 2. 普通确认按钮 (匹配书架的石墨灰) */
.apple-btn.confirm {
  background: #3c3c3e;
  color: #fff;
}
.apple-btn.confirm:hover {
  background: #4a4a4c;
}

/* 3. 危险操作的取消按钮 (与普通取消保持一致，低调克制) */
.apple-btn.cancel.destructive-cancel {
  background: #f2f2f7;
  color: #1d1d1f;
}
.apple-btn.cancel.destructive-cancel:hover {
  background: #e5e5ea;
}

/* 4. 危险操作的确认按钮 */
.apple-btn.confirm.destructive {
  background: #201f1f;
  color: #fff;
}
.apple-btn.confirm.destructive:hover {
  background: #ce1f15;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes scaleUp {
  from {
    transform: scale(0.95);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
