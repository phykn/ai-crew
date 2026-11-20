export const chatCommands = {
  "/clear": "같은 프로젝트에서 빈 대화를 시작해요.",
} as const;

export function findChatCommand(text: string) {
  const command = text.trim();
  return Object.hasOwn(chatCommands, command)
    ? (command as keyof typeof chatCommands)
    : undefined;
}

export function suggestChatCommands(text: string) {
  return /^\/[^\s]*$/.test(text)
    ? Object.entries(chatCommands).filter(([command]) =>
        command.startsWith(text),
      )
    : [];
}
