import { useMemo, useState } from "react";
import { ClipboardList, FileJson, Plus, Trash2 } from "lucide-react";
import type { Course } from "../../types";
import { useClock } from "../../hooks/useClock";
import {
  describeDue,
  groupTasks,
  loadTasks,
  makeTask,
  parseTasksJson,
  saveTasks,
  taskCountdown,
  type Task,
  type TaskBucket,
} from "../../lib/tasks";

interface TasksSettingsTabProps {
  timetableId: string;
  courses: Course[];
}

const BUCKETS: Array<{ id: TaskBucket; label: string; hint: string }> = [
  { id: "overdue", label: "已逾期", hint: "需要尽快处理" },
  { id: "today", label: "今天", hint: "今天截止" },
  { id: "tomorrow", label: "明天", hint: "明天截止" },
  { id: "upcoming", label: "未来七天", hint: "还有几天" },
  { id: "later", label: "更远", hint: "可以稍后安排" },
  { id: "undated", label: "无截止日期", hint: "想起来再做" },
];

interface TaskNotice {
  tone: "success" | "error" | "info";
  message: string;
}

export function TasksSettingsTab({ timetableId, courses }: TasksSettingsTabProps) {
  const now = useClock();
  const [tasks, setTasks] = useState<Task[]>(() => loadTasks(timetableId));
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [importText, setImportText] = useState("");
  const [notice, setNotice] = useState<TaskNotice | null>(null);

  const courseName = useMemo(() => {
    const map = new Map(courses.map((course) => [course.id, course.name]));
    return (id: string | null) => (id ? map.get(id) ?? "" : "");
  }, [courses]);

  const persist = (next: Task[], message?: string) => {
    setTasks(next);
    const ok = saveTasks(timetableId, next);
    if (!ok) {
      setNotice({ tone: "error", message: "保存失败，浏览器可能禁用了本地存储。" });
      return;
    }
    if (message) setNotice({ tone: "success", message });
  };

  const handleAdd = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setNotice({ tone: "error", message: "先写一个任务标题。" });
      return;
    }
    const task = makeTask({
      title: trimmed,
      courseId: courseId || null,
      dueDate,
      dueTime: dueDate ? dueTime : "",
    });
    persist([task, ...tasks], `已添加「${task.title}」。`);
    setTitle("");
    setDueTime("");
  };

  const toggleDone = (id: string) => {
    const timestamp = new Date().toISOString();
    persist(
      tasks.map((task) =>
        task.id === id ? { ...task, done: !task.done, updatedAt: timestamp } : task,
      ),
    );
  };

  const removeTask = (id: string) => {
    persist(tasks.filter((task) => task.id !== id));
  };

  const handleImport = () => {
    const result = parseTasksJson(importText);
    if (!result.ok) {
      setNotice({ tone: "error", message: result.error ?? "导入失败。" });
      return;
    }
    const ids = new Set(tasks.map((task) => task.id));
    const additions = result.tasks.map((task) =>
      ids.has(task.id)
        ? makeTask({
            title: task.title,
            courseId: task.courseId,
            dueDate: task.dueDate,
            dueTime: task.dueTime,
            note: task.note,
          })
        : task,
    );
    persist([...additions, ...tasks], `已导入 ${additions.length} 条任务。`);
    setImportText("");
  };

  const activeTasks = tasks.filter((task) => !task.done);
  const doneTasks = tasks.filter((task) => task.done);
  const groups = groupTasks(activeTasks, now);

  const renderTask = (task: Task, muted = false) => {
    const countdown = taskCountdown(task, now);
    const linked = courseName(task.courseId);
    return (
      <div className={`task-item ${muted ? "is-done" : ""}`} key={task.id}>
        <label className="task-check">
          <input
            type="checkbox"
            checked={task.done}
            onChange={() => toggleDone(task.id)}
            aria-label={`标记「${task.title}」${task.done ? "未完成" : "已完成"}`}
          />
          <span className="task-checkmark" aria-hidden="true" />
        </label>
        <div className="task-body">
          <span className="task-title">{task.title}</span>
          <span className="task-meta">
            {linked ? <span className="task-course">{linked}</span> : null}
            <span>{describeDue(task)}</span>
            {task.note ? <span className="task-note">{task.note}</span> : null}
          </span>
        </div>
        {muted ? null : (
          <span className={`task-badge task-badge--${countdown.tone}`}>{countdown.text}</span>
        )}
        <button
          className="icon-button task-delete"
          type="button"
          onClick={() => removeTask(task.id)}
          aria-label={`删除任务「${task.title}」`}
        >
          <Trash2 size={13} />
        </button>
      </div>
    );
  };

  return (
    <section
      className="settings-pane tasks-pane"
      onKeyDown={(event) => {
        const target = event.target;
        if (
          event.key === "Enter" &&
          !(target instanceof HTMLTextAreaElement) &&
          !(target instanceof HTMLButtonElement)
        ) {
          event.preventDefault();
        }
      }}
    >
      <div className="settings-pane-head">
        <p className="eyebrow">TASKS</p>
        <h3>作业与截止</h3>
        <p>把作业和 DDL 记在这里，按逾期、今天、明天自动分组并显示倒计时。</p>
      </div>

      {notice ? (
        <p className={`inline-notice inline-notice--${notice.tone}`} role="status">
          {notice.message}
        </p>
      ) : null}

      <div className="form-grid task-form">
        <label className="field field--wide">
          <span className="field-label">任务标题</span>
          <input
            className="field-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：交数据结构第三次作业"
            maxLength={80}
          />
        </label>
        <label className="field">
          <span className="field-label">关联课程</span>
          <select
            className="field-input"
            value={courseId}
            onChange={(event) => setCourseId(event.target.value)}
          >
            <option value="">不关联课程</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">截止日期</span>
          <input
            className="field-input"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">截止时间</span>
          <input
            className="field-input"
            type="time"
            value={dueTime}
            onChange={(event) => setDueTime(event.target.value)}
            disabled={!dueDate}
          />
          <small className="field-hint">不填则按当天结束计算倒计时。</small>
        </label>
        <div className="task-form-actions">
          <button className="primary-button" type="button" onClick={handleAdd}>
            <Plus size={15} />
            添加任务
          </button>
        </div>
      </div>

      <details className="task-import">
        <summary>
          <FileJson size={14} />
          从 JSON 导入任务
        </summary>
        <textarea
          className="field-input task-import-input"
          rows={4}
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
          placeholder={'[{"title":"实验报告","dueDate":"2026-12-01","dueTime":"23:59"}]'}
        />
        <div className="task-import-foot">
          <small>支持标题、dueDate、dueTime、courseId、note 字段。</small>
          <button className="secondary-button" type="button" onClick={handleImport}>
            导入
          </button>
        </div>
      </details>

      {activeTasks.length === 0 && doneTasks.length === 0 ? (
        <div className="task-empty">
          <ClipboardList size={18} />
          <span>还没有任务。用上面的表单加一条，或从 JSON 导入。</span>
        </div>
      ) : null}

      {BUCKETS.map((bucket) => {
        const items = groups[bucket.id];
        if (items.length === 0) return null;
        return (
          <div className={`task-group task-group--${bucket.id}`} key={bucket.id}>
            <div className="task-group-head">
              <strong>{bucket.label}</strong>
              <span>{items.length} 项 · {bucket.hint}</span>
            </div>
            <div className="task-list">{items.map((task) => renderTask(task))}</div>
          </div>
        );
      })}

      {doneTasks.length > 0 ? (
        <details className="task-done-group">
          <summary>已完成 {doneTasks.length} 项</summary>
          <div className="task-list">{doneTasks.map((task) => renderTask(task, true))}</div>
        </details>
      ) : null}
    </section>
  );
}