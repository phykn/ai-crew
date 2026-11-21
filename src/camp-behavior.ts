// 캠프 안에서 크루가 어디까지 걸을 수 있고, 어디에 앉고, 누구에게 일을 건네고,
// 누구를 지켜보는지를 정하는 순수 계산. 화면 코드는 이 계산만 따라 그린다.
//
// 좌표는 캠프 상자의 백분율(x: 왼쪽 0~100, y: 위 0~100)이고 y는 캐릭터의 발밑이다.
// 배경 그림(demo/assets/camp.webp)의 오두막·모닥불·개울·다리를 피해서 마당과 다리만 걷는다.

import type { JobState, RoleId } from "./actions";

export type Point = { x: number; y: number };
export type Facing = "left" | "right";
export type SpotKind = "seat" | "work" | "stroll";
export type Posture = "stand" | "walk" | "sit" | "work" | "watch" | "handoff";
export type Intent = "idle" | "work" | "handoff" | "watch" | "stroll" | "sit";

export type CampSpot = Point & {
  id: string;
  kind: SpotKind;
  facing: Facing;
  label: string;
  /** 이 자리에서 일하기 좋아하는 역할. 비어 있으면 누구나 쓸 수 있다. */
  roles?: RoleId[];
};

/** 모닥불 화덕의 중심. 좌석 방향과 오라 계산에 함께 쓴다. */
export const campFire: Point = { x: 59.7, y: 61.8 };

// ── 걸을 수 있는 곳 ────────────────────────────────────────────────────────
// 마당: 오두막 앞 흙길과 풀밭. 왼쪽 아래 개울과 오른쪽 개울을 따라 경계를 그었다.
const yard: Point[] = [
  { x: 6, y: 56 },
  { x: 14, y: 55 },
  { x: 24, y: 56 },
  { x: 31, y: 57.5 },
  { x: 36, y: 57 },
  { x: 39, y: 53.5 },
  { x: 43, y: 52.5 },
  { x: 48, y: 51.8 },
  { x: 51, y: 52.2 },
  { x: 54, y: 53.5 },
  { x: 58, y: 54.5 },
  { x: 63, y: 55.6 },
  { x: 67, y: 57.4 },
  { x: 72, y: 57.2 },
  { x: 76, y: 57.6 },
  { x: 79, y: 60 },
  { x: 82, y: 63 },
  { x: 84, y: 68 },
  { x: 84, y: 74 },
  { x: 80, y: 79 },
  { x: 72, y: 81 },
  { x: 64, y: 80 },
  { x: 58, y: 79 },
  { x: 55, y: 77 },
  { x: 50, y: 75 },
  { x: 44, y: 75.5 },
  { x: 38, y: 76.5 },
  { x: 34, y: 79 },
  { x: 30, y: 82 },
  { x: 26, y: 85 },
  { x: 20, y: 82 },
  { x: 16, y: 78 },
  { x: 12, y: 72 },
  { x: 8, y: 66 },
  { x: 6, y: 60 },
];

// 다리 위 널판. 마당과 이어져 있고 아래쪽 개울을 건너는 자리다.
const bridge: Point[] = [
  { x: 36, y: 76 },
  { x: 54, y: 76 },
  { x: 58, y: 98 },
  { x: 38, y: 98 },
];

export type WalkZone = { id: "yard" | "bridge"; points: Point[] };
export const walkZones: WalkZone[] = [
  { id: "yard", points: yard },
  { id: "bridge", points: bridge },
];

export type CampObstacle =
  | { id: string; kind: "polygon"; points: Point[] }
  | { id: string; kind: "ellipse"; center: Point; rx: number; ry: number };

/** 물·건물·화덕처럼 절대 밟고 지나갈 수 없는 곳. */
export const obstacles: CampObstacle[] = [
  // 오두막 본체. 문 앞 계단은 밖으로 빼 둔다.
  {
    id: "cabin",
    kind: "polygon",
    points: [
      { x: 0, y: 0 },
      { x: 37, y: 0 },
      { x: 37, y: 52 },
      { x: 33.5, y: 56 },
      { x: 30, y: 56 },
      { x: 30, y: 51 },
      { x: 0, y: 51 },
    ],
  },
  // 장작더미
  {
    id: "woodpile",
    kind: "polygon",
    points: [
      { x: 0, y: 39 },
      { x: 11, y: 39 },
      { x: 11, y: 52.5 },
      { x: 0, y: 52.5 },
    ],
  },
  // 오두막 앞 작업대
  {
    id: "workbench",
    kind: "polygon",
    points: [
      { x: 36.5, y: 42.8 },
      { x: 49.5, y: 42.8 },
      { x: 49.5, y: 49.2 },
      { x: 36.5, y: 49.2 },
    ],
  },
  // 모루
  {
    id: "anvil",
    kind: "polygon",
    points: [
      { x: 46.8, y: 48.2 },
      { x: 51.2, y: 48.2 },
      { x: 51.2, y: 51.6 },
      { x: 46.8, y: 51.6 },
    ],
  },
  // 물통
  {
    id: "barrel",
    kind: "polygon",
    points: [
      { x: 51.4, y: 44.8 },
      { x: 54.6, y: 44.8 },
      { x: 54.6, y: 49.2 },
      { x: 51.4, y: 49.2 },
    ],
  },
  // 오른쪽 울타리
  {
    id: "fence",
    kind: "polygon",
    points: [
      { x: 55, y: 43.5 },
      { x: 64, y: 43.5 },
      { x: 64, y: 47.5 },
      { x: 55, y: 47.5 },
    ],
  },
  // 모닥불 화덕(돌 테두리까지)
  { id: "campfire", kind: "ellipse", center: campFire, rx: 4.4, ry: 4.4 },
  // 오른쪽 개울
  {
    id: "stream-right",
    kind: "polygon",
    points: [
      { x: 79, y: 42 },
      { x: 88, y: 42 },
      { x: 88, y: 57 },
      { x: 83, y: 60 },
      { x: 79, y: 58.5 },
    ],
  },
  // 아래쪽 개울(다리 아래)
  {
    id: "stream-bottom",
    kind: "polygon",
    points: [
      { x: 58, y: 88 },
      { x: 86, y: 88 },
      { x: 86, y: 100 },
      { x: 58, y: 100 },
    ],
  },
  // 오른쪽 앞 큰 소나무
  {
    id: "pine-right",
    kind: "polygon",
    points: [
      { x: 85, y: 55 },
      { x: 100, y: 55 },
      { x: 100, y: 100 },
      { x: 85, y: 100 },
    ],
  },
  // 왼쪽 위 숲
  {
    id: "forest-left",
    kind: "polygon",
    points: [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 56 },
      { x: 0, y: 56 },
    ],
  },
];

export function pointInPolygon(point: Point, polygon: Point[]) {
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

export function insideObstacle(point: Point, obstacle: CampObstacle) {
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
export const seats: CampSpot[] = [
  {
    id: "seat-stump-north",
    kind: "seat",
    x: 52,
    y: 57.4,
    facing: "right",
    label: "통나무 의자",
  },
  {
    id: "seat-stump-west",
    kind: "seat",
    x: 46.8,
    y: 62,
    facing: "right",
    label: "통나무 의자",
  },
  {
    id: "seat-stump-southwest",
    kind: "seat",
    x: 49.3,
    y: 66.6,
    facing: "right",
    label: "통나무 의자",
  },
  {
    id: "seat-stump-east",
    kind: "seat",
    x: 76,
    y: 58.6,
    facing: "left",
    label: "통나무 의자",
  },
  {
    id: "seat-stump-south",
    kind: "seat",
    x: 59.2,
    y: 70,
    facing: "right",
    label: "통나무 의자",
  },
  {
    id: "seat-log-bench",
    kind: "seat",
    x: 77.4,
    y: 66,
    facing: "left",
    label: "통나무 걸상",
  },
];

export const workSpots: CampSpot[] = [
  {
    id: "work-bench",
    kind: "work",
    x: 41.5,
    y: 53.8,
    facing: "right",
    label: "작업대",
    roles: ["development", "docs", "vision"],
  },
  {
    id: "work-anvil",
    kind: "work",
    x: 49.2,
    y: 53.4,
    facing: "left",
    label: "모루",
    roles: ["build", "development"],
  },
  {
    id: "work-porch",
    kind: "work",
    x: 34,
    y: 58.4,
    facing: "right",
    label: "오두막 앞",
    roles: ["assistant", "hr", "test"],
  },
  {
    id: "work-fire",
    kind: "work",
    x: 64.6,
    y: 63.4,
    facing: "left",
    label: "모닥불가",
    roles: ["test", "build", "hr", "assistant"],
  },
  {
    id: "work-bridge",
    kind: "work",
    x: 45,
    y: 88,
    facing: "left",
    label: "다리 위",
    roles: ["vision", "test"],
  },
  {
    id: "work-garden",
    kind: "work",
    x: 70,
    y: 70.6,
    facing: "left",
    label: "텃밭",
    roles: ["style", "docs"],
  },
  {
    id: "work-woodpile",
    kind: "work",
    x: 12.6,
    y: 55.2,
    facing: "left",
    label: "장작더미 앞",
    roles: ["build", "hr"],
  },
  {
    id: "work-table-end",
    kind: "work",
    x: 47.4,
    y: 55.2,
    facing: "right",
    label: "작업대 끝",
    roles: ["docs", "review"],
  },
];

export const strollSpots: CampSpot[] = [
  { id: "walk-left", kind: "stroll", x: 30, y: 62, facing: "right", label: "마당" },
  { id: "walk-left-low", kind: "stroll", x: 37, y: 68, facing: "right", label: "마당" },
  { id: "walk-mid", kind: "stroll", x: 44, y: 68, facing: "right", label: "마당" },
  { id: "walk-mid-low", kind: "stroll", x: 52, y: 72, facing: "left", label: "마당" },
  { id: "walk-front", kind: "stroll", x: 58, y: 74.5, facing: "left", label: "마당" },
  { id: "walk-right-low", kind: "stroll", x: 66, y: 68, facing: "left", label: "마당" },
  { id: "walk-right", kind: "stroll", x: 72, y: 66, facing: "left", label: "마당" },
  { id: "walk-garden", kind: "stroll", x: 76.5, y: 72, facing: "left", label: "텃밭" },
  { id: "walk-north", kind: "stroll", x: 55.6, y: 56.2, facing: "right", label: "모닥불 위" },
  { id: "walk-north-east", kind: "stroll", x: 65.4, y: 56.9, facing: "left", label: "모닥불 위" },
  { id: "walk-south", kind: "stroll", x: 60, y: 68.4, facing: "left", label: "모닥불 아래" },
  { id: "walk-south-east", kind: "stroll", x: 65.4, y: 67.4, facing: "left", label: "모닥불 아래" },
  { id: "walk-bench", kind: "stroll", x: 46, y: 58.6, facing: "right", label: "오두막 앞" },
  { id: "walk-left-edge", kind: "stroll", x: 22, y: 66, facing: "right", label: "풀밭" },
  { id: "walk-lower-left", kind: "stroll", x: 30, y: 74, facing: "left", label: "풀밭" },
  { id: "walk-bridge-head", kind: "stroll", x: 40, y: 79, facing: "left", label: "다리 어귀" },
  { id: "walk-bridge-mid", kind: "stroll", x: 47, y: 88, facing: "left", label: "다리 위" },
];

export const campSpots: CampSpot[] = [...seats, ...workSpots, ...strollSpots];

export function spotById(id: string) {
  return campSpots.find((spot) => spot.id === id);
}

/** 캠프 그림 위에 얹는 상호작용 오브젝트. 좌표는 중심점이고 y는 발밑 기준이다. */
export type CampObject = {
  id: string;
  kind: "seat" | "campfire" | "workbench" | "lantern";
  x: number;
  y: number;
  /** 상자 크기(백분율) */
  w: number;
  h: number;
  label: string;
};

export const campObjects: CampObject[] = [
  ...seats.map((seat) => ({
    id: seat.id,
    kind: "seat" as const,
    x: seat.x,
    y: seat.y - 2.1,
    w: 6.8,
    h: 5.4,
    label: seat.label,
  })),
  {
    id: "campfire",
    kind: "campfire",
    x: campFire.x,
    y: campFire.y - 1.4,
    w: 11,
    h: 9.4,
    label: "모닥불",
  },
  {
    id: "workbench",
    kind: "workbench",
    x: 43,
    y: 46.2,
    w: 13.6,
    h: 7.6,
    label: "작업대",
  },
  {
    id: "lantern",
    kind: "lantern",
    x: 40.6,
    y: 41.4,
    w: 4.2,
    h: 6,
    label: "오두막 등불",
  },
];

// ── 길 찾기 ────────────────────────────────────────────────────────────────
type GraphNode = { id: string; point: Point };
const graphNodes: GraphNode[] = campSpots.map((spot) => ({
  id: spot.id,
  point: { x: spot.x, y: spot.y },
}));
const graphLinks = new Map<string, { id: string; cost: number }[]>();
const MAX_LINK = 21;

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
export function seatFor(from: Point, taken: Set<string>) {
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

export const walkSpeed = 8.6; // 초당 캠프 상자 백분율

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
      spot = workSpots.find((work) => work.id === "work-porch") ?? null;
    }
    if (!spot || used.has(spot.id)) {
      spot = seatFor({ x: 50, y: 60 }, used);
    }
    if (!spot) {
      spot = strollSpots.find((candidate) => !used.has(candidate.id)) ?? strollSpots[0];
    }
    used.add(spot.id);
    actors.push(placeAt(base, spot));
  }
  return actors;
}

export type DecideContext = {
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
