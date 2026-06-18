import { app, BrowserWindow, Menu, ipcMain } from 'electron'
import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import {
  allowedTags,
  type Priority,
  type Todo,
  type TodoInput,
  type TodoPatch,
  type TodoStoreFile,
  type TodoTag
} from '../shared/todo'

const dataFileName = 'todos.json'
const priorities: Priority[] = ['low', 'medium', 'high']

let mainWindow: BrowserWindow | null = null
let storeOperation = Promise.resolve()

const normalBounds = {
  width: 1240,
  height: 820,
  minWidth: 980,
  minHeight: 680
}

const compactBounds = {
  width: 360,
  height: 560,
  minWidth: 330,
  minHeight: 440
}

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: normalBounds.width,
    height: normalBounds.height,
    minWidth: normalBounds.minWidth,
    minHeight: normalBounds.minHeight,
    show: false,
    title: 'Date Todo',
    autoHideMenuBar: true,
    backgroundColor: '#f6f8fb',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#f8fbff',
      symbolColor: '#172033',
      height: 40
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const registerWindowHandlers = (): void => {
  ipcMain.handle('window:set-compact-mode', (_event, compact: boolean) => {
    if (!mainWindow) {
      return false
    }

    const bounds = compact ? compactBounds : normalBounds
    mainWindow.setMinimumSize(bounds.minWidth, bounds.minHeight)
    mainWindow.setSize(bounds.width, bounds.height, true)
    mainWindow.setAlwaysOnTop(compact, 'floating')
    mainWindow.setSkipTaskbar(false)
    return compact
  })
}

const dataFilePath = (): string => join(app.getPath('userData'), dataFileName)

const emptyStore = (): TodoStoreFile => ({ todos: [] })

const isStoreFile = (value: unknown): value is TodoStoreFile => {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as TodoStoreFile).todos))
}

const findFirstJsonObject = (raw: string): string | null => {
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
    } else if (char === '{') {
      if (depth === 0) {
        start = index
      }
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0 && start !== -1) {
        return raw.slice(start, index + 1)
      }
    }
  }

  return null
}

const backupCorruptStore = async (path: string, raw: string): Promise<void> => {
  const backupPath = `${path}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}.bak`
  await fs.writeFile(backupPath, raw, 'utf-8')
}

const readStore = async (): Promise<TodoStoreFile> => {
  const path = dataFilePath()

  try {
    const raw = await fs.readFile(path, 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    return isStoreFile(parsed) ? parsed : emptyStore()
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return emptyStore()
    }

    const raw = await fs.readFile(path, 'utf-8')
    const recoveredJson = findFirstJsonObject(raw)

    if (recoveredJson) {
      const recovered = JSON.parse(recoveredJson) as unknown
      if (isStoreFile(recovered)) {
        await backupCorruptStore(path, raw)
        await writeStore(recovered)
        return recovered
      }
    }

    await backupCorruptStore(path, raw)
    await writeStore(emptyStore())
    return emptyStore()
  }
}

const writeStore = async (store: TodoStoreFile): Promise<void> => {
  const path = dataFilePath()
  const tempPath = `${path}.${randomUUID()}.tmp`
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(tempPath, JSON.stringify(store, null, 2), 'utf-8')
  await fs.rename(tempPath, path)
}

const withStoreLock = async <T>(operation: () => Promise<T>): Promise<T> => {
  const nextOperation = storeOperation.then(operation, operation)
  storeOperation = nextOperation.then(
    () => undefined,
    () => undefined
  )
  return nextOperation
}

const isAllowedTag = (tag: string): tag is TodoTag => {
  return (allowedTags as readonly string[]).includes(tag)
}

const cleanTags = (tags?: string[]): TodoTag[] => {
  if (!Array.isArray(tags)) {
    return []
  }

  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(isAllowedTag)))
}

const cleanPriority = (priority?: Priority): Priority => {
  return priority && priorities.includes(priority) ? priority : 'medium'
}

const cleanDate = (date: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Task date must use YYYY-MM-DD format.')
  }

  return date
}

const todayString = (): string => {
  const date = new Date()
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

const isPastDate = (date: string): boolean => {
  return cleanDate(date) < todayString()
}

const assertWritableDate = (date: string): void => {
  if (isPastDate(date)) {
    throw new Error('Past tasks are read-only.')
  }
}

const cleanTitle = (title: string): string => {
  const cleaned = title.trim()
  if (!cleaned) {
    throw new Error('Task title is required.')
  }

  return cleaned
}

const registerTodoHandlers = (): void => {
  ipcMain.handle('todos:list', async () => {
    return withStoreLock(async () => {
      const store = await readStore()
      return store.todos
    })
  })

  ipcMain.handle('todos:create', async (_event, input: TodoInput) => {
    return withStoreLock(async () => {
      const store = await readStore()
      const now = new Date().toISOString()
      const todo: Todo = {
        id: randomUUID(),
        title: cleanTitle(input.title),
        date: cleanDate(input.date),
        completed: input.completed ?? false,
        priority: cleanPriority(input.priority),
        tags: cleanTags(input.tags),
        note: input.note?.trim() ?? '',
        createdAt: now,
        updatedAt: now
      }

      assertWritableDate(todo.date)
      store.todos.push(todo)
      await writeStore(store)
      return todo
    })
  })

  ipcMain.handle('todos:update', async (_event, id: string, patch: TodoPatch) => {
    return withStoreLock(async () => {
      const store = await readStore()
      const index = store.todos.findIndex((todo) => todo.id === id)

      if (index === -1) {
        throw new Error('Task was not found.')
      }

      const current = store.todos[index]
      assertWritableDate(current.date)

      const next: Todo = {
        ...current,
        ...patch,
        id: current.id,
        title: patch.title === undefined ? current.title : cleanTitle(patch.title),
        date: patch.date === undefined ? current.date : cleanDate(patch.date),
        priority: patch.priority === undefined ? current.priority : cleanPriority(patch.priority),
        tags: patch.tags === undefined ? current.tags : cleanTags(patch.tags),
        note: patch.note === undefined ? current.note : patch.note,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString()
      }

      assertWritableDate(next.date)
      store.todos[index] = next
      await writeStore(store)
      return next
    })
  })

  ipcMain.handle('todos:remove', async (_event, id: string) => {
    return withStoreLock(async () => {
      const store = await readStore()
      const current = store.todos.find((todo) => todo.id === id)

      if (!current) {
        throw new Error('Task was not found.')
      }

      assertWritableDate(current.date)
      const nextTodos = store.todos.filter((todo) => todo.id !== id)

      await writeStore({ todos: nextTodos })
      return id
    })
  })
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  registerWindowHandlers()
  registerTodoHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
