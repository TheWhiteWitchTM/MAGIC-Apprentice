# MAGIC Apprentice

A kid- and teen-friendly IDE for the [MAGIC](https://github.com/TheWhiteWitchTM/MAGIC) language. Ages 8 to 16. It feels like a small BASIC: a big Run button, a program on the page, and words that say what went wrong.

Mira, [The White Witch™](https://thewhitewitchtm.github.io/whitewitch/). [X](https://x.com/TheWhiteWitchTM) · [thewhitewitchtm@google.com](mailto:thewhitewitchtm@google.com) · [GitHub](https://github.com/TheWhiteWitchTM) · [YouTube](https://youtube.com/@TheWhiteWitchTM) · [Bluesky](https://bsky.app/profile/thewhitewitchtm.sociallydead.me) · [MIT License](LICENSE)

The compiler is the MAGIC project next to this folder, along with the emoji engines. `@canvas`, `@terminal`, and `@games` are the modules MAGIC already ships.

## Start

The MAGIC project has to be built first. From the folder that holds both projects:

```bash
cd ../MAGIC
npm install
cd ../MAGIC-Apprentice
npm install
npm start
```

`bin/magic-apprentice` does the same thing and picks up nvm when it is installed.

The first launch opens Hello, world and a three-step tour: print a line, draw an emoji sprite, play a tiny game. The tour can be skipped. Help → Tutorial brings it back.

## The screen

The paper theme is the light one. Night is the dark one. The choice is remembered.

Beginner keeps the screen to examples, the program, Run, and the helper. Advanced adds the file list, a strict check, and the compiler's own message under the plain one.

Examples copy into the library the first time you press them. A second press opens that copy and leaves your edits in place. Start over, on a tour step, puts that example back after you agree.

Projects live in the app's library, not in a folder you pick. Show folder, in Advanced, opens that library in the file manager.

## Run

Run saves, then starts the open program.

A program that only prints stays in the output box. `print "Hello, world!"` is the first one.

A program that uses `@canvas`, `@terminal`, `@2d`, `@3d`, or `@ui` opens a play window. The sprite and the catch game are that kind. Arrow keys move the cat in the game. Close the window, or press Stop.

A print program that never ends is stopped for you: 30 seconds in Beginner, 5 minutes in Advanced. Stop works sooner.

## Plain errors

The compiler's line and message are turned into a sentence. `=` stores a value, so a test that uses one `=` says to write `==`. A missing `end` says which blocks need one. Advanced still shows the original line.

## A safe box

A program runs under Node's permission rules, plus a small hook that blocks the network.

- It can read files inside its own project.
- It cannot read the rest of the computer. A link that points out of the project is refused.
- It cannot change files, start another program, or open a worker.
- It cannot use the internet. `load` of a web address is refused.
- The play window is a sandboxed Electron page. It does not get Node, and web requests are cancelled.

The editor window is sandboxed too. It talks to the app through a short list of calls.

## Export

Web page packs the program with MAGIC's `app` command and opens `index.html` in the browser. The page is the same pack MAGIC writes: `game.js`, the engine scripts the program needs, and an Electron `main.js`.

App packs that same folder, runs `npm install` once, and starts it. That download is Electron. Apprentice asks before it starts. The new window is the program, not Apprentice.

Both folders land in `export/` inside the project.

## The helper

The helper is optional. It uses Ollama on this computer, at `127.0.0.1:11434`, and nowhere else. Explain and Ask send the open program to that local model.

The helper is told it cannot edit files. If a reply contains a MAGIC program, Apprentice shows it and waits. Use this code asks again before the editor changes. Nothing is saved until you press Save. Ctrl+Z takes the change back before that.

Without Ollama, the helper column still explains `print`, `@canvas`, `@terminal`, `@games`, loops, and sprites from the program itself.

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5-coder:3b
ollama create helper -f ai/helper.Modelfile
```

Any model already installed can answer. A model named `helper` or `coder` is preferred.

## Examples

| Example | What it uses |
| --- | --- |
| Hello, world | `print` |
| Emoji sprite | `@canvas` |
| Tiny game | `@canvas` and `@games` |
| Letter grid | `@terminal` |
| Score | `@games` |

## Check

```bash
npm run smoke
npm run smoke:window
```

`smoke` compiles every example, runs Hello inside the safe box, and checks that a read of `/etc/passwd` and a web `load` are refused. `smoke:window` opens the real window, presses Run, and waits for `Hello, world!`.
