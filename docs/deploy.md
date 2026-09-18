# Deploying

The game is a static site. That is the whole of it: no server, no database,
no API keys in the client, no environment variables, and nothing to scale.
`npm run build` produces `dist/`, about 1.3MB across seventy files, and any
host that serves files can serve it.

Two things make that true and are worth not breaking:

- **Hash routing** (`createWebHashHistory`). Every route lives after the `#`,
  so the host never sees a path it has to rewrite. A history-mode router would
  need a catch-all rewrite to `index.html` on every host, which is exactly the
  kind of config that works in dev and 404s in production.
- **`base: './'`** in `vite.config.ts`. Asset paths are relative, so the build
  works from the root of a domain, a subdirectory, or a `file://` URL inside a
  Capacitor app shell — the same artefact for all three.

## What runs, and when

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | every pull request and push to `main` | typecheck (both passes), knip, unit tests, build, end-to-end in Chromium |
| `deploy.yml` | push to `main` | rebuilds, uploads to bunny.net edge storage, then purges the pull zone |

The deploy rebuilds from the commit it is deploying rather than downloading
CI's artefact, so it cannot ship something stale, and `npm run build`
typechecks before it emits anything.

## Bunny setup

Deploying uses [`ayeressian/bunnycdn-storage-deploy`](https://github.com/ayeressian/bunnycdn-storage-deploy),
pinned to a version rather than a floating tag — the step holds a key with
write access to the whole storage zone, so it should not be able to change
under us without a commit saying so.

Create a **storage zone** and a **pull zone** in front of it, then add these
repository secrets (Settings → Secrets and variables → Actions):

| Secret | Where it comes from |
|---|---|
| `BUNNY_STORAGE_ZONE` | The storage zone's name. |
| `BUNNY_STORAGE_PASSWORD` | Storage zone → FTP & API Access → Password. Read/write on that one zone. |
| `BUNNY_API_KEY` | Account settings → API. Account-wide, and needed only for the cache purge. |
| `BUNNY_PULL_ZONE_ID` | The pull zone's numeric id, from its URL in the dashboard. |

The two credentials are deliberately different things: the storage password
can write to one zone, the account API key can do anything to the account.

If the storage zone's main region is not Falkenstein, add
`storageEndpoint:` to the step — the regions are prefixed (`ny.`, `la.`,
`uk.`, `sg.`, `syd.`) and it must match the zone.

### Nothing is deleted

`remove` is set to `"false"` on purpose. Setting it to `"true"` empties the
storage zone before uploading, which opens a window where the site is partly
or wholly missing on a deploy that is otherwise seamless.

It would also throw away files that are still wanted. Every asset filename
carries a content hash, so old ones are not litter: a player who loaded the
page a minute before a deploy is still fetching chunks by their old names, and
deleting them breaks that session mid-game. Once `index.html` is replaced
nothing links to them, the whole build is 1.3MB, and storage is charged by the
gigabyte.

If they ever do need clearing out, it is a one-off by hand rather than
something to do on every deploy.

### Cache headers

Set these on the pull zone, not here:

- `index.html` — no cache, or a few seconds. It is the only file that changes
  in place, and a cached one pins players to an old build.
- `assets/*` — cache hard and far. The names are content-hashed, so a given
  URL's contents can never change.

## Saves never leave the device

Saves go to IndexedDB, with localStorage as a fallback, and Capacitor
Preferences on native. They are gzipped through the platform's own
`CompressionStream`. Nothing is uploaded anywhere, which is why there is no
backend to run and no personal data to hold.

Two things would need one, and both are deliberately stubbed rather than
half-built: cloud saves (`platform/services.ts` reports `signIn: false` until a
real provider exists, and the settings screen renders nothing) and any
LLM-backed feature, which cannot ship an API key to a client.
