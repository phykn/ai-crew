// 캠프 픽셀아트 스테이지. 바닥 타일·오브젝트·크루를 모두 pixlrt로 그린 그림에서
// 만든 텍스처로 한 장의 캔버스에 얹고, 크루의 이동·호흡·걷기·착석·방향 전환은
// GSAP과 AnimatedSprite로 다듬는다. PixiJS와 GSAP은 이 파일 안에서만 동적 import
// 하므로 서버 렌더나 WebGL이 없는 환경에서는 캔버스가 만들어지지 않고, 화면은
// CSS 캠프로 그대로 폴백한다(pixlrt 그림을 SVG로 쓴 같은 그림이다).

import { renderToCanvas } from "pixlrt/core";
import {
  artUnit,
  crewHeight,
  fireLight,
  flicker,
  sortZ,
  stagePoint,
  webglAvailable,
  type StagePoint,
  type StageSize,
} from "./pixi-layout";
import {
  campGround,
  crewAnimations,
  crewFrame,
  objectArt,
  type CrewPose,
  type ObjectKind,
} from "./art/scene";
import { mapCenter, tileSize } from "./art/ground";

type PixiModule = typeof import("pixi.js");
type GsapModule = typeof import("gsap");
type PixiContainer = InstanceType<PixiModule["Container"]>;
type PixiSprite = InstanceType<PixiModule["Sprite"]>;
type PixiAnimated = InstanceType<PixiModule["AnimatedSprite"]>;
type PixiTexture = InstanceType<PixiModule["Texture"]>;
type PixiTween = ReturnType<GsapModule["gsap"]["to"]>;

export type StageActor = {
  memberId: string;
  x: number;
  y: number;
  facing: "left" | "right";
  posture: "stand" | "walk" | "sit" | "work" | "watch" | "handoff";
  working: boolean;
};

type CampCrew = { id: string; role: number };

/** 캠프에 놓는 오브젝트. 크기는 아트 픽셀 단위다. */
export type StageObject = {
  id: string;
  kind: ObjectKind;
  x: number;
  y: number;
  w: number;
  h: number;
};

type CampStageOptions = {
  host: HTMLElement;
  /** 포인터를 받는 요소. 캔버스 자체는 입력을 받지 않는다. */
  surface?: HTMLElement | null;
  crew: CampCrew[];
  fire: StagePoint;
  objects?: StageObject[];
  reducedMotion?: boolean;
};

export type CampStage = {
  render(actors: StageActor[], working?: boolean): void;
  resize(): void;
  poke(id: string): void;
  destroy(): void;
};

type ActorView = {
  id: string;
  role: number;
  root: PixiContainer;
  sprite: PixiAnimated;
  aura: PixiSprite;
  animation: string;
  quickX: (value: number) => unknown;
  quickY: (value: number) => unknown;
  tweens: PixiTween[];
};

const warmLight: [number, string][] = [
  [0, "rgba(255,246,214,1)"],
  [0.28, "rgba(255,206,122,0.72)"],
  [0.62, "rgba(255,154,60,0.26)"],
  [1, "rgba(255,130,40,0)"],
];

const softShadow: [number, string][] = [
  [0, "rgba(0,0,0,0.8)"],
  [0.55, "rgba(0,0,0,0.3)"],
  [1, "rgba(0,0,0,0)"],
];

function random(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function measureStage(host: HTMLElement, surface?: HTMLElement | null): StageSize {
  const width = Math.max(1, host.clientWidth || host.offsetWidth || 0);
  const height = Math.max(1, host.clientHeight || host.offsetHeight || 0);
  if (width > 1 && height > 1) return { width, height };
  const box = surface?.getBoundingClientRect();
  if (box && box.width > 1 && box.height > 1)
    return { width: box.width, height: box.height };
  return { width, height };
}

/** 캠프 스테이지를 만든다. WebGL을 쓸 수 없으면 null을 돌려준다. */
export async function createCampStage(
  options: CampStageOptions,
): Promise<CampStage | null> {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  if (!options.host) return null;
  if (!webglAvailable(() => document.createElement("canvas"))) {
    return null;
  }

  let PIXI: PixiModule;
  let gsap: GsapModule["gsap"];
  try {
    PIXI = await import("pixi.js");
    gsap = (await import("gsap")).gsap;
  } catch {
    return null;
  }

  const size: StageSize = measureStage(options.host, options.surface);
  const app = new PIXI.Application();
  try {
    await app.init({
      width: size.width,
      height: size.height,
      backgroundAlpha: 0,
      antialias: false,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      roundPixels: true,
      preference: "webgl",
      powerPreference: "low-power",
      autoStart: false,
    });
  } catch {
    try {
      app.destroy(true);
    } catch {
      // 초기화에 실패한 앱은 이미 비어 있다.
    }
    return null;
  }

  const reducedMotion = Boolean(options.reducedMotion);
  const canvas = app.canvas as unknown as HTMLCanvasElement;
  canvas.className = "camp-canvas";
  canvas.setAttribute("aria-hidden", "true");
  options.host.appendChild(canvas);

  const world = new PIXI.Container();
  world.sortableChildren = true;
  const lights = new PIXI.Container();
  const particles = new PIXI.Container();
  app.stage.addChild(world, lights, particles);

  let unit = artUnit(size);

  /** 픽셀아트 그림을 그대로 옮긴 텍스처. 확대해도 각이 살아 있게 nearest로 둔다. */
  function pixelTexture(art: { width: number; height: number }) {
    const surface = document.createElement("canvas");
    renderToCanvas(art as never, surface);
    const texture = PIXI.Texture.from(surface);
    texture.source.scaleMode = "nearest";
    return texture;
  }

  const poseTextures = new Map<string, PixiTexture[]>();
  function crewTextures(role: number, poses: readonly CrewPose[]) {
    const key = role + ":" + poses.join(",");
    let textures = poseTextures.get(key);
    if (!textures) {
      textures = poses.map((pose) => pixelTexture(crewFrame(role, pose)));
      poseTextures.set(key, textures);
    }
    return textures;
  }

  function radial(stops: [number, string][], pixelSize = 128) {
    const surface = document.createElement("canvas");
    surface.width = pixelSize;
    surface.height = pixelSize;
    const context = surface.getContext("2d");
    if (!context) return null;
    const half = pixelSize / 2;
    const gradient = context.createRadialGradient(half, half, 0, half, half, half);
    for (const [offset, color] of stops) gradient.addColorStop(offset, color);
    context.fillStyle = gradient;
    context.fillRect(0, 0, pixelSize, pixelSize);
    return PIXI.Texture.from(surface);
  }

  /** 불티·반딧불이 쓰는 2x2 픽셀 점. */
  function pixelDot() {
    const surface = document.createElement("canvas");
    surface.width = 2;
    surface.height = 2;
    const context = surface.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 2, 2);
    const texture = PIXI.Texture.from(surface);
    texture.source.scaleMode = "nearest";
    return texture;
  }

  const glowTexture = radial(warmLight);
  const dotTexture = pixelDot();
  const shadowTexture = radial(softShadow, 64);

  // ── 바닥 타일 ───────────────────────────────────────────────────────────
  // 캠프 좌표의 (50,50)이 모닥불 타일이므로, 그 타일을 무대 가운데에 둔다.
  const groundTexture = pixelTexture(campGround());
  const ground = new PIXI.Sprite(groundTexture);
  ground.zIndex = -1_000_000;
  world.addChild(ground);

  // ── 오브젝트 스프라이트 ─────────────────────────────────────────────────
  const objectTextures = new Map<string, PixiTexture[]>();
  function objectFrames(kind: ObjectKind, frames: number) {
    let textures = objectTextures.get(kind);
    if (!textures) {
      textures = Array.from({ length: frames }, (_, index) =>
        pixelTexture(objectArt(kind, index)),
      );
      objectTextures.set(kind, textures);
    }
    return textures;
  }

  type ObjectView = { object: StageObject; sprite: PixiSprite };
  const objectViews: ObjectView[] = [];
  let campfire: PixiAnimated | null = null;
  for (const object of options.objects ?? []) {
    const textures =
      object.kind === "campfire" ? objectFrames("campfire", 3) : objectFrames(object.kind, 1);
    const sprite =
      object.kind === "campfire"
        ? new PIXI.AnimatedSprite(textures)
        : new PIXI.Sprite(textures[0]);
    if (sprite instanceof PIXI.AnimatedSprite) {
      sprite.animationSpeed = reducedMotion ? 0 : 0.06;
      sprite.gotoAndPlay(0);
      campfire = sprite;
    }
    sprite.anchor.set(0.5, 1);
    sprite.zIndex = sortZ(object.y, object.id);
    world.addChild(sprite);
    objectViews.push({ object, sprite });
  }

  // ── 조명 ────────────────────────────────────────────────────────────────
  const fireGlow = glowTexture ? new PIXI.Sprite(glowTexture) : new PIXI.Sprite();
  fireGlow.anchor.set(0.5, 0.62);
  fireGlow.blendMode = "add";
  fireGlow.tint = 0xffc078;
  fireGlow.zIndex = 10_000_000;
  world.addChild(fireGlow);

  const lantern = (options.objects ?? []).find((object) => object.kind === "crates");
  const tent = (options.objects ?? []).find((object) => object.kind === "tent");
  const lanternLight = lantern && glowTexture ? new PIXI.Sprite(glowTexture) : null;
  if (lanternLight) {
    lanternLight.anchor.set(0.5, 0.5);
    lanternLight.blendMode = "add";
    lanternLight.tint = 0xffb668;
    lanternLight.zIndex = 9_999_999;
    world.addChild(lanternLight);
  }

  const cursorLight = glowTexture ? new PIXI.Sprite(glowTexture) : null;
  if (cursorLight) {
    cursorLight.anchor.set(0.5, 0.5);
    cursorLight.blendMode = "add";
    cursorLight.tint = 0xffcf92;
    cursorLight.alpha = 0;
    lights.addChild(cursorLight);
  }
  const cursorAt = { x: 0, y: 0 };

  // ── 크루 ────────────────────────────────────────────────────────────────
  const views = new Map<string, ActorView>();
  const allTweens: { kill: () => void }[] = [];
  const roles = new Map(options.crew.map((crew) => [crew.id, crew.role]));

  function buildActor(actor: StageActor): ActorView | null {
    const role = roles.get(actor.memberId);
    if (role === undefined) return null;
    const root = new PIXI.Container();
    const sprite = new PIXI.AnimatedSprite(crewTextures(role, crewAnimations.stand));
    sprite.anchor.set(0.5, 1);
    sprite.animationSpeed = reducedMotion ? 0 : 0.03;
    sprite.play();

    const aura = new PIXI.Sprite(glowTexture ?? PIXI.Texture.WHITE);
    aura.anchor.set(0.5, 0.5);
    aura.blendMode = "add";
    aura.tint = 0xffb050;
    aura.alpha = 0;

    sprite.scale.set(unit, unit);
    root.addChild(aura, sprite);
    root.position.set(
      (actor.x / 100) * size.width,
      (actor.y / 100) * size.height,
    );
    world.addChild(root);

    const view: ActorView = {
      id: actor.memberId,
      role,
      root,
      sprite,
      aura,
      animation: "stand",
      quickX: gsap.quickTo(root, "x", { duration: 0.1, ease: "none" }),
      quickY: gsap.quickTo(root, "y", { duration: 0.1, ease: "none" }),
      tweens: [],
    };
    views.set(actor.memberId, view);
    return view;
  }

  function animate(view: ActorView, animation: keyof typeof crewAnimations) {
    if (view.animation === animation) return;
    const poses = crewAnimations[animation];
    view.sprite.textures = crewTextures(view.role, poses);
    if (reducedMotion || poses.length === 1) {
      view.sprite.gotoAndStop(0);
    } else {
      view.sprite.animationSpeed =
        animation === "walk" ? 0.14 : animation === "work" ? 0.05 : 0.03;
      view.sprite.gotoAndPlay(0);
    }
    view.animation = animation;
  }

  function sizeSprites() {
    unit = artUnit(size);
    ground.scale.set(unit);
    ground.position.set(
      size.width / 2 - (mapCenter.col + 0.5) * tileSize * unit,
      size.height / 2 - (mapCenter.row + 0.5) * tileSize * unit,
    );
    for (const { object, sprite } of objectViews) {
      const point = stagePoint(size, object);
      sprite.position.set(point.x, point.y);
      sprite.width = object.w * unit;
      sprite.height = object.h * unit;
    }
    for (const view of views.values()) {
      view.sprite.scale.set(
        unit * (view.sprite.scale.x < 0 ? -1 : 1),
        unit,
      );
      view.aura.width = crewHeight(size) * 0.8;
      view.aura.height = Math.max(14, crewHeight(size) * 0.2);
    }
  }

  function placeLights() {
    const fire = stagePoint(size, options.fire);
    fireGlow.position.set(fire.x, fire.y - size.height * 0.02);
    fireGlow.width = size.width * 0.34;
    fireGlow.height = size.height * 0.34;
    if (lanternLight && lantern) {
      const point = stagePoint(size, lantern);
      lanternLight.position.set(
        point.x + size.width * 0.02,
        point.y - lantern.h * unit * 0.72,
      );
      lanternLight.width = size.width * 0.16;
      lanternLight.height = size.width * 0.16;
    }
    if (cursorLight) {
      cursorLight.width = size.width * 0.34;
      cursorLight.height = size.width * 0.34;
    }
  }

  // ── 불티와 반딧불이 ─────────────────────────────────────────────────────
  type Ember = { sprite: PixiSprite; state: { rise: number; drift: number; alpha: number }; size: number };
  type Firefly = { sprite: PixiSprite; home: StagePoint; state: { dx: number; dy: number; alpha: number } };
  const embers: Ember[] = [];
  const fireflies: Firefly[] = [];

  function fireCentre() {
    const base = stagePoint(size, options.fire);
    return { x: base.x, y: base.y - size.height * 0.05 };
  }

  function spawnParticles() {
    if (!dotTexture) return;
    for (let index = 0; index < 18; index += 1) {
      const sprite = new PIXI.Sprite(dotTexture);
      sprite.anchor.set(0.5);
      sprite.blendMode = "add";
      sprite.tint = index % 3 === 0 ? 0xfff0c0 : 0xffa850;
      sprite.alpha = 0;
      particles.addChild(sprite);
      const state = { rise: 0, drift: 0, alpha: 0 };
      embers.push({ sprite, state, size: random(2, 4) });
      const rise = random(50, 130);
      const drift = random(-20, 20);
      const span = random(1.6, 3.4);
      allTweens.push(
        gsap
          .timeline({ repeat: -1, delay: random(0, 2.6) })
          .set(state, { rise: 0, drift: 0, alpha: 0 })
          .to(state, { rise: rise * 0.55, drift: drift * 0.55, alpha: 0.95, duration: span * 0.45, ease: "sine.out" })
          .to(state, { rise, drift, alpha: 0, duration: span * 0.55, ease: "sine.in" }),
      );
    }
    for (let index = 0; index < 10; index += 1) {
      const sprite = new PIXI.Sprite(dotTexture);
      sprite.anchor.set(0.5);
      sprite.blendMode = "add";
      sprite.tint = 0xdcff8a;
      sprite.alpha = 0;
      particles.addChild(sprite);
      const home = { x: random(6, 94), y: random(14, 60) };
      const state = { dx: 0, dy: 0, alpha: 0 };
      fireflies.push({ sprite, home, state });
      const reach = random(4, 10);
      const span = random(1.6, 2.8);
      allTweens.push(
        gsap
          .timeline({ repeat: -1, delay: random(0, 4) })
          .set(state, { dx: 0, dy: 0, alpha: 0 })
          .to(state, { dx: reach, dy: -reach * 0.55, alpha: 0.8, duration: span, ease: "sine.inOut" })
          .to(state, { dx: -reach * 0.7, dy: reach * 0.45, alpha: 0.1, duration: span * 1.1, ease: "sine.inOut" }),
      );
    }
  }

  function placeParticles() {
    const fire = fireCentre();
    for (const ember of embers) {
      ember.sprite.x = fire.x + ember.state.drift;
      ember.sprite.y = fire.y - ember.state.rise;
      ember.sprite.width = ember.size * unit * 0.8;
      ember.sprite.height = ember.size * unit * 0.8;
      ember.sprite.alpha = ember.state.alpha;
    }
    for (const firefly of fireflies) {
      firefly.sprite.x = ((firefly.home.x + firefly.state.dx * 0.6) / 100) * size.width;
      firefly.sprite.y = ((firefly.home.y + firefly.state.dy * 0.6) / 100) * size.height;
      firefly.sprite.width = 2 * unit * 0.9;
      firefly.sprite.height = 2 * unit * 0.9;
      firefly.sprite.alpha = firefly.state.alpha;
    }
  }

  // ── 프레임 ──────────────────────────────────────────────────────────────
  const firePulse = { value: 0 };
  let crewWorking = false;

  function frame() {
    const time = performance.now() / 1000;
    const glow = reducedMotion ? 0.72 : flicker(time);
    // 모닥불에 가까이 선 크루가 많을수록 불빛이 조금 밝아진다.
    fireGlow.alpha = 0.1 + glow * 0.16 + firePulse.value + (crewWorking ? 0.03 : 0);
    if (lanternLight) lanternLight.alpha = 0.08 + glow * 0.06;
    if (!reducedMotion) placeParticles();
    if (cursorLight) cursorLight.position.set(cursorAt.x, cursorAt.y);
    app.render();
  }

  function apply(actor: StageActor) {
    let view = views.get(actor.memberId);
    if (!view) view = buildActor(actor) ?? undefined;
    if (!view) return;
    view.root.visible = true;
    view.quickX((actor.x / 100) * size.width);
    view.quickY((actor.y / 100) * size.height);
    // 앉은 크루는 통나무 위에 걸터앉아 다리가 통나무 앞으로 나온다.
    view.root.zIndex = sortZ(actor.y + (actor.posture === "sit" ? 0.2 : 0), actor.memberId);

    if (actor.posture === "walk") animate(view, "walk");
    else if (actor.posture === "sit") animate(view, "sit");
    else if (actor.working || actor.posture === "work") animate(view, "work");
    else if (actor.posture === "watch") animate(view, "watch");
    else if (actor.posture === "handoff") animate(view, "handoff");
    else animate(view, "stand");

    // 아트 1픽셀이 화면에서 unit픽셀이 되도록 매 프레임 맞춘다(방향은 좌우 반전).
    const facing = actor.facing === "left" ? -1 : 1;
    view.sprite.scale.set(unit * facing, unit);

    const working = actor.working || actor.posture === "work";
    view.aura.alpha = working ? 0.2 + fireLight(actor.x, actor.y, options.fire) * 0.22 : 0;
  }

  function resize() {
    const measured = measureStage(options.host, options.surface);
    size.width = measured.width;
    size.height = measured.height;
    app.renderer.resize(size.width, size.height);
    sizeSprites();
    placeLights();
    placeParticles();
    frame();
  }

  // ── 포인터 ──────────────────────────────────────────────────────────────
  const parallax = { x: 0, y: 0 };
  const pointerSurface = options.surface ?? options.host;

  const moveCursor = (event: PointerEvent) => {
    if (reducedMotion) return;
    const box = options.host.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const nx = (event.clientX - box.left) / box.width - 0.5;
    const ny = (event.clientY - box.top) / box.height - 0.5;
    const range = Math.min(box.width, box.height) * 0.014;
    gsap.to(parallax, {
      x: -nx * range,
      y: -ny * range * 0.7,
      duration: 0.8,
      ease: "power2.out",
      overwrite: "auto",
      onUpdate: () => {
        ground.position.x = size.width / 2 - (mapCenter.col + 0.5) * tileSize * unit + parallax.x;
      },
    });
    if (!cursorLight) return;
    gsap.to(cursorAt, {
      x: event.clientX - box.left,
      y: event.clientY - box.top,
      duration: 0.45,
      ease: "power2.out",
      overwrite: "auto",
      onUpdate: () => {
        if (cursorLight) cursorLight.alpha = 0.4;
      },
    });
  };
  const leaveCursor = () => {
    gsap.to(parallax, { x: 0, y: 0, duration: 1, ease: "power2.out", overwrite: "auto" });
    if (cursorLight)
      gsap.to(cursorLight, { alpha: 0, duration: 0.6, overwrite: "auto" });
  };

  const onVisibility = () => {
    if (document.visibilityState === "hidden") gsap.ticker.sleep();
    else {
      gsap.ticker.wake();
      frame();
    }
  };

  sizeSprites();
  placeLights();
  spawnParticles();
  pointerSurface.addEventListener("pointermove", moveCursor);
  pointerSurface.addEventListener("pointerleave", leaveCursor);
  document.addEventListener("visibilitychange", onVisibility);
  frame();
  if (!reducedMotion) gsap.ticker.add(frame);

  return {
    render(actors, working = false) {
      crewWorking = working;
      const alive = new Set<string>();
      for (const actor of actors) {
        alive.add(actor.memberId);
        apply(actor);
      }
      for (const view of views.values()) {
        if (alive.has(view.id)) continue;
        view.root.visible = false;
      }
      if (reducedMotion) frame();
    },
    resize,
    poke(id) {
      if (id !== "campfire") return;
      gsap.fromTo(firePulse, { value: 0.45 }, { value: 0, duration: 1, ease: "power2.out", overwrite: "auto" });
      if (campfire && !reducedMotion) {
        campfire.gotoAndPlay(0);
        campfire.animationSpeed = 0.22;
        window.setTimeout(() => {
          if (campfire) campfire.animationSpeed = 0.06;
        }, 1200);
      }
      for (const ember of embers.slice(0, 6)) {
        gsap.fromTo(
          ember.state,
          { alpha: 1, rise: 0 },
          { alpha: 0, rise: random(60, 120), duration: random(0.7, 1.2), overwrite: "auto" },
        );
      }
    },
    destroy() {
      pointerSurface.removeEventListener("pointermove", moveCursor);
      pointerSurface.removeEventListener("pointerleave", leaveCursor);
      document.removeEventListener("visibilitychange", onVisibility);
      gsap.ticker.remove(frame);
      for (const tween of allTweens) tween.kill();
      allTweens.length = 0;
      gsap.killTweensOf(cursorAt);
      gsap.killTweensOf(parallax);
      for (const ember of embers) gsap.killTweensOf(ember.state);
      for (const firefly of fireflies) gsap.killTweensOf(firefly.state);
      views.clear();
      try {
        app.destroy({ removeView: true }, { children: true, texture: true });
      } catch {
        try {
          app.destroy(true);
        } catch {
          canvas.remove();
        }
      }
    },
  };
}
