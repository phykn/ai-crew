import { expect, test } from "vitest";
import type { RoleId } from "../../../../src/shared/actions";
import {
  campFire,
  campObjects,
  campSpots,
  decideActor,
  distance,
  emptyActor,
  facingBetween,
  findPath,
  handoffSpotFor,
  initialActors,
  isWalkable,
  segmentWalkable,
  seats,
  stepActor,
  strollSpots,
  watchSpotFor,
  workSpotFor,
  workSpots,
  type CampActorSeed,
  type Point,
} from "../../../../src/frontend/ui/camp/behavior";

function seed(
  memberId: string,
  roleId: RoleId,
  extra: Partial<CampActorSeed> = {},
): CampActorSeed {
  return {
    memberId,
    roleId,
    hired: true,
    working: false,
    jobId: null,
    jobState: null,
    ...extra,
  };
}

test("평지 마당 전체를 걷고 오브젝트가 놓인 발밑만 피한다", () => {
  for (const spot of campSpots) expect(isWalkable(spot)).toBe(true);
  // Outside the ring of trees there is no floor to stand on.
  expect(isWalkable({ x: 2, y: 50 })).toBe(false);
  expect(isWalkable({ x: 50, y: 95 })).toBe(false);
  expect(isWalkable({ x: 96, y: 40 })).toBe(false);
  expect(isWalkable({ x: 50, y: 6 })).toBe(false);
  // Every open patch of the clearing is walkable ground.
  expect(isWalkable({ x: 32, y: 50 })).toBe(true);
  expect(isWalkable({ x: 62, y: 62 })).toBe(true);
  expect(isWalkable({ x: 45, y: 25 })).toBe(true);
  // The foot of every painted prop is not.
  expect(isWalkable({ x: 50.3, y: 49.6 })).toBe(false); // 모닥불
  expect(isWalkable({ x: 27.9, y: 34.4 })).toBe(false); // 천막
  expect(isWalkable({ x: 82.2, y: 31.9 })).toBe(false); // 마차
  expect(isWalkable({ x: 20.2, y: 68.8 })).toBe(false); // 왼쪽 벤치
  expect(isWalkable({ x: 37.5, y: 75.6 })).toBe(false); // 아래 벤치
  expect(isWalkable({ x: 66.8, y: 33.5 })).toBe(false); // 오른쪽 벤치
  expect(isWalkable({ x: 10.1, y: 49.4 })).toBe(false); // 연금 작업대
  expect(isWalkable({ x: 87.5, y: 45.4 })).toBe(false); // 게시판
  expect(isWalkable({ x: 66.3, y: 69.8 })).toBe(false); // 이젤
});

test("어떤 자리에서 어떤 자리로 가도 길은 물과 장애물을 지나지 않는다", () => {
  const unreachable: string[] = [];
  for (const from of campSpots) {
    for (const to of campSpots) {
      if (from.id === to.id) continue;
      const path = findPath(from, to);
      if (!path.length) {
        unreachable.push(from.id + " → " + to.id);
        continue;
      }
      let previous: Point = { x: from.x, y: from.y };
      for (const point of path) {
        expect(segmentWalkable(previous, point)).toBe(true);
        expect(isWalkable(point)).toBe(true);
        previous = point;
      }
      expect(distance(previous, to)).toBeLessThan(0.5);
    }
  }
  expect(unreachable).toEqual([]);
});

test("걷는 동안 방향을 바꾸고 목표에 정확히 도착한다", () => {
  const actor = emptyActor(
    seed("development", "development", { working: true, jobId: "job-1", jobState: "developing" }),
  );
  const walking = stepActor(
    { ...actor, x: 60, y: 70, facing: "right", route: [{ x: 52, y: 70 }] },
    0.5,
    { now: 0, actors: [actor], random: () => 0.5 },
  );
  expect(walking.posture).toBe("walk");
  expect(walking.x).toBeLessThan(60);
  expect(walking.facing).toBe("left");
  const arrived = stepActor(walking, 2, {
    now: 100,
    actors: [walking],
    random: () => 0.5,
  });
  expect(arrived.route).toEqual([]);
  expect(distance(arrived, { x: 52, y: 70 })).toBeLessThan(0.01);
  expect(facingBetween({ x: 10, y: 50 }, { x: 20, y: 50 })).toBe("right");
});

test("한 의자에는 한 사람만 앉고, 일하는 크루는 작업 자리를 먼저 받는다", () => {
  const seeds: CampActorSeed[] = [
    seed("assistant", "assistant"),
    seed("hr", "hr"),
    seed("development", "development", {
      working: true,
      jobId: "job-1",
      jobState: "developing",
    }),
    seed("docs", "docs", { working: true, jobId: "job-2", jobState: "developing" }),
    seed("style", "style"),
    seed("review", "review"),
    seed("test", "test", { working: true, jobId: "job-3", jobState: "reviewing" }),
    seed("build", "build"),
    seed("vision", "vision"),
  ];
  const actors = initialActors(seeds, 0);
  const seatsUsed = actors
    .filter((actor) => actor.spotId)
    .map((actor) => actor.spotId!);
  expect(new Set(seatsUsed).size).toBe(seatsUsed.length);
  const workUsed = actors
    .filter((actor) => actor.workSpotId)
    .map((actor) => actor.workSpotId!);
  expect(workUsed.length).toBe(3);
  expect(new Set(workUsed).size).toBe(3);
  for (const id of ["development", "docs", "test"]) {
    expect(actors.find((actor) => actor.memberId === id)?.workSpotId).toBeTruthy();
  }
  // 자리 좌표가 서로 겹치지 않는다.
  for (let i = 0; i < actors.length; i += 1)
    for (let j = i + 1; j < actors.length; j += 1)
      expect(distance(actors[i], actors[j])).toBeGreaterThan(2);

  const taken = new Set<string>();
  const first = workSpotFor("development", { x: 50, y: 60 }, taken)!;
  taken.add(first.id);
  const second = workSpotFor("development", { x: 50, y: 60 }, taken)!;
  expect(second.id).not.toBe(first.id);

  for (const seat of seats) {
    const facing = facingBetween(seat, campFire);
    expect(seat.facing).toBe(facing);
  }
});

test("비서는 일이 배정된 담당자 옆으로 걸어가 말을 건넨다", () => {
  const development = emptyActor(
    seed("development", "development", {
      working: true,
      jobId: "job-1",
      jobState: "developing",
    }),
  );
  const positioned = { ...development, x: 41.5, y: 53.8, posture: "work" as const };
  const assistant = {
    ...emptyActor(seed("assistant", "assistant")),
    x: 34,
    y: 58.4,
  };
  const actors = [assistant, positioned];
  const planned = decideActor(assistant, {
    now: 10_000,
    actors,
    random: () => 0.9,
  });
  expect(planned.intent).toBe("handoff");
  expect(planned.targetMemberId).toBe("development");
  expect(planned.route.length).toBeGreaterThan(0);
  const last = planned.route[planned.route.length - 1];
  expect(distance(last, positioned)).toBeGreaterThan(2);
  expect(distance(last, positioned)).toBeLessThan(7);
  expect(facingBetween(last, positioned)).toBe(planned.facing);

  // 도착하면 전달 말풍선을 띄우고 같은 일을 다시 건네지 않는다.
  const arrived = stepActor(
    { ...planned, x: last.x, y: last.y, route: [] },
    0,
    { now: 12_000, actors, random: () => 0.9 },
  );
  expect(arrived.posture).toBe("handoff");
  expect(arrived.bubble).toBe("📋 전달!");
  expect(arrived.handedOff).toContain("job-1");
  const again = decideActor(arrived, {
    now: 30_000,
    actors: [arrived, positioned],
    random: () => 0.9,
  });
  expect(again.intent).not.toBe("handoff");
});

test("담당자가 자리를 옮기면 전달하러 가던 비서는 그 자리에 멈추지 않는다", () => {
  const development = emptyActor(
    seed("development", "development", {
      working: true,
      jobId: "job-1",
      jobState: "developing",
    }),
  );
  const assistant = {
    ...emptyActor(seed("assistant", "assistant")),
    x: 34,
    y: 58.4,
  };
  const target = { ...development, x: 46.8, y: 62, posture: "work" as const };
  const planned = decideActor(assistant, {
    now: 10_000,
    actors: [assistant, target],
    random: () => 0.9,
  });
  expect(planned.intent).toBe("handoff");
  const spot = planned.route[planned.route.length - 1];
  // 도착했더니 담당자가 작업 자리로 걸어가 버렸다.
  const moved = { ...target, x: 49.2, y: 53.4 };
  const arrived = stepActor(
    { ...planned, x: spot.x, y: spot.y, route: [] },
    0,
    { now: 12_000, actors: [planned, moved], random: () => 0.9 },
  );
  expect(arrived.bubble).toBeNull();
  expect(arrived.handedOff).not.toContain("job-1");
  expect(arrived.intent === "handoff" ? arrived.route.length : 1).toBeGreaterThan(0);
});

test("스타일·리뷰는 개발자가 일하는 옆으로 가서 그쪽을 바라본다", () => {
  const development = emptyActor(
    seed("development", "development", {
      working: true,
      jobId: "job-1",
      jobState: "developing",
    }),
  );
  const worker = { ...development, x: 41.5, y: 53.8, posture: "work" as const };
  for (const roleId of ["style", "review"] as const) {
    const watcher = {
      ...emptyActor(seed(roleId, roleId)),
      x: roleId === "style" ? 30 : 30,
      y: roleId === "style" ? 62 : 62,
    };
    const planned = decideActor(watcher, {
      now: 10_000,
      actors: [watcher, worker],
      random: () => 0.9,
    });
    expect(planned.intent).toBe("watch");
    expect(planned.targetMemberId).toBe("development");
    const last = planned.route[planned.route.length - 1];
    expect(distance(last, worker)).toBeLessThan(7);
    expect(facingBetween(last, worker)).toBe(planned.facing);
    const arrived = stepActor(
      { ...planned, x: last.x, y: last.y, route: [] },
      0,
      { now: 12_000, actors: [planned, worker], random: () => 0.9 },
    );
    expect(arrived.posture).toBe("watch");
    expect(arrived.bubble).toBe(roleId === "review" ? "✨ 확인 중" : "👀 지켜보는 중");
  }
  // 지켜보는 자리는 작업자를 등지지 않는다.
  const spot = watchSpotFor({ x: 41.5, y: 53.8 }, new Set())!;
  expect(spot.facing).toBe(facingBetween(spot, { x: 41.5, y: 53.8 }));
  const handoff = handoffSpotFor({ x: 41.5, y: 53.8 }, new Set())!;
  expect(handoff.facing).toBe(facingBetween(handoff, { x: 41.5, y: 53.8 }));
});

test("쉬는 크루는 한두 명씩만 움직이고 자리에서 자리로 순환한다", () => {
  const seeds: CampActorSeed[] = [
    seed("assistant", "assistant"),
    seed("hr", "hr"),
    seed("development", "development"),
    seed("build", "build"),
    seed("docs", "docs"),
    seed("style", "style"),
    seed("review", "review"),
    seed("test", "test"),
    seed("vision", "vision"),
  ];
  let actors = initialActors(seeds, 0);
  let walkingPeak = 0;
  for (let tick = 1; tick <= 200; tick += 1) {
    const now = tick * 100;
    const list = [...actors];
    for (let index = 0; index < list.length; index += 1)
      list[index] = stepActor(list[index], 0.1, {
        now,
        actors: list,
        random: () => ((tick * 37) % 100) / 100,
      });
    actors = list;
    const walking = actors.filter((actor) => actor.posture === "walk").length;
    walkingPeak = Math.max(walkingPeak, walking);
    for (const actor of actors) expect(isWalkable(actor)).toBe(true);
  }
  expect(walkingPeak).toBeGreaterThan(0);
  expect(walkingPeak).toBeLessThanOrEqual(4);
  const seatsUsed = actors.map((actor) => actor.spotId).filter(Boolean);
  expect(new Set(seatsUsed).size).toBe(seatsUsed.length);
});

test("캠프에는 모닥불과 통나무 벤치 세 개가 발밑 좌표로 놓인다", () => {
  // The clearing painting carries the scenery; only the animated fire and the
  // benches the crew can sit on stay separate sprites.
  expect([...new Set(campObjects.map(({ kind }) => kind))].sort()).toEqual([
    "bench",
    "campfire",
  ]);
  const benches = campObjects.filter(({ kind }) => kind === "bench");
  expect(benches).toHaveLength(3);
  for (const object of campObjects) {
    expect(object.w).toBeGreaterThan(0);
    expect(object.h).toBeGreaterThan(0);
    expect(object.x).toBeGreaterThan(2);
    expect(object.x).toBeLessThan(98);
    expect(object.y).toBeGreaterThan(6);
    expect(object.y).toBeLessThan(97);
    // A prop's foot is never on walkable ground.
    expect(isWalkable(object)).toBe(false);
  }
  // Every bench has exactly one seat, and every seat can be walked to.
  expect(seats).toHaveLength(3);
  for (const bench of benches)
    expect(
      seats.filter((seat) => seat.id.startsWith(bench.id + "-seat")),
    ).toHaveLength(1);
  for (const seat of seats) expect(isWalkable(seat)).toBe(true);
  expect(strollSpots.length).toBeGreaterThan(8);
  expect(workSpots.length).toBeGreaterThanOrEqual(6);
});
