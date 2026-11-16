import { AlertTriangle } from "lucide-react";
import { courseDisplayName } from "../lib/schedule";
import type { SessionConflict } from "../lib/schedule";
import { WEEKDAYS } from "../lib/date";

interface ConflictBarProps {
  conflicts: SessionConflict[];
  showAliases: boolean;
}

export function ConflictBar({ conflicts, showAliases }: ConflictBarProps) {
  if (conflicts.length === 0) return null;
  return (
    <div className="conflict-bar" role="alert">
      <AlertTriangle size={15} />
      <div>
        <strong>{conflicts.length} 处时间冲突</strong>
        <div className="conflict-bar-list">
          {conflicts.slice(0, 3).map((item) => (
            <span key={`${item.a.id}:${item.b.id}`}>
              {WEEKDAYS[item.day - 1].label} 第{" "}
              {item.start === item.end ? item.start : `${item.start}–${item.end}`} 节 ·{" "}
              {courseDisplayName(item.a.course, showAliases)} ×{" "}
              {courseDisplayName(item.b.course, showAliases)}
            </span>
          ))}
          {conflicts.length > 3 ? <span>还有 {conflicts.length - 3} 处冲突…</span> : null}
        </div>
      </div>
    </div>
  );
}
