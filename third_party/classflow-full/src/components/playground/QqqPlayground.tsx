import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import {
  clampDuckPosition,
  duckTiltFromDelta,
  rippleRadius,
  type DuckPosition,
} from "../../lib/playground";

const VERTEX_SHADER = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uAspect;
uniform vec4 uRipples[8];

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
  for (int i = 0; i < 8; i++) {
    vec4 rp = uRipples[i];
    if (rp.w <= 0.001) continue;
    float age = uTime - rp.z;
    if (age < 0.0 || age > 3.2) continue;
    vec2 delta = p - vec2(rp.x * uAspect, rp.y);
    float d = length(delta) + 0.0001;
    float phase = d * 52.0 - age * 18.0;
    float swell = sin(phase) * exp(-d * 6.0) * exp(-age * 2.2) * rp.w;
    float fine = sin(d * 120.0 - age * 30.0) * exp(-d * 10.0) * exp(-age * 2.8) * rp.w;
    float crest = pow(max(sin(phase), 0.0), 3.0) * exp(-d * 5.0) * exp(-age * 1.8) * rp.w;
    rippleShift += (delta / d) * (swell * 0.012 + fine * 0.005);
    rippleLight += crest * 0.3 + abs(fine) * 0.05;
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
  vec3 deep = vec3(0.05, 0.36, 0.75);
  vec3 mid = vec3(0.10, 0.50, 0.90);
  vec3 shallow = vec3(0.30, 0.68, 0.98);
  vec3 color = mix(deep, mid, smoothstep(0.10, 0.92, depth));
  color = mix(color, shallow, smoothstep(0.60, 1.05, depth) * 0.6);

  float glow = fbm(p * 2.4 + vec2(uTime * 0.02, uTime * 0.015));
  color += vec3(0.08, 0.32, 0.66) * glow * 0.24;
  color = mix(color, vec3(0.84, 0.97, 1.0), caustic * 0.9);
  color += vec3(0.86, 0.97, 1.0) * max(rippleLight, 0.0) * 0.9;
  color *= 1.0 + rippleLight * 0.45;

  vec2 centered = uv - 0.5;
  float vignette = smoothstep(0.95, 0.26, length(centered * vec2(0.85, 1.35)));
  color *= mix(0.82, 1.0, vignette);

  gl_FragColor = vec4(color, 1.0);
}
`;

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
    const rippleData = new Float32Array(32);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width * pixelRatio));
      const height = Math.max(1, Math.round(rect.height * pixelRatio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    };

    const draw = (now: number) => {
      const seconds = reducedMotion ? 8 : (now - startedAt) / 1000;
      const pending = inputRef.current?.points;
      if (pending && pending.length) {
        for (const point of pending) {
          const startAt = (point.t - startedAt) / 1000;
          if (startAt >= 0 && startAt <= seconds + 0.05) {
            if (activeRipples.length >= 8) {
              const oldest = activeRipples[0];
              oldest.start = Math.min(oldest.start, startAt - 1.4);
            }
            activeRipples.push({ x: point.x, y: point.y, start: startAt, strength: point.strength });
          }
        }
        pending.length = 0;
      }
      for (let i = activeRipples.length - 1; i >= 0; i--) {
        if (seconds - activeRipples[i].start > 3.2) activeRipples.splice(i, 1);
      }
      while (activeRipples.length > 8) activeRipples.shift();
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

function RubberDuck() {
  return (
    <svg viewBox="0 0 160 160" role="img" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="qqq-duck-body" x1="54" y1="34" x2="106" y2="118" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffe985" />
          <stop offset="0.52" stopColor="#ffd537" />
          <stop offset="1" stopColor="#f6b31a" />
        </linearGradient>
        <linearGradient id="qqq-duck-beak" x1="104" y1="72" x2="130" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffbb52" />
          <stop offset="1" stopColor="#f0820f" />
        </linearGradient>
        <radialGradient id="qqq-duck-gloss" cx="0.34" cy="0.2" r="0.62">
          <stop offset="0" stopColor="#fffdf0" stopOpacity="0.92" />
          <stop offset="1" stopColor="#fffdf0" stopOpacity="0" />
        </radialGradient>
        <filter id="qqq-duck-shadow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.4" />
        </filter>
      </defs>
      <ellipse cx="84" cy="130" rx="31" ry="7.5" fill="#6f8cb4" opacity="0.38" filter="url(#qqq-duck-shadow)" />
      <circle cx="50" cy="86" r="11.5" fill="url(#qqq-duck-body)" />
      <ellipse cx="76" cy="94" rx="40" ry="27" fill="url(#qqq-duck-body)" />
      <circle cx="90" cy="56" r="31" fill="url(#qqq-duck-body)" />
      <path
        d="M64 62c1-17 14-30 30-30 8 0 15 3 20 8-6-3-13-4-20-2-12 3-20 12-23 24-1 4-1 8 0 11-5-3-7-7-7-11Z"
        fill="url(#qqq-duck-gloss)"
      />
      <path
        d="M50 106c14 6 33 6 47 1 5-2 9-5 12-8-1 10-10 17-22 19-16 2-30-4-37-12Z"
        fill="#ee9c12"
        opacity="0.45"
      />
      <circle cx="102" cy="52" r="7" fill="#241d12" />
      <circle cx="104" cy="49.4" r="2.3" fill="#fffdf4" opacity="0.95" />
      <path
        d="M110 67c12-2 27 2 28 10 1 8-12 13-27 10-4-5-5-15-1-20Z"
        fill="url(#qqq-duck-beak)"
      />
      <path d="M113 78c7 2 16 2 23 1" stroke="#cf6c09" strokeWidth="1.8" strokeLinecap="round" opacity="0.6" />
      <path d="M56 97c11 4 27 4 38 0" stroke="#e7a516" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.55" />
    </svg>
  );
}

interface Ripple {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
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

interface DragState {
  pointerId: number;
  lastX: number;
  lastY: number;
  startX: number;
  startY: number;
  moved: boolean;
}

export function QqqPlayground() {
  const stageRef = useRef<HTMLDivElement>(null);
  const duckRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const rippleId = useRef(0);
  const waterInput = useRef<WaterInput>({ points: [] });
  const waterDragging = useRef(false);
  const lastWaterAt = useRef(0);
  const followRef = useRef<{ x: number; y: number } | null>(null);

  const [position, setPosition] = useState<DuckPosition>({ x: 50, y: 49 });
  const [tilt, setTilt] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const [ripples, setRipples] = useState<Ripple[]>([]);

  const addRipple = useCallback((x: number, y: number, delay = 0) => {
    const duckSize = duckRef.current?.getBoundingClientRect().width ?? 64;
    const size = rippleRadius(duckSize);
    const id = ++rippleId.current;
    setRipples((current) => [...current.slice(-7), { id, x, y, size, delay }]);
  }, []);

  const pushWater = useCallback((clientX: number, clientY: number, strength: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    const points = waterInput.current.points;
    points.push({ x, y: 1 - y, t: performance.now(), strength });
    if (points.length > 48) points.splice(0, points.length - 48);
  }, []);

  /** 鼠标只要在泳池里，小鸭就直接跟到指针下，不再需要按住拖动。 */
  const followDuck = useCallback((clientX: number, clientY: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const previous = followRef.current;
    followRef.current = { x: clientX, y: clientY };
    if (previous) {
      setTilt(duckTiltFromDelta(clientX - previous.x, clientY - previous.y));
    }
    setPosition(
      clampDuckPosition(
        ((clientX - rect.left) / rect.width) * 100,
        ((clientY - rect.top) / rect.height) * 100,
      ),
    );
    setInteracted(true);
  }, []);

  const handleStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    waterDragging.current = true;
    lastWaterAt.current = performance.now();
    pushWater(event.clientX, event.clientY, 1);
    if (event.pointerType !== "touch") {
      followDuck(event.clientX, event.clientY);
    }
    const target = event.target as HTMLElement | null;
    if (!target?.closest(".qqq-playground__duck")) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const handleStagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const isTouch = event.pointerType === "touch";
    if (isTouch && !waterDragging.current) return;

    const now = performance.now();
    const throttle = isTouch ? 55 : 90;
    if (now - lastWaterAt.current >= throttle) {
      lastWaterAt.current = now;
      pushWater(event.clientX, event.clientY, isTouch ? 0.85 : 0.7);
    }

    if (isTouch) return;
    followDuck(event.clientX, event.clientY);
    setDragging(true);
  };

  const handleStagePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    waterDragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleStagePointerLeave = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    followRef.current = null;
    setDragging(false);
  };

  const celebrate = useCallback(() => {
    setTilt(0);
    setInteracted(true);
    addRipple(position.x, position.y, 0);
    addRipple(position.x, position.y, 180);
  }, [addRipple, position.x, position.y]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    if (event.pointerType === "touch") {
      event.preventDefault();
      setDragging(true);
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) {
      drag.moved = true;
    }
    if (event.pointerType !== "touch") return;
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    const next = clampDuckPosition(
      ((event.clientX - rect.left) / rect.width) * 100,
      ((event.clientY - rect.top) / rect.height) * 100,
    );
    setPosition(next);
    setTilt(duckTiltFromDelta(dx, dy));
    setInteracted(true);
  };

  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.pointerType === "touch") {
      setDragging(false);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!drag.moved) {
      celebrate();
    } else {
      setInteracted(true);
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const step = 3;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowRight":
      case "ArrowUp":
      case "ArrowDown": {
        event.preventDefault();
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        setPosition((current) => clampDuckPosition(current.x + dx, current.y + dy));
        setTilt(dx * 2 + dy * 0.8);
        setInteracted(true);
        break;
      }
      case "Home": {
        event.preventDefault();
        setPosition({ x: 50, y: 49 });
        setTilt(0);
        setInteracted(true);
        break;
      }
      case "Enter":
      case " ": {
        event.preventDefault();
        celebrate();
        break;
      }
      default:
        break;
    }
  };

  const duckStyle = {
    left: `${position.x}%`,
    top: `${position.y}%`,
    "--duck-tilt": `${tilt}deg`,
  } as CSSProperties;

  return (
    <div className="qqq-playground">
      <header className="qqq-playground__head">
        <h3>QQQ 游乐场</h3>
        <p>海阔凭鸭跃、天高任鸟飞</p>
      </header>

      <div
        ref={stageRef}
        className={`qqq-playground__stage${dragging ? " is-dragging" : ""}`}
        role="group"
        aria-label="QQQ 游乐场水面。鼠标进入泳池就能带着小黄鸭游动，点一下让它站直。"
        onPointerDown={handleStagePointerDown}
        onPointerMove={handleStagePointerMove}
        onPointerUp={handleStagePointerUp}
        onPointerCancel={handleStagePointerUp}
        onPointerLeave={handleStagePointerLeave}
      >
        <WaterCanvas inputRef={waterInput} />

        <div className="qqq-playground__ripples" aria-hidden="true">
          {ripples.map((ripple) => (
            <span
              key={ripple.id}
              className="qqq-playground__ripple"
              style={{
                left: `${ripple.x}%`,
                top: `${ripple.y}%`,
                width: ripple.size,
                height: ripple.size,
                animationDelay: `${ripple.delay}ms`,
              }}
              onAnimationEnd={() =>
                setRipples((current) => current.filter((item) => item.id !== ripple.id))
              }
            />
          ))}
        </div>

        <button
          ref={duckRef}
          type="button"
          className={`qqq-playground__duck${dragging ? " is-dragging" : ""}`}
          style={duckStyle}
          aria-label="小黄鸭：鼠标进入泳池就会跟着游，点击或按回车让它站直"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onKeyDown={handleKeyDown}
        >
          <span className="qqq-playground__bob">
            <RubberDuck />
          </span>
        </button>

        <p className={`qqq-playground__hint${interacted ? " is-hidden" : ""}`} aria-hidden="true">
          移动鼠标带小鸭游 · 划过水面
        </p>
      </div>

      <p className="qqq-playground__caption">
        一个没有成绩、没有 DDL 的角落。把鼠标放进泳池，小黄鸭就会跟着你游。
      </p>
    </div>
  );
}