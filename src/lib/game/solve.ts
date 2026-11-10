import type {
  ActionProfile,
  BestResponse,
  DominanceFact,
  EliminationStep,
  Game,
  MixedEquilibrium,
  PureEquilibrium,
  Recommendation,
  Solution,
  StackelbergOutcome,
} from "./types"
import {
  actionsFor,
  enumerateProfiles,
  missingPayoffCount,
  payoffAt,
  profileKey,
} from "./types"

const TOL = 1e-8

function playerName(game: Game, playerId: string): string {
  return game.players.find((player) => player.id === playerId)?.name.trim() || "Player"
}

function actionName(game: Game, actionId: string): string {
  const action = game.actions.find((item) => item.id === actionId)
  if (!action) return "that action"
  const label = action.label.trim()
  if (label) return label
  const index = actionsFor(game, action.playerId).findIndex((item) => item.id === actionId)
  return `Action ${index + 1}`
}

function describeProfile(game: Game, profile: ActionProfile): string {
  return game.players
    .map((player) => `${playerName(game, player.id)} plays ${actionName(game, profile[player.id])}`)
    .join(", ")
}

function dot(left: number[], right: number[]): number {
  let sum = 0
  for (let index = 0; index < left.length; index += 1) sum += left[index] * right[index]
  return sum
}

function combinations(count: number, size: number): number[][] {
  const results: number[][] = []
  const picked: number[] = []
  const walk = (start: number) => {
    if (picked.length === size) {
      results.push(picked.slice())
      return
    }
    for (let index = start; index < count; index += 1) {
      picked.push(index)
      walk(index + 1)
      picked.pop()
    }
  }
  if (size >= 0 && size <= count) walk(0)
  return results
}

function subsets(count: number): number[][] {
  const results: number[][] = []
  for (let mask = 1; mask < 1 << count; mask += 1) {
    const subset: number[] = []
    for (let index = 0; index < count; index += 1) {
      if (mask & (1 << index)) subset.push(index)
    }
    results.push(subset)
  }
  return results
}

type Affine = { particular: number[]; nullspace: number[][] }

function solveAffine(matrix: number[][], rhs: number[]): Affine | null {
  const width = matrix[0]?.length ?? rhs.length
  if (matrix.length === 0) {
    const nullspace = Array.from({ length: width }, (_, column) => {
      const vector = Array(width).fill(0)
      vector[column] = 1
      return vector
    })
    return { particular: Array(width).fill(0), nullspace }
  }

  const augmented = matrix.map((row, index) => [...row, rhs[index]])
  const height = augmented.length
  let rank = 0
  const pivotColumns: number[] = []

  for (let column = 0; column < width && rank < height; column += 1) {
    let pivot = rank
    for (let row = rank + 1; row < height; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row
    }
    if (Math.abs(augmented[pivot][column]) < 1e-10) continue
    ;[augmented[rank], augmented[pivot]] = [augmented[pivot], augmented[rank]]
    const divisor = augmented[rank][column]
    for (let entry = column; entry <= width; entry += 1) augmented[rank][entry] /= divisor
    for (let row = 0; row < height; row += 1) {
      if (row === rank) continue
      const factor = augmented[row][column]
      if (Math.abs(factor) < 1e-12) continue
      for (let entry = column; entry <= width; entry += 1) {
        augmented[row][entry] -= factor * augmented[rank][entry]
      }
    }
    pivotColumns[rank] = column
    rank += 1
  }

  for (let row = rank; row < height; row += 1) {
    if (Math.abs(augmented[row][width]) > 1e-7) return null
  }

  const pivotSet = new Set(pivotColumns.slice(0, rank))
  const particular = Array(width).fill(0)
  for (let row = 0; row < rank; row += 1) particular[pivotColumns[row]] = augmented[row][width]
  const nullspace: number[][] = []
  for (let column = 0; column < width; column += 1) {
    if (pivotSet.has(column)) continue
    const vector = Array(width).fill(0)
    vector[column] = 1
    for (let row = 0; row < rank; row += 1) vector[pivotColumns[row]] = -augmented[row][column]
    nullspace.push(vector)
  }
  return { particular, nullspace }
}

function fromParameters(particular: number[], nullspace: number[][], parameters: number[]): number[] {
  const point = particular.slice()
  for (let column = 0; column < nullspace.length; column += 1) {
    for (let index = 0; index < point.length; index += 1) {
      point[index] += nullspace[column][index] * parameters[column]
    }
  }
  return point
}

type Inequality = { coeffs: number[]; bound: number }

function satisfies(point: number[], inequalities: Inequality[]): boolean {
  return inequalities.every((inequality) => dot(inequality.coeffs, point) >= inequality.bound - 1e-6)
}

function mixturesOnSupport(matrix: number[][], ownSupport: number[], opponentSupport: number[]): number[][] {
  const opponentCount = matrix[0]?.length ?? 0
  const supportSize = opponentSupport.length
  const reference = ownSupport[0]
  const equalities: number[][] = [Array(supportSize).fill(1)]
  const equalityRhs: number[] = [1]
  for (let index = 1; index < ownSupport.length; index += 1) {
    const row = ownSupport[index]
    equalities.push(opponentSupport.map((column) => matrix[row][column] - matrix[reference][column]))
    equalityRhs.push(0)
  }

  const affine = solveAffine(equalities, equalityRhs)
  if (!affine) return []

  const inequalities: Inequality[] = []
  for (let index = 0; index < supportSize; index += 1) {
    const lower = Array(supportSize).fill(0)
    lower[index] = 1
    inequalities.push({ coeffs: lower, bound: 0 })
    const upper = Array(supportSize).fill(0)
    upper[index] = -1
    inequalities.push({ coeffs: upper, bound: -1 })
  }
  for (let row = 0; row < matrix.length; row += 1) {
    if (ownSupport.includes(row)) continue
    inequalities.push({
      coeffs: opponentSupport.map((column) => matrix[reference][column] - matrix[row][column]),
      bound: 0,
    })
  }

  const dimension = affine.nullspace.length
  const constraintRows = inequalities.map((inequality) =>
    affine.nullspace.map((vector) => dot(inequality.coeffs, vector)),
  )
  const constraintRhs = inequalities.map(
    (inequality) => inequality.bound - dot(inequality.coeffs, affine.particular),
  )

  const candidates: number[][] = []
  if (dimension === 0) {
    candidates.push(affine.particular)
  } else {
    for (const tight of combinations(inequalities.length, dimension)) {
      const solved = solveAffine(
        tight.map((index) => constraintRows[index]),
        tight.map((index) => constraintRhs[index]),
      )
      if (!solved || solved.nullspace.length > 0) continue
      candidates.push(fromParameters(affine.particular, affine.nullspace, solved.particular))
    }
  }

  const feasible = candidates.filter(
    (point) => Math.abs(point.reduce((sum, value) => sum + value, 0) - 1) < 1e-4 && satisfies(point, inequalities),
  )
  const chosen = feasible.filter((point) => point.every((value) => value > 1e-6))
  if (chosen.length === 0 && feasible.length > 0) {
    const centroid = Array(supportSize).fill(0)
    for (const point of feasible) {
      for (let index = 0; index < supportSize; index += 1) centroid[index] += point[index]
    }
    for (let index = 0; index < supportSize; index += 1) centroid[index] /= feasible.length
    if (centroid.every((value) => value > 1e-6) && satisfies(centroid, inequalities)) chosen.push(centroid)
  }

  return chosen.map((point) => {
    const full = Array(opponentCount).fill(0)
    const total = point.reduce((sum, value) => sum + value, 0)
    opponentSupport.forEach((column, index) => {
      const value = point[index] / total
      full[column] = Math.abs(value) < 1e-8 ? 0 : Math.abs(value - 1) < 1e-8 ? 1 : value
    })
    return full
  })
}

function transpose(matrix: number[][]): number[][] {
  if (matrix.length === 0) return []
  return matrix[0].map((_, column) => matrix.map((row) => row[column]))
}

function isPureVector(probabilities: number[]): boolean {
  return probabilities.some((probability) => probability > 1 - 1e-6)
}

function probabilityKey(rows: number[], columns: number[]): string {
  const round = (value: number) => (Math.round(value * 1e6) / 1e6).toFixed(6)
  return `${rows.map(round).join(",")}|${columns.map(round).join(",")}`
}

function expectedPayoff(matrix: number[][], rowMix: number[], columnMix: number[]): number {
  let payoff = 0
  for (let row = 0; row < rowMix.length; row += 1) {
    for (let column = 0; column < columnMix.length; column += 1) {
      payoff += rowMix[row] * matrix[row][column] * columnMix[column]
    }
  }
  return payoff
}

function findMixedEquilibria(game: Game): MixedEquilibrium[] {
  if (game.players.length !== 2) return []
  const [rowPlayer, columnPlayer] = game.players
  const rowActions = actionsFor(game, rowPlayer.id)
  const columnActions = actionsFor(game, columnPlayer.id)
  if (
    rowActions.length === 0 ||
    columnActions.length === 0 ||
    rowActions.length > 4 ||
    columnActions.length > 4
  ) {
    return []
  }

  const rowPayoffs = rowActions.map((row) =>
    columnActions.map((column) => {
      const profile = { [rowPlayer.id]: row.id, [columnPlayer.id]: column.id }
      return payoffAt(game, profile, rowPlayer.id) ?? 0
    }),
  )
  const columnPayoffs = rowActions.map((row) =>
    columnActions.map((column) => {
      const profile = { [rowPlayer.id]: row.id, [columnPlayer.id]: column.id }
      return payoffAt(game, profile, columnPlayer.id) ?? 0
    }),
  )

  const found: MixedEquilibrium[] = []
  const seen = new Set<string>()
  for (const rowSupport of subsets(rowActions.length)) {
    for (const columnSupport of subsets(columnActions.length)) {
      const columnMixes = mixturesOnSupport(rowPayoffs, rowSupport, columnSupport)
      const rowMixes = mixturesOnSupport(transpose(columnPayoffs), columnSupport, rowSupport)
      for (const rowMix of rowMixes) {
        for (const columnMix of columnMixes) {
          if (isPureVector(rowMix) && isPureVector(columnMix)) continue
          const key = probabilityKey(rowMix, columnMix)
          if (seen.has(key)) continue
          seen.add(key)
          found.push({
            probabilities: {
              [rowPlayer.id]: Object.fromEntries(rowActions.map((action, index) => [action.id, rowMix[index]])),
              [columnPlayer.id]: Object.fromEntries(
                columnActions.map((action, index) => [action.id, columnMix[index]]),
              ),
            },
            payoffs: {
              [rowPlayer.id]: expectedPayoff(rowPayoffs, rowMix, columnMix),
              [columnPlayer.id]: expectedPayoff(columnPayoffs, rowMix, columnMix),
            },
          })
        }
      }
    }
  }
  return found
}

function opponentProfiles(
  game: Game,
  playerId: string,
  remaining?: Map<string, Set<string>>,
): ActionProfile[] {
  const others = game.players.filter((player) => player.id !== playerId)
  const lists = others.map((player) =>
    actionsFor(game, player.id).filter((action) => !remaining || remaining.get(player.id)?.has(action.id)),
  )
  if (others.length === 0) return [{}]
  if (lists.some((list) => list.length === 0)) return []
  const profiles: ActionProfile[] = []
  const walk = (index: number, acc: ActionProfile) => {
    if (index === others.length) {
      profiles.push({ ...acc })
      return
    }
    for (const action of lists[index]) {
      acc[others[index].id] = action.id
      walk(index + 1, acc)
    }
  }
  walk(0, {})
  return profiles
}

function beats(
  game: Game,
  playerId: string,
  betterId: string,
  worseId: string,
  remaining: Map<string, Set<string>> | undefined,
  strict: boolean,
): boolean {
  const profiles = opponentProfiles(game, playerId, remaining)
  if (profiles.length === 0) return false
  let improvedSomewhere = false
  for (const others of profiles) {
    const better = payoffAt(game, { ...others, [playerId]: betterId }, playerId)
    const worse = payoffAt(game, { ...others, [playerId]: worseId }, playerId)
    if (better === null || worse === null) return false
    if (better < worse - TOL) return false
    if (better > worse + TOL) improvedSomewhere = true
    if (strict && !(better > worse + TOL)) return false
  }
  return strict ? true : improvedSomewhere
}

function dominanceFacts(game: Game, kind: "strict" | "weak"): DominanceFact[] {
  const facts: DominanceFact[] = []
  for (const player of game.players) {
    const actions = actionsFor(game, player.id)
    for (const worse of actions) {
      const better = actions.find(
        (candidate) =>
          candidate.id !== worse.id &&
          beats(game, player.id, candidate.id, worse.id, undefined, kind === "strict"),
      )
      if (!better) continue
      facts.push({
        playerId: player.id,
        actionId: worse.id,
        kind,
        dominatedBy: better.id,
      })
    }
  }
  return facts
}

function eliminateStrictlyDominated(game: Game): {
  steps: EliminationStep[]
  surviving: Record<string, string[]>
} {
  const remaining = new Map<string, Set<string>>(
    game.players.map((player) => [player.id, new Set(actionsFor(game, player.id).map((action) => action.id))]),
  )
  const steps: EliminationStep[] = []
  let round = 1
  while (true) {
    const doomed: EliminationStep[] = []
    for (const player of game.players) {
      const available = [...(remaining.get(player.id) ?? [])]
      for (const worseId of available) {
        const betterId = available.find(
          (candidate) =>
            candidate !== worseId && beats(game, player.id, candidate, worseId, remaining, true),
        )
        if (!betterId) continue
        doomed.push({ round, playerId: player.id, actionId: worseId, dominatedBy: betterId })
      }
    }
    if (doomed.length === 0) break
    for (const step of doomed) remaining.get(step.playerId)?.delete(step.actionId)
    steps.push(...doomed)
    round += 1
  }
  return {
    steps,
    surviving: Object.fromEntries([...remaining].map(([playerId, ids]) => [playerId, [...ids]])),
  }
}

function pureEquilibria(game: Game): PureEquilibrium[] {
  const equilibria: PureEquilibrium[] = []
  for (const profile of enumerateProfiles(game)) {
    let strict = true
    let equilibrium = true
    const payoffs: Record<string, number> = {}
    for (const player of game.players) {
      const current = payoffAt(game, profile, player.id)
      if (current === null) {
        equilibrium = false
        break
      }
      payoffs[player.id] = current
      for (const action of actionsFor(game, player.id)) {
        if (action.id === profile[player.id]) continue
        const alternative = payoffAt(game, { ...profile, [player.id]: action.id }, player.id)
        if (alternative === null || alternative > current + TOL) {
          equilibrium = false
          break
        }
        if (alternative >= current - TOL) strict = false
      }
      if (!equilibrium) break
    }
    if (equilibrium) equilibria.push({ profile, strict, payoffs })
  }
  return equilibria
}

function bestResponses(game: Game): BestResponse[] {
  const responses: BestResponse[] = []
  for (const player of game.players) {
    for (const others of opponentProfiles(game, player.id)) {
      let best = -Infinity
      const actionIds: string[] = []
      for (const action of actionsFor(game, player.id)) {
        const payoff = payoffAt(game, { ...others, [player.id]: action.id }, player.id)
        if (payoff === null) continue
        if (payoff > best + TOL) {
          best = payoff
          actionIds.length = 0
          actionIds.push(action.id)
        } else if (Math.abs(payoff - best) <= TOL) {
          actionIds.push(action.id)
        }
      }
      if (actionIds.length > 0) responses.push({ playerId: player.id, others, actionIds })
    }
  }
  return responses
}

function payoffVector(equilibrium: PureEquilibrium, game: Game): number[] {
  return game.players.map((player) => equilibrium.payoffs[player.id])
}

function payoffDominates(better: number[], worse: number[]): boolean {
  let improved = false
  for (let index = 0; index < better.length; index += 1) {
    if (better[index] < worse[index] - TOL) return false
    if (better[index] > worse[index] + TOL) improved = true
  }
  return improved
}

function stackelberg(game: Game): Solution["stackelberg"] {
  const timing = game.timing
  if (timing.kind !== "leader-follower") {
    return { available: false, reason: null, outcomes: [] }
  }
  if (game.players.length !== 2) {
    return {
      available: false,
      reason: "Moving first is solved for two players. With more players, the result below is the simultaneous game.",
      outcomes: [],
    }
  }
  const leader = game.players.find((player) => player.id === timing.leaderId)
  const follower = game.players.find((player) => player.id !== timing.leaderId)
  if (!leader || !follower) {
    return { available: false, reason: "Choose who moves first.", outcomes: [] }
  }

  const leaderActions = actionsFor(game, leader.id)
  const followerActions = actionsFor(game, follower.id)
  const replies = new Map<string, string[]>()
  for (const leaderAction of leaderActions) {
    let best = -Infinity
    const repliesForAction: string[] = []
    for (const followerAction of followerActions) {
      const payoff = payoffAt(
        game,
        { [leader.id]: leaderAction.id, [follower.id]: followerAction.id },
        follower.id,
      )
      if (payoff === null) continue
      if (payoff > best + TOL) {
        best = payoff
        repliesForAction.length = 0
        repliesForAction.push(followerAction.id)
      } else if (Math.abs(payoff - best) <= TOL) {
        repliesForAction.push(followerAction.id)
      }
    }
    replies.set(leaderAction.id, repliesForAction)
  }

  const strategies: Record<string, string>[] = []
  const walk = (index: number, acc: Record<string, string>) => {
    if (index === leaderActions.length) {
      strategies.push({ ...acc })
      return
    }
    const leaderAction = leaderActions[index]
    for (const reply of replies.get(leaderAction.id) ?? []) {
      acc[leaderAction.id] = reply
      walk(index + 1, acc)
    }
  }
  walk(0, {})

  const outcomes: StackelbergOutcome[] = []
  const seen = new Set<string>()
  for (const strategy of strategies) {
    let best = -Infinity
    const chosen: string[] = []
    for (const leaderAction of leaderActions) {
      const followerActionId = strategy[leaderAction.id]
      const payoff = payoffAt(
        game,
        { [leader.id]: leaderAction.id, [follower.id]: followerActionId },
        leader.id,
      )
      if (payoff === null) continue
      if (payoff > best + TOL) {
        best = payoff
        chosen.length = 0
        chosen.push(leaderAction.id)
      } else if (Math.abs(payoff - best) <= TOL) {
        chosen.push(leaderAction.id)
      }
    }
    for (const leaderActionId of chosen) {
      const followerActionId = strategy[leaderActionId]
      const key = `${leaderActionId}|${followerActionId}`
      if (seen.has(key)) continue
      seen.add(key)
      const profile = { [leader.id]: leaderActionId, [follower.id]: followerActionId }
      outcomes.push({
        leaderActionId,
        followerActionId,
        payoffs: Object.fromEntries(
          game.players.map((player) => [player.id, payoffAt(game, profile, player.id) ?? 0]),
        ),
      })
    }
  }
  return { available: true, reason: null, outcomes }
}

function paretoBetter(game: Game, profile: ActionProfile): ActionProfile | null {
  const profiles = enumerateProfiles(game)
  for (const candidate of profiles) {
    if (profileKey(candidate) === profileKey(profile)) continue
    let improved = false
    let worse = false
    for (const player of game.players) {
      const current = payoffAt(game, profile, player.id) ?? 0
      const alternative = payoffAt(game, candidate, player.id) ?? 0
      if (alternative > current + TOL) improved = true
      if (alternative < current - TOL) worse = true
    }
    if (improved && !worse) return candidate
  }
  return null
}

function listProfiles(game: Game, profiles: ActionProfile[]): string {
  return profiles.map((profile) => describeProfile(game, profile)).join("; ")
}

function dependsOn(): string {
  return "This uses the payoff numbers you entered. They are judgments, and a different number can change the equilibrium."
}

function paretoSentence(game: Game, profile: ActionProfile): string {
  const better = paretoBetter(game, profile)
  if (!better) return ""
  return ` Everyone would do better if ${describeProfile(game, better)}, but that is not a Nash equilibrium, because someone can gain by deviating from it.`
}

function strictlyDominantAction(game: Game, playerId: string, facts: DominanceFact[]): string | null {
  const actions = actionsFor(game, playerId)
  for (const candidate of actions) {
    const others = actions.filter((action) => action.id !== candidate.id)
    if (others.length === 0) continue
    const dominatesAll = others.every((other) =>
      facts.some(
        (fact) =>
          fact.playerId === playerId &&
          fact.actionId === other.id &&
          fact.dominatedBy === candidate.id &&
          fact.kind === "strict",
      ),
    )
    if (dominatesAll) return candidate.id
  }
  return null
}

function recommend(
  game: Game,
  complete: boolean,
  missing: number,
  pure: PureEquilibrium[],
  mixed: MixedEquilibrium[],
  mixedSearched: boolean,
  strictFacts: DominanceFact[],
  stack: Solution["stackelberg"],
  payoffDominantKeys: string[],
  riskDominantKey: string | null,
): Recommendation {
  const user = game.players.find((player) => player.isUser) ?? game.players[0]
  const base = {
    yourPlayerId: user.id,
    yourActionIds: [] as string[],
    mixture: null as Record<string, number> | null,
    dependsOn: dependsOn(),
  }
  if (!user) {
    return { ...base, headline: "Add yourself as a player.", reasoning: "Mark which player is you.", dependsOn: dependsOn() }
  }
  if (!complete) {
    const noun = missing === 1 ? "payoff is" : "payoffs are"
    return {
      ...base,
      headline: "Finish the payoffs before trusting an action.",
      reasoning: `${missing} ${noun} still empty. Nash equilibrium is defined only once every player has a number for every outcome.`,
    }
  }

  const timing = game.timing
  if (timing.kind === "leader-follower" && stack.available && stack.outcomes.length > 0) {
    const leader = game.players.find((player) => player.id === timing.leaderId)!
    const follower = game.players.find((player) => player.id !== leader.id)!
    const yourActionIds = [
      ...new Set(
        stack.outcomes.map((outcome) =>
          user.id === leader.id ? outcome.leaderActionId : outcome.followerActionId,
        ),
      ),
    ]
    const paths = stack.outcomes
      .map(
        (outcome) =>
          `${playerName(game, leader.id)} plays ${actionName(game, outcome.leaderActionId)}, then ${playerName(game, follower.id)} plays ${actionName(game, outcome.followerActionId)}`,
      )
      .join("; ")
    const simultaneous =
      pure.length > 0 ? ` If you chose at the same time, the Nash equilibria would be ${listProfiles(game, pure.map((item) => item.profile))}.` : ""
    const single = stack.outcomes.length === 1 ? stack.outcomes[0] : null
    const profile = single
      ? { [leader.id]: single.leaderActionId, [follower.id]: single.followerActionId }
      : null
    const headline =
      yourActionIds.length === 1
        ? user.id === leader.id
          ? `Move first with ${actionName(game, yourActionIds[0])}.`
          : `Respond with ${actionName(game, yourActionIds[0])}.`
        : "More than one subgame-perfect outcome fits these payoffs."
    return {
      ...base,
      yourActionIds,
      headline,
      reasoning: `The second mover sees the first move and then best-responds. Subgame-perfect play: ${paths}.${simultaneous}${profile ? paretoSentence(game, profile) : ""}`,
    }
  }

  const dominant = strictlyDominantAction(game, user.id, strictFacts)
  if (dominant && pure.length === 1 && pure[0].profile[user.id] === dominant) {
    return {
      ...base,
      yourActionIds: [dominant],
      headline: `Play ${actionName(game, dominant)}.`,
      reasoning: `${actionName(game, dominant)} strictly dominates your other actions, so it is best no matter what the others do. The equilibrium is ${describeProfile(game, pure[0].profile)}.${paretoSentence(game, pure[0].profile)}`,
    }
  }

  if (pure.length === 1) {
    return {
      ...base,
      yourActionIds: [pure[0].profile[user.id]],
      headline: `Play ${actionName(game, pure[0].profile[user.id])}.`,
      reasoning: `There is one pure Nash equilibrium: ${describeProfile(game, pure[0].profile)}. No player can raise their own payoff by switching alone.${paretoSentence(game, pure[0].profile)}`,
    }
  }

  if (payoffDominantKeys.length === 1 && pure.length > 1) {
    const chosen = pure.find((item) => profileKey(item.profile) === payoffDominantKeys[0])!
    return {
      ...base,
      yourActionIds: [chosen.profile[user.id]],
      headline: `Play ${actionName(game, chosen.profile[user.id])}.`,
      reasoning: `There is more than one equilibrium: ${listProfiles(game, pure.map((item) => item.profile))}. ${describeProfile(game, chosen.profile)} payoff-dominates the others, because every player does at least as well and someone does better. Treating that as the one to play is a selection judgment, and it is the one the payoffs themselves rank first.${paretoSentence(game, chosen.profile)}`,
    }
  }

  if (riskDominantKey && pure.length > 1) {
    const chosen = pure.find((item) => profileKey(item.profile) === riskDominantKey)!
    return {
      ...base,
      yourActionIds: [chosen.profile[user.id]],
      headline: `Play ${actionName(game, chosen.profile[user.id])} if you cannot tell which equilibrium they expect.`,
      reasoning: `There are two strict equilibria: ${listProfiles(game, pure.map((item) => item.profile))}. Neither payoff-dominates the other. ${describeProfile(game, chosen.profile)} risk-dominates, which means the product of the losses from deviating is larger. That is a tie-break, not a proof that the other equilibrium cannot happen.`,
    }
  }

  if (pure.length > 1) {
    const yourActionIds = [...new Set(pure.map((item) => item.profile[user.id]))]
    return {
      ...base,
      yourActionIds,
      headline:
        yourActionIds.length === 1
          ? `Play ${actionName(game, yourActionIds[0])}.`
          : "The payoffs do not pick a single action.",
      reasoning: `There is more than one Nash equilibrium: ${listProfiles(game, pure.map((item) => item.profile))}. ${
        yourActionIds.length === 1
          ? "Your action is the same in each of them."
          : "Which action is right depends on which equilibrium you expect the others to play. That expectation is a judgment, not something the payoff numbers settle."
      }`,
    }
  }

  if (mixed.length === 1) {
    const mixture = mixed[0].probabilities[user.id]
    const used = Object.entries(mixture).filter(([, probability]) => probability > 1e-6)
    return {
      ...base,
      yourActionIds: used.map(([actionId]) => actionId),
      mixture,
      headline: "Don't play one action for sure.",
      reasoning: `There is no pure equilibrium. The mixed equilibrium puts ${used
        .map(([actionId, probability]) => `${Math.round(probability * 1000) / 10}% on ${actionName(game, actionId)}`)
        .join(" and ")}. That mixture makes the other side unwilling to switch, and theirs does the same for you.`,
    }
  }

  if (mixed.length > 1) {
    return {
      ...base,
      headline: "Several mixed equilibria fit these payoffs.",
      reasoning: `There is no pure equilibrium, and more than one mixed equilibrium. The probabilities are listed with the result. Which mixture you expect is a judgment.`,
    }
  }

  return {
    ...base,
    headline: "No equilibrium was found in the strategies this solver checks.",
    reasoning: mixedSearched
      ? "Two-player games always have a Nash equilibrium, so this usually means the payoff grid is incomplete or outside the four-action cap."
      : "There is no pure-strategy equilibrium. Mixed equilibria for more than two players are not computed here.",
  }
}

function riskDominantKey(game: Game, pure: PureEquilibrium[]): string | null {
  if (game.players.length !== 2 || pure.length !== 2) return null
  if (pure.some((item) => !item.strict)) return null
  if (game.players.some((player) => actionsFor(game, player.id).length !== 2)) return null
  const [first, second] = pure
  const [rowPlayer, columnPlayer] = game.players
  if (first.profile[rowPlayer.id] === second.profile[rowPlayer.id]) return null
  if (first.profile[columnPlayer.id] === second.profile[columnPlayer.id]) return null

  const lossProduct = (equilibrium: PureEquilibrium, other: PureEquilibrium) => {
    const rowDeviation = payoffAt(
      game,
      { ...equilibrium.profile, [rowPlayer.id]: other.profile[rowPlayer.id] },
      rowPlayer.id,
    )
    const columnDeviation = payoffAt(
      game,
      { ...equilibrium.profile, [columnPlayer.id]: other.profile[columnPlayer.id] },
      columnPlayer.id,
    )
    if (rowDeviation === null || columnDeviation === null) return null
    return (
      (equilibrium.payoffs[rowPlayer.id] - rowDeviation) *
      (equilibrium.payoffs[columnPlayer.id] - columnDeviation)
    )
  }

  const firstProduct = lossProduct(first, second)
  const secondProduct = lossProduct(second, first)
  if (firstProduct === null || secondProduct === null) return null
  if (firstProduct > secondProduct + TOL) return profileKey(first.profile)
  if (secondProduct > firstProduct + TOL) return profileKey(second.profile)
  return null
}

export function solve(game: Game): Solution {
  const missing = missingPayoffCount(game)
  const profiles = enumerateProfiles(game)
  const complete = game.players.length >= 2 && profiles.length > 0 && missing === 0
  const emptyStack = { available: false, reason: null, outcomes: [] as StackelbergOutcome[] }
  if (!complete) {
    return {
      complete: false,
      missingPayoffCount: missing,
      profileCount: profiles.length,
      strictlyDominated: [],
      weaklyDominated: [],
      elimination: [],
      survivingActionIds: {},
      bestResponses: [],
      pureEquilibria: [],
      mixedEquilibria: [],
      mixedSearched: false,
      stackelberg: emptyStack,
      payoffDominantKeys: [],
      riskDominantKey: null,
      recommendation: recommend(game, false, missing, [], [], false, [], emptyStack, [], null),
    }
  }

  const strictlyDominated = dominanceFacts(game, "strict")
  const weaklyDominated = dominanceFacts(game, "weak").filter(
    (fact) =>
      !strictlyDominated.some(
        (strict) => strict.playerId === fact.playerId && strict.actionId === fact.actionId,
      ),
  )
  const eliminated = eliminateStrictlyDominated(game)
  const responses = bestResponses(game)
  const pure = pureEquilibria(game)
  const bothSmall =
    game.players.length === 2 &&
    game.players.every((player) => {
      const count = actionsFor(game, player.id).length
      return count >= 1 && count <= 4
    })
  const mixed = bothSmall ? findMixedEquilibria(game) : []
  const stack = stackelberg(game)
  const payoffKeys = pure
    .filter((equilibrium, index) =>
      pure.every(
        (other, otherIndex) =>
          otherIndex === index || !payoffDominates(payoffVector(other, game), payoffVector(equilibrium, game)),
      ),
    )
    .map((equilibrium) => profileKey(equilibrium.profile))
  const riskKey = riskDominantKey(game, pure)

  return {
    complete: true,
    missingPayoffCount: 0,
    profileCount: profiles.length,
    strictlyDominated,
    weaklyDominated,
    elimination: eliminated.steps,
    survivingActionIds: eliminated.surviving,
    bestResponses: responses,
    pureEquilibria: pure,
    mixedEquilibria: mixed,
    mixedSearched: bothSmall,
    stackelberg: stack,
    payoffDominantKeys: payoffKeys.length === pure.length ? [] : payoffKeys,
    riskDominantKey: riskKey,
    recommendation: recommend(
      game,
      true,
      0,
      pure,
      mixed,
      bothSmall,
      strictlyDominated,
      stack,
      payoffKeys.length === pure.length ? [] : payoffKeys,
      riskKey,
    ),
  }
}
