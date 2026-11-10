# Nash agent

A local worksheet for thinking through a decision the way a game theorist would. You name the players, their actions, what they know, and the payoffs. The app computes dominated strategies, best responses, and Nash equilibria, then recommends your action. A chat panel can talk through the same worksheet. It has to call that solver before it states an equilibrium.

The worksheet works with no API key. Chat needs a key.

## Run

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The prisoner’s dilemma is loaded first, so the result is visible before you enter your own decision.

## Chat

Put one of these in `.env.local` and restart the dev server:

```
OPENAI_API_KEY=...
# or
ANTHROPIC_API_KEY=...
```

If both are set, chat uses OpenAI unless `AI_PROVIDER=anthropic`. Optional model overrides: `OPENAI_MODEL`, `ANTHROPIC_MODEL`.

Equilibria come from the solver in `src/lib/game/solve.ts`, not from the model. `npm test` checks the prisoner’s dilemma, matching pennies, a coordination game, and a leader-follower game.
