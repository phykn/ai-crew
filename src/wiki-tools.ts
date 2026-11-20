import { randomUUID } from "node:crypto";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { CrewMember } from "./actions";
import type { CrewStore } from "./store";

export function mentionsWiki(text: string) {
  return /\bwiki\b|위키/i.test(text);
}

export function wikiTools(
  store: CrewStore,
  context: { projectId: string; sessionId: string; jobId?: string; canRead: boolean },
  member: CrewMember,
  signal: AbortSignal,
  saved?: () => void,
): ToolSet {
  return {
    ...(context.canRead ? { wiki_read: tool({
      description: "Read an active page in this project's shared wiki by UUID from the wiki outline.",
      inputSchema: z.object({ id: z.uuid() }),
      execute: ({ id }) => {
        signal.throwIfAborted();
        return store.readWiki(context.projectId, id) ?? { error: "문서를 찾을 수 없어요." };
      },
    }) } : {}),
    wiki_save: tool({
      description: "Write durable project knowledge in the shared wiki when asked or when it is a relevant verified outcome. Use null id and version 0 for a new page. Read an existing page first, keep its prior useful content and revision, and include selected reference page IDs.",
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
