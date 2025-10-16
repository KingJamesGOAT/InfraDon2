// By using `declare global`, we can extend existing types like `Window`.
// This tells TypeScript that our `window` object can have a `global` property.
declare global {
  interface Window {
    global: Window
  }
}

// Add this polyfill at the very top.
// This ensures 'global' is defined before any other code runs.
if (typeof window.global === 'undefined') {
  window.global = window
}

import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')
