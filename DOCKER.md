# Docker

This project ships with a `Dockerfile` for building and running openrouterX in a container.

## Build image

```bash
docker build -t openrouterx .
```

## Start container

```bash
docker run --rm \
  -p 20128:20128 \
  -v "$HOME/.openrouterx:/app/data" \
  -e DATA_DIR=/app/data \
  --name openrouterx \
  openrouterx
```

The app listens on port `20128` in the container.

## What the volume does

```bash
-v "$HOME/.openrouterx:/app/data" \
-e DATA_DIR=/app/data
```

`openrouterx` stores its database at `path.join(DATA_DIR, "db.json")`.
Without `DATA_DIR`, the app falls back to the current user's home directory (for example `~/.openrouterx/db.json` on macOS/Linux). In the container, set `DATA_DIR=/app/data` so the bind mount is actually used.

With the example above, the database file is:

```text
/app/data/db.json
```

and it is persisted on the host at:

```text
$HOME/.openrouterx/db.json
```

## Stop container

```bash
docker stop openrouterx
```

## Run in background

```bash
docker run -d \
  -p 20128:20128 \
  -v "$HOME/.openrouterx:/app/data" \
  -e DATA_DIR=/app/data \
  --name openrouterx \
  openrouterx
```

## View logs

```bash
docker logs -f openrouterx
```

## Optional environment variables

You can override runtime env vars with `-e`.

Example:

```bash
docker run --rm \
  -p 20128:20128 \
  -v "$HOME/.openrouterx:/app/data" \
  -e DATA_DIR=/app/data \
  -e PORT=20128 \
  -e HOSTNAME=0.0.0.0 \
  -e DEBUG=true \
  --name openrouterx \
  openrouterx
```

## Rebuild after code changes

```bash
docker build -t openrouterx .
```

Then restart the container.
