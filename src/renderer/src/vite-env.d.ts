/// <reference types="vite/client" />

import type { MarkdownNoteApi, TodoApi, WindowApi } from '../../shared/todo'

declare global {
  interface Window {
    markdownNoteApi: MarkdownNoteApi
    todoApi: TodoApi
    windowApi: WindowApi
  }
}
