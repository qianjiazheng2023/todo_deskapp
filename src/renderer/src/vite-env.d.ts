/// <reference types="vite/client" />

import type { TodoApi, WindowApi } from '../../shared/todo'

declare global {
  interface Window {
    todoApi: TodoApi
    windowApi: WindowApi
  }
}
