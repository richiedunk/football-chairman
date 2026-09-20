# undisclosedfootball.com — the public site

A brief overview of the game and a coming-soon holding page. One file, no
build step, no dependencies: `index.html` carries its own CSS, and everything
it loads lives in `assets/`.

```
website/
  index.html          the whole page
  assets/
    logo.png          badge + wordmark, on its own near-black plate
    badge.svg         the shield alone, from design/badge.svg
    favicon.svg
    apple-touch-icon.png
```

## Looking at it

Open `index.html` in a browser, or serve the folder if you want real URLs:

```bash
python3 -m http.server -d website 8000    # http://localhost:8000
```

## Deploying

`deploy.yml` ships this folder to bunny.net on any push to `main` that touches
it. Nothing is built first: what is in the repository is what is uploaded,
which is also what `python3 -m http.server -d website` serves locally.

That workflow used to deploy the game itself. The game is not a web target any
more — it ships as an Android APK from `release.yml` on a `v*` tag — so the
zone and its four secrets carry this site instead.

The paths here are all relative, so the folder also works from a domain root
or a subdirectory on any other static host, which is what keeps the move in
the next section cheap.

Inter and JetBrains Mono come from Google Fonts and are the page's only
third-party request. The font stack falls through to the system faces if that
request is blocked, so nothing breaks without it.

## When the source moves

This folder is written to be lifted out whole. Nothing in it imports from
`src/`, shares the game's `package.json`, or reads anything at build time —
copying `website/` into a new repository and pointing a host at it is the
entire migration.

## Notes on the assets

The logos are copies, not symlinks, so the folder stays self-contained after
that move. They are generated from `design/badge.svg` by `npm run icons` in
the game repo; if the mark changes there, re-copy rather than hand-edit.

`.hero img` uses `mix-blend-mode: lighten` because `logo.png` ships on an
opaque near-black plate rather than on transparency — without it the plate
reads as a visible rectangle against the page's background wash.
