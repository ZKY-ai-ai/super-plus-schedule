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
  float t = uTime * 0.05;
  vec2 flow = vec2(t * 1.2, -t * 0.75);

  vec2 q = p * 1.75 + flow;
  float warp = fbm(q * 0.8 + vec2(t * 0.5, -t * 0.35));
  q += (warp - 0.5) * 1.05;

  float n1 = fbm(q * 1.9 + vec2(t * 1.7, -t * 0.9));
  float n2 = fbm(q * 3.4 - vec2(t * 1.1, t * 0.6));

  float v1 = 1.0 - abs(sin(q.x * 2.4 + q.y * 1.7 + n1 * 3.1 + t * 2.1));
  v1 = pow(v1, 8.0);
  float v2 = 1.0 - abs(sin(q.y * 3.1 - q.x * 2.2 + n2 * 2.5 - t * 1.7));
  v2 = pow(v2, 11.0);
  float v3 = 1.0 - abs(sin((q.x + q.y) * 1.8 + n1 * 3.6 + t * 1.2));
  v3 = pow(v3, 15.0);
  float caustic = v1 * 0.62 + v2 * 0.44 + v3 * 0.30;

  float depth = fbm(p * 1.1 + vec2(uTime * 0.012, -uTime * 0.008));
  vec3 deep = vec3(0.03, 0.30, 0.68);
  vec3 mid = vec3(0.09, 0.47, 0.88);
  vec3 shallow = vec3(0.18, 0.60, 0.96);
  vec3 color = mix(deep, mid, smoothstep(0.10, 0.92, depth));
  color = mix(color, shallow, smoothstep(0.60, 1.05, depth) * 0.6);

  float glow = fbm(p * 2.4 + vec2(uTime * 0.02, uTime * 0.015));
  color += vec3(0.08, 0.32, 0.66) * glow * 0.24;
  color = mix(color, vec3(0.84, 0.97, 1.0), caustic * 0.78);

  vec2 centered = uv - 0.5;
  float vignette = smoothstep(0.95, 0.26, length(centered * vec2(0.85, 1.35)));
  color *= mix(0.74, 1.0, vignette);

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

function WaterCanvas() {
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
    gl.useProgram(program);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pixelRatio = Math.min(1.6, window.devicePixelRatio || 1);
    let frame = 0;
    let startedAt = performance.now();
    let pausedAt = 0;

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
      gl.useProgram(program);
      gl.uniform1f(timeLocation, seconds);
      gl.uniform1f(aspectLocation, canvas.width / Math.max(1, canvas.height));
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
    <svg viewBox="0 0 120 120" role="img" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="qqq-duck-body" x1="30" y1="24" x2="86" y2="104" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffe070" />
          <stop offset="0.55" stopColor="#ffbe38" />
          <stop offset="1" stopColor="#f2920f" />
        </linearGradient>
        <linearGradient id="qqq-duck-beak" x1="90" y1="54" x2="112" y2="70" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffa528" />
          <stop offset="1" stopColor="#e97f0a" />
        </linearGradient>
        <radialGradient id="qqq-duck-gloss" cx="0.3" cy="0.22" r="0.6">
          <stop offset="0" stopColor="#fffbe0" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fffbe0" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="60" cy="108" rx="29" ry="6" fill="#062554" opacity="0.28" />
      <path
        d="M18 77c-9-11-4-24 10-28 3-17 19-29 37-26 19 3 32 18 31 34 15 5 18 25 4 34-19 12-68 12-82-2-4-4-4-8 0-12Z"
        fill="url(#qqq-duck-body)"
      />
      <path
        d="M38 34c9-8 23-9 32-3-8-1-16 2-22 8-4 4-8 10-9 16-7-6-8-15-1-21Z"
        fill="url(#qqq-duck-gloss)"
      />
      <path
        d="M29 79c9 8 26 12 43 10 10-1 18-4 24-8-2 12-16 20-34 20-16 0-29-8-33-22Z"
        fill="#e2a015"
        opacity="0.55"
      />
      <circle cx="79" cy="53" r="5.2" fill="#2a2113" />
      <circle cx="80.8" cy="51" r="1.7" fill="#fffdf4" opacity="0.92" />
      <path
        d="M89 58c8-2 16 1 16 6 0 5-8 8-16 6-3-3-3-9 0-12Z"
        fill="url(#qqq-duck-beak)"
      />
      <path d="M90 64c4 1 9 1.4 14 1.2" stroke="#b9670c" strokeWidth="1.6" strokeLinecap="round" opacity="0.65" />
      <path d="M53 83c5 2 11 2 16 1" stroke="#d89612" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
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

interface DragState {
  pointerId: number;
  lastX: number;
  lastY: number;
  startX: number;
  startY: number;
  moved: boolean;
  lastRippleAt: number;
}

export function QqqPlayground() {
  const stageRef = useRef<HTMLDivElement>(null);
  const duckRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const rippleId = useRef(0);

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

  const celebrate = useCallback(() => {
    setTilt(0);
    setInteracted(true);
    addRipple(position.x, position.y, 0);
    addRipple(position.x, position.y, 180);
  }, [addRipple, position.x, position.y]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      lastRippleAt: 0,
    };
    setDragging(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !stage) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) {
      drag.moved = true;
    }
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    const next = clampDuckPosition(
      ((event.clientX - rect.left) / rect.width) * 100,
      ((event.clientY - rect.top) / rect.height) * 100,
    );
    setPosition(next);
    setTilt(duckTiltFromDelta(dx, dy));
    setInteracted(true);

    const now = performance.now();
    if (now - drag.lastRippleAt > 260) {
      drag.lastRippleAt = now;
      addRipple(next.x, next.y, 0);
    }
  };

  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!drag.moved) {
      celebrate();
    } else {
      setInteracted(true);
      addRipple(position.x, position.y, 0);
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
        <p>海阔凭鱼跃，天高任鸟飞</p>
      </header>

      <div
        ref={stageRef}
        className={`qqq-playground__stage${dragging ? " is-dragging" : ""}`}
        role="group"
        aria-label="QQQ 游乐场水面。小黄鸭可以拖动，点一下让它站直。"
      >
        <WaterCanvas />

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
          aria-label="小黄鸭：拖动改变位置，按回车或点击让它站直"
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
          拖动小鸭 · 点一下让它站直
        </p>
      </div>

      <p className="qqq-playground__caption">
        一个没有成绩、没有 DDL 的角落。鸭子喜欢被拖到水面亮一点的地方。
      </p>
    </div>
  );
}