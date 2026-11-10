"use client"

import { useEffect, useState } from "react"
import { ChatPanel } from "@/components/chat-panel"
import { blankGame, prisonersDilemma } from "@/lib/game/examples"
import { actionName, describeOthers, describeProfile, percent, playerName } from "@/lib/game/format"
import { solve } from "@/lib/game/solve"
import {
  actionsFor,
  coerceGame,
  enumerateProfiles,
  payoffAt,
  profileKey,
  type ActionProfile,
  type Game,
  type Timing,
} from "@/lib/game/types"

const STORAGE_KEY = "nash-decision-game"

const STEPS = [
  { id: "frame", label: "Frame", prompt: "Name the decision, not the whole story." },
  { id: "players", label: "Players", prompt: "Who else is choosing, not merely affected?" },
  { id: "actions", label: "Actions", prompt: "What can each player actually do?" },
  { id: "timing", label: "Timing", prompt: "Do they choose together, or does someone move first?" },
  { id: "payoffs", label: "Payoffs", prompt: "Higher is better for that player. These are your judgments." },
  { id: "result", label: "Result", prompt: "An equilibrium is a profile nobody wants to leave alone." },
] as const

type StepId = (typeof STEPS)[number]["id"]

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`
}

function fieldClassName(): string {
  return "mt-1 w-full border border-line bg-card px-3 py-2"
}

export function NashApp() {
  const [game, setGame] = useState<Game | null>(null)
  const [step, setStep] = useState<StepId>("result")
  const [session, setSession] = useState(0)
  const [payoffKey, setPayoffKey] = useState(0)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    let next = prisonersDilemma()
    if (stored) {
      try {
        next = coerceGame(JSON.parse(stored)) ?? prisonersDilemma()
      } catch {
        next = prisonersDilemma()
      }
    }
    // The saved worksheet lives in localStorage, which the server render cannot read.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate the worksheet after mount
    setGame(next)
  }, [])

  useEffect(() => {
    if (!game) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(game))
  }, [game])

  if (!game) {
    return <p className="px-6 py-10 text-muted">Opening the worksheet.</p>
  }

  const replaceGame = (next: Game) => {
    setGame(next)
    setSession((value) => value + 1)
    setPayoffKey((value) => value + 1)
    setStep("result")
  }

  return (
    <div className="min-h-dvh">
      <header className="border-b border-ink bg-ink px-5 py-5 text-paper sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[#d7c4a4]">Nash agent</p>
            <h1 className="mt-1 font-serif text-4xl font-medium leading-none">Decide as if they are deciding too.</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="border border-[#d7c4a4] px-3 py-2 text-sm"
              onClick={() => replaceGame(blankGame())}
            >
              New decision
            </button>
            <button
              type="button"
              className="bg-paper px-3 py-2 text-sm text-ink"
              onClick={() => replaceGame(prisonersDilemma())}
            >
              Load the prisoner&apos;s dilemma
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl lg:grid-cols-[13rem_minmax(0,1fr)_22rem]">
        <nav className="flex gap-2 overflow-x-auto border-b border-line px-4 py-3 lg:flex-col lg:border-b-0 lg:border-r lg:px-4 lg:py-6">
          {STEPS.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setStep(item.id)}
              className={`shrink-0 px-2 py-2 text-left text-sm ${
                step === item.id ? "bg-pine text-paper" : "text-ink hover:bg-card"
              }`}
            >
              <span className="mr-2 tabular-nums">{index + 1}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <main className="px-5 py-6 sm:px-8">
          <p className="text-xs uppercase tracking-[0.16em] text-pine">
            {STEPS.find((item) => item.id === step)?.label}
          </p>
          <p className="mt-2 max-w-xl font-serif text-3xl leading-tight">
            {STEPS.find((item) => item.id === step)?.prompt}
          </p>
          <div className="mt-6">
            {step === "frame" ? <FrameStep game={game} setGame={setGame} /> : null}
            {step === "players" ? <PlayersStep game={game} setGame={setGame} /> : null}
            {step === "actions" ? <ActionsStep game={game} setGame={setGame} /> : null}
            {step === "timing" ? <TimingStep game={game} setGame={setGame} /> : null}
            {step === "payoffs" ? <PayoffStep key={payoffKey} game={game} setGame={setGame} /> : null}
            {step === "result" ? <ResultStep game={game} /> : null}
          </div>
        </main>
        <ChatPanel key={session} game={game} />
      </div>
    </div>
  )
}

function FrameStep({ game, setGame }: { game: Game; setGame: (game: Game) => void }) {
  return (
    <div className="grid max-w-xl gap-5">
      <label className="block">
        <span className="text-sm text-muted">Short title</span>
        <input
          className={fieldClassName()}
          value={game.title}
          onChange={(event) => setGame({ ...game, title: event.target.value })}
        />
      </label>
      <label className="block">
        <span className="text-sm text-muted">What are you deciding?</span>
        <textarea
          className={fieldClassName()}
          rows={4}
          value={game.decision}
          onChange={(event) => setGame({ ...game, decision: event.target.value })}
        />
      </label>
      <label className="block">
        <span className="text-sm text-muted">What happens if you do nothing?</span>
        <textarea
          className={fieldClassName()}
          rows={3}
          value={game.doNothing}
          onChange={(event) => setGame({ ...game, doNothing: event.target.value })}
        />
      </label>
    </div>
  )
}

function PlayersStep({ game, setGame }: { game: Game; setGame: (game: Game) => void }) {
  const update = (id: string, name: string) => {
    setGame({
      ...game,
      players: game.players.map((player) => (player.id === id ? { ...player, name } : player)),
    })
  }
  const makeUser = (id: string) => {
    setGame({
      ...game,
      players: game.players.map((player) => ({ ...player, isUser: player.id === id })),
    })
  }
  const addPlayer = () => {
    if (game.players.length >= 4) return
    const id = uid("p")
    setGame({
      ...game,
      players: [...game.players, { id, name: "Player", isUser: false }],
      actions: [
        ...game.actions,
        { id: uid("a"), playerId: id, label: "" },
        { id: uid("a"), playerId: id, label: "" },
      ],
    })
  }
  const removePlayer = (id: string) => {
    if (game.players.length <= 2) return
    const players = game.players.filter((player) => player.id !== id)
    if (!players.some((player) => player.isUser)) players[0] = { ...players[0], isUser: true }
    const timing: Timing =
      game.timing.kind === "leader-follower" && game.timing.leaderId === id
        ? { kind: "simultaneous" }
        : game.timing
    setGame({
      ...game,
      players,
      actions: game.actions.filter((action) => action.playerId !== id),
      timing,
    })
  }

  return (
    <div className="grid max-w-xl gap-4">
      {game.players.map((player) => (
        <div key={player.id} className="border border-line bg-card p-4">
          <label className="block">
            <span className="text-sm text-muted">Name</span>
            <input
              className={fieldClassName()}
              value={player.name}
              onChange={(event) => update(player.id, event.target.value)}
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="user-player"
                checked={player.isUser}
                onChange={() => makeUser(player.id)}
              />
              This is me
            </label>
            <button
              type="button"
              className="text-sm text-clay disabled:opacity-40"
              disabled={game.players.length <= 2}
              onClick={() => removePlayer(player.id)}
            >
              Remove
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="justify-self-start border border-ink px-3 py-2 text-sm disabled:opacity-40"
        disabled={game.players.length >= 4}
        onClick={addPlayer}
      >
        Add a player
      </button>
    </div>
  )
}

function ActionsStep({ game, setGame }: { game: Game; setGame: (game: Game) => void }) {
  const rename = (id: string, label: string) => {
    setGame({
      ...game,
      actions: game.actions.map((action) => (action.id === id ? { ...action, label } : action)),
    })
  }
  const addAction = (playerId: string) => {
    if (actionsFor(game, playerId).length >= 4) return
    setGame({ ...game, actions: [...game.actions, { id: uid("a"), playerId, label: "" }] })
  }
  const removeAction = (playerId: string, actionId: string) => {
    if (actionsFor(game, playerId).length <= 2) return
    setGame({ ...game, actions: game.actions.filter((action) => action.id !== actionId) })
  }

  return (
    <div className="grid max-w-xl gap-6">
      <p className="text-base leading-7 text-muted">Include the status quo. Two to four actions each.</p>
      {game.players.map((player) => (
        <section key={player.id}>
          <h2 className="font-serif text-2xl">{playerName(game, player.id)}</h2>
          <div className="mt-3 grid gap-3">
            {actionsFor(game, player.id).map((action) => (
              <div key={action.id} className="flex items-end gap-3">
                <label className="block flex-1">
                  <span className="text-sm text-muted">Action</span>
                  <input
                    className={fieldClassName()}
                    value={action.label}
                    onChange={(event) => rename(action.id, event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="mb-2 text-sm text-clay disabled:opacity-40"
                  disabled={actionsFor(game, player.id).length <= 2}
                  onClick={() => removeAction(player.id, action.id)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="mt-3 border border-ink px-3 py-2 text-sm disabled:opacity-40"
            disabled={actionsFor(game, player.id).length >= 4}
            onClick={() => addAction(player.id)}
          >
            Add an action
          </button>
        </section>
      ))}
    </div>
  )
}

function TimingStep({ game, setGame }: { game: Game; setGame: (game: Game) => void }) {
  const setTiming = (timing: Timing) => setGame({ ...game, timing })
  return (
    <div className="grid max-w-xl gap-5">
      <fieldset className="grid gap-3">
        <legend className="text-sm text-muted">When do they choose?</legend>
        <label className="flex items-start gap-2">
          <input
            type="radio"
            name="timing"
            checked={game.timing.kind === "simultaneous"}
            onChange={() => setTiming({ kind: "simultaneous" })}
          />
          <span>Simultaneous. Nobody sees the other move before choosing.</span>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="radio"
            name="timing"
            checked={game.timing.kind === "leader-follower"}
            disabled={game.players.length !== 2}
            onChange={() => setTiming({ kind: "leader-follower", leaderId: game.players[0].id })}
          />
          <span>Someone moves first, and the other player sees that move. This path is for two players.</span>
        </label>
      </fieldset>
      {game.timing.kind === "leader-follower" ? (
        <label className="block">
          <span className="text-sm text-muted">Who moves first?</span>
          <select
            className={fieldClassName()}
            value={game.timing.leaderId}
            onChange={(event) => setTiming({ kind: "leader-follower", leaderId: event.target.value })}
          >
            {game.players.map((player) => (
              <option key={player.id} value={player.id}>
                {playerName(game, player.id)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="block">
        <span className="text-sm text-muted">What does each player know when they choose?</span>
        <textarea
          className={fieldClassName()}
          rows={4}
          value={game.information}
          onChange={(event) => setGame({ ...game, information: event.target.value })}
        />
      </label>
    </div>
  )
}

function PayoffInput({
  label,
  testId,
  value,
  onCommit,
}: {
  label: string
  testId: string
  value: number | null
  onCommit: (value: number | null) => void
}) {
  return (
    <label className="block text-xs text-muted">
      {label}
      <input
        data-testid={testId}
        aria-label={label}
        inputMode="decimal"
        className="mt-1 w-full border border-line bg-paper px-2 py-1 text-base text-ink"
        defaultValue={value ?? ""}
        onChange={(event) => {
          const raw = event.target.value.trim()
          if (raw === "" || raw === "-" || raw === "." || raw === "-.") return
          const next = Number(raw)
          if (Number.isFinite(next)) onCommit(next)
        }}
        onBlur={(event) => {
          if (event.target.value.trim() === "") onCommit(null)
        }}
      />
    </label>
  )
}

function PayoffStep({ game, setGame }: { game: Game; setGame: (game: Game) => void }) {
  const profiles = enumerateProfiles(game)
  const commit = (profile: ActionProfile, playerId: string, value: number | null) => {
    const key = profileKey(profile)
    setGame({
      ...game,
      payoffs: {
        ...game.payoffs,
        [key]: { ...game.payoffs[key], [playerId]: value },
      },
    })
  }

  if (game.players.length === 2) {
    const [rowPlayer, columnPlayer] = game.players
    const rows = actionsFor(game, rowPlayer.id)
    const columns = actionsFor(game, columnPlayer.id)
    return (
      <div>
        <p className="max-w-xl text-base leading-7 text-muted">
          Each cell is one outcome. Enter a number for both players. Leave a cell blank if you have not judged it yet.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="p-2 text-left font-normal text-muted">
                  {playerName(game, rowPlayer.id)} \ {playerName(game, columnPlayer.id)}
                </th>
                {columns.map((column) => (
                  <th key={column.id} className="p-2 text-left font-medium">
                    {actionName(game, column.id)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <th className="p-2 text-left font-medium">{actionName(game, row.id)}</th>
                  {columns.map((column) => {
                    const profile = { [rowPlayer.id]: row.id, [columnPlayer.id]: column.id }
                    return (
                      <td key={column.id} className="p-2 align-top">
                        <div className="grid min-w-36 gap-2">
                          {game.players.map((player) => (
                            <PayoffInput
                              key={player.id}
                              label={`${playerName(game, player.id)} when ${describeProfile(game, profile)}`}
                              testId={`payoff-${player.id}-${profileKey(profile)}`}
                              value={payoffAt(game, profile, player.id)}
                              onCommit={(value) => commit(profile, player.id, value)}
                            />
                          ))}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <p className="max-w-xl text-base leading-7 text-muted">
        One row per outcome. Higher is better for that player.
      </p>
      {profiles.map((profile) => (
        <article key={profileKey(profile)} className="border border-line bg-card p-4">
          <h2 className="font-medium">{describeProfile(game, profile)}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {game.players.map((player) => (
              <PayoffInput
                key={player.id}
                label={`${playerName(game, player.id)} payoff`}
                testId={`payoff-${player.id}-${profileKey(profile)}`}
                value={payoffAt(game, profile, player.id)}
                onCommit={(value) => commit(profile, player.id, value)}
              />
            ))}
          </div>
        </article>
      ))}
    </div>
  )
}

function ResultStep({ game }: { game: Game }) {
  const solution = solve(game)
  const unnamed = game.actions.some((action) => action.label.trim() === "")
  return (
    <div className="grid max-w-2xl gap-8">
      <section className="border border-pine bg-pine-soft px-5 py-5">
        <h2 data-testid="recommendation" className="font-serif text-4xl leading-tight">
          {solution.recommendation.headline}
        </h2>
        <p className="mt-4 text-base leading-7">{solution.recommendation.reasoning}</p>
        <p data-testid="depends-on" className="mt-4 text-sm leading-6 text-muted">
          {solution.recommendation.dependsOn}
        </p>
        {solution.recommendation.mixture ? (
          <p className="mt-3 text-sm">
            Your mixture:{" "}
            {Object.entries(solution.recommendation.mixture)
              .filter(([, probability]) => probability > 1e-6)
              .map(([actionId, probability]) => `${percent(probability)} ${actionName(game, actionId)}`)
              .join(", ")}
          </p>
        ) : null}
      </section>
      {unnamed ? <p className="text-sm text-clay">Name every action so this stays readable.</p> : null}
      {!solution.complete ? (
        <p className="text-base leading-7">
          {solution.missingPayoffCount} payoff {solution.missingPayoffCount === 1 ? "entry is" : "entries are"} still
          empty. The equilibrium is computed only from numbers you enter.
        </p>
      ) : (
        <>
          <section>
            <h3 className="font-serif text-2xl">Best responses</h3>
            <ul className="mt-3 grid gap-2 text-base leading-7">
              {solution.bestResponses.map((response) => (
                <li key={`${response.playerId}-${profileKey(response.others)}`}>
                  If {describeOthers(game, response.playerId, response.others) || "nobody else moves"},{" "}
                  {playerName(game, response.playerId)}&apos;s best{" "}
                  {response.actionIds.length === 1 ? "response is" : "responses are"}{" "}
                  {response.actionIds.map((actionId) => actionName(game, actionId)).join(" or ")}.
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="font-serif text-2xl">Dominated actions</h3>
            {solution.strictlyDominated.length === 0 && solution.weaklyDominated.length === 0 ? (
              <p className="mt-3 leading-7">No action is dominated by another pure action.</p>
            ) : (
              <ul className="mt-3 grid gap-2 leading-7">
                {solution.strictlyDominated.map((fact) => (
                  <li key={`strict-${fact.playerId}-${fact.actionId}`}>
                    {playerName(game, fact.playerId)}&apos;s {actionName(game, fact.actionId)} is strictly dominated by{" "}
                    {actionName(game, fact.dominatedBy)}.
                  </li>
                ))}
                {solution.weaklyDominated.map((fact) => (
                  <li key={`weak-${fact.playerId}-${fact.actionId}`}>
                    {playerName(game, fact.playerId)}&apos;s {actionName(game, fact.actionId)} is weakly dominated by{" "}
                    {actionName(game, fact.dominatedBy)}.
                  </li>
                ))}
              </ul>
            )}
            {solution.elimination.length > 0 ? (
              <p className="mt-3 text-sm leading-6 text-muted">
                Iterated elimination of strictly dominated actions leaves{" "}
                {game.players
                  .map((player) => {
                    const left = solution.survivingActionIds[player.id] ?? []
                    return `${playerName(game, player.id)}: ${left.map((id) => actionName(game, id)).join(", ")}`
                  })
                  .join("; ")}
                .
              </p>
            ) : null}
          </section>
          <section>
            <h3 className="font-serif text-2xl">Equilibria</h3>
            {solution.pureEquilibria.length === 0 ? (
              <p className="mt-3 leading-7">No pure-strategy Nash equilibrium.</p>
            ) : (
              <ul className="mt-3 grid gap-2 leading-7">
                {solution.pureEquilibria.map((equilibrium) => (
                  <li key={profileKey(equilibrium.profile)}>
                    {describeProfile(game, equilibrium.profile)} is a {equilibrium.strict ? "strict" : "weak"} Nash
                    equilibrium. Payoffs:{" "}
                    {game.players
                      .map((player) => `${playerName(game, player.id)} ${equilibrium.payoffs[player.id]}`)
                      .join(", ")}
                    .
                  </li>
                ))}
              </ul>
            )}
            {solution.payoffDominantKeys.length === 1 ? (
              <p className="mt-3 text-sm leading-6 text-muted">
                One equilibrium payoff-dominates the others: every player does at least as well, and someone does better.
              </p>
            ) : null}
            {solution.riskDominantKey ? (
              <p className="mt-3 text-sm leading-6 text-muted">
                In this 2×2 game, one strict equilibrium risk-dominates the other. That is a tie-break when you cannot
                tell which equilibrium they expect.
              </p>
            ) : null}
            {solution.mixedSearched ? (
              solution.mixedEquilibria.length === 0 ? (
                <p className="mt-3 leading-7">No mixed equilibrium beyond the pure ones.</p>
              ) : (
                <ul className="mt-3 grid gap-2 leading-7">
                  {solution.mixedEquilibria.map((equilibrium) => (
                    <li key={JSON.stringify(equilibrium.probabilities)}>
                      Mixed equilibrium.{" "}
                      {game.players
                        .map((player) => {
                          const mix = Object.entries(equilibrium.probabilities[player.id] ?? [])
                            .filter(([, probability]) => probability > 1e-6)
                            .map(([actionId, probability]) => `${percent(probability)} ${actionName(game, actionId)}`)
                            .join(", ")
                          return `${playerName(game, player.id)}: ${mix}`
                        })
                        .join(". ")}
                      .
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <p className="mt-3 text-sm leading-6 text-muted">
                Mixed equilibria are computed for two players with at most four actions each.
              </p>
            )}
          </section>
          {game.timing.kind === "leader-follower" ? (
            <section>
              <h3 className="font-serif text-2xl">Moving first</h3>
              {solution.stackelberg.reason ? <p className="mt-3 leading-7">{solution.stackelberg.reason}</p> : null}
              {solution.stackelberg.outcomes.length > 0 ? (
                <ul className="mt-3 grid gap-2 leading-7">
                  {solution.stackelberg.outcomes.map((outcome) => (
                    <li key={`${outcome.leaderActionId}-${outcome.followerActionId}`}>
                      {playerName(game, game.timing.kind === "leader-follower" ? game.timing.leaderId : "")} plays{" "}
                      {actionName(game, outcome.leaderActionId)}, and the responder plays{" "}
                      {actionName(game, outcome.followerActionId)}.
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}
