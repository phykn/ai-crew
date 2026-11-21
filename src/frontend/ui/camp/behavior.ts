// Where the crew may walk, sit, work and hand off. The screen only follows this
// pure calculation. Coordinates are percentages of the camp box (x from the left,
// y from the top) and y is where the character's feet touch the ground. The
// obstacles trace the painted clearing, so the crew goes around the tent, the
// wagon, the table, the benches and the fire instead of through them.

import type { JobState, RoleId } from "../../../shared/actions";
import { benchArt, fireArt, type ObjectKind } from "./art/scene";

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
  /** Roles that like this spot; empty means anyone may use it. */
  roles?: RoleId[];
};

/** The fire pit's centre; seat facing and the aura both read it. */
export const campFire: Point = { x: 50.3, y: 49.6 };

// ── Walkable ground ────────────────────────────────────────────────────────
// The clearing is open grass inside the ring of trees and rocks.
const yard: Point[] = [
  { x: 13, y: 16 },
  { x: 38, y: 13 },
  { x: 62, y: 12 },
  { x: 86, y: 15 },
  { x: 91, y: 26 },
  { x: 92, y: 52 },
  { x: 89, y: 72 },
  { x: 80, y: 84 },
  { x: 63, y: 88 },
  { x: 40, y: 90 },
  { x: 22, y: 86 },
  { x: 12, y: 74 },
  { x: 10, y: 52 },
  { x: 11, y: 30 },
];

type WalkZone = { id: "yard"; points: Point[] };
const walkZones: WalkZone[] = [{ id: "yard", points: yard }];

type CampObstacle =
  | { id: string; kind: "polygon"; points: Point[] }
  | { id: string; kind: "ellipse"; center: Point; rx: number; ry: number };

/** The foot of every painted prop, so nobody walks through it. */
const obstacles: CampObstacle[] = [
  // The tent and the wagon cover the ground behind them, so their whole painted
  // body is closed; a crew member may stand only in front of them.
  {
    id: "tent",
    kind: "polygon",
    points: [
      { x: 26, y: 7 },
      { x: 42.3, y: 25 },
      { x: 41.3, y: 33.9 },
      { x: 31.7, y: 34.9 },
      { x: 23, y: 34.9 },
      { x: 13.5, y: 33.9 },
      { x: 12.5, y: 24.9 },
    ],
  },
  {
    id: "wagon",
    kind: "polygon",
    points: [
      { x: 68, y: 6 },
      { x: 97, y: 6 },
      { x: 97, y: 32 },
      { x: 68, y: 33.5 },
    ],
  },
  { id: "campfire", kind: "ellipse", center: campFire, rx: 7.4, ry: 3.4 },
  { id: "bench-west", kind: "ellipse", center: { x: 20.2, y: 68.8 }, rx: 8.6, ry: 1.3 },
  { id: "bench-east", kind: "ellipse", center: { x: 66.8, y: 33.5 }, rx: 8.6, ry: 1.3 },
  { id: "bench-south", kind: "ellipse", center: { x: 37.5, y: 75.6 }, rx: 8.6, ry: 1.3 },
  { id: "alchemy", kind: "ellipse", center: { x: 10.1, y: 49.4 }, rx: 9.6, ry: 1.8 },
  { id: "notice", kind: "ellipse", center: { x: 87.5, y: 45.4 }, rx: 8, ry: 1.5 },
  { id: "crates", kind: "ellipse", center: { x: 44, y: 16.5 }, rx: 3.4, ry: 1.5 },
  { id: "telescope", kind: "ellipse", center: { x: 87, y: 67.3 }, rx: 3.8, ry: 1.4 },
  { id: "easel", kind: "ellipse", center: { x: 66.3, y: 69.8 }, rx: 3.6, ry: 1.3 },
  { id: "firewood", kind: "ellipse", center: { x: 94, y: 78.8 }, rx: 5.6, ry: 1.7 },
  { id: "cauldron", kind: "ellipse", center: { x: 27.4, y: 85.7 }, rx: 2.6, ry: 1.1 },
  { id: "crystal-west", kind: "ellipse", center: { x: 5.3, y: 32.9 }, rx: 1.6, ry: 1 },
  { id: "crystal-south", kind: "ellipse", center: { x: 24, y: 85.2 }, rx: 1.8, ry: 1 },
  { id: "crystal-east", kind: "ellipse", center: { x: 95.2, y: 46.9 }, rx: 1.8, ry: 1 },
  { id: "banner", kind: "ellipse", center: { x: 8.6, y: 34.8 }, rx: 1, ry: 0.8 },
  { id: "barrel-tent", kind: "ellipse", center: { x: 15.4, y: 32.4 }, rx: 1.6, ry: 0.9 },
  { id: "barrel-east", kind: "ellipse", center: { x: 36.5, y: 29.9 }, rx: 1.6, ry: 0.9 },
  { id: "pine-south", kind: "ellipse", center: { x: 67.3, y: 87.7 }, rx: 3, ry: 1.5 },
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

/** Is this a place a foot may land, not water or a building inside? */
export function isWalkable(point: Point) {
  const inZone = walkZones.some(({ points }) => pointInPolygon(point, points));
  if (!inZone) return false;
  return !obstacles.some((obstacle) => insideObstacle(point, obstacle));
}

/** Does the straight line between two points cross an obstacle? */
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

// ── Spots ──────────────────────────────────────────────────────────────────
// Three log benches around the clearing, eight props to work at, and open grass
// to stroll over.
export const seats: CampSpot[] = [
  {
    id: "bench-west-seat",
    kind: "seat",
    x: 20.2,
    y: 70.4,
    facing: "right",
    label: "통나무 벤치",
  },
  {
    id: "bench-east-seat",
    kind: "seat",
    x: 66.8,
    y: 35.1,
    facing: "left",
    label: "통나무 벤치",
  },
  {
    id: "bench-south-seat",
    kind: "seat",
    x: 37.5,
    y: 77.2,
    facing: "right",
    label: "통나무 벤치",
  },
];

export const workSpots: CampSpot[] = [
  {
    id: "work-fire",
    kind: "work",
    x: 56.4,
    y: 45.6,
    facing: "left",
    label: "모닥불가",
    roles: ["test", "build", "hr", "assistant"],
  },
  {
    id: "work-tent",
    kind: "work",
    x: 27.5,
    y: 39.6,
    facing: "left",
    label: "천막 앞",
    roles: ["docs", "vision", "assistant"],
  },
  {
    id: "work-wagon",
    kind: "work",
    x: 76.6,
    y: 38.4,
    facing: "right",
    label: "마차 앞",
    roles: ["development", "build"],
  },
  {
    id: "work-alchemy",
    kind: "work",
    x: 14.4,
    y: 54.2,
    facing: "left",
    label: "연금 작업대",
    roles: ["style", "test"],
  },
  {
    id: "work-easel",
    kind: "work",
    x: 70.4,
    y: 71,
    facing: "left",
    label: "이젤 앞",
    roles: ["style", "vision"],
  },
  {
    id: "work-notice",
    kind: "work",
    x: 85.4,
    y: 50.2,
    facing: "right",
    label: "게시판 앞",
    roles: ["hr", "docs", "review"],
  },
  {
    id: "work-crates",
    kind: "work",
    x: 44.6,
    y: 21.4,
    facing: "left",
    label: "보급 상자 앞",
    roles: ["build", "hr"],
  },
  {
    id: "work-telescope",
    kind: "work",
    x: 90,
    y: 64,
    facing: "right",
    label: "망원경 옆",
    roles: ["vision", "review"],
  },
];

export const strollSpots: CampSpot[] = [
  { id: "walk-north-west", kind: "stroll", x: 22, y: 41, facing: "right", label: "풀밭" },
  { id: "walk-north", kind: "stroll", x: 50, y: 18, facing: "right", label: "풀밭" },
  { id: "walk-north-east", kind: "stroll", x: 57, y: 19, facing: "left", label: "풀밭" },
  { id: "walk-east-north", kind: "stroll", x: 76, y: 40, facing: "left", label: "풀밭" },
  { id: "walk-east", kind: "stroll", x: 87.5, y: 37, facing: "left", label: "풀밭" },
  { id: "walk-east-south", kind: "stroll", x: 85, y: 60, facing: "left", label: "풀밭" },
  { id: "walk-south-east", kind: "stroll", x: 78, y: 76, facing: "left", label: "풀밭" },
  { id: "walk-south", kind: "stroll", x: 56, y: 84.5, facing: "left", label: "풀밭" },
  { id: "walk-south-west", kind: "stroll", x: 41, y: 84, facing: "right", label: "풀밭" },
  { id: "walk-west-south", kind: "stroll", x: 25, y: 80, facing: "right", label: "풀밭" },
  { id: "walk-west", kind: "stroll", x: 14.5, y: 62, facing: "right", label: "풀밭" },
  { id: "walk-west-north", kind: "stroll", x: 15, y: 42, facing: "right", label: "풀밭" },
  { id: "walk-mid-north", kind: "stroll", x: 35, y: 38.5, facing: "right", label: "마당" },
  { id: "walk-mid-east", kind: "stroll", x: 72, y: 46, facing: "left", label: "마당" },
  { id: "walk-mid-south", kind: "stroll", x: 52, y: 72, facing: "left", label: "마당" },
  { id: "walk-mid-west", kind: "stroll", x: 31, y: 59.5, facing: "right", label: "마당" },
  { id: "walk-fire-north", kind: "stroll", x: 43, y: 42, facing: "right", label: "모닥불 위" },
  { id: "walk-fire-south", kind: "stroll", x: 58.5, y: 57, facing: "left", label: "모닥불 아래" },
];

export const campSpots: CampSpot[] = [...seats, ...workSpots, ...strollSpots];

/** A prop laid over the clearing; the coordinates are its foot centre. */
export type CampObject = {
  id: string;
  kind: ObjectKind;
  x: number;
  y: number;
  /** The drawing's real pixel size, multiplied by the background scale on screen. */
  w: number;
  h: number;
  label: string;
};

export const campObjects: CampObject[] = [
  {
    id: "campfire",
    kind: "campfire",
    x: campFire.x,
    y: campFire.y,
    w: fireArt.cellWidth,
    h: fireArt.cellHeight,
    label: "모닥불",
  },
  {
    id: "bench-west",
    kind: "bench",
    x: 20.2,
    y: 68.8,
    w: benchArt.width,
    h: benchArt.height,
    label: "통나무 벤치",
  },
  {
    id: "bench-east",
    kind: "bench",
    x: 66.8,
    y: 33.5,
    w: benchArt.width,
    h: benchArt.height,
    label: "통나무 벤치",
  },
  {
    id: "bench-south",
    kind: "bench",
    x: 37.5,
    y: 75.6,
    w: benchArt.width,
    h: benchArt.height,
    label: "통나무 벤치",
  },
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
      const freeStroll = strollSpots.filter((walk) => !used.has(walk.id));
      const freeSeats = seats.filter((seat) => !used.has(seat.id));
      const wander = freeStroll.length
        ? freeStroll[(idle * 5) % freeStroll.length]
        : null;
      spot =
        (idle % 2 === 0 ? freeSeats[0] ?? wander : wander ?? freeSeats[0]) ??
        null;
      idle += 1;
    }
    if (!spot) spot = strollSpots[0];
    used.add(spot.id);
    actors.push(placeAt(base, spot));
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
