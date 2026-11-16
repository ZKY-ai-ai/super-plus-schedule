import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { Volume2, VolumeX } from "lucide-react";
import {
  loadWoodfish,
  pruneTaps,
  rollWoodfishDay,
  saveWoodfish,
  tapSpeed,
  tapWoodfish,
  type WoodfishStats,
} from "../../lib/woodfish";

/** 手速进度条画到 10 次/秒就满了，再快也只算满格。 */
const METER_FULL_SPEED = 10;
const MERIT_LABELS = ["功德 +1", "烦恼 -1", "今日顺遂", "心平气和"];

interface MeritFloat {
  id: number;
  x: number;
  y: number;
  label: string;
}

function formatCount(value: number): string {
  return value.toLocaleString("zh-CN");
}

function WoodenFishArt() {
  return (
    <svg viewBox="0 0 240 200" role="img" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="woodfish-body" x1="56" y1="58" x2="198" y2="168" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#d99a5c" />
          <stop offset="0.52" stopColor="#b2743a" />
          <stop offset="1" stopColor="#7f471f" />
        </linearGradient>
        <linearGradient id="woodfish-tail" x1="24" y1="54" x2="92" y2="142" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#a96a34" />
          <stop offset="1" stopColor="#6e3b17" />
        </linearGradient>
        <radialGradient id="woodfish-gloss" cx="0.33" cy="0.2" r="0.68">
          <stop offset="0" stopColor="#ffe4bd" stopOpacity="0.72" />
          <stop offset="1" stopColor="#ffe4bd" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="woodfish-slit" cx="0.5" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#2a1408" />
          <stop offset="1" stopColor="#432312" />
        </radialGradient>
        <filter id="woodfish-shadow" x="-50%" y="-120%" width="200%" height="340%">
          <feGaussianBlur stdDeviation="4.5" />
        </filter>
      </defs>

      <ellipse cx="128" cy="178" rx="70" ry="10" fill="#3a2412" opacity="0.3" filter="url(#woodfish-shadow)" />

      <path
        d="M78 116C56 106 34 84 24 52c23 7 44 20 58 40 5 7 7 15 5 24-3 6-6 8-9 0Z"
        fill="url(#woodfish-tail)"
      />
      <path d="M43 67c11 12 21 24 29 38" stroke="#5d3214" strokeWidth="2.5" strokeLinecap="round" opacity="0.45" fill="none" />

      <ellipse cx="128" cy="112" rx="70" ry="54" fill="url(#woodfish-body)" />
      <ellipse cx="128" cy="112" rx="70" ry="54" fill="url(#woodfish-gloss)" />
      <path d="M66 139c16 18 43 27 69 23" stroke="#6b3a17" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.34" />
      <path d="M79 127c12 10 28 15 43 14" stroke="#f3c78e" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.3" />

      <path
        d="M120 74c24-6 50-2 68 9 2 1 2 3 0 4-19 5-43 1-60-8-4-2-7-3-8-5Z"
        fill="url(#woodfish-slit)"
      />
      <path d="M131 79c18-2 37 1 49 7" stroke="#612f13" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.55" />

      <circle cx="108" cy="98" r="5.2" fill="#2b1508" />
      <circle cx="109.7" cy="96.3" r="1.7" fill="#ffe9c9" opacity="0.9" />
      <path d="M91 148c16 8 36 10 53 5" stroke="#f0c088" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.22" />
    </svg>
  );
}

function MalletArt() {
  return (
    <svg viewBox="0 0 120 120" role="img" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="woodfish-mallet-head" x1="16" y1="78" x2="62" y2="112" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#d8a163" />
          <stop offset="1" stopColor="#8f5626" />
        </linearGradient>
      </defs>
      <path d="M97 10 53 78" stroke="#a06b36" strokeWidth="9" strokeLinecap="round" />
      <path d="M97 10 53 78" stroke="#d6a166" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
      <g transform="rotate(-34 40 92)">
        <rect x="14" y="74" width="52" height="36" rx="18" fill="url(#woodfish-mallet-head)" stroke="#6f3c18" strokeWidth="1.6" />
        <path d="M25 84h30M25 100h30" stroke="#f2cd9b" strokeWidth="2.2" strokeLinecap="round" opacity="0.32" />
      </g>
    </svg>
  );
}

export function Woodfish() {
  const [stats, setStats] = useState<WoodfishStats>(() => loadWoodfish());
  const statsRef = useRef(stats);
  const [speed, setSpeed] = useState(0);
  const tapsRef = useRef<number[]>([]);
  const [strikes, setStrikes] = useState(0);
  const [merits, setMerits] = useState<MeritFloat[]>([]);
  const meritId = useRef(0);
  const [interacted, setInteracted] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);

  const playKnock = useCallback(() => {
    try {
      const Ctor: typeof AudioContext | undefined =
        typeof window.AudioContext === "function"
          ? window.AudioContext
          : (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      let ctx = audioRef.current;
      if (!ctx || ctx.state === "closed") {
        ctx = new Ctor({ latencyHint: "interactive" });
        audioRef.current = ctx;
      }
      if (ctx.state === "suspended") void ctx.resume();

      const start = ctx.currentTime;
      const body = ctx.createOscillator();
      body.type = "sine";
      body.frequency.setValueAtTime(330, start);
      body.frequency.exponentialRampToValueAtTime(118, start + 0.085);
      const bodyGain = ctx.createGain();
      bodyGain.gain.setValueAtTime(0.0001, start);
      bodyGain.gain.exponentialRampToValueAtTime(0.26, start + 0.007);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      body.connect(bodyGain).connect(ctx.destination);
      body.start(start);
      body.stop(start + 0.18);

      const knock = ctx.createOscillator();
      knock.type = "triangle";
      knock.frequency.setValueAtTime(880, start);
      knock.frequency.exponentialRampToValueAtTime(440, start + 0.03);
      const knockGain = ctx.createGain();
      knockGain.gain.setValueAtTime(0.0001, start);
      knockGain.gain.exponentialRampToValueAtTime(0.08, start + 0.003);
      knockGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.05);
      knock.connect(knockGain).connect(ctx.destination);
      knock.start(start);
      knock.stop(start + 0.06);
    } catch {
      // 没有音频输出时安静降级，不影响敲击与计数。
    }
  }, []);

  const strike = useCallback(() => {
    const now = Date.now();
    const next = tapWoodfish(statsRef.current, new Date(now));
    statsRef.current = next;
    setStats(next);
    saveWoodfish(next);

    const taps = pruneTaps(tapsRef.current, now);
    taps.push(now);
    tapsRef.current = taps;
    setSpeed(tapSpeed(taps, now));

    setStrikes((value) => value + 1);
    setInteracted(true);
    const id = ++meritId.current;
    setMerits((current) => [
      ...current.slice(-7),
      {
        id,
        x: 44 + Math.random() * 16,
        y: 30 + Math.random() * 10,
        label: MERIT_LABELS[id % MERIT_LABELS.length],
      },
    ]);

    if (next.soundOn) playKnock();
  }, [playKnock]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    strike();
  };

  const handleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    // 指针敲击已在 pointerdown 记账；键盘 Enter/Space 的 click 没有指针细节，需要补一次。
    if (event.detail === 0) strike();
  };

  const toggleSound = () => {
    const next = { ...statsRef.current, soundOn: !statsRef.current.soundOn };
    statsRef.current = next;
    setStats(next);
    saveWoodfish(next);
    if (next.soundOn) playKnock();
  };

  useEffect(() => {
    // 每 120ms 刷新一次实时手速；窗口滑空后速度自然归零，同时处理跨天清零。
    const timer = window.setInterval(() => {
      const now = Date.now();
      tapsRef.current = pruneTaps(tapsRef.current, now);
      setSpeed(tapSpeed(tapsRef.current, now));
      const rolled = rollWoodfishDay(statsRef.current, new Date(now));
      if (rolled !== statsRef.current) {
        statsRef.current = rolled;
        setStats(rolled);
        saveWoodfish(rolled);
      }
    }, 120);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      const ctx = audioRef.current;
      audioRef.current = null;
      if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
    };
  }, []);

  const meterWidth = Math.min(100, (speed / METER_FULL_SPEED) * 100);

  return (
    <div className="woodfish">
      <header className="woodfish__head">
        <h3>敲木鱼</h3>
        <p>功德 +1 · 烦恼 -1</p>
      </header>

      <div className="woodfish__stats" role="group" aria-label="敲木鱼统计">
        <div className="woodfish__stat">
          <span className="woodfish__stat-label">总计次数</span>
          <strong className="woodfish__stat-value">{formatCount(stats.total)}</strong>
        </div>
        <div className="woodfish__stat">
          <span className="woodfish__stat-label">当日次数</span>
          <strong className="woodfish__stat-value">{formatCount(stats.dayCount)}</strong>
        </div>
        <div className="woodfish__stat woodfish__stat--speed">
          <span className="woodfish__stat-label">点击速度</span>
          <strong className="woodfish__stat-value">
            {speed.toFixed(1)}
            <small>次/秒</small>
          </strong>
          <span className="woodfish__meter" aria-hidden="true">
            <span style={{ width: `${meterWidth}%` }} />
          </span>
        </div>
      </div>

      <div className="woodfish__stage">
        <span className="woodfish__glow" aria-hidden="true" />
        {strikes > 0 ? <span key={`ring-${strikes}`} className="woodfish__ring" aria-hidden="true" /> : null}

        <button
          type="button"
          className="woodfish__fish-button"
          aria-label="敲木鱼，功德加一"
          onPointerDown={handlePointerDown}
          onClick={handleClick}
        >
          <span key={`fish-${strikes}`} className={`woodfish__fish${strikes > 0 ? " is-struck" : ""}`}>
            <WoodenFishArt />
          </span>
        </button>

        <span
          key={`mallet-${strikes}`}
          className={`woodfish__mallet${strikes > 0 ? " is-striking" : ""}`}
          aria-hidden="true"
        >
          <MalletArt />
        </span>

        <div className="woodfish__merits" aria-hidden="true">
          {merits.map((merit) => (
            <span
              key={merit.id}
              className="woodfish__merit"
              style={{ left: `${merit.x}%`, top: `${merit.y}%` }}
              onAnimationEnd={() =>
                setMerits((current) => current.filter((item) => item.id !== merit.id))
              }
            >
              {merit.label}
            </span>
          ))}
        </div>

        <p className={`woodfish__hint${interacted ? " is-hidden" : ""}`} aria-hidden="true">
          轻点木鱼
        </p>
      </div>

      <div className="woodfish__tools">
        <button
          type="button"
          className="woodfish__sound"
          onClick={toggleSound}
          aria-pressed={stats.soundOn}
        >
          {stats.soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
          {stats.soundOn ? "声音开" : "声音关"}
        </button>
        <p className="woodfish__caption">
          敲击次数只保存在本机，点击速度是最近 1.5 秒的实时手速。
        </p>
      </div>
    </div>
  );
}
