<template>
  <transition name="slide-bottom">
    <!-- 同样绑定夜间模式类名 -->
    <div v-if="isAnnotationInputOpen" class="annotation-input-popup" :class="{ 'is-night-mode': readerSettings.isNight }" @click.stop>
      <div class="aip-header">
         <span class="aip-title">添加批注</span>
         <button class="icon-btn compact-btn" @click="$emit('cancel')">
           <span class="btn-emoji">❌</span>
         </button>
      </div>
      <div class="aip-snippet-box">
         <div class="aip-snippet">「 {{ draftAnnotationData?.textSnippet }} 」</div>
      </div>
      <textarea
         v-model="annotationInputText"
         class="aip-textarea"
         placeholder="写下你的想法..."
         autofocus
      ></textarea>
      <div class="aip-footer">
         <button class="apple-primary-btn" @click="$emit('confirm')">保存批注</button>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { useAnnotation } from '../../composables/useAnnotation'
import { useSettings } from '../../composables/useSettings'

defineEmits<{ (e: 'cancel'): void; (e: 'confirm'): void }>()

const { isAnnotationInputOpen, annotationInputText, draftAnnotationData } = useAnnotation()
const { readerSettings } = useSettings()
</script>

<style scoped>
.annotation-input-popup { position: absolute; bottom: 24px; left: 0; right: 0; margin: 0 auto; width: 92%; max-width: 900px; background: rgba(250, 250, 250, 0.95); backdrop-filter: blur(30px); -webkit-backdrop-filter: blur(30px); border: 1px solid rgba(0, 0, 0, 0.06); border-radius: 18px; box-shadow: 0 16px 50px rgba(0, 0, 0, 0.15); z-index: 200; padding: 20px 30px; display: flex; flex-direction: column; gap: 12px; }
.is-night-mode.annotation-input-popup { background: rgba(30, 30, 32, 0.95); border: 1px solid rgba(255, 255, 255, 0.08); }

.aip-header { display: flex; justify-content: space-between; align-items: center; }
.aip-title { font-size: 16px; font-weight: 600; color: #1d1d1f; }
.is-night-mode .aip-title { color: #fff; }

.aip-snippet-box { background: rgba(0,0,0,0.04); padding: 12px; border-radius: 8px; border-left: 3px solid #ff3b30; }
.is-night-mode .aip-snippet-box { background: rgba(255,255,255,0.05); }
.aip-snippet { font-size: 14px; color: #666; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.is-night-mode .aip-snippet { color: #aaa; }

.aip-textarea { width: 100%; height: 100px; padding: 12px; border: 1px solid rgba(0,0,0,0.1); border-radius: 8px; background: #fff; font-size: 15px; color: #333; resize: none; outline: none; box-sizing: border-box; font-family: inherit; }
.aip-textarea:focus { border-color: #007aff; }
.is-night-mode .aip-textarea { background: #1c1c1e; color: #fff; border-color: rgba(255,255,255,0.1); }
.aip-footer { display: flex; justify-content: flex-end; }

/* 👇 补回按钮的 CSS 👇 */
.icon-btn { background: transparent; border: none; color: #1d1d1f; cursor: pointer; border-radius: 8px; transition: background 0.2s; display: flex; align-items: center; justify-content: center; }
.icon-btn:hover { background: rgba(0, 0, 0, 0.05); }
.is-night-mode .icon-btn { color: #8e8e93; }
.is-night-mode .icon-btn:hover { background: rgba(255, 255, 255, 0.1); }
.compact-btn { padding: 4px 8px; }

.apple-primary-btn { background: #1d1d1f; color: #fff; border: none; padding: 8px 18px; border-radius: 20px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s ease; }
.apple-primary-btn:hover { background: #4a4a4c; }
</style>
