import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  CURSOR_RIPPLE_SPACING,
  DUCK_RIPPLE_SPACING,
  DUCK_RIPPLE_STRENGTH,
  DUCK_SPAWN,
  DUCK_SIZE_RATIO,
  chaseStep,
  clampFrameSeconds,
  rescalePoint,
  rippleDue,
  wanderTarget,
  type DuckPoint,
  type DuckPose,
} from "../../lib/playground";

const VERTEX_SHADER = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

// 水面着色器：程序化泳池底色 + 焦散，涟漪用「三环笔刷扩散包」模型
// （笔刷随时间扩张、按 500^(-age/2.4) 衰减，参数对齐原版彩蛋的手感）。
const FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uAspect;
uniform float uBrush;
uniform vec4 uRipples[24];

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = p * 2.02 + 13.7;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = vUv;
  vec2 p = vec2(uv.x * uAspect, uv.y);

  vec2 rippleShift = vec2(0.0);
  float rippleLight = 0.0;
  for (int i = 0; i < 24; i++) {
    vec4 rp = uRipples[i];
    if (rp.w <= 0.001) continue;
    float age = uTime - rp.z;
    if (age < 0.0 || age > 2.4) continue;
    vec2 delta = p - vec2(rp.x * uAspect, rp.y);
    float d = length(delta) + 0.0001;
    float grow = exp(-age * 1.09);
    float scale = rp.w * (6.6 - 5.1 * grow);
    float radius = scale * uBrush * 0.5;
    float rr = d / radius;
    if (rr > 1.0) continue;
    float opacity = exp(-age * 6.2146081 / 2.4);
    float envelope = (exp(-5.0 * rr * rr) - 0.0067379) / 0.9932620;
    float rings = 0.55 + 0.45 * cos(sqrt(rr) * 18.8495559);
    float amount = envelope * rings * opacity * opacity;
    rippleShift += (delta / d) * amount * 0.015;
    rippleLight += amount;
  }

  float t = uTime * 0.05;
  vec2 flow = vec2(t * 1.2, -t * 0.75);

  vec2 q = (p + rippleShift) * 2.4 + flow;
  float warp = fbm(q * 0.8 + vec2(t * 0.5, -t * 0.35));
  q += (warp - 0.5) * 0.68;

  float n1 = fbm(q * 2.4 + vec2(t * 1.7, -t * 0.9));
  float n2 = fbm(q * 4.2 - vec2(t * 1.1, t * 0.6));

  float v1 = 1.0 - abs(sin(q.x * 2.4 + q.y * 1.7 + n1 * 3.1 + t * 2.1));
  v1 = pow(v1, 45.0);
  float v2 = 1.0 - abs(sin(q.y * 3.1 - q.x * 2.2 + n2 * 2.5 - t * 1.7));
  v2 = pow(v2, 60.0);
  float v3 = 1.0 - abs(sin((q.x + q.y) * 1.8 + n1 * 3.6 + t * 1.2));
  v3 = pow(v3, 80.0);
  float caustic = v1 * 1.05 + v2 * 0.70 + v3 * 0.48;

  float depth = fbm(p * 1.6 + vec2(uTime * 0.012, -uTime * 0.008));
  vec3 deep = vec3(0.07, 0.42, 0.86);
  vec3 mid = vec3(0.13, 0.55, 0.93);
  vec3 shallow = vec3(0.36, 0.72, 1.0);
  vec3 color = mix(deep, mid, smoothstep(0.10, 0.92, depth));
  color = mix(color, shallow, smoothstep(0.60, 1.05, depth) * 0.6);

  float glow = fbm(p * 2.4 + vec2(uTime * 0.02, uTime * 0.015));
  color += vec3(0.08, 0.32, 0.66) * glow * 0.24;
  color = mix(color, vec3(0.87, 0.97, 1.0), caustic * 0.9);
  // 轨迹光晕：只保留轻微的亮度和反射提升，避免拖动鸭子后水面泛白。
  color += vec3(0.88, 0.97, 1.0) * min(rippleLight, 1.4) * 0.26;
  color *= 1.0 + min(rippleLight, 1.4) * 0.12;

  vec2 centered = uv - 0.5;
  float vignette = smoothstep(0.95, 0.26, length(centered * vec2(0.85, 1.35)));
  color *= mix(0.84, 1.0, vignette);

  gl_FragColor = vec4(color, 1.0);
}
`;

const RIPPLE_SLOTS = 24;
/** 原版笔刷直径 172px（设计稿尺度），渲染时换算成水面纹理坐标。 */
const BRUSH_SIZE_PX = 172;
const RIPPLE_LIFETIME = 2.4;

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

interface WaterPoint {
  x: number;
  y: number;
  t: number;
  strength: number;
}

interface WaterInput {
  points: WaterPoint[];
}

function WaterCanvas({ inputRef }: { inputRef: { current: WaterInput } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    if (fallback) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: "low-power",
    });
    if (!gl) {
      setFallback(true);
      return;
    }

    const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) {
      setFallback(true);
      return;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setFallback(true);
      return;
    }

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const positionLocation = gl.getAttribLocation(program, "aPosition");
    const timeLocation = gl.getUniformLocation(program, "uTime");
    const aspectLocation = gl.getUniformLocation(program, "uAspect");
    const brushLocation = gl.getUniformLocation(program, "uBrush");
    const rippleLocation = gl.getUniformLocation(program, "uRipples");
    gl.useProgram(program);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pixelRatio = Math.min(1.6, window.devicePixelRatio || 1);
    let frame = 0;
    let startedAt = performance.now();
    let pausedAt = 0;
    const activeRipples: { x: number; y: number; start: number; strength: number }[] = [];
    const rippleData = new Float32Array(RIPPLE_SLOTS * 4);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width * pixelRatio));
      const height = Math.max(1, Math.round(rect.height * pixelRatio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
      if (rect.height > 0) {
        // 172px 笔刷直径换算成水面 p 空间（p.y 纵向铺满画布高度）。
        gl.useProgram(program);
        gl.uniform1f(
          brushLocation,
          (BRUSH_SIZE_PX * (canvas.width / Math.max(1, rect.width))) / canvas.height,
        );
      }
    };

    const draw = (now: number) => {
      const seconds = reducedMotion ? 8 : (now - startedAt) / 1000;
      const pending = inputRef.current?.points;
      if (pending && pending.length && !reducedMotion) {
        for (const point of pending) {
          const startAt = (point.t - startedAt) / 1000;
          if (startAt >= 0 && startAt <= seconds + 0.05) {
            if (activeRipples.length >= RIPPLE_SLOTS) {
              activeRipples.shift();
            }
            activeRipples.push({ x: point.x, y: point.y, start: startAt, strength: point.strength });
          }
        }
        pending.length = 0;
      }
      for (let i = activeRipples.length - 1; i >= 0; i--) {
        if (seconds - activeRipples[i].start > RIPPLE_LIFETIME) activeRipples.splice(i, 1);
      }
      rippleData.fill(0);
      for (let i = 0; i < activeRipples.length; i++) {
        const ripple = activeRipples[i];
        rippleData[i * 4] = ripple.x;
        rippleData[i * 4 + 1] = ripple.y;
        rippleData[i * 4 + 2] = ripple.start;
        rippleData[i * 4 + 3] = ripple.strength;
      }
      gl.useProgram(program);
      gl.uniform1f(timeLocation, seconds);
      gl.uniform1f(aspectLocation, canvas.width / Math.max(1, canvas.height));
      gl.uniform4fv(rippleLocation, rippleData);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!reducedMotion) frame = window.requestAnimationFrame(draw);
    };

    const start = () => {
      if (reducedMotion || frame) return;
      startedAt = performance.now() - pausedAt;
      frame = window.requestAnimationFrame(draw);
    };

    const stop = () => {
      if (!frame) return;
      pausedAt = performance.now() - startedAt;
      window.cancelAnimationFrame(frame);
      frame = 0;
    };

    const observer = new ResizeObserver(() => {
      resize();
      if (reducedMotion) draw(performance.now());
    });
    observer.observe(canvas);
    resize();
    draw(performance.now());

    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      stop();
      setFallback(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    canvas.addEventListener("webglcontextlost", onContextLost);

    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      gl.deleteBuffer(buffer);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      gl.deleteProgram(program);
    };
  }, [fallback]);

  if (fallback) {
    return <div className="qqq-playground__water qqq-playground__water--fallback" aria-hidden="true" />;
  }
  return <canvas ref={canvasRef} className="qqq-playground__water" aria-hidden="true" />;
}

/**
 * 俯视视角的小黄鸭：鸭头朝向图片下方（前进方向），
 * 旋转角交给 headingRotation，让鸭头始终指向移动方向。
 */
function TopDuck() {
  return (
    <svg viewBox="0 0 160 160" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="qqq-duck-body" x1="80" y1="22" x2="80" y2="132" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffe985" />
          <stop offset="0.52" stopColor="#ffd537" />
          <stop offset="1" stopColor="#f6b31a" />
        </linearGradient>
        <linearGradient id="qqq-duck-beak" x1="72" y1="112" x2="88" y2="132" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffbb52" />
          <stop offset="1" stopColor="#f0820f" />
        </linearGradient>
        <radialGradient id="qqq-duck-gloss" cx="0.32" cy="0.24" r="0.6">
          <stop offset="0" stopColor="#fffdf0" stopOpacity="0.85" />
          <stop offset="1" stopColor="#fffdf0" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* 尾巴绒毛：鸭头朝下时尾巴在图片顶端 */}
      <path d="M80 12c-5 7-5 14 0 19 5-5 5-12 0-19Z" fill="#f6b31a" />
      {/* 身体与两侧翅膀绒毛 */}
      <circle cx="34" cy="74" r="15" fill="url(#qqq-duck-body)" />
      <circle cx="126" cy="74" r="15" fill="url(#qqq-duck-body)" />
      <ellipse cx="80" cy="70" rx="46" ry="44" fill="url(#qqq-duck-body)" />
      {/* 头部：朝下 */}
      <circle cx="80" cy="97" r="30" fill="url(#qqq-duck-body)" />
      {/* 背部高光 */}
      <ellipse cx="62" cy="48" rx="26" ry="16" fill="url(#qqq-duck-gloss)" transform="rotate(-16 62 48)" />
      {/* 眼睛 */}
      <circle cx="68" cy="104" r="4.6" fill="#241d12" />
      <circle cx="92" cy="104" r="4.6" fill="#241d12" />
      <circle cx="69.6" cy="102.4" r="1.5" fill="#fffdf4" opacity="0.95" />
      <circle cx="93.6" cy="102.4" r="1.5" fill="#fffdf4" opacity="0.95" />
      {/* 嘴：指向行进方向（图片下方） */}
      <ellipse cx="80" cy="124" rx="13" ry="10" fill="url(#qqq-duck-beak)" />
      <path d="M70 124c6 3 14 3 20 0" stroke="#cf6c09" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.6" />
    </svg>
  );
}

interface StageSize {
  width: number;
  height: number;
}

export function QqqPlayground() {
  const pondRef = useRef<HTMLDivElement>(null);
  const duckRef = useRef<HTMLSpanElement>(null);
  const waterInput = useRef<WaterInput>({ points: [] });
  const [hintGone, setHintGone] = useState(false);

  // 引擎共享状态：渲染循环与指针处理器都要读写，放在 ref 里避免重挂载。
  const pondSizeRef = useRef<StageSize>({ width: 0, height: 0 });
  const duckWidthRef = useRef(0);
  const poseRef = useRef<DuckPose>({ x: 0, y: 0, rotation: 0, visible: false });
  const pointerInsideRef = useRef(false);
  const cursorTargetRef = useRef<DuckPoint | null>(null);
  const wanderRef = useRef<DuckPoint | null>(null);
  const duckRippleAnchorRef = useRef<DuckPoint | null>(null);
  const cursorRippleAnchorRef = useRef<DuckPoint | null>(null);

  /** 把指针事件换算成泳池内像素坐标。 */
  const toPond = useCallback((clientX: number, clientY: number): DuckPoint | null => {
    const pond = pondRef.current;
    if (!pond) return null;
    const rect = pond.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  /** 往水面里撒一圈涟漪（泳池像素 → shader 的 uv 坐标）。 */
  const emitWaterRipple = useCallback((point: DuckPoint, strength: number) => {
    const pond = pondRef.current;
    if (!pond) return;
    const rect = pond.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const points = waterInput.current.points;
    points.push({
      x: point.x / rect.width,
      y: 1 - point.y / rect.height,
      t: performance.now(),
      strength,
    });
    if (points.length > 64) points.splice(0, points.length - 64);
  }, []);

  useEffect(() => {
    const pond = pondRef.current;
    const duck = duckRef.current;
    if (!pond || !duck) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rect = pond.getBoundingClientRect();
    pondSizeRef.current = { width: rect.width, height: rect.height };
    duckWidthRef.current = rect.width * DUCK_SIZE_RATIO;
    // 原版入场点：宽 48.95%、高 57.24%；第一次移动前鸭子不显示。
    poseRef.current = {
      x: rect.width * DUCK_SPAWN.x,
      y: rect.height * DUCK_SPAWN.y,
      rotation: 0,
      visible: false,
    };

    const applyPose = () => {
      const pose = poseRef.current;
      duck.style.left = `${pose.x}px`;
      duck.style.top = `${pose.y}px`;
      duck.style.transform = `translate(-50%, -50%) rotate(${pose.rotation}deg)`;
      duck.style.opacity = pose.visible ? "1" : "0";
    };
    applyPose();

    if (reducedMotion) {
      // 减弱动效：小鸭停在入场点，水面保持静态，不做追踪与漫游。
      poseRef.current = { ...poseRef.current, visible: true };
      applyPose();
      return;
    }

    let lastTime = 0;
    let frame = 0;
    const tick = (now: number) => {
      frame = window.requestAnimationFrame(tick);
      const size = pondSizeRef.current;
      const dt = clampFrameSeconds(lastTime ? (now - lastTime) / 1000 : 0);
      lastTime = now;
      const chasing = pointerInsideRef.current && cursorTargetRef.current !== null;
      if (!wanderRef.current && !chasing) {
        wanderRef.current = wanderTarget(size.width, size.height, duckWidthRef.current);
      }
      const target = chasing ? (cursorTargetRef.current as DuckPoint) : (wanderRef.current as DuckPoint);
      const step = chaseStep(poseRef.current, target, dt, chasing);
      if (step.arrived) {
        if (!chasing) {
          // 到达漫游目标就换下一个点，小鸭自己一直游。
          wanderRef.current = wanderTarget(size.width, size.height, duckWidthRef.current);
        }
        return;
      }
      poseRef.current = { ...step.next, rotation: step.rotation, visible: true };
      if (rippleDue(duckRippleAnchorRef.current, poseRef.current, DUCK_RIPPLE_SPACING)) {
        emitWaterRipple(poseRef.current, DUCK_RIPPLE_STRENGTH);
        duckRippleAnchorRef.current = { x: poseRef.current.x, y: poseRef.current.y };
      }
      applyPose();
    };
    frame = window.requestAnimationFrame(tick);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const next = { width: entry.contentRect.width, height: entry.contentRect.height };
      if (next.width <= 0 || next.height <= 0) return;
      const from = { ...pondSizeRef.current };
      pondSizeRef.current = next;
      duckWidthRef.current = next.width * DUCK_SIZE_RATIO;
      const pose = poseRef.current;
      const migrated = pose.visible
        ? rescalePoint(pose, from, next)
        : { x: next.width * DUCK_SPAWN.x, y: next.height * DUCK_SPAWN.y };
      poseRef.current = { ...pose, ...migrated };
      wanderRef.current = wanderRef.current ? rescalePoint(wanderRef.current, from, next) : null;
      duckRippleAnchorRef.current = duckRippleAnchorRef.current
        ? rescalePoint(duckRippleAnchorRef.current, from, next)
        : null;
      cursorRippleAnchorRef.current = null;
      applyPose();
    });
    observer.observe(pond);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [emitWaterRipple]);

  /** 鼠标/笔进入泳池：小鸭开始追踪指针，涟漪锚点重置（对齐原版）。 */
  const enterPond = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    const point = toPond(event.clientX, event.clientY);
    if (!point) return;
    pointerInsideRef.current = true;
    cursorTargetRef.current = point;
    duckRippleAnchorRef.current = null;
    cursorRippleAnchorRef.current = null;
    setHintGone(true);
  };

  /** 指针在泳池里移动：更新追踪目标，并按 12px 间距往水面撒涟漪。 */
  const movePond = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    const point = toPond(event.clientX, event.clientY);
    if (!point) return;
    pointerInsideRef.current = true;
    cursorTargetRef.current = point;
    duckRippleAnchorRef.current = null;
    if (rippleDue(cursorRippleAnchorRef.current, point, CURSOR_RIPPLE_SPACING)) {
      emitWaterRipple(point, 1);
      cursorRippleAnchorRef.current = point;
    }
    setHintGone(true);
  };

  /** 指针离开泳池：小鸭改回自主漫游，重新挑一个随机目标。 */
  const leavePond = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    pointerInsideRef.current = false;
    cursorTargetRef.current = null;
    wanderRef.current = null;
    cursorRippleAnchorRef.current = null;
  };

  /** 触屏：按住拖动等于「指针在泳池里」，松手后小鸭继续漫游。 */
  const touchDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") return;
    const point = toPond(event.clientX, event.clientY);
    if (!point) return;
    pointerInsideRef.current = true;
    cursorTargetRef.current = point;
    duckRippleAnchorRef.current = null;
    cursorRippleAnchorRef.current = point;
    emitWaterRipple(point, 1);
    setHintGone(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const touchUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") return;
    pointerInsideRef.current = false;
    cursorTargetRef.current = null;
    wanderRef.current = null;
    cursorRippleAnchorRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className="qqq-playground">
      <header className="qqq-playground__head">
        <h3>QQQ 游乐场</h3>
        <p>海阔凭鸭跃、天高任鸟飞</p>
      </header>

      <div
        ref={pondRef}
        className="qqq-playground__stage"
        role="group"
        aria-label="QQQ 游乐场泳池。把鼠标放进泳池，小鸭就会追着指针游；移开后它自己四处漫游。"
        onPointerEnter={enterPond}
        onPointerMove={movePond}
        onPointerLeave={leavePond}
        onPointerDown={touchDown}
        onPointerUp={touchUp}
        onPointerCancel={touchUp}
      >
        <WaterCanvas inputRef={waterInput} />

        <span ref={duckRef} className="qqq-playground__duck" aria-hidden="true">
          <TopDuck />
        </span>

        <p className={`qqq-playground__hint${hintGone ? " is-hidden" : ""}`} aria-hidden="true">
          移动鼠标带小鸭游 · 划过水面
        </p>
      </div>

      <p className="qqq-playground__caption">
        一个没有成绩、没有 DDL 的角落。把鼠标放进泳池，小鸭就会追着你游；你离开时，它自己闲逛。
      </p>
    </div>
  );
}
