import type { Game } from "./types"

export function blankGame(): Game {
  return {
    title: "",
    decision: "",
    doNothing: "",
    information: "",
    players: [
      { id: "you", name: "You", isUser: true },
      { id: "other", name: "Other", isUser: false },
    ],
    actions: [
      { id: "you-a", playerId: "you", label: "" },
      { id: "you-b", playerId: "you", label: "" },
      { id: "other-a", playerId: "other", label: "" },
      { id: "other-b", playerId: "other", label: "" },
    ],
    timing: { kind: "simultaneous" },
    payoffs: {},
  }
}

export function prisonersDilemma(): Game {
  return {
    title: "Prisoner's dilemma",
    decision: "Do you cooperate with the other player, or take the short-run gain?",
    doNothing: "If you both refuse to decide, treat that as cooperating and hope they do too.",
    information:
      "You choose at the same time. Neither of you sees the other's move before choosing.",
    players: [
      { id: "you", name: "You", isUser: true },
      { id: "counterpart", name: "Counterpart", isUser: false },
    ],
    actions: [
      { id: "you-cooperate", playerId: "you", label: "Cooperate" },
      { id: "you-defect", playerId: "you", label: "Defect" },
      { id: "them-cooperate", playerId: "counterpart", label: "Cooperate" },
      { id: "them-defect", playerId: "counterpart", label: "Defect" },
    ],
    timing: { kind: "simultaneous" },
    payoffs: {
      "counterpart:them-cooperate|you:you-cooperate": { you: 3, counterpart: 3 },
      "counterpart:them-defect|you:you-cooperate": { you: 0, counterpart: 5 },
      "counterpart:them-cooperate|you:you-defect": { you: 5, counterpart: 0 },
      "counterpart:them-defect|you:you-defect": { you: 1, counterpart: 1 },
    },
  }
}

export function matchingPennies(): Game {
  return {
    title: "Matching pennies",
    decision: "Do you match the other player or not?",
    doNothing: "There is no status quo that pays either of you.",
    information: "You choose at the same time, without seeing the other side.",
    players: [
      { id: "you", name: "You", isUser: true },
      { id: "other", name: "Other", isUser: false },
    ],
    actions: [
      { id: "you-heads", playerId: "you", label: "Heads" },
      { id: "you-tails", playerId: "you", label: "Tails" },
      { id: "other-heads", playerId: "other", label: "Heads" },
      { id: "other-tails", playerId: "other", label: "Tails" },
    ],
    timing: { kind: "simultaneous" },
    payoffs: {
      "other:other-heads|you:you-heads": { you: 1, other: -1 },
      "other:other-tails|you:you-heads": { you: -1, other: 1 },
      "other:other-heads|you:you-tails": { you: -1, other: 1 },
      "other:other-tails|you:you-tails": { you: 1, other: -1 },
    },
  }
}

export function coordinationGame(): Game {
  return {
    title: "Coordination",
    decision: "Which option do you both pick?",
    doNothing: "If you fail to coordinate, you both get nothing.",
    information: "You choose at the same time, without a binding agreement.",
    players: [
      { id: "you", name: "You", isUser: true },
      { id: "other", name: "Other", isUser: false },
    ],
    actions: [
      { id: "you-alpha", playerId: "you", label: "Alpha" },
      { id: "you-beta", playerId: "you", label: "Beta" },
      { id: "other-alpha", playerId: "other", label: "Alpha" },
      { id: "other-beta", playerId: "other", label: "Beta" },
    ],
    timing: { kind: "simultaneous" },
    payoffs: {
      "other:other-alpha|you:you-alpha": { you: 2, other: 2 },
      "other:other-beta|you:you-alpha": { you: 0, other: 0 },
      "other:other-alpha|you:you-beta": { you: 0, other: 0 },
      "other:other-beta|you:you-beta": { you: 1, other: 1 },
    },
  }
}

export function stackelbergChicken(): Game {
  return {
    title: "Moving first",
    decision: "Do you commit first, or choose together?",
    doNothing: "Swerving is the cautious move if you have not committed.",
    information:
      "You move first. The other player sees your choice and then responds.",
    players: [
      { id: "you", name: "You", isUser: true },
      { id: "rival", name: "Rival", isUser: false },
    ],
    actions: [
      { id: "you-swerve", playerId: "you", label: "Swerve" },
      { id: "you-straight", playerId: "you", label: "Straight" },
      { id: "rival-swerve", playerId: "rival", label: "Swerve" },
      { id: "rival-straight", playerId: "rival", label: "Straight" },
    ],
    timing: { kind: "leader-follower", leaderId: "you" },
    payoffs: {
      "rival:rival-swerve|you:you-swerve": { you: 0, rival: 0 },
      "rival:rival-straight|you:you-swerve": { you: -1, rival: 1 },
      "rival:rival-swerve|you:you-straight": { you: 1, rival: -1 },
      "rival:rival-straight|you:you-straight": { you: -10, rival: -10 },
    },
  }
}
