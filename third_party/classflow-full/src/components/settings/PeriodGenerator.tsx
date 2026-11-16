import { useState } from "react";
import { WandSparkles } from "lucide-react";
import type { Period } from "../../types";
import { MAX_PERIODS, MIN_PERIODS, generatePeriods } from "../../lib/factory";
import { timeToMinutes } from "../../lib/date";

interface PeriodGeneratorProps {
  periods: Period[];
  onGenerate: (periods: Period[]) => void;
}

function gapBetween(from: string, to: string): number {
  return Math.max(0, timeToMinutes(to) - timeToMinutes(from));
}

export function PeriodGenerator({ periods, onGenerate }: PeriodGeneratorProps) {
  const first = periods[0];
  const second = periods[1];
  const [startTime, setStartTime] = useState(first?.start ?? "08:00");
  const [lesson, setLesson] = useState(() =>
    first ? Math.max(5, gapBetween(first.start, first.end)) : 45,
  );
  const [gap, setGap] = useState(() =>
    first && second ? gapBetween(first.end, second.start) : 10,
  );

  return (
    <div className="period-generator">
      <div className="period-generator-head">
        <div>
          <strong>按课时自动排时间</strong>
          <span>填好时长与课间，一次铺满当前 {periods.length} 节。</span>
        </div>
        <WandSparkles size={16} />
      </div>
      <div className="period-generator-grid">
        <label className="field">
          <span className="field-label">开始时间</span>
          <input
            className="field-input"
            type="time"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">每节分钟</span>
          <input
            className="field-input"
            type="number"
            min={5}
            max={240}
            value={lesson}
            onChange={(event) => setLesson(Number(event.target.value) || 5)}
          />
        </label>
        <label className="field">
          <span className="field-label">课间分钟</span>
          <input
            className="field-input"
            type="number"
            min={0}
            max={120}
            value={gap}
            onChange={(event) => setGap(Number(event.target.value) || 0)}
          />
        </label>
        <button
          className="small-button period-generator-apply"
          type="button"
          onClick={() =>
            onGenerate(
              generatePeriods({
                count: Math.min(MAX_PERIODS, Math.max(MIN_PERIODS, periods.length)),
                startTime,
                lessonMinutes: lesson,
                breakMinutes: gap,
              }),
            )
          }
        >
          生成时间表
        </button>
      </div>
      <p className="settings-note">
        生成后会覆盖当前方案的时间，可在下方逐节微调；保存设置后生效。
      </p>
    </div>
  );
}
