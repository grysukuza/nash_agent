import type { ActionProfile, Game } from "./types"
import { actionsFor, enumerateProfiles, profileKey } from "./types"

export function playerName(game: Game, playerId: string): string {
  return game.players.find((player) => player.id === playerId)?.name.trim() || "Player"
}

export function actionName(game: Game, actionId: string): string {
  const action = game.actions.find((item) => item.id === actionId)
  if (!action) return "that action"
  const label = action.label.trim()
  if (label) return label
  const index = actionsFor(game, action.playerId).findIndex((item) => item.id === actionId)
  return `Action ${index + 1}`
}

export function describeProfile(game: Game, profile: ActionProfile): string {
  return game.players
    .map((player) => `${playerName(game, player.id)} plays ${actionName(game, profile[player.id])}`)
    .join(", ")
}

export function describeOthers(game: Game, playerId: string, others: ActionProfile): string {
  const names = game.players
    .filter((player) => player.id !== playerId)
    .map((player) => `${playerName(game, player.id)} plays ${actionName(game, others[player.id])}`)
  return names.join(", ")
}

export function percent(probability: number): string {
  return `${Math.round(probability * 1000) / 10}%`
}

export function describeGame(game: Game): string {
  const lines = [
    game.title ? `Title: ${game.title}` : "Title: untitled decision",
    `Decision: ${game.decision.trim() || "(not stated)"}`,
    `If nobody acts: ${game.doNothing.trim() || "(not stated)"}`,
    `Information: ${game.information.trim() || "(not stated)"}`,
    game.timing.kind === "simultaneous"
      ? "Timing: simultaneous."
      : `Timing: ${playerName(game, game.timing.leaderId)} moves first, and the other player sees that move.`,
    "Players:",
    ...game.players.map(
      (player) =>
        `- ${playerName(game, player.id)}${player.isUser ? " (this is the user)" : ""}: ${
          actionsFor(game, player.id)
            .map((action) => actionName(game, action.id))
            .join(", ") || "(no actions)"
        }`,
    ),
    "Payoffs (higher is better for that player):",
  ]
  const profiles = enumerateProfiles(game)
  if (profiles.length === 0) {
    lines.push("- No outcomes yet.")
  }
  for (const profile of profiles) {
    const key = profileKey(profile)
    const bits = game.players.map((player) => {
      const value = game.payoffs[key]?.[player.id]
      const shown = typeof value === "number" && Number.isFinite(value) ? String(value) : "missing"
      return `${playerName(game, player.id)} ${shown}`
    })
    lines.push(`- ${describeProfile(game, profile)} → ${bits.join(", ")}`)
  }
  return lines.join("\n")
}
