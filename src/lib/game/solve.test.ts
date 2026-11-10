import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  coordinationGame,
  matchingPennies,
  prisonersDilemma,
  stackelbergChicken,
} from "./examples"
import { solve } from "./solve"
import { profileKey, type Game } from "./types"

describe("prisoner's dilemma", () => {
  const solution = solve(prisonersDilemma())

  it("has one strict equilibrium where both defect", () => {
    assert.equal(solution.complete, true)
    assert.equal(solution.pureEquilibria.length, 1)
    assert.equal(solution.pureEquilibria[0].strict, true)
    assert.equal(solution.pureEquilibria[0].profile.you, "you-defect")
    assert.equal(solution.pureEquilibria[0].profile.counterpart, "them-defect")
    assert.equal(solution.mixedEquilibria.length, 0)
  })

  it("treats cooperate as strictly dominated", () => {
    assert.equal(solution.strictlyDominated.length, 2)
    assert.ok(solution.strictlyDominated.every((fact) => fact.dominatedBy.endsWith("defect")))
    assert.deepEqual(solution.survivingActionIds.you, ["you-defect"])
    assert.deepEqual(solution.survivingActionIds.counterpart, ["them-defect"])
  })

  it("recommends defect and names the payoff judgment", () => {
    assert.deepEqual(solution.recommendation.yourActionIds, ["you-defect"])
    assert.match(solution.recommendation.headline, /Defect/)
    assert.match(solution.recommendation.reasoning, /dominates/)
    assert.match(solution.recommendation.reasoning, /not a Nash equilibrium/)
    assert.match(solution.recommendation.dependsOn, /payoff numbers/)
  })
})

describe("matching pennies", () => {
  const solution = solve(matchingPennies())

  it("has no pure equilibrium and one even mixture", () => {
    assert.equal(solution.pureEquilibria.length, 0)
    assert.equal(solution.mixedEquilibria.length, 1)
    const yours = solution.mixedEquilibria[0].probabilities.you
    const theirs = solution.mixedEquilibria[0].probabilities.other
    for (const probability of [...Object.values(yours), ...Object.values(theirs)]) {
      assert.ok(Math.abs(probability - 0.5) < 1e-6)
    }
    assert.match(solution.recommendation.headline, /Don't play one action for sure/)
  })
})

describe("coordination", () => {
  const solution = solve(coordinationGame())

  it("has two pure equilibria and a payoff-dominant one", () => {
    assert.equal(solution.pureEquilibria.length, 2)
    assert.equal(solution.payoffDominantKeys.length, 1)
    assert.equal(
      solution.payoffDominantKeys[0],
      profileKey({ you: "you-alpha", other: "other-alpha" }),
    )
    assert.equal(solution.riskDominantKey, solution.payoffDominantKeys[0])
    assert.deepEqual(solution.recommendation.yourActionIds, ["you-alpha"])
    assert.match(solution.recommendation.headline, /Alpha/)
  })

  it("finds the mixed equilibrium that makes both indifferent", () => {
    assert.equal(solution.mixedEquilibria.length, 1)
    const yours = solution.mixedEquilibria[0].probabilities.you
    assert.ok(Math.abs(yours["you-alpha"] - 1 / 3) < 1e-6)
    assert.ok(Math.abs(yours["you-beta"] - 2 / 3) < 1e-6)
  })
})

describe("leader-follower", () => {
  const solution = solve(stackelbergChicken())

  it("selects the leader's preferred equilibrium once the rival can respond", () => {
    assert.equal(solution.pureEquilibria.length, 2)
    assert.equal(solution.stackelberg.outcomes.length, 1)
    assert.equal(solution.stackelberg.outcomes[0].leaderActionId, "you-straight")
    assert.equal(solution.stackelberg.outcomes[0].followerActionId, "rival-swerve")
    assert.deepEqual(solution.recommendation.yourActionIds, ["you-straight"])
    assert.match(solution.recommendation.headline, /Straight/)
    assert.match(solution.recommendation.reasoning, /same time/)
  })
})

describe("other shapes", () => {
  it("flags a weakly dominated action without calling it strict", () => {
    const game: Game = {
      title: "Weak",
      decision: "",
      doNothing: "",
      information: "",
      players: [
        { id: "row", name: "Row", isUser: true },
        { id: "column", name: "Column", isUser: false },
      ],
      actions: [
        { id: "up", playerId: "row", label: "Up" },
        { id: "down", playerId: "row", label: "Down" },
        { id: "left", playerId: "column", label: "Left" },
        { id: "right", playerId: "column", label: "Right" },
      ],
      timing: { kind: "simultaneous" },
      payoffs: {
        "column:left|row:up": { row: 1, column: 1 },
        "column:right|row:up": { row: 1, column: 0 },
        "column:left|row:down": { row: 0, column: 0 },
        "column:right|row:down": { row: 0, column: 0 },
      },
    }
    const solution = solve(game)
    assert.ok(
      solution.weaklyDominated.some(
        (fact) => fact.playerId === "column" && fact.actionId === "right" && fact.dominatedBy === "left",
      ),
    )
    assert.ok(solution.strictlyDominated.some((fact) => fact.actionId === "down"))
    assert.ok(!solution.strictlyDominated.some((fact) => fact.actionId === "right"))
  })

  it("solves a three-player game with a dominant action", () => {
    const players = ["a", "b", "c"].map((id, index) => ({
      id,
      name: id.toUpperCase(),
      isUser: index === 0,
    }))
    const actions = players.flatMap((player) => [
      { id: `${player.id}-yes`, playerId: player.id, label: "Yes" },
      { id: `${player.id}-no`, playerId: player.id, label: "No" },
    ])
    const payoffs: Game["payoffs"] = {}
    for (const a of ["yes", "no"]) {
      for (const b of ["yes", "no"]) {
        for (const c of ["yes", "no"]) {
          const key = profileKey({ a: `a-${a}`, b: `b-${b}`, c: `c-${c}` })
          payoffs[key] = { a: a === "yes" ? 1 : 0, b: b === "yes" ? 1 : 0, c: c === "yes" ? 1 : 0 }
        }
      }
    }
    const solution = solve({
      title: "Three",
      decision: "",
      doNothing: "",
      information: "",
      players,
      actions,
      timing: { kind: "simultaneous" },
      payoffs,
    })
    assert.equal(solution.mixedSearched, false)
    assert.equal(solution.pureEquilibria.length, 1)
    assert.equal(solution.pureEquilibria[0].profile.a, "a-yes")
    assert.equal(solution.recommendation.yourActionIds[0], "a-yes")
  })

  it("finds the unique mixed equilibrium of rock-paper-scissors", () => {
    const labels = ["rock", "paper", "scissors"] as const
    const score = (left: number, right: number) => {
      if (left === right) return [0, 0]
      if ((left + 1) % 3 === right) return [-1, 1]
      return [1, -1]
    }
    const payoffs: Game["payoffs"] = {}
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        const [you, other] = score(row, column)
        payoffs[profileKey({ you: `you-${labels[row]}`, other: `other-${labels[column]}` })] = { you, other }
      }
    }
    const solution = solve({
      title: "RPS",
      decision: "",
      doNothing: "",
      information: "",
      players: [
        { id: "you", name: "You", isUser: true },
        { id: "other", name: "Other", isUser: false },
      ],
      actions: labels.flatMap((label) => [
        { id: `you-${label}`, playerId: "you", label },
        { id: `other-${label}`, playerId: "other", label },
      ]),
      timing: { kind: "simultaneous" },
      payoffs,
    })
    assert.equal(solution.pureEquilibria.length, 0)
    assert.equal(solution.mixedEquilibria.length, 1)
    for (const probability of Object.values(solution.mixedEquilibria[0].probabilities.you)) {
      assert.ok(Math.abs(probability - 1 / 3) < 1e-6)
    }
  })

  it("refuses to invent an equilibrium when a payoff is missing", () => {
    const game = prisonersDilemma()
    game.payoffs["counterpart:them-defect|you:you-defect"].you = null
    const solution = solve(game)
    assert.equal(solution.complete, false)
    assert.equal(solution.pureEquilibria.length, 0)
    assert.equal(solution.recommendation.yourActionIds.length, 0)
    assert.match(solution.recommendation.headline, /Finish the payoffs/)
  })
})
