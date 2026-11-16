import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
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

interface Spark {
  id: number;
  dx: number;
  dy: number;
  size: number;
  delay: number;
  tone: number;
}

/** 用敲击序号做种子，保证同一次敲击的火星在重渲染时不跳变。 */
function makeSparks(seed: number): Spark[] {
  const sparks: Spark[] = [];
  for (let i = 0; i < 9; i++) {
    const angle = (i / 9) * Math.PI * 2 + (((seed * 37 + i * 13) % 10) / 10) * 0.7;
    const distance = 52 + ((seed * 53 + i * 29) % 48);
    sparks.push({
      id: i,
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance * 0.82 - 16,
      size: 3 + ((seed * 17 + i * 7) % 4),
      delay: i * 13,
      tone: i % 3,
    });
  }
  return sparks;
}

function speedMood(speed: number): { label: string; tone: string } {
  if (speed < 0.5) return { label: "入定", tone: "calm" };
  if (speed < 2.5) return { label: "匀速", tone: "steady" };
  if (speed < 5) return { label: "疾风", tone: "fast" };
  return { label: "狂敲", tone: "wild" };
}

const MOTES = [
  { left: 12, top: 78, delay: 0, duration: 9, size: 3 },
  { left: 24, top: 88, delay: 2.4, duration: 11, size: 2 },
  { left: 38, top: 82, delay: 5.1, duration: 8, size: 3 },
  { left: 55, top: 90, delay: 1.2, duration: 12, size: 2 },
  { left: 68, top: 80, delay: 4.3, duration: 9.5, size: 3 },
  { left: 80, top: 86, delay: 6.6, duration: 10, size: 2 },
  { left: 90, top: 76, delay: 3.2, duration: 8.5, size: 3 },
  { left: 46, top: 94, delay: 7.8, duration: 13, size: 2 },
];

function formatCount(value: number): string {
  return value.toLocaleString("zh-CN");
}

function WoodenFishArt() {
  return (
    <svg viewBox="0 0 240 200" role="img" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="woodfish-body" x1="56" y1="58" x2="198" y2="168" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#e2a768" />
          <stop offset="0.5" stopColor="#b2743a" />
          <stop offset="1" stopColor="#7c441d" />
        </linearGradient>
        <linearGradient id="woodfish-tail" x1="20" y1="50" x2="96" y2="146" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#b5763c" />
          <stop offset="1" stopColor="#6e3b17" />
        </linearGradient>
        <radialGradient id="woodfish-gloss" cx="0.33" cy="0.18" r="0.7">
          <stop offset="0" stopColor="#ffe9c4" stopOpacity="0.8" />
          <stop offset="1" stopColor="#ffe9c4" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="woodfish-slit" cx="0.5" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#241106" />
          <stop offset="1" stopColor="#432312" />
        </radialGradient>
        <filter id="woodfish-shadow" x="-50%" y="-120%" width="200%" height="340%">
          <feGaussianBlur stdDeviation="4.5" />
        </filter>
      </defs>

      <ellipse cx="128" cy="176" rx="66" ry="9" fill="#3a2412" opacity="0.3" filter="url(#woodfish-shadow)" />

      <g className="woodfish__tail">
        <path
          d="M82 118C58 112 32 92 18 58c-2-5 2-8 7-6 16 7 34 10 48 22 9 8 15 18 16 28 1 6-2 10-7 16Z"
          fill="url(#woodfish-tail)"
        />
        <path
          d="M80 122C62 124 44 118 30 104c14-2 30 0 42 8 4 3 6 6 8 10Z"
          fill="#8a5226"
          opacity="0.85"
        />
        <path d="M40 66c12 12 24 26 32 40" stroke="#5d3214" strokeWidth="2.4" strokeLinecap="round" opacity="0.45" fill="none" />
      </g>

      <ellipse cx="128" cy="112" rx="70" ry="54" fill="url(#woodfish-body)" />
      <ellipse cx="128" cy="112" rx="70" ry="54" fill="url(#woodfish-gloss)" />

      <path d="M64 138c16 19 44 28 71 24" stroke="#6b3a17" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.34" />
      <path d="M78 126c12 10 28 15 44 14" stroke="#f3c78e" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.3" />
      <path d="M92 150c16 8 36 10 53 5" stroke="#f0c088" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.22" />
      <path d="M70 96c6-14 18-24 32-28" stroke="#8a5226" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.35" />

      <g className="woodfish__mouth">
        <path
          d="M120 74c24-6 50-2 68 9 2 1 2 3 0 4-19 5-43 1-60-8-4-2-7-3-8-5Z"
          fill="url(#woodfish-slit)"
        />
        <path d="M131 79c18-2 37 1 49 7" stroke="#612f13" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.55" />
      </g>

      <g className="woodfish__eye">
        <circle cx="106" cy="98" r="5.4" fill="#2b1508" />
        <circle cx="107.8" cy="96.2" r="1.8" fill="#ffe9c9" opacity="0.92" />
      </g>
      <path d="M96 90c4-4 10-6 16-5" stroke="#6b3a17" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.4" />
    </svg>
  );
}

function MalletArt() {
  return (
    <svg viewBox="0 0 120 120" role="img" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="woodfish-mallet-head" x1="14" y1="74" x2="66" y2="112" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#dca76a" />
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

function AuraRing() {
  return (
    <svg className="woodfish__aura" viewBox="0 0 320 320" aria-hidden="true" focusable="false">
      <defs>
        <path
          id="woodfish-aura-path"
          d="M160 160 m -126 0 a 126 126 0 1 1 252 0 a 126 126 0 1 1 -252 0"
        />
      </defs>
      <text className="woodfish__aura-text">
        <textPath href="#woodfish-aura-path" startOffset="0">
          功德 +1 · 烦恼 -1 · 心平气和 · 今日顺遂 · 功德 +1 · 烦恼 -1 · 心平气和 · 今日顺遂 ·
        </textPath>
      </text>
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

  const sparks = useMemo(() => makeSparks(strikes), [strikes]);
  const energy = Math.min(1, speed / 8);
  const mood = speedMood(speed);

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
    // 四条横向泳道轮转，连点时飘字错开落点，避免叠成一团看不清。
    const lane = id % 4;
    setMerits((current) => [
      ...current.slice(-5),
      {
        id,
        x: [32, 45, 58, 71][lane] + Math.random() * 4,
        y: 28 + Math.random() * 5,
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
  const rootStyle = {
    "--wf-energy": energy.toFixed(3),
    "--wf-spin": `${(16 - energy * 11).toFixed(2)}s`,
    "--wf-bob": `${(3.4 - energy * 1.7).toFixed(2)}s`,
  } as CSSProperties;

  return (
    <div className="woodfish" style={rootStyle}>
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
          <span className="woodfish__stat-label">
            点击速度
            <span className={`woodfish__mood is-${mood.tone}`}>{mood.label}</span>
          </span>
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
        <AuraRing />
        <span className="woodfish__orbit" aria-hidden="true" />

        <span className="woodfish__smoke woodfish__smoke--a" aria-hidden="true" />
        <span className="woodfish__smoke woodfish__smoke--b" aria-hidden="true" />
        <span className="woodfish__smoke woodfish__smoke--c" aria-hidden="true" />

        <span className="woodfish__motes" aria-hidden="true">
          {MOTES.map((mote, index) => (
            <span
              key={index}
              className="woodfish__mote"
              style={
                {
                  left: `${mote.left}%`,
                  top: `${mote.top}%`,
                  width: mote.size,
                  height: mote.size,
                  animationDelay: `${mote.delay}s`,
                  animationDuration: `${mote.duration}s`,
                } as CSSProperties
              }
            />
          ))}
        </span>

        {strikes > 0 ? (
          <span key={`rings-${strikes}`} className="woodfish__rings" aria-hidden="true">
            <span className="woodfish__ring" />
            <span className="woodfish__ring woodfish__ring--late" />
          </span>
        ) : null}

        <button
          type="button"
          className="woodfish__fish-button"
          aria-label="敲木鱼，功德加一"
          onPointerDown={handlePointerDown}
          onClick={handleClick}
        >
          <span className="woodfish__fish-bob">
            <span key={`fish-${strikes}`} className={`woodfish__fish${strikes > 0 ? " is-struck" : ""}`}>
              <WoodenFishArt />
            </span>
          </span>
        </button>

        <span
          key={`mallet-${strikes}`}
          className={`woodfish__mallet${strikes > 0 ? " is-striking" : ""}`}
          aria-hidden="true"
        >
          <MalletArt />
        </span>

        {strikes > 0 ? (
          <span key={`burst-${strikes}`} className="woodfish__burst" aria-hidden="true">
            <span className="woodfish__flash" />
            {sparks.map((spark) => (
              <span
                key={spark.id}
                className={`woodfish__spark is-tone-${spark.tone}`}
                style={
                  {
                    "--dx": `${spark.dx}px`,
                    "--dy": `${spark.dy}px`,
                    width: spark.size,
                    height: spark.size,
                    animationDelay: `${spark.delay}ms`,
                  } as CSSProperties
                }
              />
            ))}
          </span>
        ) : null}

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
