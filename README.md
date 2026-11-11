# Queue Strain

An [oss!idle](https://oss.idle.rhythmgamers.net) add-on that shows where the queue you're playing takes your strain, warm-up bar, XP and levels.

- Forecasts your strain bar for the queue, repeats included, up to 24 hours ahead
- XP per hour for every skill, with your medals, mindblock and genetics counted
- Compares that with what your own recent plays gave you, live as you play
- Levels and prestige: how close each skill is, and where its XP comes from
- Speed Jam / Memory XP per play

Press **Alt+Shift+F** in game, then **Scan queue**.

## Files

| File | What's in it |
| --- | --- |
| `src/config.js` | Version, notice, changelog, settings and every text players see. Edit this for a release. |
| `src/rules/` | The game's fatigue, genetics, Tries and XP rules, ported from oss!idle 1.4.3.0 |
| `src/game.js` | Reading the game and the server: the queue, medals, genetics, Tries, mindblock |
| `src/forecast.js` | Simulating the queue play by play, the cache, calibration, the local estimate |
| `src/ui/` | The window: styles, small parts, and the tabs |
| `src/index.js` | What oss!idle calls |

## Building

oss!idle builds every new version tag (`v1.3.2`) with `npm ci` and `npm run build`. `addon.config.json` names the built file, `dist/queue-strain.js`.

To build it yourself: `npm run build`. To check the ported game rules too: `npm test`.

For a release:
1. Set the same version in `package.json`, `package-lock.json` and `src/config.js` (the build stops if they differ).
2. Update `VERSION_ID` and the changelog in `src/config.js`.
3. Commit, then tag it: `git tag v1.3.2 && git push --tags`.

`test/harness.html` is a fake game for trying the add-on in a browser without oss!idle.

## Sources

- [oss!idle](https://github.com/oss-idle/oss-idle) 1.4.3.0: the game's rules, the add-on API and simulator
- [oss!idle sim](https://github.com/oss-idle/addon-sim): how the server applies mindblock, fatigue, medals and mods to XP

## License

[AGPL-3.0](LICENSE)
