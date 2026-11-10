"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { useEffect, useMemo, useRef, useState } from "react"
import type { Game } from "@/lib/game/types"

function messageText(message: UIMessage): string {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .filter(Boolean)
    .join("\n")
}

function usedSolver(message: UIMessage): boolean {
  return message.parts.some((part) => part.type === "tool-solveGame")
}

function LiveChat({ game, provider }: { game: Game; provider: string | null }) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { game },
      }),
    [game],
  )
  const { messages, sendMessage, status, error } = useChat({ transport })
  const [draft, setDraft] = useState("")
  const busy = status === "submitted" || status === "streaming"
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [messages, status])

  return (
    <form
      className="flex min-h-80 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        const text = draft.trim()
        if (!text || busy) return
        setDraft("")
        void sendMessage({ text })
      }}
    >
      <p className="text-sm text-muted">
        {provider === "anthropic" ? "Using Anthropic." : "Using OpenAI."} The reply has to come from the solver for this worksheet.
      </p>
      <div ref={scroller} className="mt-4 flex max-h-[28rem] flex-1 flex-col gap-4 overflow-y-auto lg:max-h-none">
        {messages.length === 0 ? (
          <p className="text-base leading-7 text-ink">
            Ask why this action is the one to play, or what would have to be true for a different action to be right.
          </p>
        ) : null}
        {messages.map((message) => (
          <article key={message.id} className={message.role === "user" ? "text-right" : ""}>
            <p className="text-xs uppercase tracking-[0.14em] text-muted">
              {message.role === "user" ? "You" : "Nash"}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-base leading-7">{messageText(message) || (busy ? "…" : "")}</p>
            {usedSolver(message) ? <p className="mt-1 text-xs text-pine">Checked against the worksheet solver.</p> : null}
          </article>
        ))}
        {error ? <p className="text-sm text-clay">{error.message}</p> : null}
      </div>
      <label className="mt-4 block text-sm text-muted" htmlFor="nash-chat">
        Ask about this decision
      </label>
      <textarea
        id="nash-chat"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={3}
        className="mt-1 w-full resize-none border border-line bg-card px-3 py-2"
        placeholder="Why isn't cooperating the equilibrium?"
      />
      <button
        type="submit"
        disabled={busy || draft.trim() === ""}
        className="mt-3 bg-ink px-4 py-2 text-paper disabled:opacity-40"
      >
        {busy ? "Thinking" : "Send"}
      </button>
    </form>
  )
}

function Setup() {
  return (
    <div className="text-base leading-7">
      <p>The worksheet solves without an API key. Chat needs one in <code>.env.local</code>, then a restart of the dev server.</p>
      <pre className="mt-3 overflow-x-auto border border-line bg-card p-3 text-sm leading-6">{`OPENAI_API_KEY=your-key
# or
ANTHROPIC_API_KEY=your-key`}</pre>
    </div>
  )
}

export function ChatPanel({ game }: { game: Game }) {
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading")
  const [provider, setProvider] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/chat")
      .then((response) => response.json())
      .then((data: { configured?: boolean; provider?: string | null }) => {
        if (cancelled) return
        setProvider(data.provider ?? null)
        setState(data.configured ? "ready" : "missing")
      })
      .catch(() => {
        if (!cancelled) setState("missing")
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <aside className="flex flex-col border-t border-line bg-paper px-5 py-6 lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto lg:border-t-0 lg:border-l">
      <p className="text-xs uppercase tracking-[0.16em] text-pine">Conversation</p>
      <h2 className="mt-1 font-serif text-3xl font-medium">Talk it through</h2>
      <div className="mt-4 flex flex-1 flex-col">
        {state === "loading" ? <p className="text-muted">Checking for an API key.</p> : null}
        {state === "missing" ? <Setup /> : null}
        {state === "ready" ? <LiveChat game={game} provider={provider} /> : null}
      </div>
    </aside>
  )
}
