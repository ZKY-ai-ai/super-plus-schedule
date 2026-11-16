import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
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
/** 四条横向泳道轮转，连点时飘字错开落点，避免叠成一团看不清。 */
const MERIT_LANES = [32, 45, 58, 71];
const MERIT_POOL = 6;
const SPARK_POOL = 10;
const SPARK_SIZES = [5, 3.5, 4.5];

interface Mote {
  left: number;
  top: number;
  delay: number;
  duration: number;
  size: number;
}

const MOTES: Mote[] = [
  { left: 12, top: 78, delay: 0, duration: 9, size: 3 },
  { left: 24, top: 88, delay: 2.4, duration: 11, size: 2 },
  { left: 38, top: 82, delay: 5.1, duration: 8, size: 3 },
  { left: 55, top: 90, delay: 1.2, duration: 12, size: 2 },
  { left: 68, top: 80, delay: 4.3, duration: 9.5, size: 3 },
  { left: 80, top: 86, delay: 6.6, duration: 10, size: 2 },
  { left: 90, top: 76, delay: 3.2, duration: 8.5, size: 3 },
  { left: 46, top: 94, delay: 7.8, duration: 13, size: 2 },
];

function speedMood(speed: number): { label: string; tone: string } {
  if (speed < 0.5) return { label: "入定", tone: "calm" };
  if (speed < 2.5) return { label: "匀速", tone: "steady" };
  if (speed < 5) return { label: "疾风", tone: "fast" };
  return { label: "狂敲", tone: "wild" };
}

function formatCount(value: number): string {
  return value.toLocaleString("zh-CN");
}

/**
 * 木鱼本体：参考 clockhub 在线木鱼的扁平剪影风格——纯色鱼身、
 * 月牙口是左端圆厚、向右上收细直抵头部边缘的切口，不加眼睛鳞纹等附加细节。
 * 仅保留极轻的渐变与地面投影；动画只跑 transform/opacity，不触发重绘。
 */
function WoodenFishArt({ mouthRef }: { mouthRef: RefObject<SVGGElement | null> }) {
  return (
    <svg viewBox="0 0 448 190" role="img" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="wf-body" cx="0.42" cy="0.3" r="0.85">
          <stop offset="0" stopColor="#e4b77e" />
          <stop offset="0.55" stopColor="#d49c5c" />
          <stop offset="1" stopColor="#b97f42" />
        </radialGradient>
        <filter id="wf-blur" x="-60%" y="-200%" width="220%" height="500%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>

      {/* 地面投影 */}
      <ellipse cx="218" cy="170" rx="112" ry="7" fill="#3a2412" opacity="0.18" filter="url(#wf-blur)" />

      {/* 鱼身：圆头在右、尾部收尖在左下的纯色剪影 */}
      <path
        d="M106 148 C124 120 158 78 210 52 C232 41 258 38 282 46 C304 55 320 72 323 92 C326 112 314 130 292 141 C264 156 226 158 190 152 C158 147 128 155 106 148 Z"
        fill="url(#wf-body)"
      />

      {/* 月牙口：左端圆厚、向右上收细的切口 */}
      <g className="woodfish__mouth" ref={mouthRef}>
        <path
          d="M171 94 C222 87 276 81 314 79 C317.5 80 318 84.5 314.5 85.5 C270 95 220 107 186 123 C172 129.5 155 128 148 118 C143 110.5 146 99 156 94.5 C161 92 166 92.5 171 94 Z"
          fill="#241106"
        />
      </g>
    </svg>
  );
}

function MalletArt() {
  return (
    <svg viewBox="0 0 120 120" role="img" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="wf-mallet-head" x1="14" y1="74" x2="66" y2="112" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#e6b276" />
          <stop offset="1" stopColor="#8f5626" />
        </linearGradient>
        <linearGradient id="wf-mallet-stick" x1="99" y1="8" x2="55" y2="76" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#caa26b" />
          <stop offset="1" stopColor="#96662f" />
        </linearGradient>
      </defs>
      <path d="M99 8 55 76" stroke="url(#wf-mallet-stick)" strokeWidth="9.5" strokeLinecap="round" />
      <path d="M99 8 55 76" stroke="#ecc999" strokeWidth="2.6" strokeLinecap="round" opacity="0.55" />
      <g transform="rotate(-34 40 92)">
        <rect x="12" y="72" width="56" height="40" rx="20" fill="url(#wf-mallet-head)" stroke="#6f3c18" strokeWidth="1.6" />
        <ellipse cx="30" cy="82" rx="10" ry="6" fill="#ffe9c4" opacity="0.4" />
        <path d="M22 86h36M22 100h36" stroke="#f2cd9b" strokeWidth="2.2" strokeLinecap="round" opacity="0.3" />
        <path d="M12 84c8-5 16-6 24-5" stroke="#ffeecb" strokeWidth="1.6" strokeLinecap="round" opacity="0.4" fill="none" />
      </g>
    </svg>
  );
}

function AuraRing({ auraRef }: { auraRef: RefObject<SVGSVGElement | null> }) {
  return (
    <svg className="woodfish__aura" ref={auraRef} viewBox="0 0 320 320" aria-hidden="true" focusable="false">
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
  const statsRef = useRef<WoodfishStats | null>(null);
  if (statsRef.current === null) statsRef.current = loadWoodfish();

  const [soundOn, setSoundOn] = useState(statsRef.current.soundOn);

  const tapsRef = useRef<number[]>([]);
  const interactedRef = useRef(false);
  const audioRef = useRef<AudioContext | null>(null);
  const meritCursor = useRef(0);
  const rateCache = useRef(new Map<Element, number>());

  // 全部数值走 ref 直写 DOM，敲击与测速循环不触发 React 重渲染。
  const rootRef = useRef<HTMLDivElement | null>(null);
  const totalRef = useRef<HTMLElement | null>(null);
  const dayRef = useRef<HTMLElement | null>(null);
  const speedNumRef = useRef<HTMLSpanElement | null>(null);
  const speedBarRef = useRef<HTMLSpanElement | null>(null);
  const moodRef = useRef<HTMLSpanElement | null>(null);
  const hintRef = useRef<HTMLParagraphElement | null>(null);
  const auraRef = useRef<SVGSVGElement | null>(null);
  const orbitRef = useRef<HTMLSpanElement | null>(null);
  const bobRef = useRef<HTMLSpanElement | null>(null);
  const squashRef = useRef<HTMLSpanElement | null>(null);
  const mouthRef = useRef<SVGGElement | null>(null);
  const malletRef = useRef<HTMLSpanElement | null>(null);
  const trailRef = useRef<HTMLSpanElement | null>(null);
  const ringARef = useRef<HTMLSpanElement | null>(null);
  const ringBRef = useRef<HTMLSpanElement | null>(null);
  const flashRef = useRef<HTMLSpanElement | null>(null);
  const sparkRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const meritRefs = useRef<(HTMLSpanElement | null)[]>([]);

  const prefersReducedMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

  /** 常驻动画平滑变速：updatePlaybackRate 无缝衔接，不会像改 animation-duration 那样重启跳帧。 */
  const setRate = (el: Element | null, rate: number) => {
    if (!el) return;
    const prev = rateCache.current.get(el);
    if (prev !== undefined && Math.abs(prev - rate) < 0.04) return;
    rateCache.current.set(el, rate);
    for (const anim of el.getAnimations()) {
      if (anim instanceof CSSAnimation) {
        try {
          anim.updatePlaybackRate(rate);
        } catch {
          // 动画刚好被移除时忽略。
        }
      }
    }
  };

  /** 单元素补间：先取消上一次没放完的，让这一次完整重播；同一元素连击时新的覆盖旧的。 */
  const replay = (
    el: Element | null,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
  ) => {
    if (!el) return;
    el.getAnimations().forEach((anim) => anim.cancel());
    el.animate(keyframes, options);
  };

  /** 敲击冲击帧：木槌蓄力挥落 + 鱼身挤压回弹 + 双层声波 + 闪光 + 火星，全部 WAAPI 单次补间。 */
  const playImpact = useCallback(() => {
    if (prefersReducedMotion()) return;

    replay(
      malletRef.current,
      [
        { transform: "rotate(-16deg)" },
        { transform: "rotate(-31deg)", offset: 0.22 },
        { transform: "rotate(24deg)", offset: 0.46 },
        { transform: "rotate(6deg)", offset: 0.7 },
        { transform: "rotate(-16deg)" },
      ],
      { duration: 380, easing: "cubic-bezier(0.3, 0.8, 0.35, 1.1)" },
    );

    replay(
      trailRef.current,
      [
        { opacity: 0, transform: "rotate(-24deg) scale(0.7)" },
        { opacity: 0, transform: "rotate(-20deg) scale(0.8)", offset: 0.3 },
        { opacity: 0.9, transform: "rotate(10deg) scale(1.1)", offset: 0.52 },
        { opacity: 0, transform: "rotate(18deg) scale(1.25)" },
      ],
      { duration: 380, easing: "ease-out" },
    );

    replay(
      squashRef.current,
      [
        { transform: "scale(1, 1) rotate(0deg)" },
        { transform: "scale(1.07, 0.88) rotate(-2.4deg) translateY(6px)", offset: 0.28 },
        { transform: "scale(0.95, 1.07) rotate(1.8deg) translateY(-4px)", offset: 0.56 },
        { transform: "scale(1.02, 0.98) rotate(-0.6deg)", offset: 0.78 },
        { transform: "scale(1, 1) rotate(0deg)" },
      ],
      { duration: 320, easing: "cubic-bezier(0.22, 0.9, 0.32, 1.25)" },
    );

    replay(
      mouthRef.current,
      [
        { transform: "scaleY(1)" },
        { transform: "scaleY(1.5)", offset: 0.35 },
        { transform: "scaleY(1)" },
      ],
      { duration: 260, easing: "ease-out" },
    );

    replay(
      ringARef.current,
      [
        { opacity: 0.9, transform: "translate(-50%, -50%) scale(0.45)" },
        { opacity: 0, transform: "translate(-50%, -50%) scale(1.32)" },
      ],
      { duration: 640, easing: "cubic-bezier(0.16, 0.7, 0.3, 1)" },
    );
    replay(
      ringBRef.current,
      [
        { opacity: 0.75, transform: "translate(-50%, -50%) scale(0.45)" },
        { opacity: 0, transform: "translate(-50%, -50%) scale(1.32)" },
      ],
      { duration: 760, delay: 90, easing: "cubic-bezier(0.16, 0.7, 0.3, 1)" },
    );

    replay(
      flashRef.current,
      [
        { opacity: 0.95, transform: "scale(0.4)" },
        { opacity: 0, transform: "scale(1.5)" },
      ],
      { duration: 230, easing: "ease-out" },
    );

    // 火星方向每次敲击随机重排，避开固定轨迹的机械感。
    const seedAngle = Math.random() * Math.PI * 2;
    sparkRefs.current.forEach((el, i) => {
      if (!el) return;
      const angle = seedAngle + (i / SPARK_POOL) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
      const distance = 46 + Math.random() * 46;
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance * 0.8 - 14;
      el.getAnimations().forEach((anim) => anim.cancel());
      el.animate(
        [
          { opacity: 1, transform: "translate(0, 0) scale(1)" },
          {
            opacity: 0.9,
            transform: `translate(${dx * 0.55}px, ${dy * 0.55}px) scale(0.85)`,
            offset: 0.55,
          },
          { opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(0.15)` },
        ],
        { duration: 520 + Math.random() * 160, delay: i * 12, easing: "cubic-bezier(0.15, 0.6, 0.3, 1)" },
      );
    });
  }, []);

  /** 功德飘字：复用固定池里的泳道节点，不增删 DOM。 */
  const floatMerit = useCallback(() => {
    if (prefersReducedMotion()) return;
    const index = meritCursor.current % MERIT_POOL;
    const cursor = meritCursor.current;
    meritCursor.current += 1;
    const el = meritRefs.current[index];
    if (!el) return;
    el.textContent = MERIT_LABELS[cursor % MERIT_LABELS.length];
    el.style.left = `${MERIT_LANES[cursor % MERIT_LANES.length] + Math.random() * 4}%`;
    el.style.top = `${26 + Math.random() * 6}%`;
    replay(
      el,
      [
        { opacity: 0, transform: "translate(-50%, 10px) scale(0.85)" },
        { opacity: 1, transform: "translate(-50%, -6px) scale(1.06)", offset: 0.16 },
        { opacity: 0, transform: "translate(-50%, -64px) scale(1)" },
      ],
      { duration: 820, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)", fill: "forwards" },
    );
  }, []);

  const strike = useCallback(() => {
    const stats = statsRef.current;
    if (!stats) return;
    const now = Date.now();
    const next = tapWoodfish(stats, new Date(now));
    statsRef.current = next;
    saveWoodfish(next);
    if (totalRef.current) totalRef.current.textContent = formatCount(next.total);
    if (dayRef.current) dayRef.current.textContent = formatCount(next.dayCount);

    const taps = pruneTaps(tapsRef.current, now);
    taps.push(now);
    tapsRef.current = taps;

    if (!interactedRef.current) {
      interactedRef.current = true;
      hintRef.current?.classList.add("is-hidden");
    }

    playImpact();
    floatMerit();
    if (next.soundOn) playKnock();
  }, [playKnock, playImpact, floatMerit]);

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
    const stats = statsRef.current;
    if (!stats) return;
    const next = { ...stats, soundOn: !stats.soundOn };
    statsRef.current = next;
    setSoundOn(next.soundOn);
    saveWoodfish(next);
    if (next.soundOn) playKnock();
  };

  // 首帧把存量数字写进自管节点。
  useEffect(() => {
    const stats = statsRef.current;
    if (!stats) return;
    if (totalRef.current) totalRef.current.textContent = formatCount(stats.total);
    if (dayRef.current) dayRef.current.textContent = formatCount(stats.dayCount);
  }, []);

  useEffect(() => {
    // rAF 主循环：指数平滑的虚拟指针驱动仪表、光晕与动画速率，
    // 只写 CSS 变量和 textContent，全程零 setState、零重渲染。
    let frame = 0;
    let shown = 0;
    let lastText = "";
    let lastMoodTone = "";

    const setMood = (tone: string, label: string) => {
      if (moodRef.current) {
        moodRef.current.textContent = label;
        moodRef.current.className = `woodfish__mood is-${tone}`;
      }
    };

    const loop = () => {
      const now = Date.now();
      tapsRef.current = pruneTaps(tapsRef.current, now);
      const target = tapSpeed(tapsRef.current, now);
      // 升得快、落得慢：起手立刻响应，停手优雅滑落。
      shown += (target - shown) * (target > shown ? 0.5 : 0.16);
      if (target === 0 && shown < 0.06) shown = 0;

      const energy = Math.min(1, shown / 8);
      rootRef.current?.style.setProperty("--wf-energy", energy.toFixed(3));

      const text = shown.toFixed(1);
      if (text !== lastText) {
        lastText = text;
        if (speedNumRef.current) speedNumRef.current.textContent = text;
        if (speedBarRef.current) {
          speedBarRef.current.style.width = `${Math.min(100, (shown / METER_FULL_SPEED) * 100)}%`;
        }
      }
      const mood = speedMood(shown);
      if (mood.tone !== lastMoodTone) {
        lastMoodTone = mood.tone;
        setMood(mood.tone, mood.label);
      }

      // 经文环 / 轨道环 / 浮沉节奏随手速无缝加速。
      setRate(auraRef.current, 0.55 + energy * 2.45);
      setRate(orbitRef.current, 0.6 + energy * 1.8);
      setRate(bobRef.current, 0.85 + energy * 1.6);

      const rolled = rollWoodfishDay(statsRef.current as WoodfishStats, new Date(now));
      if (rolled !== statsRef.current) {
        statsRef.current = rolled;
        saveWoodfish(rolled);
        if (dayRef.current) dayRef.current.textContent = formatCount(rolled.dayCount);
      }

      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    return () => {
      const ctx = audioRef.current;
      audioRef.current = null;
      if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
    };
  }, []);

  return (
    <div className="woodfish" ref={rootRef}>
      <header className="woodfish__head">
        <h3>敲木鱼</h3>
        <p>功德 +1 · 烦恼 -1</p>
      </header>

      <div className="woodfish__stats" role="group" aria-label="敲木鱼统计">
        <div className="woodfish__stat">
          <span className="woodfish__stat-label">总计次数</span>
          <strong className="woodfish__stat-value" ref={totalRef} />
        </div>
        <div className="woodfish__stat">
          <span className="woodfish__stat-label">当日次数</span>
          <strong className="woodfish__stat-value" ref={dayRef} />
        </div>
        <div className="woodfish__stat woodfish__stat--speed">
          <span className="woodfish__stat-label">
            点击速度
            <span className="woodfish__mood is-calm" ref={moodRef}>
              入定
            </span>
          </span>
          <strong className="woodfish__stat-value">
            <span ref={speedNumRef}>0.0</span>
            <small>次/秒</small>
          </strong>
          <span className="woodfish__meter" aria-hidden="true">
            <span ref={speedBarRef} style={{ width: "0%" }} />
          </span>
        </div>
      </div>

      <div className="woodfish__stage">
        <span className="woodfish__glow" aria-hidden="true" />
        <AuraRing auraRef={auraRef} />
        <span className="woodfish__orbit" ref={orbitRef} aria-hidden="true" />

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

        {/* 常驻声波与冲击层：节点只建一次，每次敲击用 WAAPI 重播 */}
        <span className="woodfish__rings" aria-hidden="true">
          <span className="woodfish__ring" ref={ringARef} />
          <span className="woodfish__ring woodfish__ring--late" ref={ringBRef} />
        </span>

        <button
          type="button"
          className="woodfish__fish-button"
          aria-label="敲木鱼，功德加一"
          onPointerDown={handlePointerDown}
          onClick={handleClick}
        >
          <span className="woodfish__fish-bob" ref={bobRef}>
            <span className="woodfish__fish">
              <span className="woodfish__fish-squash" ref={squashRef}>
                <WoodenFishArt mouthRef={mouthRef} />
              </span>
            </span>
          </span>
        </button>

        <span className="woodfish__mallet" ref={malletRef} aria-hidden="true">
          <span className="woodfish__trail" ref={trailRef} />
          <MalletArt />
        </span>

        <span className="woodfish__burst" aria-hidden="true">
          <span className="woodfish__flash" ref={flashRef} />
          {Array.from({ length: SPARK_POOL }, (_, i) => (
            <span
              key={i}
              className={`woodfish__spark is-tone-${i % 3}`}
              ref={(el) => {
                sparkRefs.current[i] = el;
              }}
              style={{ width: SPARK_SIZES[i % 3], height: SPARK_SIZES[i % 3] }}
            />
          ))}
        </span>

        <div className="woodfish__merits" aria-hidden="true">
          {Array.from({ length: MERIT_POOL }, (_, i) => (
            <span
              key={i}
              className="woodfish__merit"
              ref={(el) => {
                meritRefs.current[i] = el;
              }}
            />
          ))}
        </div>

        <p className="woodfish__hint" ref={hintRef} aria-hidden="true">
          轻点木鱼
        </p>
      </div>

      <div className="woodfish__tools">
        <button
          type="button"
          className="woodfish__sound"
          onClick={toggleSound}
          aria-pressed={soundOn}
        >
          {soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
          {soundOn ? "声音开" : "声音关"}
        </button>
        <p className="woodfish__caption">
          敲击次数只保存在本机，点击速度是最近 1.5 秒的实时手速。
        </p>
      </div>
    </div>
  );
}
