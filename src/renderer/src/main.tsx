import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  CalendarDays,
  CheckCircle2,
  Circle,
  NotebookPen,
  Plus,
  Search,
  Shrink,
  Trash2
} from 'lucide-react'
import { allowedTags, type Priority, type Todo, type TodoPatch, type TodoTag } from '../../shared/todo'
import './styles.css'

const priorityLabels: Record<Priority, string> = {
  low: '低',
  medium: '中',
  high: '高'
}

const priorityOrder: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2
}

const todayString = (): string => toDateInputValue(new Date())

const isPastDate = (dateValue: string): boolean => dateValue < todayString()

const toDateInputValue = (date: Date): string => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

const formatDateLabel = (dateValue: string): string => {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  }).format(new Date(`${dateValue}T00:00:00`))
}

const getWeekDates = (selectedDate: string): string[] => {
  const date = new Date(`${selectedDate}T00:00:00`)
  const day = date.getDay() || 7
  const monday = new Date(date)
  monday.setDate(date.getDate() - day + 1)

  return Array.from({ length: 7 }, (_, index) => {
    const item = new Date(monday)
    item.setDate(monday.getDate() + index)
    return toDateInputValue(item)
  })
}

const sortTodos = (todos: Todo[]): Todo[] => {
  return [...todos].sort((a, b) => {
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1
    }

    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority]
    }

    return a.createdAt.localeCompare(b.createdAt)
  })
}

const App = (): React.ReactElement => {
  const [todos, setTodos] = useState<Todo[]>([])
  const [selectedDate, setSelectedDate] = useState(todayString())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState<TodoTag | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [noteDraft, setNoteDraft] = useState('')
  const [compactMode, setCompactMode] = useState(false)

  useEffect(() => {
    window.todoApi
      .list()
      .then((items) => {
        setTodos(items)
        setError(null)
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false))
  }, [])

  const selectedTodo = useMemo(() => {
    return todos.find((todo) => todo.id === selectedId) ?? null
  }, [selectedId, todos])

  useEffect(() => {
    setNoteDraft(selectedTodo?.note ?? '')
  }, [selectedTodo?.id])

  useEffect(() => {
    document.body.classList.toggle('compact-window', compactMode)
    return () => document.body.classList.remove('compact-window')
  }, [compactMode])

  const dateTodos = useMemo(() => {
    return sortTodos(todos.filter((todo) => todo.date === selectedDate))
  }, [selectedDate, todos])

  const visibleTodos = useMemo(() => {
    const query = search.trim().toLowerCase()

    if (!query && !tagFilter) {
      return dateTodos
    }

    return sortTodos(
      todos.filter((todo) => {
        const matchesSearch =
          !query ||
          todo.title.toLowerCase().includes(query) ||
          todo.note.toLowerCase().includes(query) ||
          todo.tags.some((tag) => tag.toLowerCase().includes(query))
        const matchesTag = !tagFilter || todo.tags.includes(tagFilter)

        return matchesSearch && matchesTag
      })
    )
  }, [dateTodos, search, tagFilter, todos])

  const todayTodos = useMemo(() => todos.filter((todo) => todo.date === todayString()), [todos])
  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate])
  const weekTodos = useMemo(() => todos.filter((todo) => weekDates.includes(todo.date)), [todos, weekDates])

  const completedToday = todayTodos.filter((todo) => todo.completed).length
  const completedWeek = weekTodos.filter((todo) => todo.completed).length
  const activeCount = todos.filter((todo) => !todo.completed).length
  const selectedCompleted = dateTodos.filter((todo) => todo.completed).length
  const progress = dateTodos.length ? Math.round((selectedCompleted / dateTodos.length) * 100) : 0
  const isSearchMode = Boolean(search.trim() || tagFilter)
  const selectedDateReadOnly = isPastDate(selectedDate)
  const selectedTodoReadOnly = selectedTodo ? isPastDate(selectedTodo.date) : false

  const updateTodoInState = (next: Todo): void => {
    setTodos((items) => items.map((todo) => (todo.id === next.id ? next : todo)))
  }

  const createTodo = async (): Promise<void> => {
    const title = newTitle.trim()
    if (!title || selectedDateReadOnly) {
      return
    }

    try {
      const created = await window.todoApi.create({
        title,
        date: selectedDate,
        priority: 'medium',
        tags: [],
        note: ''
      })
      setTodos((items) => [...items, created])
      setSelectedId(created.id)
      setNewTitle('')
      setError(null)
    } catch (reason) {
      setError((reason as Error).message)
    }
  }

  const updateTodo = async (id: string, patch: TodoPatch): Promise<void> => {
    const current = todos.find((todo) => todo.id === id)
    if (!current || isPastDate(current.date)) {
      return
    }

    try {
      const updated = await window.todoApi.update(id, patch)
      updateTodoInState(updated)
      setError(null)
    } catch (reason) {
      setError((reason as Error).message)
    }
  }

  const deleteTodo = async (id: string): Promise<void> => {
    const current = todos.find((todo) => todo.id === id)
    if (!current || isPastDate(current.date)) {
      return
    }

    try {
      await window.todoApi.remove(id)
      setTodos((items) => items.filter((todo) => todo.id !== id))
      setSelectedId((current) => (current === id ? null : current))
      setError(null)
    } catch (reason) {
      setError((reason as Error).message)
    }
  }

  const toggleCompactMode = async (): Promise<void> => {
    const nextMode = !compactMode
    try {
      await window.windowApi.setCompactMode(nextMode)
      setCompactMode(nextMode)
    } catch (reason) {
      setError((reason as Error).message)
    }
  }

  return (
    <>
      <div className="app-titlebar">
        <div className="app-mark">D</div>
        <span>Date Todo</span>
        <span className="app-titlebar-subtitle">本地计划</span>
        <button className={compactMode ? 'titlebar-action active' : 'titlebar-action'} onClick={() => void toggleCompactMode()}>
          <Shrink size={14} />
          {compactMode ? '展开' : '迷你'}
        </button>
      </div>
      <main className={compactMode ? 'app-shell compact' : 'app-shell'}>
      <header className="topbar">
        <div>
          <p className="eyebrow">本地桌面计划</p>
          <h1>Date Todo</h1>
        </div>

        <label className="search-box">
          <Search size={18} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索标题、备注或标签"
          />
        </label>

        <button className="primary-button" onClick={() => setSelectedDate(todayString())}>
          今天
        </button>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <section className="layout">
        <aside className="sidebar">
          <div className="panel-title">
            <CalendarDays size={18} />
            <span>日期</span>
          </div>

          <input
            className="date-picker"
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
          />

          <div className="week-list">
            {weekDates.map((date) => (
              <button
                className={`week-day ${date === selectedDate ? 'active' : ''} ${date === todayString() ? 'today' : ''}`}
                key={date}
                onClick={() => setSelectedDate(date)}
              >
                <span>{new Date(`${date}T00:00:00`).toLocaleDateString('zh-CN', { weekday: 'short' })}</span>
                <strong>
                  {date === todayString() && <em>今天</em>}
                  {date.slice(5)}
                </strong>
              </button>
            ))}
          </div>

          <div className="panel-title spacing">
            <NotebookPen size={18} />
            <span>标签</span>
          </div>

          <button className={tagFilter === null ? 'tag-filter active' : 'tag-filter'} onClick={() => setTagFilter(null)}>
            全部标签
          </button>
          {allowedTags.map((tag) => (
            <button
              className={tagFilter === tag ? 'tag-filter active' : 'tag-filter'}
              key={tag}
              onClick={() => setTagFilter(tag)}
            >
              #{tag}
            </button>
          ))}
        </aside>

        <section className="task-area">
          <div className="date-heading">
            <div>
              <p className="eyebrow">{isSearchMode ? '搜索视图' : '日期视图'}</p>
              <h2>{isSearchMode ? '匹配的任务' : formatDateLabel(selectedDate)}</h2>
            </div>
            <div className="progress-block">
              <span>{progress}%</span>
              <div className="progress-track">
                <div style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>

          {selectedDateReadOnly && <div className="readonly-note">过去日期仅可查看，不能新增或修改任务。</div>}

          <div className={selectedDateReadOnly ? 'quick-add disabled' : 'quick-add'}>
            <Plus size={18} />
            <input
              value={newTitle}
              disabled={selectedDateReadOnly}
              onChange={(event) => setNewTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void createTodo()
                }
              }}
              placeholder={selectedDateReadOnly ? '过去日期只能查看' : `添加 ${selectedDate} 的任务`}
            />
            <button disabled={selectedDateReadOnly} onClick={() => void createTodo()}>
              添加
            </button>
          </div>

          <div className="task-list">
            {loading && <div className="empty-state">正在读取本地任务...</div>}

            {!loading && visibleTodos.length === 0 && (
              <div className="empty-state">
                {isSearchMode ? '没有找到匹配的任务，换个关键词试试。' : '这一天还没有任务，先写下一件想做的事。'}
              </div>
            )}

            {visibleTodos.map((todo) => (
              <article
                className={`${selectedId === todo.id ? 'task-item selected' : 'task-item'} ${
                  isPastDate(todo.date) ? 'read-only' : ''
                }`}
                key={todo.id}
                onClick={() => setSelectedId(todo.id)}
              >
                <button
                  className="check-button"
                  disabled={isPastDate(todo.date)}
                  onClick={(event) => {
                    event.stopPropagation()
                    void updateTodo(todo.id, { completed: !todo.completed })
                  }}
                  title={todo.completed ? '取消完成' : '标记完成'}
                >
                  {todo.completed ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                </button>

                <div className="task-content">
                  <div className="task-title-row">
                    <h3 className={todo.completed ? 'done' : ''}>{todo.title}</h3>
                    <span className={`priority priority-${todo.priority}`}>{priorityLabels[todo.priority]}</span>
                  </div>
                  <div className="task-meta">
                    <span>{todo.date}</span>
                    {todo.tags.map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                    {todo.note && <span>有备注</span>}
                  </div>
                </div>

                <button
                  className="icon-button danger"
                  disabled={isPastDate(todo.date)}
                  onClick={(event) => {
                    event.stopPropagation()
                    void deleteTodo(todo.id)
                  }}
                  title="删除任务"
                >
                  <Trash2 size={18} />
                </button>
              </article>
            ))}
          </div>
        </section>

        <aside className="detail-panel">
          <div className="stats-grid">
            <div>
              <span>今日完成</span>
              <strong>
                {completedToday}/{todayTodos.length}
              </strong>
            </div>
            <div>
              <span>本周完成</span>
              <strong>
                {completedWeek}/{weekTodos.length}
              </strong>
            </div>
            <div>
              <span>未完成</span>
              <strong>{activeCount}</strong>
            </div>
          </div>

          {selectedTodo ? (
            <div className="editor">
              <p className="eyebrow">任务详情</p>
              {selectedTodoReadOnly && <div className="readonly-note compact">过去任务仅可查看。</div>}
              <label>
                标题
                <input
                  value={selectedTodo.title}
                  disabled={selectedTodoReadOnly}
                  onChange={(event) => void updateTodo(selectedTodo.id, { title: event.target.value })}
                />
              </label>

              <label>
                优先级
                <select
                  value={selectedTodo.priority}
                  disabled={selectedTodoReadOnly}
                  onChange={(event) => void updateTodo(selectedTodo.id, { priority: event.target.value as Priority })}
                >
                  <option value="low">低</option>
                  <option value="medium">中</option>
                  <option value="high">高</option>
                </select>
              </label>

              <label>
                标签
                <select
                  value={selectedTodo.tags[0] ?? ''}
                  disabled={selectedTodoReadOnly}
                  onChange={(event) =>
                    void updateTodo(selectedTodo.id, {
                      tags: event.target.value ? [event.target.value as TodoTag] : []
                    })
                  }
                >
                  <option value="">无标签</option>
                  {allowedTags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                备注
                <textarea
                  value={noteDraft}
                  disabled={selectedTodoReadOnly}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  onBlur={() => {
                    if (!selectedTodoReadOnly && noteDraft !== selectedTodo.note) {
                      void updateTodo(selectedTodo.id, { note: noteDraft })
                    }
                  }}
                  placeholder="写一点上下文、想法或复盘。"
                />
              </label>
            </div>
          ) : (
            <div className="detail-empty">
              <NotebookPen size={26} />
              <h3>选择一个任务</h3>
              <p>在这里编辑优先级、标签和备注。</p>
            </div>
          )}
        </aside>
      </section>
      </main>
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
