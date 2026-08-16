# STT conversion handoff

This directory contains only the contract used by the STT/lecture-analysis screen
to hand generated data to the escape-room game.

- `bridge/game-handoff.js`: validates and stores an STT analysis handoff in
  `sessionStorage`.
- `game-contract.d.ts`: source-side handoff type definitions.
- `game-generator.sample.json`: sample output from the STT analysis pipeline.
- `TEAM_MESSAGE.txt`: the original teammate handoff note.

The temporary game page and runtime from the handoff package are intentionally
not included. The active game screen is implemented exclusively by
`apps/web/index.html`, `apps/web/app.js`, and `apps/web/styles.css` from the
`lecture-room-escape` package.

The STT screen should call `saveGameHandoff(sessionStorage, message)` after its
analysis has completed. Converting that analysis contract into the room puzzle
pack consumed by the active game remains an integration boundary.
