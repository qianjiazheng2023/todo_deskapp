import { contextBridge, ipcRenderer } from 'electron'
import type {
  MarkdownNoteApi,
  MarkdownNoteInput,
  MarkdownNotePatch,
  TodoApi,
  TodoInput,
  TodoPatch,
  WindowApi
} from '../shared/todo'

const todoApi: TodoApi = {
  list: () => ipcRenderer.invoke('todos:list'),
  create: (input: TodoInput) => ipcRenderer.invoke('todos:create', input),
  update: (id: string, patch: TodoPatch) => ipcRenderer.invoke('todos:update', id, patch),
  remove: (id: string) => ipcRenderer.invoke('todos:remove', id)
}

contextBridge.exposeInMainWorld('todoApi', todoApi)

const markdownNoteApi: MarkdownNoteApi = {
  list: () => ipcRenderer.invoke('notes:list'),
  create: (input: MarkdownNoteInput) => ipcRenderer.invoke('notes:create', input),
  update: (id: string, patch: MarkdownNotePatch) => ipcRenderer.invoke('notes:update', id, patch),
  remove: (id: string) => ipcRenderer.invoke('notes:remove', id)
}

contextBridge.exposeInMainWorld('markdownNoteApi', markdownNoteApi)

const windowApi: WindowApi = {
  setCompactMode: (compact: boolean) => ipcRenderer.invoke('window:set-compact-mode', compact)
}

contextBridge.exposeInMainWorld('windowApi', windowApi)
