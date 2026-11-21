import { randomUUID } from "node:crypto";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { CrewMember } from "../../../shared/actions";
import type { CrewStore } from "../../store/store";

/** 사용자가 위키를 직접 언급했는지. 문서가 없을 때도 도구를 열어 첫 문서를 남기게 한다. */
export function mentionsWiki(text: string) {
  return /\bwiki\b|위키/i.test(text);
}

/**
 * 위키 도구는 모든 모델과 모든 역할에 같은 모양으로 준다. 읽기 범위는 프로젝트 전체이고,
 * 쓰기는 지금 이 업무에 배정된 팀원만 할 수 있다. 쓴 문서에는 업무 출처가 함께 남는다.
 */
export function wikiTools(
  store: CrewStore,
  context: { projectId: string; sessionId: string; jobId?: string },
  member: CrewMember,
  signal: AbortSignal,
  saved?: () => void,
): ToolSet {
  return {
    wiki_search: tool({
      description:
        "Search this project's shared wiki by words in a page title or body. Returns matching pages with an id, version and excerpt; read one with wiki_read.",
      inputSchema: z.object({
        query: z.string().trim().min(1).max(120),
        limit: z.int().min(1).max(10).optional(),
      }),
      execute: ({ query, limit }) => {
        signal.throwIfAborted();
        return store.searchWiki(context.projectId, query, limit ?? 5);
      },
    }),
    wiki_read: tool({
      description:
        "Read an active page in this project's shared wiki by the id from the wiki outline or wiki_search.",
      inputSchema: z.object({ id: z.uuid() }),
      execute: ({ id }) => {
        signal.throwIfAborted();
        return store.readWiki(context.projectId, id) ?? { error: "문서를 찾을 수 없어요." };
      },
    }),
    wiki_save: tool({
      description:
        "Write durable project knowledge in the shared wiki when asked, or when this work verified a fact, rule or decision that later work should not have to find again. Use null id and version 0 for a new page. Read an existing page first, keep its prior useful content and revision, and include the ids of reference pages.",
      inputSchema: z.object({
        id: z.uuid().nullable(),
        version: z.int().nonnegative(),
        title: z.string().trim().min(1).max(120),
        body: z.string().trim().min(1).max(24000),
        links: z.array(z.uuid()).max(64),
      }),
      execute: ({ id, ...page }) => {
        signal.throwIfAborted();
        const eligible = store.readMembers(context.projectId, member.roleId).some(
          (current) => current.id === member.id && current.hired &&
            (!current.assignmentJobId || current.assignmentJobId === context.jobId),
        );
        if (!eligible) return { error: "현재 팀원에게 위키 쓰기 권한이 없어요." };
        const pageId = id ?? randomUUID();
        try {
          store.saveWiki(context.sessionId, { id: pageId, ...page }, { name: member.name, jobId: context.jobId });
          saved?.();
          return { id: pageId, version: page.version + 1 };
        } catch (error) {
          return { error: error instanceof Error ? error.message : "위키에 저장할 수 없어요." };
        }
      },
    }),
  };
}
