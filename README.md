# claude-mods

Mods I made for [Claude Code](https://code.claude.com) and use every day. A mod is a small plugin that hooks into Claude Code's events and UI.

## usage-band

Shows your Claude plan usage next to the prompt: the 5-hour and weekly limits, and the time until each resets. No need to open the usage page to check how much is left.

![usage-band next to the prompt](docs/usage-band.png)

`5H 29% 1h8m / 7D 15% 5d` reads as:

- **5H / 7D**: the 5-hour and weekly limits
- **29% / 15%**: how much of each is used. Green below 50%, yellow from 50%, red from 80%
- **1h8m / 5d**: time until each resets (the weekly one shows whole days)

It also:

- Shows a toast once when a limit newly passes 80% and 95%
- Shows the last known values, marked `(last)`, until the first reply of a new session brings fresh ones
- Reads only the usage Claude Code already has. No network calls, no file access, no commands

Tested with Claude Code 2.1.299 in the desktop app on macOS. The tests cover both the terminal and the desktop app.

### Install

At the prompt of a Claude Code session:

```
/plugin install usage-band --marketplace jumpei-kurata/claude-mods
```

Answer `y` to add the marketplace, then pick a scope. From a shell:

```bash
claude plugin install usage-band --marketplace jumpei-kurata/claude-mods
```

### Uninstall

```bash
claude plugin uninstall usage-band@kurata-mods
```

### Known issue

In recent versions of the desktop app, content a mod draws in the `SessionMode` slot gets its own row under the model picker, instead of sitting on the same row. So the label takes an extra line. A mod can't move it back. Reported in [anthropics/claude-code#102415](https://github.com/anthropics/claude-code/issues/102415).

## Development

```bash
claude plugin validate usage-band
claude plugin test usage-band
```

## License

[MIT](LICENSE)
