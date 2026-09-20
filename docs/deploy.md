# Releasing

The game ships as an Android APK attached to a GitHub release. There is no web
deploy: the browser build still exists and is what `npm run dev` and the
end-to-end test drive, but it is not a target anybody installs from any more.

## Cutting a release

```bash
git tag v0.2.0
git push origin v0.2.0
```

That is the whole process. `release.yml` picks the tag up, runs the unit tests,
builds the web bundle, syncs it into the Android project, assembles the APK and
creates the release with the APK attached.

A tag rather than a push to main, because a release is a deliberate act with a
number on it. Every green commit minting a release would make the tag list
meaningless and the version number arbitrary.

`workflow_dispatch` rebuilds without a tag for when something went wrong with
the run rather than with the commit. It versions itself `0.0.0-dev.<run>` and
publishes as a prerelease, so a rebuild cannot be mistaken for a real version.

## What the version comes from

| | Source | Why |
| --- | --- | --- |
| `versionName` | the tag, minus its `v` | What people see. `v0.2.0` → `0.2.0`. |
| `versionCode` | the workflow run number | Must be an integer and must only ever increase. A date works until you release twice in a day; a semver is not an integer at all. |

Both arrive as environment variables and `android/app/build.gradle` falls back
to the template's `1.0` / `1` when they are absent, so opening the project in
Android Studio still builds.

One consequence of taking `versionCode` from the run number: renaming or
recreating the workflow file restarts that counter, and a `versionCode` that
goes backwards cannot be installed over what is already on the device. If the
workflow is ever replaced rather than edited, the replacement needs an offset.

**`src/version.ts` is not wired to any of this.** The about screen reads
`APP_VERSION`, which is still maintained by hand, so it will disagree with the
release the APK came from unless somebody bumps it in the same commit as the
tag. Worth fixing — the about screen is where a bug report gets its version
number from — but it is not fixed today.

## The signing key, and what it costs

`android/debug.keystore` is committed, and the APK is debug-signed with it.

That is not an accident and it is not a secret. A debug keystore is normally
created on demand in `~/.android`, which is fine on one machine and wrong on
CI: a fresh runner has no such file, so every release would be signed with a
different throwaway key, and Android refuses to install an APK over one signed
by a different key. Every release would mean uninstall-and-reinstall, and
uninstalling takes the player's saves with it. Pinning the key is what makes
the releases a series rather than a set of unrelated apps.

What it costs is real and worth stating plainly:

- **Anybody can sign an APK with this key**, because the keystore and its
  password are both in the repository. It identifies the build, it does not
  authenticate it.
- **Android will warn on install.** Expected for anything not coming from Play.
- **Moving to a real key is a one-time break.** A release signed with a proper
  upload key cannot install over a debug-signed one. Every existing install has
  to be removed first, saves included. The longer debug-signed releases go on,
  the more people that affects.

When that move happens: generate a keystore, put it and its three passwords in
repository secrets, add a `release` signing config that reads them, and switch
the workflow to `assembleRelease`. Say loudly in the release notes that it is a
clean install.

## Google Play

The APK here is for sideloading and Play does not accept it — Play wants an
Android App Bundle. The Capacitor 8 upgrade cleared the technical bar (the
store requires API 36 and the project now targets it), but a Play submission
additionally needs `./gradlew bundleRelease`, a real upload key, and Play App
Signing enabled. None of that is wired up, on purpose: it is a different
distribution channel with a different key, not a flag on this workflow.

The trademark question in the About screen's legal notice is unresolved and is
a Play and App Store policy matter rather than a build one.

## Two build settings worth not breaking

Both exist so the same `dist/` works in a browser and inside the native shell,
which is what keeps one artefact honest across targets:

- **Hash routing** (`createWebHashHistory`). Every route lives after the `#`,
  so nothing has to rewrite paths — including the `file://`-like origin the
  Capacitor shell serves from.
- **`base: './'`** in `vite.config.ts`. Asset paths are relative, so the build
  works from the root of a domain, a subdirectory, or the native shell without
  rebuilding.

## Saves never leave the device

Saves go to IndexedDB, with localStorage as a fallback and Capacitor
Preferences on native, gzipped through the platform's own `CompressionStream`.
Nothing is uploaded anywhere, which is why there is no backend to run and no
personal data to hold — and why uninstalling the app destroys the career.

Two things would need a backend, and both are deliberately stubbed rather than
half-built: cloud saves (`platform/services.ts` reports `signIn: false` until a
real provider exists, and the settings screen renders nothing) and any
LLM-backed feature, which cannot ship an API key to a client.
