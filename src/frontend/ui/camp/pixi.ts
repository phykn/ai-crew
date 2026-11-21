// The camp pixel-art stage. One painted clearing, the crew sprite strips, the log
// benches and the flicker frames of the fire go onto a single canvas, and GSAP
// plus AnimatedSprite carry movement, breathing, walking, sitting and turning.
// PixiJS and GSAP are imported dynamically here only, so without WebGL no canvas
// is made and the screen falls back to the CSS camp, which uses the same files.

import {
  artUnit,
  crewHeight,
  fireLight,
  flicker,
  sortZ,
  stagePoint,
  webglAvailable,
  worldRect,
  type StagePoint,
  type StageSize,
} from "./pixi-layout";
import {
  benchArt,
  campBackground,
  crewAnimations,
  crewArt,
  crewColumns,
  fireArt,
  type CrewPose,
  type ObjectKind,
} from "./art/scene";

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

/** A camp object; its size is in pixels of the background painting. */
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
  /** The element that takes pointer input; the canvas itself takes none. */
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

/** Builds the stage; null when WebGL or the art files are unavailable. */
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

  let textures: PixiTexture[];
  try {
    textures = await Promise.all(
      [
        campBackground.url,
        fireArt.url,
        benchArt.url,
        ...crewArt.sheets,
      ].map((url) => PIXI.Assets.load<PixiTexture>(url)),
    );
  } catch {
    return null;
  }
  const [bgTexture, fireTexture, benchTexture, ...crewTexturesByRole] = textures;
  for (const texture of textures) texture.source.scaleMode = "nearest";

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
      // An app that failed to init is already empty.
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

  /** Cuts one frame out of a strip; nearest keeps the pixels square when scaled. */
  function frameTexture(sheet: PixiTexture, column: number, cellWidth: number, cellHeight: number) {
    return new PIXI.Texture({
      source: sheet.source,
      frame: new PIXI.Rectangle(column * cellWidth, 0, cellWidth, cellHeight),
    });
  }

  const poseTextures = new Map<string, PixiTexture[]>();
  function crewTextures(role: number, poses: readonly CrewPose[]) {
    const key = role + ":" + poses.join(",");
    let frames = poseTextures.get(key);
    if (!frames) {
      const sheet = crewTexturesByRole[role] ?? crewTexturesByRole[0];
      frames = poses.map((pose) =>
        frameTexture(sheet, crewColumns[pose], crewArt.cellWidth, crewArt.cellHeight),
      );
      poseTextures.set(key, frames);
    }
    return frames;
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

  /** The 2x2 pixel dot used by embers and fireflies. */
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
  const shadowTexture = radial(softShadow, 64);
  const dotTexture = pixelDot();

  // ── Background ──────────────────────────────────────────────────────────
  const background = new PIXI.Sprite(bgTexture);
  background.anchor.set(0, 0);
  background.zIndex = -1_000_000;
  world.addChild(background);

  // ── Object sprites ──────────────────────────────────────────────────────
  const fireFrames = Array.from({ length: fireArt.frames }, (_, index) =>
    frameTexture(fireTexture, index, fireArt.cellWidth, fireArt.cellHeight),
  );

  type ObjectView = { object: StageObject; sprite: PixiSprite | PixiAnimated; shadow: PixiSprite | null };
  const objectViews: ObjectView[] = [];
  let campfire: PixiAnimated | null = null;
  for (const object of options.objects ?? []) {
    const sprite =
      object.kind === "campfire"
        ? new PIXI.AnimatedSprite(fireFrames)
        : new PIXI.Sprite(benchTexture);
    if (sprite instanceof PIXI.AnimatedSprite) {
      sprite.animationSpeed = reducedMotion ? 0 : 0.09;
      sprite.gotoAndPlay(0);
      campfire = sprite;
    }
    sprite.anchor.set(0.5, 1);
    sprite.zIndex = sortZ(object.y, object.id);
    world.addChild(sprite);
    // A soft contact shadow keeps a log bench from floating on the grass.
    let shadow: PixiSprite | null = null;
    if (shadowTexture) {
      shadow = new PIXI.Sprite(shadowTexture);
      shadow.anchor.set(0.5, 0.5);
      shadow.alpha = 0.45;
      shadow.zIndex = sortZ(object.y, object.id) - 1;
      world.addChild(shadow);
    }
    objectViews.push({ object, sprite, shadow });
  }

  // ── Lights ──────────────────────────────────────────────────────────────
  const fireGlow = glowTexture ? new PIXI.Sprite(glowTexture) : new PIXI.Sprite();
  fireGlow.anchor.set(0.5, 0.62);
  fireGlow.blendMode = "add";
  fireGlow.tint = 0xffc078;
  fireGlow.zIndex = 10_000_000;
  world.addChild(fireGlow);

  const cursorLight = glowTexture ? new PIXI.Sprite(glowTexture) : null;
  if (cursorLight) {
    cursorLight.anchor.set(0.5, 0.5);
    cursorLight.blendMode = "add";
    cursorLight.tint = 0xffcf92;
    cursorLight.alpha = 0;
    lights.addChild(cursorLight);
  }
  const cursorAt = { x: 0, y: 0 };

  // ── Crew ────────────────────────────────────────────────────────────────
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

    const aura = new PIXI.Sprite(glowTexture ?? PIXI.Texture.WHITE);
    aura.anchor.set(0.5, 0.5);
    aura.blendMode = "add";
    aura.tint = 0xffb050;
    aura.alpha = 0;

    sprite.scale.set(unit, unit);
    root.addChild(aura, sprite);
    const point = stagePoint(size, { x: actor.x, y: actor.y });
    root.position.set(point.x, point.y);
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
        animation === "walk" ? 0.18 : animation === "work" ? 0.05 : 0.03;
      view.sprite.gotoAndPlay(0);
    }
    view.animation = animation;
  }

  function sizeSprites() {
    unit = artUnit(size);
    const world = worldRect(size);
    background.position.set(world.x, world.y);
    background.width = world.width;
    background.height = world.height;
    for (const { object, sprite, shadow } of objectViews) {
      const point = stagePoint(size, object);
      sprite.position.set(point.x, point.y);
      sprite.width = object.w * unit;
      sprite.height = object.h * unit;
      if (shadow) {
        shadow.position.set(point.x, point.y - 3 * unit);
        shadow.width = object.w * unit * 0.92;
        shadow.height = Math.max(6, 13 * unit);
      }
    }
    for (const view of views.values()) {
      const scale = crewHeight(size) / crewArt.height;
      view.sprite.scale.set(
        scale * (view.sprite.scale.x < 0 ? -1 : 1),
        scale,
      );
      view.aura.width = crewHeight(size) * 0.8;
      view.aura.height = Math.max(14, crewHeight(size) * 0.2);
    }
  }

  function placeLights() {
    const fire = stagePoint(size, options.fire);
    fireGlow.position.set(fire.x, fire.y - size.height * 0.03);
    fireGlow.width = size.width * 0.24;
    fireGlow.height = size.height * 0.24;
    if (cursorLight) {
      cursorLight.width = size.width * 0.34;
      cursorLight.height = size.width * 0.34;
    }
  }

  // ── Embers and fireflies ────────────────────────────────────────────────
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
      const home = stagePoint(size, {
        x: firefly.home.x + firefly.state.dx * 0.6,
        y: firefly.home.y + firefly.state.dy * 0.6,
      });
      firefly.sprite.x = home.x;
      firefly.sprite.y = home.y;
      firefly.sprite.width = 2 * unit * 0.9;
      firefly.sprite.height = 2 * unit * 0.9;
      firefly.sprite.alpha = firefly.state.alpha;
    }
  }

  // ── Frame loop ──────────────────────────────────────────────────────────
  const firePulse = { value: 0 };
  let crewWorking = false;

  function frame() {
    const time = performance.now() / 1000;
    const glow = reducedMotion ? 0.72 : flicker(time);
    // A crew working near the fire brightens it a little.
    fireGlow.alpha = 0.05 + glow * 0.1 + firePulse.value + (crewWorking ? 0.02 : 0);
    if (!reducedMotion) placeParticles();
    if (cursorLight) cursorLight.position.set(cursorAt.x, cursorAt.y);
    app.render();
  }

  function apply(actor: StageActor) {
    let view = views.get(actor.memberId);
    if (!view) view = buildActor(actor) ?? undefined;
    if (!view) return;
    view.root.visible = true;
    const point = stagePoint(size, { x: actor.x, y: actor.y });
    view.quickX(point.x);
    view.quickY(point.y);
    // A seated crew member sits on the log with the legs forward, so it sorts in front.
    view.root.zIndex = sortZ(actor.y + (actor.posture === "sit" ? 0.9 : 0), actor.memberId);

    if (actor.posture === "walk") animate(view, "walk");
    else if (actor.posture === "sit") animate(view, "sit");
    else if (actor.working || actor.posture === "work") animate(view, "work");
    else if (actor.posture === "watch") animate(view, "watch");
    else if (actor.posture === "handoff") animate(view, "handoff");
    else animate(view, "stand");

    const facing = actor.facing === "left" ? -1 : 1;
    const scale = crewHeight(size) / crewArt.height;
    view.sprite.scale.set(scale * facing, scale);

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

  // ── Pointer ─────────────────────────────────────────────────────────────
  const pointerSurface = options.surface ?? options.host;

  const moveCursor = (event: PointerEvent) => {
    if (reducedMotion) return;
    const box = options.host.getBoundingClientRect();
    if (!box.width || !box.height) return;
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
          if (campfire) campfire.animationSpeed = 0.09;
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
      for (const ember of embers) gsap.killTweensOf(ember.state);
      for (const firefly of fireflies) gsap.killTweensOf(firefly.state);
      for (const view of views.values()) gsap.killTweensOf(view.root);
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
