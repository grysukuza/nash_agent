import { anthropic } from "@ai-sdk/anthropic"
import { openai } from "@ai-sdk/openai"
import type { LanguageModel } from "ai"

export type ProviderName = "openai" | "anthropic"

export function configuredProvider(): ProviderName | null {
  const requested = process.env.AI_PROVIDER
  const openaiKey = process.env.OPENAI_API_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (requested === "anthropic" && anthropicKey) return "anthropic"
  if (requested === "openai" && openaiKey) return "openai"
  if (openaiKey) return "openai"
  if (anthropicKey) return "anthropic"
  return null
}

export function languageModel(): LanguageModel | null {
  const provider = configuredProvider()
  if (provider === "openai") return openai(process.env.OPENAI_MODEL || "gpt-5.4")
  if (provider === "anthropic") return anthropic(process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5")
  return null
}
