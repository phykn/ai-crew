// 캠프 픽셀아트 스테이지. 배경·조명·캐릭터·불티를 PixiJS로 한 장의 캔버스에 그리고,
// 캐릭터의 자리 이동·호흡·착석·방향 전환은 GSAP으로 다듬는다. PixiJS와 GSAP은 이
// 파일 안에서만 동적 import 하므로, 서버 렌더(react-dom/server)나 WebGL이 없는
// 환경에서는 모듈만 읽히고 캔버스는 만들어지지 않는다. 초기화에 실패하면 null을
// 돌려주고, 화면은 기존 CSS 캠프로 그대로 폴백한다.

import {
  coverFit,
  crewHeight,
  crewScale,
  depthScale,
  fireLight,
  flicker,
  seatPose,
  sortZ,
  stagePoint,
  webglAvailable,
  type StagePoint,
  type StageSize,
} from "./camp-pixi-layout";

type PixiModule = typeof import("pixi.js");
type GsapModule = typeof import("gsap");
type PixiContainer = InstanceType<PixiModule["Container"]>;
type PixiSprite = InstanceType<PixiModule["Sprite"]>;
type PixiTexture = InstanceType<PixiModule["Texture"]>;
type PixiTween = ReturnType<GsapModule["gsap"]["to"]>;
type PixiTimeline = ReturnType<GsapModule["gsap"]["timeline"]>;

type StageActor = {
  memberId: string;
  x: number;
  y: number;
  facing: "left" | "right";
  posture: "stand" | "walk" | "sit" | "work" | "watch" | "handoff";
  working: boolean;
};

type CrewSprite = { id: string; url: string };

/** 캠프 그림 위에 얹는 만질 수 있는 오브젝트(통나무 의자·작업대·등불·모닥불). */
type StageObject = {
  id: string;
  kind: "seat" | "workbench" | "campfire" | "lantern";
  x: number;
  y: number;
};

type CampStageOptions = {
  host: HTMLElement;
  /** 포인터를 받는 요소. 캔버스 자체는 입력을 받지 않는다. */
  surface?: HTMLElement | null;
  background: string;
  crew: CrewSprite[];
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

type Pose = {
  sink: number; // 0~1, 앉는 깊이
  squashX: number;
  squashY: number;
  facing: number; // 1 또는 -1
  bob: number; // px
  tilt: number; // rad
};

type ActorView = {
  id: string;
  root: PixiContainer;
  breath: PixiContainer;
  body: PixiContainer;
  sprite: PixiSprite;
  shadow: PixiSprite;
  aura: PixiSprite;
  pose: Pose;
  base: number;
  walking: boolean;
  sitting: boolean;
  quickX: (value: number) => unknown;
  quickY: (value: number) => unknown;
  breathing: PixiTween | null;
  bobTimeline: PixiTimeline | null;
  sitTween: PixiTween | null;
  faceTween: PixiTimeline | null;
};

type EmberState = { rise: number; drift: number; alpha: number };
type EmberView = { sprite: PixiSprite; state: EmberState; size: number };
type FireflyState = { dx: number; dy: number; alpha: number };
type FireflyView = {
  sprite: PixiSprite;
  home: StagePoint;
  state: FireflyState;
};

const warmLight: [number, string][] = [
  [0, "rgba(255,246,214,1)"],
  [0.28, "rgba(255,206,122,0.72)"],
  [0.62, "rgba(255,154,60,0.26)"],
  [1, "rgba(255,130,40,0)"],
];

const dotLight: [number, string][] = [
  [0, "rgba(255,255,255,1)"],
  [0.45, "rgba(255,226,160,0.55)"],
  [1, "rgba(255,180,90,0)"],
];

const softShadow: [number, string][] = [
  [0, "rgba(0,0,0,0.85)"],
  [0.55, "rgba(0,0,0,0.34)"],
  [1, "rgba(0,0,0,0)"],
];

function loadImage(url: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function random(min: number, max: number) {
  return min + Math.random() * (max - min);
}

/**
 * 캔버스를 얹을 자리의 크기. 아직 화면에 붙지 않아 높이가 0이면, 포인터를 받는
 * 캠프 영역의 크기를 대신 쓴다.
 */
function measureStage(
  host: HTMLElement,
  surface?: HTMLElement | null,
): StageSize {
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
  if (typeof window === "undefined" || typeof document === "undefined")
    return null;
  if (!options.host) return null;
  if (!webglAvailable(() => document.createElement("canvas"))) return null;

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

  function radial(stops: [number, string][], pixelSize = 128) {
    const surface = document.createElement("canvas");
    surface.width = pixelSize;
    surface.height = pixelSize;
    const context = surface.getContext("2d");
    if (!context) return null;
    const half = pixelSize / 2;
    const gradient = context.createRadialGradient(
      half,
      half,
      0,
      half,
      half,
      half,
    );
    for (const [offset, color] of stops) gradient.addColorStop(offset, color);
    context.fillStyle = gradient;
    context.fillRect(0, 0, pixelSize, pixelSize);
    return PIXI.Texture.from(surface);
  }

  const glowTexture = radial(warmLight);
  const dotTexture = radial(dotLight, 64);
  const shadowTexture = radial(softShadow, 64);

  // ── 배경 ────────────────────────────────────────────────────────────────
  const backgroundImage = await loadImage(options.background);
  const background = backgroundImage
    ? new PIXI.Sprite(PIXI.Texture.from(backgroundImage))
    : null;
  if (background) {
    background.texture.source.scaleMode = "nearest";
    background.zIndex = -1_000_000;
    world.addChild(background);
  }

  // ── 캐릭터 텍스처 ───────────────────────────────────────────────────────
  const crewTextures = new Map<string, PixiTexture>();
  const crewImages = await Promise.all(
    options.crew.map((crew) => loadImage(crew.url)),
  );
  for (const [index, image] of crewImages.entries()) {
    if (!image) continue;
    const texture = PIXI.Texture.from(image);
    texture.source.scaleMode = "nearest";
    crewTextures.set(options.crew[index].id, texture);
  }

  // ── 조명 ────────────────────────────────────────────────────────────────
  const fireGlow =
    glowTexture ? new PIXI.Sprite(glowTexture) : new PIXI.Sprite();
  fireGlow.anchor.set(0.5, 0.62);
  fireGlow.blendMode = "add";
  fireGlow.tint = 0xffc078;
  fireGlow.zIndex = sortZ(options.fire.y, "campfire-light");
  world.addChild(fireGlow);

  const fireCore = dotTexture ? new PIXI.Sprite(dotTexture) : new PIXI.Sprite();
  fireCore.anchor.set(0.5, 0.62);
  fireCore.blendMode = "add";
  fireCore.tint = 0xffd9a0;
  fireCore.zIndex = sortZ(options.fire.y, "campfire-core");
  world.addChild(fireCore);

  // 통나무 의자·작업대 위의 은은한 빛. 캐릭터와 같은 Y 정렬 층에 둔다.
  const objectGlows = (options.objects ?? [])
    .filter((object) => object.kind === "seat" || object.kind === "workbench")
    .map((object) => {
      const sprite = glowTexture
        ? new PIXI.Sprite(glowTexture)
        : new PIXI.Sprite();
      sprite.anchor.set(0.5, 0.5);
      sprite.blendMode = "add";
      sprite.tint = object.kind === "workbench" ? 0xffb45c : 0xffc989;
      sprite.alpha = 0.05;
      sprite.zIndex = sortZ(object.y, "object-" + object.id);
      world.addChild(sprite);
      return { object, sprite };
    });

  const lanternObject = (options.objects ?? []).find(
    (object) => object.kind === "lantern",
  );
  const lanternLight =
    lanternObject && glowTexture ? new PIXI.Sprite(glowTexture) : null;
  if (lanternLight && lanternObject) {
    lanternLight.anchor.set(0.5, 0.5);
    lanternLight.blendMode = "add";
    lanternLight.tint = 0xffb668;
    lanternLight.zIndex = sortZ(lanternObject.y, "lantern-light");
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

  // ── 캐릭터 ──────────────────────────────────────────────────────────────
  const views = new Map<string, ActorView>();
  const allTweens: (PixiTween | PixiTimeline)[] = [];

  const bgFit = { scale: 1, x: 0, y: 0 };
  const parallax = { x: 0, y: 0 };

  function placeBackground() {
    if (!background) return;
    // 가장자리가 드러나지 않게 6% 여유를 두고 채운 뒤, 포인터를 따라 조금씩 민다.
    const fit = coverFit(
      { width: background.texture.width, height: background.texture.height },
      { width: size.width * 1.06, height: size.height * 1.06 },
    );
    bgFit.scale = fit.scale;
    bgFit.x = fit.x - size.width * 0.03;
    bgFit.y = fit.y - size.height * 0.03;
    background.scale.set(fit.scale);
    background.position.set(bgFit.x + parallax.x, bgFit.y + parallax.y);
  }

  function placeLights() {
    const fire = stagePoint(size, options.fire);
    fireGlow.position.set(fire.x, fire.y);
    fireGlow.width = size.width * 0.34;
    fireGlow.height = size.height * 0.34;
    fireCore.position.set(fire.x, fire.y);
    fireCore.width = size.width * 0.085;
    fireCore.height = size.width * 0.085;
    for (const { object, sprite } of objectGlows) {
      const point = stagePoint(size, object);
      sprite.position.set(point.x, point.y);
      const width = size.width * (object.kind === "workbench" ? 0.16 : 0.1);
      sprite.width = width;
      sprite.height = width * 0.62;
    }
    if (lanternLight && lanternObject) {
      const lantern = stagePoint(size, lanternObject);
      lanternLight.position.set(lantern.x, lantern.y);
      lanternLight.width = size.width * 0.2;
      lanternLight.height = size.width * 0.2;
    }
    if (cursorLight) {
      cursorLight.width = size.width * 0.34;
      cursorLight.height = size.width * 0.34;
    }
  }

  function sizeActor(view: ActorView) {
    const height = crewHeight(size);
    view.base = crewScale(
      { width: view.sprite.texture.width, height: view.sprite.texture.height },
      size,
    );
    view.sprite.scale.set(view.base);
    view.shadow.width = height * 0.42;
    view.shadow.height = Math.max(6, height * 0.1);
    view.aura.width = height * 0.78;
    view.aura.height = Math.max(16, height * 0.22);
  }

  function buildActor(id: string): ActorView | null {
    const texture = crewTextures.get(id);
    if (!texture) return null;
    const root = new PIXI.Container();
    const breath = new PIXI.Container();
    const body = new PIXI.Container();
    const sprite = new PIXI.Sprite(texture);
    sprite.anchor.set(0.5, 1);

    const shadow = new PIXI.Sprite(shadowTexture ?? PIXI.Texture.WHITE);
    shadow.anchor.set(0.5, 0.5);
    shadow.tint = 0x000000;
    shadow.alpha = 0.42;

    const aura = new PIXI.Sprite(glowTexture ?? PIXI.Texture.WHITE);
    aura.anchor.set(0.5, 0.5);
    aura.blendMode = "add";
    aura.tint = 0xffb050;
    aura.alpha = 0;
    aura.y = -1;

    body.addChild(sprite);
    breath.addChild(body);
    root.addChild(shadow, aura, breath);
    world.addChild(root);

    const pose: Pose = {
      sink: 0,
      squashX: 1,
      squashY: 1,
      facing: 1,
      bob: 0,
      tilt: 0,
    };
    const view: ActorView = {
      id,
      root,
      breath,
      body,
      sprite,
      shadow,
      aura,
      pose,
      base: 1,
      walking: false,
      sitting: false,
      quickX: gsap.quickTo(root, "x", { duration: 0.1, ease: "none" }),
      quickY: gsap.quickTo(root, "y", { duration: 0.1, ease: "none" }),
      breathing: null,
      bobTimeline: null,
      sitTween: null,
      faceTween: null,
    };
    sizeActor(view);
    if (!reducedMotion) {
      view.breathing = gsap.to(body.scale, {
        y: 1.015,
        duration: 2.6 + (id.length % 5) * 0.24,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
        delay: (id.length % 7) * 0.16,
      });
      view.bobTimeline = gsap.timeline({ paused: true, repeat: -1, yoyo: true }).to(pose, {
        bob: -3.2,
        tilt: 0.03,
        duration: 0.26,
        ease: "sine.inOut",
      });
      allTweens.push(view.breathing, view.bobTimeline);
    }
    views.set(id, view);
    return view;
  }

  function sitDown(view: ActorView, down: boolean) {
    view.sitting = down;
    view.sitTween?.kill();
    const rest = seatPose(down ? 1 : 0);
    if (reducedMotion) {
      // 움직임을 줄이는 환경에서는 보간 없이 앉은 자세로 바로 둔다.
      view.pose.sink = down ? 1 : 0;
      view.pose.squashY = rest.squashY;
      view.pose.squashX = rest.squashX;
      return;
    }
    view.sitTween = gsap.to(view.pose, {
      sink: down ? 1 : 0,
      squashY: rest.squashY,
      squashX: rest.squashX,
      duration: down ? 0.42 : 0.34,
      ease: down ? "power2.out" : "power2.inOut",
      overwrite: "auto",
    });
  }

  function turnTo(view: ActorView, facing: "left" | "right") {
    const sign = facing === "left" ? -1 : 1;
    if (view.pose.facing === sign) return;
    view.faceTween?.kill();
    if (reducedMotion) {
      view.pose.facing = sign;
      return;
    }
    // 뒤집히는 순간만 살짝 납작해져 고개를 돌리는 것처럼 보인다.
    view.faceTween = gsap
      .timeline()
      .to(view.pose, { squashX: 0.74, duration: 0.09, ease: "power1.in" })
      .to(view.pose, { facing: sign, duration: 0.001 })
      .to(view.pose, { squashX: 1, duration: 0.12, ease: "power1.out" });
  }

  // ── 불티와 반딧불이 ─────────────────────────────────────────────────────
  const embers: EmberView[] = [];
  const fireflies: FireflyView[] = [];

  function spawnParticles() {
    if (!dotTexture) return;
    for (let index = 0; index < 18; index += 1) {
      const sprite = new PIXI.Sprite(dotTexture);
      sprite.anchor.set(0.5);
      sprite.blendMode = "add";
      sprite.tint = index % 3 === 0 ? 0xfff0c0 : 0xffa850;
      sprite.alpha = 0;
      particles.addChild(sprite);
      const state: EmberState = { rise: 0, drift: 0, alpha: 0 };
      const ember: EmberView = {
        sprite,
        state,
        size: random(3, 7),
      };
      embers.push(ember);
      const rise = random(56, 150);
      const drift = random(-22, 22);
      const span = random(1.6, 3.4);
      const timeline = gsap
        .timeline({ repeat: -1, delay: random(0, 2.6) })
        .set(state, { rise: 0, drift: 0, alpha: 0 })
        .to(state, {
          rise: rise * 0.55,
          drift: drift * 0.55,
          alpha: 0.95,
          duration: span * 0.45,
          ease: "sine.out",
        })
        .to(state, {
          rise,
          drift,
          alpha: 0,
          duration: span * 0.55,
          ease: "sine.in",
        });
      allTweens.push(timeline);
    }
    for (let index = 0; index < 12; index += 1) {
      const sprite = new PIXI.Sprite(dotTexture);
      sprite.anchor.set(0.5);
      sprite.blendMode = "add";
      sprite.tint = 0xdcff8a;
      sprite.alpha = 0;
      sprite.width = random(2.4, 4.6);
      sprite.height = sprite.width;
      particles.addChild(sprite);
      const home = { x: random(6, 94), y: random(14, 60) };
      const state: FireflyState = { dx: 0, dy: 0, alpha: 0 };
      fireflies.push({ sprite, home, state });
      const reach = random(4, 10);
      const span = random(1.6, 2.8);
      const timeline = gsap
        .timeline({ repeat: -1, delay: random(0, 4) })
        .set(state, { dx: 0, dy: 0, alpha: 0 })
        .to(state, {
          dx: reach,
          dy: -reach * 0.55,
          alpha: 0.8,
          duration: span,
          ease: "sine.inOut",
        })
        .to(state, {
          dx: -reach * 0.7,
          dy: reach * 0.45,
          alpha: 0.1,
          duration: span * 1.1,
          ease: "sine.inOut",
        });
      allTweens.push(timeline);
    }
  }

  function placeParticles() {
    const fire = stagePoint(size, options.fire);
    for (const ember of embers) {
      ember.sprite.x = fire.x + ember.state.drift;
      ember.sprite.y = fire.y - ember.state.rise;
      ember.sprite.width = ember.size;
      ember.sprite.height = ember.size;
      ember.sprite.alpha = ember.state.alpha;
    }
    for (const firefly of fireflies) {
      firefly.sprite.x =
        ((firefly.home.x + firefly.state.dx * 0.6) / 100) * size.width;
      firefly.sprite.y =
        ((firefly.home.y + firefly.state.dy * 0.6) / 100) * size.height;
      firefly.sprite.alpha = firefly.state.alpha;
    }
  }

  // ── 프레임 ──────────────────────────────────────────────────────────────
  function paint() {
    // 통나무에 걸터앉으면 발끝을 축으로 몸을 내리고 눌러 앉힌다.
    const sink = crewHeight(size) * 0.26 + size.height * 0.016;
    for (const view of views.values()) {
      if (!view.root.visible) continue;
      view.breath.y = view.pose.sink * sink + view.pose.bob;
      view.breath.rotation = view.pose.tilt;
      view.sprite.scale.set(
        view.base * view.pose.facing * view.pose.squashX,
        view.base * view.pose.squashY,
      );
    }
  }

  const pointerSurface = options.surface ?? options.host;
  const firePulse = { value: 0 };
  let crewWorking = false;

  function frame() {
    paint();
    const time = performance.now() / 1000;
    const glow = reducedMotion ? 0.72 : flicker(time);
    fireGlow.alpha = 0.1 + glow * 0.16 + firePulse.value;
    fireCore.alpha = 0.06 + glow * 0.08;
    if (lanternLight) lanternLight.alpha = 0.1 + glow * 0.08;
    for (const { object, sprite } of objectGlows) {
      if (object.kind === "workbench") sprite.alpha = crewWorking ? 0.22 : 0.05;
    }
    if (background)
      background.position.set(bgFit.x + parallax.x, bgFit.y + parallax.y);
    if (!reducedMotion) placeParticles();
    if (cursorLight) cursorLight.position.set(cursorAt.x, cursorAt.y);
    app.render();
  }

  function apply(actor: StageActor) {
    let view = views.get(actor.memberId);
    if (!view) {
      view = buildActor(actor.memberId) ?? undefined;
      if (!view) return;
      view.root.position.set(
        (actor.x / 100) * size.width,
        (actor.y / 100) * size.height,
      );
    }
    view.root.visible = true;
    view.quickX((actor.x / 100) * size.width);
    view.quickY((actor.y / 100) * size.height);
    view.root.zIndex = sortZ(actor.y, actor.memberId);
    view.root.scale.set(depthScale(actor.y));

    if (actor.posture === "walk") {
      if (!view.walking) {
        view.walking = true;
        view.bobTimeline?.play();
      }
    } else if (view.walking) {
      view.walking = false;
      view.bobTimeline?.pause();
      view.pose.bob = 0;
      view.pose.tilt = 0;
    }

    if (actor.posture === "sit") {
      if (!view.sitting) sitDown(view, true);
    } else if (view.sitting) sitDown(view, false);

    turnTo(view, actor.facing);

    const working = actor.working || actor.posture === "work";
    view.aura.alpha = working
      ? 0.2 + fireLight(actor.x, actor.y, options.fire) * 0.22
      : 0;
    view.shadow.alpha = actor.posture === "sit" ? 0.3 : 0.42;
  }

  function resize() {
    const measured = measureStage(options.host, options.surface);
    size.width = measured.width;
    size.height = measured.height;
    app.renderer.resize(size.width, size.height);
    placeBackground();
    placeLights();
    for (const view of views.values()) sizeActor(view);
    placeParticles();
    frame();
  }

  // ── 포인터 ──────────────────────────────────────────────────────────────
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

  placeBackground();
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
      gsap.fromTo(
        firePulse,
        { value: 0.45 },
        { value: 0, duration: 1, ease: "power2.out", overwrite: "auto" },
      );
      for (const ember of embers.slice(0, 6)) {
        gsap.fromTo(
          ember.state,
          { alpha: 1, rise: 0 },
          {
            alpha: 0,
            rise: random(60, 120),
            duration: random(0.7, 1.2),
            overwrite: "auto",
          },
        );
      }
    },
    destroy() {
      pointerSurface.removeEventListener("pointermove", moveCursor);
      pointerSurface.removeEventListener("pointerleave", leaveCursor);
      document.removeEventListener("visibilitychange", onVisibility);
      gsap.ticker.remove(frame);
      for (const view of views.values()) {
        view.sitTween?.kill();
        view.faceTween?.kill();
        gsap.killTweensOf(view.root);
        gsap.killTweensOf(view.pose);
      }
      for (const tween of allTweens) tween.kill();
      allTweens.length = 0;
      gsap.killTweensOf(cursorAt);
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
