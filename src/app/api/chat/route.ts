import { convertToModelMessages, isStepCount, ToolLoopAgent, tool, type UIMessage } from "ai"
import { z } from "zod"
import { instructionsFor } from "@/lib/ai/prompt"
import { configuredProvider, languageModel } from "@/lib/ai/provider"
import { solve } from "@/lib/game/solve"
import { coerceGame } from "@/lib/game/types"

export async function GET() {
  const provider = configuredProvider()
  return Response.json({ configured: provider !== null, provider })
}

export async function POST(request: Request) {
  const model = languageModel()
  if (!model) {
    return Response.json(
      { error: "Add OPENAI_API_KEY or ANTHROPIC_API_KEY to .env.local and restart the server." },
      { status: 503 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 })
  }
  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 })
  }

  const game = coerceGame((body as { game?: unknown }).game)
  if (!game) return Response.json({ error: "The worksheet could not be read." }, { status: 400 })
  const messages = (body as { messages?: UIMessage[] }).messages
  if (!Array.isArray(messages)) return Response.json({ error: "Messages are missing." }, { status: 400 })

  const tools = {
    solveGame: tool({
      description:
        "Compute dominated strategies, best responses, Nash equilibria, and the recommended action from the worksheet that was posted with this request. Call this before stating any equilibrium or recommendation. It ignores any payoffs you might invent.",
      inputSchema: z.object({
        useWorksheet: z.literal(true).describe("Confirm that the posted worksheet is the game to solve."),
      }),
      execute: async () => solve(game),
    }),
  }

  const agent = new ToolLoopAgent({
    model,
    instructions: instructionsFor(game),
    tools,
    stopWhen: isStepCount(2),
    prepareStep: ({ stepNumber }) =>
      stepNumber === 0
        ? { toolChoice: { type: "tool", toolName: "solveGame" } }
        : { toolChoice: "none" },
  })

  const result = await agent.stream({
    messages: await convertToModelMessages(messages, { tools }),
  })
  return result.toUIMessageStreamResponse()
}
