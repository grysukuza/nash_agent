export type Player = {
  id: string
  name: string
  isUser: boolean
}

export type Action = {
  id: string
  playerId: string
  label: string
}

export type Timing =
  | { kind: "simultaneous" }
  | { kind: "leader-follower"; leaderId: string }

export type Game = {
  title: string
  decision: string
  doNothing: string
  information: string
  players: Player[]
  actions: Action[]
  timing: Timing
  payoffs: Record<string, Record<string, number | null>>
}

export type ActionProfile = Record<string, string>

export type PureEquilibrium = {
  profile: ActionProfile
  strict: boolean
  payoffs: Record<string, number>
}

export type MixedEquilibrium = {
  probabilities: Record<string, Record<string, number>>
  payoffs: Record<string, number>
}

export type DominanceFact = {
  playerId: string
  actionId: string
  kind: "strict" | "weak"
  dominatedBy: string
}

export type EliminationStep = {
  round: number
  playerId: string
  actionId: string
  dominatedBy: string
}

export type BestResponse = {
  playerId: string
  others: ActionProfile
  actionIds: string[]
}

export type StackelbergOutcome = {
  leaderActionId: string
  followerActionId: string
  payoffs: Record<string, number>
}

export type Recommendation = {
  yourPlayerId: string
  yourActionIds: string[]
  mixture: Record<string, number> | null
  headline: string
  reasoning: string
  dependsOn: string
}

export type Solution = {
  complete: boolean
  missingPayoffCount: number
  profileCount: number
  strictlyDominated: DominanceFact[]
  weaklyDominated: DominanceFact[]
  elimination: EliminationStep[]
  survivingActionIds: Record<string, string[]>
  bestResponses: BestResponse[]
  pureEquilibria: PureEquilibrium[]
  mixedEquilibria: MixedEquilibrium[]
  mixedSearched: boolean
  stackelberg: {
    available: boolean
    reason: string | null
    outcomes: StackelbergOutcome[]
  }
  payoffDominantKeys: string[]
  riskDominantKey: string | null
  recommendation: Recommendation
}

export function profileKey(profile: ActionProfile): string {
  return Object.keys(profile)
    .sort()
    .map((id) => `${id}:${profile[id]}`)
    .join("|")
}

export function actionsFor(game: Game, playerId: string): Action[] {
  return game.actions.filter((action) => action.playerId === playerId)
}

export function payoffAt(
  game: Game,
  profile: ActionProfile,
  playerId: string,
): number | null {
  const cell = game.payoffs[profileKey(profile)]
  if (!cell) return null
  const value = cell[playerId]
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

export function enumerateProfiles(game: Game): ActionProfile[] {
  if (game.players.length === 0) return []
  const lists = game.players.map((player) => actionsFor(game, player.id))
  if (lists.some((list) => list.length === 0)) return []
  const profiles: ActionProfile[] = []
  const walk = (index: number, acc: ActionProfile) => {
    if (index === game.players.length) {
      profiles.push({ ...acc })
      return
    }
    const player = game.players[index]
    for (const action of lists[index]) {
      acc[player.id] = action.id
      walk(index + 1, acc)
    }
  }
  walk(0, {})
  return profiles
}

export function missingPayoffCount(game: Game): number {
  const profiles = enumerateProfiles(game)
  let missing = 0
  for (const profile of profiles) {
    for (const player of game.players) {
      if (payoffAt(game, profile, player.id) === null) missing += 1
    }
  }
  return missing
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function coerceGame(value: unknown): Game | null {
  if (!isRecord(value)) return null
  if (!Array.isArray(value.players) || !Array.isArray(value.actions)) return null
  const players: Player[] = []
  for (const player of value.players) {
    if (!isRecord(player)) return null
    if (typeof player.id !== "string" || typeof player.name !== "string") return null
    players.push({
      id: player.id,
      name: player.name,
      isUser: player.isUser === true,
    })
  }
  if (players.length < 2) return null
  const actions: Action[] = []
  for (const action of value.actions) {
    if (!isRecord(action)) return null
    if (
      typeof action.id !== "string" ||
      typeof action.playerId !== "string" ||
      typeof action.label !== "string"
    ) {
      return null
    }
    if (!players.some((player) => player.id === action.playerId)) return null
    actions.push({
      id: action.id,
      playerId: action.playerId,
      label: action.label,
    })
  }
  let timing: Timing = { kind: "simultaneous" }
  if (isRecord(value.timing) && value.timing.kind === "leader-follower") {
    if (typeof value.timing.leaderId !== "string") return null
    timing = { kind: "leader-follower", leaderId: value.timing.leaderId }
  }
  const payoffs: Game["payoffs"] = {}
  if (isRecord(value.payoffs)) {
    for (const [key, cell] of Object.entries(value.payoffs)) {
      if (!isRecord(cell)) continue
      payoffs[key] = {}
      for (const [playerId, payoff] of Object.entries(cell)) {
        payoffs[key][playerId] =
          typeof payoff === "number" && Number.isFinite(payoff) ? payoff : null
      }
    }
  }
  const userCount = players.filter((player) => player.isUser).length
  if (userCount !== 1) {
    players.forEach((player, index) => {
      player.isUser = index === 0
    })
  }
  return {
    title: typeof value.title === "string" ? value.title : "",
    decision: typeof value.decision === "string" ? value.decision : "",
    doNothing: typeof value.doNothing === "string" ? value.doNothing : "",
    information: typeof value.information === "string" ? value.information : "",
    players,
    actions,
    timing,
    payoffs,
  }
}
