# Local npm Package Testing

This document is required reading before validating CLI, release, MITM, or installed-app behavior.

The source app and the installed npm package are different test surfaces. A local `next build` or direct `.next/standalone/server.js` run proves only that the current checkout can serve the dashboard. It does not prove that the npm package layout, CLI entrypoint, postinstall hook, global bin, runtime data directory, or installed app boot path works.

## Golden Rule

If the change will ship through `openrouterX`, test the local npm package, not only the source checkout.

Valid package evidence must include:

- A fresh production build.
- A freshly generated `npm/` staging package.
- A packed `.tgz`.
- A local install from that `.tgz`.
- Starting through the installed `openrouterX` command.
- Health check against the installed server.

## Prerequisites

Use a Node installation that includes `npm`. Some embedded runtimes, including app-bundled Node binaries, may provide `node` without `npm`. That is not enough for the npm package flow because the project scripts call:

- `npm run ...`
- `npm pack`
- `npm install -g ...`
- `npm prefix -g`
- `npm rebuild ...` from the postinstall hook when needed

Check first:

```bash
node --version
npm --version
```

If `npm` is missing, fix the local toolchain before claiming npm package validation. Do not replace this flow with direct standalone startup.

## Clean Up Existing Local Runs

Stop any installed `openrouterX` background process:

```bash
openrouterX stop || true
```

If port `20128` is still occupied, inspect and stop the listener:

```bash
lsof -nP -iTCP:20128 -sTCP:LISTEN
kill <pid>
```

Avoid running source and installed package instances at the same time. They can point at different app roots and data directories, which makes debugging misleading.

## Fast Source Build Check

This is useful as a prerequisite, but it is not the package test.

```bash
npm run build
```

When the shell has Bun and native SWC signing issues block regular Node, this source build may be used as a local workaround:

```bash
PATH="$HOME/.bun/bin:$PATH" bun run build:bun
```

After this step, `.next/standalone/server.js` should exist. Do not stop here for release or CLI validation.

## Canonical Local Package Install

Use this when you want to install the current checkout onto the machine and test the real command users will run:

```bash
npm run release:npm:install-local -- --keep-tarball
```

If the production build has already been completed separately, for example with `bun run build:bun`, skip the rebuild but still run package staging, packing, and global install:

```bash
npm run release:npm:install-local -- --skip-build --keep-tarball
```

This script performs the intended local install flow:

1. Runs the npm dry-run release preparation.
2. Rebuilds the `npm/` staging directory from the current `.next/standalone` output.
3. Creates `npm-local/` with package name `openrouterx-local`.
4. Packs a local `.tgz`.
5. Installs that tarball globally.
6. Verifies that `openrouterX` exists in the npm global bin directory.

The installed package is intentionally named `openrouterx-local` so it can be removed without touching the published package name:

```bash
npm uninstall -g openrouterx-local
```

## Temporary Prefix Smoke Test

Use this when you want package validation without changing the real global install:

```bash
npm run release:npm:test-install -- --keep-temp
```

After a separate successful build:

```bash
npm run release:npm:test-install -- --skip-build --keep-temp
```

This script installs the packed `@yina-npm/openrouterx` package into a temporary npm prefix, starts its installed `openrouterX` binary on a random port, waits for `/api/health`, runs `openrouterX status`, then stops it.

This is the safest CI-style smoke test because it checks the install layout without modifying the user's global command.

## Manual Verification After Global Local Install

After `release:npm:install-local`, run:

```bash
openrouterX --version
openrouterX --no-browser
openrouterX status
curl -i http://127.0.0.1:20128/api/health
```

Expected health response:

```txt
HTTP/1.1 200 OK
...
{"ok":true}
```

Open the dashboard:

```txt
http://127.0.0.1:20128/dashboard
```

Stop the installed process when finished:

```bash
openrouterX stop
```

## What Not To Count As npm Validation

Do not claim npm package validation from any of these alone:

- `npm run build`
- `bun run build:bun`
- `next start`
- `node .next/standalone/server.js`
- Running the source checkout on `20128`
- A dashboard page returning `200` from the source checkout

Those commands can be useful for quick source checks, but they bypass the packaged CLI and installed app layout.

## Common Failure Modes

### `npm: command not found`

The package flow cannot run. Install or select a Node distribution with npm, then rerun the canonical command.

If npm is managed by nvm but a non-interactive tool shell cannot see it, expose the nvm default version before running package scripts:

```bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use default
npm --version
```

For tool shells with a fixed PATH, a temporary symlink to the nvm default version is also acceptable:

```bash
NVM_NODE_BIN="$HOME/.nvm/versions/node/$(cat "$HOME/.nvm/alias/default")/bin"
ln -sf "$NVM_NODE_BIN/node" /path/on/current/PATH/node
ln -sf "$NVM_NODE_BIN/npm" /path/on/current/PATH/npm
ln -sf "$NVM_NODE_BIN/npx" /path/on/current/PATH/npx
```

Verify that `which npm` points at the intended nvm-backed command before running install scripts.

### `next start` exits with standalone warning

This project uses `output: "standalone"`. `next start` is not the installed runtime. Use the packaged `openrouterX` command for installed testing.

### Global `openrouterX` bin already exists

Local install may fail with `EEXIST` if another package already owns the global `openrouterX` command. Remove the previous local or published install, then rerun the local install:

```bash
npm uninstall -g openrouterx-local @yina-npm/openrouterx
npm run release:npm:install-local -- --skip-build --keep-tarball
```

### Direct standalone starts but uses the wrong data directory

Running `.next/standalone/server.js` directly can resolve runtime paths differently from the installed CLI. The CLI sets the app root to the packaged `app/` directory and stores runtime metadata under `~/.openrouterx`. Test installed behavior through `openrouterX`.

### Port `20128` is occupied

Stop the existing process first. If testing an alternate port:

```bash
PORT=20129 openrouterX --no-browser
curl -i http://127.0.0.1:20129/api/health
```

Record the non-default port in the test notes.

## Reporting Checklist

When reporting local package validation, include:

- Build command used.
- Package command used.
- Tarball path and version.
- Installed command path from `which openrouterX`.
- Server URL and port.
- `/api/health` result.
- Any skipped step and why.

Example:

```txt
Build: npm run build
Package install: npm run release:npm:install-local -- --keep-tarball
Tarball: npm-local/openrouterx-local-0.4.22.tgz
Command: /opt/homebrew/bin/openrouterX
Health: http://127.0.0.1:20128/api/health -> 200 {"ok":true}
```
