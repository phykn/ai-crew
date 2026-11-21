import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { campState, idleLine, timeOfDay } from "../../../src/backend/store/camp";
import { CrewStore } from "../../../src/backend/store/store";

test("the camp reads one stored state: who works, on what, and who is highlighted", () => {
  const members = [
    {
      id: "assistant",
      roleId: "assistant" as const,
      name: "하나",
      provider: "local" as const,
      hired: true,
    },
    {
      id: "development",
      roleId: "development" as const,
      name: "태오",
      provider: "local" as const,
      hired: true,
    },
    {
      id: "test",
      roleId: "test" as const,
      name: "민재",
      provider: "local" as const,
      hired: false,
    },
  ];
  const jobs = [
    {
      id: "job-1",
      projectId: "p",
      sessionId: "s",
      request: "notice 문구 변경",
      state: "developing" as const,
      approvalId: null,
      clarification: null,
      plan: null,
      workflowId: null,
      workflowVersion: null,
      worktree: null,
      branch: null,
      baseCommit: null,
      applyState: "none" as const,
      applyNote: null,
    },
  ];
  const assignees = [
    { jobId: "job-1", memberId: "development", roleId: "development" as const },
  ];
  const state = campState({
    members,
    jobs,
    assignees,
    selectedJobId: null,
    hour: 9,
  });
  expect(state.highlightedJobId).toBe("job-1");
  expect(state.members.find(({ id }) => id === "development")).toMatchObject({
    status: "개발",
    working: true,
    highlighted: true,
    jobTitle: "notice 문구 변경",
    line: null,
  });
  expect(state.members.find(({ id }) => id === "assistant")).toMatchObject({
    status: "대기",
    working: false,
    highlighted: false,
  });
  expect(state.members.find(({ id }) => id === "assistant")?.line).toBeTruthy();
  expect(state.members.find(({ id }) => id === "test")).toMatchObject({
    status: "미고용",
    working: false,
  });
});

test("camp and idle lines never create a request, message or activity", () => {
  const store = new CrewStore(":memory:");
  try {
    store.openFolder("/fixture");
    const before = store.snapshot();
    const camp = store.snapshot().camp;
    expect(camp.members).toHaveLength(before.members.length);
    expect(
      camp.members.every(({ status }) =>
        ["대기", "미고용"].includes(status),
      ),
    ).toBe(true);
    const after = store.snapshot();
    expect(after.messages).toEqual(before.messages);
    expect(after.activity).toEqual(before.activity);
    expect(after.jobs).toEqual(before.jobs);
  } finally {
    store.close();
  }
});

test("idle lines follow the time of day and the member", () => {
  expect(timeOfDay(8)).toBe("morning");
  expect(timeOfDay(13)).toBe("day");
  expect(timeOfDay(20)).toBe("evening");
  expect(timeOfDay(2)).toBe("night");
  const member = {
    id: "review",
    roleId: "review" as const,
    name: "현우",
    provider: "local" as const,
    hired: true,
  };
  expect(idleLine(member, 8)).toBe(idleLine(member, 9));
  expect(idleLine(member, 8)).not.toBe("");
  expect(["아침 잘 먹었어요?", "오늘은 뭐부터 할까요?", "커피 한 잔 하고 시작하죠."]).toContain(
    idleLine(member, 8),
  );
  const store = new CrewStore(":memory:");
  try {
    store.openFolder("/fixture");
    store.createJob(store.snapshot().session!.id, randomUUID(), "일 하나");
    expect(store.snapshot().jobs).toHaveLength(1);
  } finally {
    store.close();
  }
});
