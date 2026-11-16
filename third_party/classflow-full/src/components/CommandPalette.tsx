import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { CornerDownLeft, Search } from "lucide-react";

export interface CommandItem {
  id: string;
  label: string;
  group: string;
  hint?: string;
  shortcut?: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  commands: CommandItem[];
  onClose: () => void;
}

export function CommandPalette({ open, commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return commands;
    return commands.filter((command) =>
      `${command.label} ${command.hint ?? ""} ${command.group} ${command.shortcut ?? ""}`
        .toLowerCase()
        .includes(keyword),
    );
  }, [commands, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setIndex(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector<HTMLElement>("[data-active='true']");
    active?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (!open) return null;

  const run = (command: CommandItem) => {
    onClose();
    command.run();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIndex((current) => Math.min(Math.max(filtered.length - 1, 0), current + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIndex((current) => Math.max(0, current - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const command = filtered[index];
      if (command) run(command);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  let lastGroup = "";

  return (
    <div className="command-overlay" role="presentation" onMouseDown={onClose}>
      <div
        className="command-panel"
        role="dialog"
        aria-modal="true"
        aria-label="命令面板"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="command-search">
          <Search size={15} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索页面、课程或操作…"
            aria-label="搜索命令"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd>Ctrl K</kbd>
        </div>

        {filtered.length === 0 ? (
          <p className="command-empty">没有匹配的命令，换个关键词试试。</p>
        ) : (
          <ul className="command-list" ref={listRef} role="listbox" aria-label="可用命令">
            {filtered.map((command, itemIndex) => {
              const showGroup = command.group !== lastGroup;
              lastGroup = command.group;
              const active = itemIndex === index;
              return (
                <li key={command.id} role="presentation">
                  {showGroup ? <p className="command-group">{command.group}</p> : null}
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    data-active={active}
                    className={active ? "is-active" : ""}
                    onMouseEnter={() => setIndex(itemIndex)}
                    onClick={() => run(command)}
                  >
                    <span className="command-label">
                      {command.label}
                      {command.hint ? <small>{command.hint}</small> : null}
                    </span>
                    {command.shortcut ? <kbd>{command.shortcut}</kbd> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <footer className="command-foot">
          <span>
            <CornerDownLeft size={11} />
            执行
          </span>
          <span>↑↓ 选择</span>
          <span>Esc 关闭</span>
        </footer>
      </div>
    </div>
  );
}
