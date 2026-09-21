# The desktop shell

An Electron wrapper around the built web bundle, so the game can be sold where
desktop games are sold. Nothing in `src/` knows it exists.

## Why it is a separate package

Its own `package.json`, and its own `node_modules`, so that `npm ci` at the
repository root does not download a hundred megabytes of Chromium on every CI
run for a target CI does not build. The root install stays what it was.

## Why Electron and not Tauri

Tauri's binary is a tenth of the size and renders in whatever webview the
operating system supplies — WebView2 on Windows, WebKitGTK on Linux, WKWebView
on macOS. This game is typography, hairline rules and a canvas. Testing it
against three renderers to save a hundred megabytes, on a storefront where a
hundred megabytes is nothing, would be paying in the only currency that
matters here.

Electron ships the Chromium the game is already tested against, and a Windows
build of it runs on a Steam Deck under Proton without special handling.

## Running it

From the repository root, build the bundle first — the shell loads `dist/`:

```bash
npm run build
cd desktop && npm install && npm start
```

## Packaging

```bash
npm run dist      # installers for the current platform, into desktop/out/
npm run pack      # an unpacked directory, faster, for a smoke test
```

Cross-building is not set up. Each platform's installer is built on that
platform, which is what the Windows, macOS and Linux targets in `package.json`
assume.

## What is verified, and what is not

Verified: the shell launches, the game renders from `file://`, IndexedDB is
available so saves work, and the window opens wide enough for the desktop
layout to engage.

Not verified here, because none of it can be without a developer account, a
Steam appid or a real machine:

- **Steamworks.** Achievements, cloud saves and rich presence need the
  Steamworks SDK and an appid. The seam already exists and is the right shape:
  `src/engine/systems/achievements.ts` decides what has been earned from the
  game state, and `src/platform/services.ts` reports it, so Steam plugs in
  beside Game Center and Play Games without the engine learning anything.
- **Code signing.** Windows and macOS both want it, and macOS wants
  notarisation as well.
- **Steam Deck.** 1280x800 is the default window size for exactly this reason,
  but Deck verification also wants full controller support, which the game does
  not have. Keyboard and pointer work; a gamepad does not.

## One known warning

Running unpackaged, Electron logs a Content-Security-Policy warning. It stops
once the app is packaged. Setting a real policy is still worth doing and is
deliberately not done blind: it needs testing that nothing in the bundle
breaks under it.
