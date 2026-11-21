// 캠프 안에서 크루가 어디까지 걸을 수 있고, 어디에 앉고, 누구에게 일을 건네고,
// 누구를 지켜보는지를 정하는 순수 계산. 화면 코드는 이 계산만 따라 그린다.
//
// 좌표는 캠프 상자의 백분율(x: 왼쪽 0~100, y: 위 0~100)이고 y는 캐릭터의 발밑이다.
// 바닥은 pixlrt로 깐 평지 타일맵이고, 캠프 마당 전체를 걷고,
// 천막·마차·모닥불·벤치·보급 상자가 놓인 발밑 자리만 돌아서 지나간다.

import type { JobState, RoleId } from "../../../shared/actions";
import { objectSize } from "./art/scene";

export type Point = { x: number; y: number };
type Facing = "left" | "right";
type SpotKind = "seat" | "work" | "stroll";
type Posture = "stand" | "walk" | "sit" | "work" | "watch" | "handoff";
type Intent = "idle" | "work" | "handoff" | "watch" | "stroll" | "sit";

type CampSpot = Point & {
  id: string;
  kind: SpotKind;
  facing: Facing;
  label: string;
  /** 이 자리에서 일하기 좋아하는 역할. 비어 있으면 누구나 쓸 수 있다. */
  roles?: RoleId[];
};

/** 모닥불 화덕의 중심. 좌석 방향과 오라 계산에 함께 쓴다. */
export const campFire: Point = { x: 50, y: 50 };

// ── 걸을 수 있는 곳 ────────────────────────────────────────────────────────
// 배경에 하늘도 절벽도 물도 없으므로 캠프 마당 전체가 걸을 수 있는 땅이다.
const yard: Point[] = [
  { x: 6, y: 12 },
  { x: 94, y: 12 },
  { x: 94, y: 90 },
  { x: 6, y: 90 },
];

type WalkZone = { id: "yard"; points: Point[] };
const walkZones: WalkZone[] = [{ id: "yard", points: yard }];

type CampObstacle =
  | { id: string; kind: "polygon"; points: Point[] }
  | { id: string; kind: "ellipse"; center: Point; rx: number; ry: number };

/** 천막·마차·모닥불·벤치처럼 밟고 지나갈 수 없는 자리. 그림의 발밑 면적만 막는다. */
const obstacles: CampObstacle[] = [
  { id: "tent", kind: "ellipse", center: { x: 19, y: 33 }, rx: 14.5, ry: 2.8 },
  { id: "wagon", kind: "ellipse", center: { x: 80, y: 34 }, rx: 13, ry: 2.8 },
  { id: "campfire", kind: "ellipse", center: campFire, rx: 5, ry: 2.8 },
  { id: "bench-west", kind: "ellipse", center: { x: 35.5, y: 52.6 }, rx: 5.2, ry: 1 },
  { id: "bench-east", kind: "ellipse", center: { x: 64.5, y: 52.6 }, rx: 5.2, ry: 1 },
  { id: "bench-south", kind: "ellipse", center: { x: 50, y: 61.4 }, rx: 5.6, ry: 1.2 },
  { id: "crates", kind: "ellipse", center: { x: 13, y: 80 }, rx: 4.2, ry: 2.4 },
];

function pointInPolygon(point: Point, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function insideObstacle(point: Point, obstacle: CampObstacle) {
  if (obstacle.kind === "ellipse") {
    const dx = (point.x - obstacle.center.x) / obstacle.rx;
    const dy = (point.y - obstacle.center.y) / obstacle.ry;
    return dx * dx + dy * dy <= 1;
  }
  return pointInPolygon(point, obstacle.points);
}

/** 물이나 건물 안이 아닌, 실제로 발을 디딜 수 있는 자리인가. */
export function isWalkable(point: Point) {
  const inZone = walkZones.some(({ points }) => pointInPolygon(point, points));
  if (!inZone) return false;
  return !obstacles.some((obstacle) => insideObstacle(point, obstacle));
}

/** 두 점을 잇는 직선이 장애물을 가로지르지 않는가. */
export function segmentWalkable(from: Point, to: Point, steps = 64) {
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    if (!isWalkable({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }))
      return false;
  }
  return true;
}

export function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function facingBetween(from: Point, to: Point): Facing {
  return to.x < from.x ? "left" : "right";
}

// ── 자리 ──────────────────────────────────────────────────────────────────
// 모닥불을 가운데 두고 통나무 벤치 세 개가 둘러싼다. 한 벤치에 두 명씩 앉는다.
export const seats: CampSpot[] = [
  {
    id: "bench-west-seat",
    kind: "seat",
    x: 35.5,
    y: 55.5,
    facing: "right",
    label: "통나무 벤치",
  },
  {
    id: "bench-east-seat",
    kind: "seat",
    x: 64.5,
    y: 55.5,
    facing: "left",
    label: "통나무 벤치",
  },
  {
    id: "bench-south-seat",
    kind: "seat",
    x: 50,
    y: 64.3,
    facing: "right",
    label: "통나무 벤치",
  },
];

export const workSpots: CampSpot[] = [
  {
    id: "work-fire",
    kind: "work",
    x: 55.5,
    y: 45.8,
    facing: "left",
    label: "모닥불가",
    roles: ["test", "build", "hr", "assistant"],
  },
  {
    id: "work-tent",
    kind: "work",
    x: 25,
    y: 37.6,
    facing: "left",
    label: "천막 앞",
    roles: ["docs", "vision", "assistant"],
  },
  {
    id: "work-wagon",
    kind: "work",
    x: 71,
    y: 39,
    facing: "right",
    label: "마차 앞",
    roles: ["development", "build"],
  },
  {
    id: "work-crates",
    kind: "work",
    x: 19.5,
    y: 82,
    facing: "left",
    label: "보급 상자 앞",
    roles: ["hr", "style"],
  },
  {
    id: "work-path",
    kind: "work",
    x: 50,
    y: 39,
    facing: "right",
    label: "길 위",
    roles: ["development", "docs", "review"],
  },
  {
    id: "work-west",
    kind: "work",
    x: 27,
    y: 50,
    facing: "right",
    label: "마당 서쪽",
    roles: ["style", "test"],
  },
  {
    id: "work-east",
    kind: "work",
    x: 73,
    y: 50,
    facing: "left",
    label: "마당 동쪽",
    roles: ["vision", "review"],
  },
];

export const strollSpots: CampSpot[] = [
  { id: "walk-north-west", kind: "stroll", x: 30, y: 22, facing: "right", label: "풀밭" },
  { id: "walk-north", kind: "stroll", x: 50, y: 17, facing: "right", label: "풀밭" },
  { id: "walk-north-east", kind: "stroll", x: 65, y: 24, facing: "left", label: "풀밭" },
  { id: "walk-east-north", kind: "stroll", x: 88, y: 42, facing: "left", label: "풀밭" },
  { id: "walk-east", kind: "stroll", x: 87, y: 62, facing: "left", label: "풀밭" },
  { id: "walk-east-south", kind: "stroll", x: 82, y: 79, facing: "left", label: "풀밭" },
  { id: "walk-south-east", kind: "stroll", x: 68, y: 86, facing: "left", label: "풀밭" },
  { id: "walk-south", kind: "stroll", x: 52, y: 85, facing: "left", label: "풀밭" },
  { id: "walk-south-west", kind: "stroll", x: 38, y: 86, facing: "right", label: "풀밭" },
  { id: "walk-west-south", kind: "stroll", x: 23, y: 72, facing: "right", label: "풀밭" },
  { id: "walk-west", kind: "stroll", x: 11, y: 58, facing: "right", label: "풀밭" },
  { id: "walk-west-north", kind: "stroll", x: 10, y: 42, facing: "right", label: "풀밭" },
  { id: "walk-mid-north", kind: "stroll", x: 36, y: 40, facing: "right", label: "마당" },
  { id: "walk-mid-east", kind: "stroll", x: 66, y: 42, facing: "left", label: "마당" },
  { id: "walk-mid-south", kind: "stroll", x: 60, y: 73, facing: "left", label: "마당" },
  { id: "walk-mid-west", kind: "stroll", x: 33, y: 68, facing: "right", label: "마당" },
  { id: "walk-fire-north", kind: "stroll", x: 43, y: 45, facing: "right", label: "모닥불 위" },
  { id: "walk-fire-south", kind: "stroll", x: 57, y: 70, facing: "left", label: "모닥불 아래" },
];

export const campSpots: CampSpot[] = [...seats, ...workSpots, ...strollSpots];

/** 캠프 그림 위에 얹는 개별 오브젝트. 좌표는 바닥에 닿는 발밑 중심이다. */
export type CampObject = {
  id: string;
  kind: "campfire" | "bench" | "tent" | "wagon" | "crates";
  x: number;
  y: number;
  /** 그림의 실제 픽셀 크기. 화면 크기는 아트 배율을 곱해 정한다. */
  w: number;
  h: number;
  label: string;
};

export const campObjects: CampObject[] = [
  { id: "tent", kind: "tent", x: 19, y: 33, ...objectSize("tent"), label: "천막" },
  { id: "wagon", kind: "wagon", x: 80, y: 34, ...objectSize("wagon"), label: "마차" },
  { id: "campfire", kind: "campfire", x: campFire.x, y: campFire.y, ...objectSize("campfire"), label: "모닥불" },
  { id: "bench-west", kind: "bench", x: 35.5, y: 55.6, ...objectSize("bench"), label: "통나무 벤치" },
  { id: "bench-east", kind: "bench", x: 64.5, y: 55.6, ...objectSize("bench"), label: "통나무 벤치" },
  { id: "bench-south", kind: "bench", x: 50, y: 64.4, ...objectSize("bench"), label: "통나무 벤치" },
  { id: "crates", kind: "crates", x: 13, y: 80, ...objectSize("crates"), label: "보급 상자" },
];

// ── 길 찾기 ────────────────────────────────────────────────────────────────
type GraphNode = { id: string; point: Point };
const graphNodes: GraphNode[] = campSpots.map((spot) => ({
  id: spot.id,
  point: { x: spot.x, y: spot.y },
}));
const graphLinks = new Map<string, { id: string; cost: number }[]>();
const MAX_LINK = 34;

function buildGraph() {
  if (graphLinks.size) return;
  for (const node of graphNodes) graphLinks.set(node.id, []);
  for (let i = 0; i < graphNodes.length; i += 1) {
    for (let j = i + 1; j < graphNodes.length; j += 1) {
      const a = graphNodes[i];
      const b = graphNodes[j];
      const cost = distance(a.point, b.point);
      if (cost > MAX_LINK) continue;
      if (!segmentWalkable(a.point, b.point)) continue;
      graphLinks.get(a.id)!.push({ id: b.id, cost });
      graphLinks.get(b.id)!.push({ id: a.id, cost });
    }
  }
}

function nodePoint(id: string) {
  return graphNodes.find((node) => node.id === id)!.point;
}

function nearestNode(point: Point) {
  let best: { id: string; distance: number } | null = null;
  for (const node of graphNodes) {
    const gap = distance(point, node.point);
    if (best && gap >= best.distance) continue;
    if (!segmentWalkable(point, node.point)) continue;
    best = { id: node.id, distance: gap };
  }
  return best?.id ?? null;
}

/** 가장 가까운 지점에서 목표까지 장애물을 돌아가는 길. 갈 수 없으면 빈 배열. */
export function findPath(from: Point, to: Point): Point[] {
  if (distance(from, to) < 0.4) return [];
  if (segmentWalkable(from, to)) return [{ x: to.x, y: to.y }];
  buildGraph();
  const start = nearestNode(from);
  const goal = nearestNode(to);
  if (!start || !goal) return [];
  if (start === goal) {
    const path = [nodePoint(goal), { x: to.x, y: to.y }];
    return path.filter((point) => distance(point, to) > 0.4);
  }
  const costs = new Map<string, number>([[start, 0]]);
  const cameFrom = new Map<string, string>();
  const open = new Set<string>([start]);
  while (open.size) {
    let current: string | null = null;
    let bestCost = Infinity;
    for (const id of open) {
      const cost = costs.get(id) ?? Infinity;
      if (cost < bestCost) {
        bestCost = cost;
        current = id;
      }
    }
    if (!current) break;
    if (current === goal) break;
    open.delete(current);
    for (const link of graphLinks.get(current) ?? []) {
      const next = bestCost + link.cost;
      if (next >= (costs.get(link.id) ?? Infinity)) continue;
      costs.set(link.id, next);
      cameFrom.set(link.id, current);
      open.add(link.id);
    }
  }
  if (!costs.has(goal)) return [];
  const ids = [goal];
  while (ids[0] !== start) {
    const previous = cameFrom.get(ids[0]);
    if (!previous) return [];
    ids.unshift(previous);
  }
  const path: Point[] = ids.map(nodePoint);
  path.push({ x: to.x, y: to.y });
  return path.filter(
    (point, index) => index === 0 || distance(point, path[index - 1]) > 0.4,
  );
}

// ── 자리 고르기 ────────────────────────────────────────────────────────────
function takenSpots(
  actors: { memberId: string; spotId: string | null; workSpotId?: string | null }[],
  ignore?: string,
) {
  const taken = new Set<string>();
  for (const actor of actors) {
    if (actor.memberId === ignore) continue;
    if (actor.spotId) taken.add(actor.spotId);
    if (actor.workSpotId) taken.add(actor.workSpotId);
  }
  return taken;
}

function crowded(point: Point, actors: CampActor[], selfId: string) {
  return actors.some((other) => {
    if (other.memberId === selfId || !other.hired) return false;
    if (distance(other, point) < 3.2) return true;
    const destination = other.route[other.route.length - 1];
    return Boolean(destination && distance(destination, point) < 3.2);
  });
}

/** 역할에 맞는 작업 자리를 먼저, 없으면 가까운 빈 작업 자리를 고른다. */
export function workSpotFor(
  roleId: RoleId,
  from: Point,
  taken: Set<string>,
  ignore?: string,
) {
  const free = workSpots.filter(
    (spot) => !taken.has(spot.id) && spot.id !== ignore,
  );
  if (!free.length) return null;
  const preferred = free
    .filter((spot) => spot.roles?.includes(roleId))
    .sort((a, b) => distance(from, a) - distance(from, b));
  return preferred[0] ?? free.sort((a, b) => distance(from, a) - distance(from, b))[0];
}

/** 가까운 빈 통나무 의자. 자리가 다 차면 null. */
function seatFor(from: Point, taken: Set<string>) {
  const free = seats.filter((spot) => !taken.has(spot.id));
  if (!free.length) return null;
  return free.sort((a, b) => distance(from, a) - distance(from, b))[0];
}

/** 작업 중인 사람 옆에서 지켜보는 자리. 작업자를 바라본다. */
export function watchSpotFor(
  worker: Point,
  taken: Set<string>,
  actors: CampActor[] = [],
  selfId = "",
) {
  const candidates: Point[] = [
    { x: worker.x - 6, y: worker.y + 2.4 },
    { x: worker.x + 6, y: worker.y + 2.4 },
    { x: worker.x + 2.4, y: worker.y + 4.8 },
    { x: worker.x - 2.4, y: worker.y + 4.8 },
    { x: worker.x + 5.4, y: worker.y - 2.2 },
  ];
  for (const point of candidates) {
    if (!isWalkable(point)) continue;
    if (campSpots.some((spot) => taken.has(spot.id) && distance(spot, point) < 1.6))
      continue;
    if (distance(point, worker) < 2) continue;
    if (crowded(point, actors, selfId)) continue;
    return { ...point, facing: facingBetween(point, worker) };
  }
  return null;
}

/** 일을 건네러 담당자 바로 옆에 서는 자리. 담당자를 마주 본다. */
export function handoffSpotFor(
  target: Point,
  taken: Set<string>,
  actors: CampActor[] = [],
  selfId = "",
) {
  const candidates: Point[] = [
    { x: target.x - 6.2, y: target.y + 0.8 },
    { x: target.x + 6.2, y: target.y + 0.8 },
    { x: target.x - 4.6, y: target.y + 4.2 },
    { x: target.x + 4.6, y: target.y + 4.2 },
  ];
  for (const point of candidates) {
    if (!isWalkable(point)) continue;
    if (distance(point, target) < 2.5) continue;
    if (campSpots.some((spot) => taken.has(spot.id) && distance(spot, point) < 1.6))
      continue;
    if (crowded(point, actors, selfId)) continue;
    return { ...point, facing: facingBetween(point, target) };
  }
  return null;
}

// ── 배우(캐릭터)의 상태 ────────────────────────────────────────────────────
export type CampActor = {
  memberId: string;
  roleId: RoleId;
  hired: boolean;
  working: boolean;
  jobId: string | null;
  jobState: JobState | null;
  x: number;
  y: number;
  facing: Facing;
  posture: Posture;
  spotId: string | null;
  workSpotId: string | null;
  intent: Intent;
  targetMemberId: string | null;
  handoffJobId: string | null;
  route: Point[];
  bubble: string | null;
  bubbleUntil: number;
  nextDecisionAt: number;
  handedOff: string[];
  watching: string | null;
};

export type CampActorSeed = {
  memberId: string;
  roleId: RoleId;
  hired: boolean;
  working: boolean;
  jobId: string | null;
  jobState: JobState | null;
};

const walkSpeed = 8.6; // 초당 캠프 상자 백분율

export function emptyActor(seed: CampActorSeed, now = 0): CampActor {
  return {
    ...seed,
    x: 50,
    y: 60,
    facing: "right",
    posture: "stand",
    spotId: null,
    workSpotId: null,
    intent: "idle",
    targetMemberId: null,
    handoffJobId: null,
    route: [],
    bubble: null,
    bubbleUntil: 0,
    nextDecisionAt: now + 2400,
    handedOff: [],
    watching: null,
  };
}

function placeAt(actor: CampActor, spot: CampSpot): CampActor {
  return {
    ...actor,
    x: spot.x,
    y: spot.y,
    facing: spot.facing,
    posture: spot.kind === "seat" ? "sit" : "stand",
    spotId: spot.kind === "seat" ? spot.id : null,
    workSpotId: null,
    route: [],
    intent: spot.kind === "seat" ? "sit" : "idle",
  };
}

/** 처음 그릴 때의 자리. SSR과 움직임 줄이기 설정에서도 겹치지 않는다. */
export function initialActors(seeds: CampActorSeed[], now = 0): CampActor[] {
  const used = new Set<string>();
  const actors: CampActor[] = [];
  let idle = 0;
  for (const [index, seed] of seeds.entries()) {
    const base = { ...emptyActor(seed, now), nextDecisionAt: now + 1400 + index * 900 };
    let spot: CampSpot | null = null;
    if (seed.working) {
      spot = workSpotFor(seed.roleId, { x: 50, y: 60 }, used);
      if (spot)
        actors.push({
          ...placeAt(base, spot),
          posture: "work",
          intent: "work",
          workSpotId: spot.id,
        });
      if (spot) used.add(spot.id);
      continue;
    }
    if (seed.roleId === "assistant") {
      spot = workSpots.find((work) => work.id === "work-fire") ?? null;
    }
    // 쉬는 크루는 통나무와 마당을 번갈아 받아 한 자리에 몰리지 않는다.
    if (!spot || used.has(spot.id)) {
      spot =
        (idle % 2 === 0
          ? seats.find((seat) => !used.has(seat.id))
          : strollSpots.find((walk) => !used.has(walk.id))) ??
        strollSpots.find((walk) => !used.has(walk.id)) ??
        seats.find((seat) => !used.has(seat.id)) ??
        null;
    }
    if (!spot) spot = strollSpots[0];
    used.add(spot.id);
    actors.push(placeAt(base, spot));
    idle += 1;
  }
  return actors;
}

type DecideContext = {
  now: number;
  actors: CampActor[];
  random: () => number;
};

function actorAt(actors: CampActor[], memberId: string | null) {
  return memberId
    ? (actors.find(({ memberId: id }) => id === memberId) ?? null)
    : null;
}

/** 일하는 담당자 중에서 일을 건네거나 지켜볼 만한 사람. */
function busyCrew(actors: CampActor[], rolesFilter?: RoleId[]) {
  return actors.filter(
    (actor) =>
      actor.working &&
      actor.jobId &&
      ["planning", "developing", "reviewing"].includes(actor.jobState ?? "") &&
      (!rolesFilter || rolesFilter.includes(actor.roleId)),
  );
}

function workSpotOf(actor: CampActor, actors: CampActor[]) {
  const taken = takenSpots(actors, actor.memberId);
  const own = actor.workSpotId
    ? workSpots.find((spot) => spot.id === actor.workSpotId)
    : null;
  if (own && !taken.has(own.id)) return own;
  return workSpotFor(actor.roleId, actor, taken);
}

/**
 * 지금 무엇을 할지 정한다.
 * 1) 배정된 일이 있으면 작업 자리로 걸어가 일한다.
 * 2) 비서는 아직 건네지 않은 일을 담당자에게 전하러 간다.
 * 3) 스타일·리뷰는 일하는 사람 옆으로 가서 지켜본다.
 * 4) 쉬는 크루는 6~12초마다 빈 통나무 의자나 산책 지점으로 움직인다.
 */
export function decideActor(actor: CampActor, context: DecideContext): CampActor {
  if (!actor.hired) return actor;
  const taken = takenSpots(context.actors, actor.memberId);
  const self = { x: actor.x, y: actor.y };
  const random = context.random;
  const walking = actor.route.length > 0;

  if (actor.working && actor.jobId) {
    const spot = workSpotOf(actor, context.actors);
    if (!spot) return actor;
    if (
      actor.posture === "work" &&
      actor.workSpotId === spot.id &&
      distance(self, spot) < 0.8
    )
      return actor;
    if (walking && actor.intent === "work") return actor;
    return {
      ...actor,
      intent: "work",
      targetMemberId: null,
      handoffJobId: null,
      watching: null,
      bubble: null,
      route: findPath(self, spot),
      posture: "walk",
      spotId: null,
      workSpotId: spot.id,
    };
  }

  if (actor.roleId === "assistant") {
    const target = busyCrew(context.actors).find(
      (other) =>
        other.roleId !== "assistant" &&
        other.jobId &&
        !actor.handedOff.includes(other.jobId),
    );
    if (target) {
      if (
        actor.posture === "handoff" &&
        actor.targetMemberId === target.memberId
      )
        return actor;
      if (walking && actor.intent === "handoff" && actor.targetMemberId === target.memberId)
        return actor;
      const spot = handoffSpotFor(
        target,
        taken,
        context.actors,
        actor.memberId,
      );
      if (spot) {
        return {
          ...actor,
          intent: "handoff",
          targetMemberId: target.memberId,
          handoffJobId: target.jobId,
          watching: null,
          bubble: null,
          route: findPath(self, spot),
          posture: "walk",
          facing: facingBetween(spot, target),
        };
      }
    }
  }

  if (actor.roleId === "style" || actor.roleId === "review") {
    const watchedTargets = new Set(
      context.actors
        .filter(
          (other) =>
            other.memberId !== actor.memberId && other.intent === "watch",
        )
        .map((other) => other.targetMemberId),
    );
    const crew = busyCrew(context.actors, [
      "development",
      "docs",
      "build",
      "test",
    ]);
    const free = crew.filter(
      (other) => !watchedTargets.has(other.memberId),
    );
    const watched = (free.length ? free : crew).sort(
      (a, b) => distance(self, a) - distance(self, b),
    )[0];
    if (watched) {
      const same = actor.watching === watched.memberId;
      if (same && walking && actor.intent === "watch") return actor;
      if (same && actor.posture === "watch" && distance(self, watched) < 8) {
        return {
          ...actor,
          bubble: actor.roleId === "review" ? "✨ 확인 중" : "👀 지켜보는 중",
          bubbleUntil: context.now + 6000,
          nextDecisionAt: context.now + 5200,
        };
      }
      if (!same || actor.posture !== "watch") {
        const spot = watchSpotFor(
          watched,
          taken,
          context.actors,
          actor.memberId,
        );
        if (spot) {
          return {
            ...actor,
            intent: "watch",
            watching: watched.memberId,
            targetMemberId: watched.memberId,
            handoffJobId: null,
            route: findPath(self, spot),
            posture: "walk",
            facing: facingBetween(spot, watched),
          };
        }
      }
      return actor;
    }
  }

  if (walking || context.now < actor.nextDecisionAt) return actor;

  const idleWalkers = context.actors.filter(
    (other) =>
      other.memberId !== actor.memberId &&
      other.route.length > 0 &&
      (other.intent === "sit" || other.intent === "stroll"),
  ).length;
  if (idleWalkers >= 2)
    return { ...actor, nextDecisionAt: context.now + 1400 };

  const roll = random();
  const idleFor = () => context.now + 6000 + Math.floor(random() * 6000);
  if (roll < 0.42) {
    const seat = seatFor(self, taken);
    if (seat && actor.spotId !== seat.id) {
      return {
        ...actor,
        intent: "sit",
        watching: null,
        targetMemberId: null,
        handoffJobId: null,
        bubble: null,
        route: findPath(self, seat),
        posture: "walk",
        nextDecisionAt: idleFor(),
      };
    }
  }
  if (roll < 0.86) {
    const spots = strollSpots.filter(
      (spot) => !taken.has(spot.id) && !(distance(spot, self) < 3),
    );
    if (spots.length) {
      const spot = spots[Math.floor(random() * spots.length)];
      return {
        ...actor,
        intent: "stroll",
        watching: null,
        targetMemberId: null,
        handoffJobId: null,
        bubble: null,
        route: findPath(self, spot),
        posture: "walk",
        nextDecisionAt: idleFor(),
      };
    }
  }
  return {
    ...actor,
    intent: "idle",
    watching: null,
    targetMemberId: null,
    handoffJobId: null,
    bubble: null,
    route: [],
    posture: actor.spotId ? "sit" : "stand",
    nextDecisionAt: idleFor(),
  };
}

/** 도착했을 때의 자세와 말풍선. */
function arrived(actor: CampActor, context: DecideContext): CampActor {
  const at = { x: actor.x, y: actor.y };
  switch (actor.intent) {
    case "work": {
      const spot =
        workSpots.find((item) => distance(item, at) < 0.8) ??
        workSpots.find((item) => item.id === actor.workSpotId);
      return {
        ...actor,
        posture: "work",
        bubble: null,
        spotId: null,
        facing: spot ? spot.facing : actor.facing,
        workSpotId: spot?.id ?? actor.workSpotId,
        route: [],
      };
    }
    case "handoff": {
      const target = actorAt(context.actors, actor.targetMemberId);
      // 담당자가 자리를 옮겼으면 도착한 곳에서 말을 걸지 않고 다시 따라간다.
      if (!target || distance(at, target) > 7)
        return {
          ...actor,
          posture: "stand",
          bubble: null,
          route: [],
          nextDecisionAt: 0,
        };
      return {
        ...actor,
        posture: "handoff",
        facing: target ? facingBetween(at, target) : actor.facing,
        bubble: "📋 전달!",
        bubbleUntil: context.now + 2800,
        handedOff:
          actor.handoffJobId && !actor.handedOff.includes(actor.handoffJobId)
            ? [...actor.handedOff, actor.handoffJobId]
            : actor.handedOff,
        route: [],
        nextDecisionAt: context.now + 4200,
      };
    }
    case "watch": {
      const target = actorAt(context.actors, actor.targetMemberId);
      return {
        ...actor,
        posture: "watch",
        facing: target ? facingBetween(at, target) : actor.facing,
        bubble: actor.roleId === "review" ? "✨ 확인 중" : "👀 지켜보는 중",
        bubbleUntil: context.now + 6000,
        route: [],
        nextDecisionAt: context.now + 5200,
      };
    }
    case "sit": {
      const seat = seats.find((item) => distance(item, at) < 0.8);
      return {
        ...actor,
        posture: "sit",
        spotId: seat?.id ?? null,
        facing: seat ? seat.facing : actor.facing,
        workSpotId: null,
        route: [],
      };
    }
    default:
      return {
        ...actor,
        posture: "stand",
        bubble: null,
        spotId: null,
        workSpotId: null,
        route: [],
      };
  }
}

/** 한 틱(초 단위) 움직인다. 길이 끝나면 도착 자세로 바꾼다. */
export function stepActor(
  actor: CampActor,
  seconds: number,
  context: DecideContext,
): CampActor {
  let next = actor;
  if (next.bubbleUntil && context.now >= next.bubbleUntil)
    next = { ...next, bubble: null, bubbleUntil: 0 };
  if (next.route.length) {
    let remaining = walkSpeed * seconds;
    let point = { x: next.x, y: next.y };
    let facing = next.facing;
    let route = [...next.route];
    while (remaining > 0 && route.length) {
      const target = route[0];
      const gap = distance(point, target);
      if (gap < 0.01) {
        route.shift();
        continue;
      }
      const step = Math.min(gap, remaining);
      const ratio = step / gap;
      point = {
        x: point.x + (target.x - point.x) * ratio,
        y: point.y + (target.y - point.y) * ratio,
      };
      if (Math.abs(target.x - point.x) > 0.02)
        facing = facingBetween(point, target);
      remaining -= step;
      if (step >= gap) route.shift();
    }
    next = {
      ...next,
      x: point.x,
      y: point.y,
      facing,
      route,
      spotId: null,
      workSpotId: next.workSpotId,
      posture: route.length ? "walk" : next.posture,
    };
    if (!route.length) next = arrived(next, context);
  } else if (next.posture === "walk") {
    next = arrived(next, context);
  }
  // 전달·지켜보기 대상이 멀어지면 그 자리에 서 있지 않고 다시 찾아간다.
  if (
    (next.posture === "handoff" || next.posture === "watch") &&
    !next.route.length
  ) {
    const target = actorAt(context.actors, next.targetMemberId);
    const reach = next.posture === "watch" ? 8 : 7;
    if (!target || distance(next, target) > reach)
      next = {
        ...next,
        posture: "stand",
        bubble: null,
        watching: null,
        targetMemberId: null,
        nextDecisionAt: 0,
      };
  }
  if (
    !next.route.length &&
    next.posture !== "walk" &&
    context.now >= next.nextDecisionAt
  )
    next = decideActor(next, { ...context, actors: context.actors });
  return next;
}
