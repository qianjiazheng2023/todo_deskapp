import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CalendarDays, CheckCircle2, Circle, FileText, NotebookPen, Plus, Save, Search, Shrink, Trash2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { type MarkdownNote, type MarkdownNotePatch, type Priority, type Todo, type TodoPatch } from '../../shared/todo'
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

const toDateInputValue = (date: Date): string => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

const todayString = (): string => toDateInputValue(new Date())

const isPastDate = (dateValue: string): boolean => dateValue < todayString()

const formatDateLabel = (dateValue: string): string => {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  }).format(new Date(`${dateValue}T00:00:00`))
}

const formatUpdatedAt = (value: string): string => {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
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

const sortNotes = (notes: MarkdownNote[]): MarkdownNote[] => {
  return [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

const App = (): React.ReactElement => {
  const [todos, setTodos] = useState<Todo[]>([])
  const [notes, setNotes] = useState<MarkdownNote[]>([])
  const [selectedDate, setSelectedDate] = useState(todayString())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [todoNoteDraft, setTodoNoteDraft] = useState('')
  const [markdownDraft, setMarkdownDraft] = useState('')
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState('')
  const [noteMode, setNoteMode] = useState<'edit' | 'preview'>('edit')
  const [compactMode, setCompactMode] = useState(false)

  useEffect(() => {
    Promise.all([window.todoApi.list(), window.markdownNoteApi.list()])
      .then(([todoItems, noteItems]) => {
        setTodos(todoItems)
        setNotes(noteItems)
        setSelectedNoteId(noteItems[0]?.id ?? null)
        setError(null)
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false))
  }, [])

  const selectedTodo = useMemo(() => todos.find((todo) => todo.id === selectedId) ?? null, [selectedId, todos])
  const selectedNote = useMemo(() => notes.find((note) => note.id === selectedNoteId) ?? null, [notes, selectedNoteId])

  useEffect(() => {
    setTodoNoteDraft(selectedTodo?.note ?? '')
  }, [selectedTodo?.id])

  useEffect(() => {
    setMarkdownDraft(selectedNote?.content ?? '')
    setSaveMessage('')
    setNoteMode('edit')
  }, [selectedNote?.id])

  useEffect(() => {
    document.body.classList.toggle('compact-window', compactMode)
    return () => document.body.classList.remove('compact-window')
  }, [compactMode])

  const dateTodos = useMemo(() => sortTodos(todos.filter((todo) => todo.date === selectedDate)), [selectedDate, todos])

  const visibleTodos = useMemo(() => {
    const query = search.trim().toLowerCase()

    if (!query) {
      return dateTodos
    }

    return sortTodos(
      todos.filter((todo) => todo.title.toLowerCase().includes(query) || todo.note.toLowerCase().includes(query))
    )
  }, [dateTodos, search, todos])

  const todayTodos = useMemo(() => todos.filter((todo) => todo.date === todayString()), [todos])
  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate])
  const weekTodos = useMemo(() => todos.filter((todo) => weekDates.includes(todo.date)), [todos, weekDates])

  const completedToday = todayTodos.filter((todo) => todo.completed).length
  const completedWeek = weekTodos.filter((todo) => todo.completed).length
  const activeCount = todos.filter((todo) => !todo.completed).length
  const selectedCompleted = dateTodos.filter((todo) => todo.completed).length
  const progress = dateTodos.length ? Math.round((selectedCompleted / dateTodos.length) * 100) : 0
  const isSearchMode = Boolean(search.trim())
  const selectedDateReadOnly = isPastDate(selectedDate)
  const selectedTodoReadOnly = selectedTodo ? isPastDate(selectedTodo.date) : false

  const updateTodoInState = (next: Todo): void => {
    setTodos((items) => items.map((todo) => (todo.id === next.id ? next : todo)))
  }

  const updateNoteInState = (next: MarkdownNote): void => {
    setNotes((items) => sortNotes([next, ...items.filter((note) => note.id !== next.id)]))
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
      setSelectedNoteId(null)
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
      setSelectedId((currentId) => (currentId === id ? null : currentId))
      setError(null)
    } catch (reason) {
      setError((reason as Error).message)
    }
  }

  const createMarkdownNote = async (): Promise<void> => {
    try {
      const created = await window.markdownNoteApi.create({
        title: '未命名笔记',
        content: '# 未命名笔记\n\n'
      })
      setNotes((items) => [created, ...items])
      setSelectedNoteId(created.id)
      setSelectedId(null)
      setError(null)
    } catch (reason) {
      setError((reason as Error).message)
    }
  }

  const updateMarkdownNote = async (id: string, patch: MarkdownNotePatch): Promise<void> => {
    try {
      const updated = await window.markdownNoteApi.update(id, patch)
      updateNoteInState(updated)
      setError(null)
    } catch (reason) {
      setError((reason as Error).message)
    }
  }

  const saveMarkdownNote = async (): Promise<void> => {
    if (!selectedNote || savingNoteId) {
      return
    }

    try {
      setSavingNoteId(selectedNote.id)
      const updated = await window.markdownNoteApi.update(selectedNote.id, {
        title: selectedNote.title,
        content: markdownDraft
      })
      updateNoteInState(updated)
      setMarkdownDraft(updated.content)
      setSaveMessage('已保存')
      setError(null)
      window.setTimeout(() => setSaveMessage(''), 1800)
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setSavingNoteId(null)
    }
  }

  const openTodoDate = (date: string): void => {
    setSelectedDate(date)
    setSelectedNoteId(null)
    setSelectedId(null)
  }

  const deleteMarkdownNote = async (id: string): Promise<void> => {
    try {
      await window.markdownNoteApi.remove(id)
      setNotes((items) => items.filter((note) => note.id !== id))
      setSelectedNoteId((currentId) => (currentId === id ? null : currentId))
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
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索标题或备注" />
          </label>

          <button className="primary-button" onClick={() => openTodoDate(todayString())}>
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
              onChange={(event) => openTodoDate(event.target.value)}
            />

            <div className="week-list">
              {weekDates.map((date) => (
                <button
                  className={`week-day ${date === selectedDate ? 'active' : ''} ${date === todayString() ? 'today' : ''}`}
                  key={date}
                  onClick={() => openTodoDate(date)}
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
              <span>灵感日志</span>
            </div>

            <button className="note-create-button" onClick={() => void createMarkdownNote()}>
              <Plus size={16} />
              新建笔记
            </button>

            <div className="note-list">
              {notes.length === 0 && <div className="note-empty">还没有 Markdown 笔记。</div>}
              {notes.map((note) => (
                <button
                  className={selectedNoteId === note.id ? 'note-list-item active' : 'note-list-item'}
                  key={note.id}
                  onClick={() => {
                    setSelectedNoteId(note.id)
                    setSelectedId(null)
                  }}
                >
                  <span>{note.title}</span>
                  <time>修改于 {formatUpdatedAt(note.updatedAt)}</time>
                </button>
              ))}
            </div>
          </aside>

          <section className="task-area">
            {selectedNote ? (
              <div className="editor markdown-editor main-markdown-editor">
                <div className="editor-heading">
                  <div>
                    <p className="eyebrow">Markdown 笔记</p>
                    <h2>灵感日志</h2>
                  </div>
                  <button
                    className="icon-button danger"
                    onClick={() => void deleteMarkdownNote(selectedNote.id)}
                    title="删除笔记"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>

                <label>
                  文档名称
                  <input
                    value={selectedNote.title}
                    onChange={(event) => updateNoteInState({ ...selectedNote, title: event.target.value })}
                    onBlur={(event) => void updateMarkdownNote(selectedNote.id, { title: event.target.value })}
                  />
                </label>

                <div className="last-updated">
                  <FileText size={16} />
                  <span>最后修改：{formatUpdatedAt(selectedNote.updatedAt)}</span>
                  <div className="note-mode-toggle" aria-label="Markdown 显示模式">
                    <button
                      className={noteMode === 'edit' ? 'active' : ''}
                      onClick={() => setNoteMode('edit')}
                      type="button"
                    >
                      编辑
                    </button>
                    <button
                      className={noteMode === 'preview' ? 'active' : ''}
                      onClick={() => setNoteMode('preview')}
                      type="button"
                    >
                      预览
                    </button>
                  </div>
                  <button
                    className="save-note-button"
                    disabled={savingNoteId === selectedNote.id}
                    onClick={() => void saveMarkdownNote()}
                    title="保存笔记"
                  >
                    <Save size={16} />
                    {savingNoteId === selectedNote.id ? '保存中' : '保存'}
                  </button>
                  {saveMessage && <strong>{saveMessage}</strong>}
                </div>

                {noteMode === 'edit' ? (
                  <textarea
                    className="markdown-textarea"
                    value={markdownDraft}
                    onChange={(event) => setMarkdownDraft(event.target.value)}
                    onBlur={() => {
                      if (markdownDraft !== selectedNote.content) {
                        void updateMarkdownNote(selectedNote.id, { content: markdownDraft })
                      }
                    }}
                    placeholder="# 今天的想法&#10;&#10;- 想做一个..."
                    aria-label="Markdown 笔记内容"
                  />
                ) : (
                  <div className="markdown-preview">
                    {markdownDraft.trim() ? (
                      <ReactMarkdown>{markdownDraft}</ReactMarkdown>
                    ) : (
                      <p className="markdown-preview-empty">还没有内容。</p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <>
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
                  {loading && <div className="empty-state">正在读取本地数据...</div>}

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
                      onClick={() => {
                        setSelectedId(todo.id)
                        setSelectedNoteId(null)
                      }}
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
              </>
            )}
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
                  备注
                  <textarea
                    value={todoNoteDraft}
                    disabled={selectedTodoReadOnly}
                    onChange={(event) => setTodoNoteDraft(event.target.value)}
                    onBlur={() => {
                      if (!selectedTodoReadOnly && todoNoteDraft !== selectedTodo.note) {
                        void updateTodo(selectedTodo.id, { note: todoNoteDraft })
                      }
                    }}
                    placeholder="写一点上下文、想法或复盘。"
                  />
                </label>
              </div>
            ) : (
              <div className="detail-empty">
                <NotebookPen size={26} />
                <h3>{selectedNote ? '正在编辑笔记' : '选择一个任务'}</h3>
                <p>{selectedNote ? 'Markdown 笔记已在中间区域打开。' : '在这里编辑优先级和备注。'}</p>
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
