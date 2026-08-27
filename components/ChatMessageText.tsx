// Los chats (GuidedSearchChat, ChatBubble del comparador) piden al LLM que
// remarque el nombre de un producto envolviéndolo en **negrita** (ver
// SALES_ADVISOR_RULES / buildSearchRefineChatPrompt en lib/llm/prompts.ts) —
// sin librería de markdown completa, alcanza con parsear ese único patrón.
export function ChatMessageText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-bold">
            {part.slice(2, -2)}
          </strong>
        ) : (
          part
        )
      )}
    </>
  );
}
