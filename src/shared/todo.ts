export type Priority = 'low' | 'medium' | 'high'

export const allowedTags = ['学习', '生活', '健身', '工作'] as const

export type TodoTag = (typeof allowedTags)[number]

export interface Todo {
  id: string
  title: string
  date: string
  completed: boolean
  priority: Priority
  tags: TodoTag[]
  note: string
  createdAt: string
  updatedAt: string
}

export type TodoInput = Pick<Todo, 'title' | 'date'> &
  Partial<Pick<Todo, 'completed' | 'priority' | 'tags' | 'note'>>

export type TodoPatch = Partial<Omit<Todo, 'id' | 'createdAt' | 'updatedAt'>>

export interface TodoApi {
  list: () => Promise<Todo[]>
  create: (input: TodoInput) => Promise<Todo>
  update: (id: string, patch: TodoPatch) => Promise<Todo>
  remove: (id: string) => Promise<string>
}

export interface WindowApi {
  setCompactMode: (compact: boolean) => Promise<boolean>
}

export interface TodoStoreFile {
  todos: Todo[]
}
