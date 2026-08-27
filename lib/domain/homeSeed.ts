import type { GuidingQuestion } from "@/types";

// El home (app/page.tsx) ya no tiene buscador propio — arranca el chat guiado
// con una frase deliberadamente vaga para que category/use_cases salgan
// vacíos del slot-filling y el backend pida tipo de equipo primero. Como
// app/search/[token]/page.tsx sabe de antemano que ESTA frase puntual siempre
// termina pidiendo exactamente esta pregunta (mismo texto/tags que
// getGuidingQuestions en lib/llm/slotFilling.ts), la muestra al toque sin
// esperar el round-trip al LLM (~4s) — esa espera pasó de ser opcional (atrás
// de un botón) a ser lo primero que ve cualquier visita al sitio.
export const HOME_SEED_PHRASE = "quiero comprar algo de tecnología, todavía no sé bien qué";

export const HOME_SEED_QUESTION: GuidingQuestion = {
  text: "¿Qué tipo de equipo estás buscando?",
  tags: ["💻 Notebook", "🖥️ PC de escritorio", "📱 Tablet", "📺 Smart TV", "📲 Celular"],
};
