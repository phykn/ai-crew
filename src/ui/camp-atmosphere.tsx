// 캠프의 공기: 모닥불에서 올라가는 불티와 숲 사이로 흐르는 반딧불이를 그리는
// 가벼운 Canvas 한 장. 포인터를 받지 않고, 창이 가려지면 멈추며, 움직임 줄이기를
// 켠 환경에서는 한 장면만 정적으로 그린다.

import { useEffect, useRef } from "react";

// 불티가 피어오르는 자리: 새 배경의 모닥불 위치(가로 66%, 세로 60%).
const FIRE = { x: 0.66, y: 0.6 };

type Ember = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  span: number;
  size: number;
};

type Firefly = {
  x: number;
  y: number;
  phase: number;
  drift: number;
  reach: number;
  radius: number;
};

function random(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function makeEmber(width: number, height: number): Ember {
  const span = random(2, 4.2);
  return {
    x: width * FIRE.x + random(-20, 16),
    y: height * FIRE.y + random(-8, 10),
    vx: random(-9, 5),
    vy: random(-46, -20),
    life: random(0, span),
    span,
    size: random(1.1, 2.6),
  };
}

function makeFirefly(width: number, height: number): Firefly {
  return {
    x: random(width * 0.06, width * 0.94),
    y: random(height * 0.16, height * 0.62),
    phase: random(0, Math.PI * 2),
    drift: random(0.12, 0.34),
    reach: random(8, 26),
    radius: random(1, 1.9),
  };
}

export function CampAtmosphere() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const embers: Ember[] = [];
    const fireflies: Firefly[] = [];
    let width = 0;
    let height = 0;
    let frame: number | null = null;
    let last = 0;

    const resize = () => {
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height) return;
      width = box.width;
      height = box.height;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      fill();
      draw();
    };

    // 입자 수는 화면 넓이에 맞춰 두되 상한을 둔다.
    const fill = () => {
      const emberCount = Math.round(
        Math.min(64, Math.max(22, (width * height) / 22000)),
      );
      const flyCount = Math.round(Math.min(16, Math.max(6, (width * height) / 90000)));
      while (embers.length < emberCount) embers.push(makeEmber(width, height));
      embers.length = emberCount;
      while (fireflies.length < flyCount)
        fireflies.push(makeFirefly(width, height));
      fireflies.length = flyCount;
    };

    const drawEmber = (ember: Ember) => {
      const left = ember.life / ember.span;
      const fade = Math.sin(Math.PI * left);
      const x = ember.x + Math.sin(left * 6.2) * 8;
      // 밝은 심지와 바깥 불빛을 겹쳐 작은 불티처럼 보이게 한다.
      context.beginPath();
      context.fillStyle = `rgba(255, ${Math.round(150 + 80 * fade)}, ${Math.round(70 + 60 * fade)}, ${fade * 0.95})`;
      context.arc(x, ember.y, ember.size * (0.6 + fade * 0.7), 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.fillStyle = `rgba(255, 120, 40, ${fade * 0.28})`;
      context.arc(x, ember.y, ember.size * 2.6, 0, Math.PI * 2);
      context.fill();
    };

    const drawFirefly = (firefly: Firefly, time: number) => {
      const glow = (Math.sin(firefly.phase + time * firefly.drift * 2.2) + 1) / 2;
      const x = firefly.x + Math.sin(time * firefly.drift + firefly.phase) * firefly.reach;
      const y =
        firefly.y + Math.cos(time * firefly.drift * 0.8 + firefly.phase) * firefly.reach * 0.6;
      context.beginPath();
      context.fillStyle = `rgba(196, 255, 132, ${0.16 + glow * 0.55})`;
      context.arc(x, y, firefly.radius * (1 + glow), 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.fillStyle = `rgba(186, 255, 120, ${0.1 + glow * 0.3})`;
      context.arc(x, y, firefly.radius * 3.2, 0, Math.PI * 2);
      context.fill();
    };

    const draw = () => {
      if (!width || !height) return;
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";
      const time = performance.now() / 1000;
      for (const firefly of fireflies) drawFirefly(firefly, time);
      for (const ember of embers) drawEmber(ember);
      context.globalCompositeOperation = "source-over";
    };

    const step = (now: number) => {
      frame = null;
      const seconds = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      for (const ember of embers) {
        ember.life += seconds;
        if (ember.life >= ember.span) Object.assign(ember, makeEmber(width, height));
        ember.x += ember.vx * seconds;
        ember.y += ember.vy * seconds;
        ember.vx += Math.sin(ember.life * 3.1) * 6 * seconds;
      }
      for (const firefly of fireflies)
        firefly.phase += seconds * firefly.drift * 0.4;
      draw();
      start();
    };

    const start = () => {
      if (frame !== null || reduced.matches) return;
      if (document.visibilityState === "hidden") return;
      frame = requestAnimationFrame(step);
    };

    const stop = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    };

    const visible = () => {
      if (document.visibilityState === "hidden") stop();
      else start();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    start();
    document.addEventListener("visibilitychange", visible);
    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);

  return <canvas className="camp-atmosphere" ref={canvas} aria-hidden="true" />;
}
