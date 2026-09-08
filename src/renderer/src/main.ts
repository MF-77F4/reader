// src/main.ts
import { createApp } from 'vue'
import App from './App.vue'

// 👇 引入虚拟滚动库的样式和组件
import VirtualScroller from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import './styles/base.css'
import { installAppTooltip } from './utils/appTooltip'

const app = createApp(App)

app.use(VirtualScroller) // 👈 注册插件
installAppTooltip(app)

app.mount('#app')
