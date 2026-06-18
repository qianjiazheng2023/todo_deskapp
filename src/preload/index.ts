import { contextBridge, ipcRenderer } from 'electron'
import type { TodoApi, TodoInput, TodoPatch, WindowApi } from '../shared/todo'

const todoApi: TodoApi = {
  list: () => ipcRenderer.invoke('todos:list'),
  create: (input: TodoInput) => ipcRenderer.invoke('todos:create', input),
  update: (id: string, patch: TodoPatch) => ipcRenderer.invoke('todos:update', id, patch),
  remove: (id: string) => ipcRenderer.invoke('todos:remove', id)
}

contextBridge.exposeInMainWorld('todoApi', todoApi)

const windowApi: WindowApi = {
  setCompactMode: (compact: boolean) => ipcRenderer.invoke('window:set-compact-mode', compact)
}

contextBridge.exposeInMainWorld('windowApi', windowApi)
