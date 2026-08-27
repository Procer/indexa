import OpenAI from "openai";
import { QUERY_EXPANSION_PROMPT } from "./prompts";
import type { Slots } from "@/types";

const openai = new OpenAI();

export async function expandQuery(slots: Slots): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: QUERY_EXPANSION_PROMPT },
      { role: "user", content: JSON.stringify(slots) },
    ],
    temperature: 0.3,
    max_tokens: 200,
  });

  return response.choices[0].message.content ?? "";
}

export async function generateQueryEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });

  return response.data[0].embedding;
}
