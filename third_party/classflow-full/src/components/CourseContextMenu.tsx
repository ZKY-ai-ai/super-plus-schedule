import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CalendarClock, ClipboardPaste, Copy, Pencil, Scissors } from "lucide-react";

interface CourseContextMenuProps {
  x: number;
  y: number;
  courseName: string;
  clipboardName: string | null;
  onClose: () => void;
  onEdit: () => void;
  onAdjust: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
}

export function CourseContextMenu({
  x,
  y,
  courseName,
  clipboardName,
  onClose,
  onEdit,
  onAdjust,
  onCopy,
  onCut,
  onPaste,
}: CourseContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const margin = 8;
    setPosition({
      left: Math.min(Math.max(margin, x), window.innerWidth - rect.width - margin),
      top: Math.min(Math.max(margin, y), window.innerHeight - rect.height - margin),
    });
  }, [x, y]);

  useEffect(() => {
    const handlePointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const handleViewport = () => onClose();
    document.addEventListener("pointerdown", handlePointer, true);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("resize", handleViewport);
    window.addEventListener("scroll", handleViewport, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointer, true);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", handleViewport);
      window.removeEventListener("scroll", handleViewport, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="course-context-menu"
      role="menu"
      aria-label={`课程操作：${courseName}`}
      style={{ left: position.left, top: position.top }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <p className="course-context-title" title={courseName}>
        {courseName}
      </p>
      <button className="course-context-item" role="menuitem" type="button" onClick={onEdit}>
        <Pencil size={15} />
        修改课程信息
      </button>
      <button className="course-context-item" role="menuitem" type="button" onClick={onAdjust}>
        <CalendarClock size={15} />
        调整这一次课
      </button>
      <span className="course-context-divider" role="separator" />
      <button className="course-context-item" role="menuitem" type="button" onClick={onCopy}>
        <Copy size={15} />
        复制课程
      </button>
      <button className="course-context-item" role="menuitem" type="button" onClick={onCut}>
        <Scissors size={15} />
        剪切课程
      </button>
      <button
        className="course-context-item"
        role="menuitem"
        type="button"
        disabled={!clipboardName}
        onClick={onPaste}
      >
        <ClipboardPaste size={15} />
        {clipboardName ? `粘贴「${clipboardName}」` : "粘贴课程"}
      </button>
    </div>
  );
}