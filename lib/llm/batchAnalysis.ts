import OpenAI from "openai";
import { BATCH_ANALYSIS_PROMPT } from "@/lib/llm/prompts";
import type { Product, ProductAnalysis } from "@/types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateBatchAnalysis(
  product: Pick<Product, "title" | "brand" | "category" | "price_cash" | "price_installment" | "specs">
): Promise<Pick<ProductAnalysis, "quality_price_score" | "quality_price_analysis">> {
  const context = {
    title: product.title,
    brand: product.brand,
    category: product.category,
    price_cash: product.price_cash,
    price_installment: product.price_installment,
    specs: product.specs,
  };

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: BATCH_ANALYSIS_PROMPT },
      { role: "user", content: JSON.stringify(context) },
    ],
    temperature: 0.3,
    max_tokens: 200,
  });

  const content = response.choices[0].message.content ?? "{}";
  const raw = JSON.parse(content) as Record<string, unknown>;

  const score = raw.quality_price_score as ProductAnalysis["quality_price_score"];
  const analysis = typeof raw.quality_price_analysis === "string" ? raw.quality_price_analysis : "";

  return {
    quality_price_score: ["EXCELENTE", "MUY BUENO", "BUENO", "REGULAR"].includes(score)
      ? score
      : "BUENO",
    quality_price_analysis: analysis,
  };
}
