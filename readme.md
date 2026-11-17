<img src="docs/logo.svg" width="64" alt="">

# Saga

Self-hosted paste and file sharing for moving things between your own devices. Every paste or file gets a short numeric code, so you can open it on another device by typing the code, scanning the QR code or following the link:

```
https://data.armgrp.dev/paste/12345678
https://data.armgrp.dev/file/87654321
https://data.armgrp.dev/12345678   → redirects to the paste or file
```

- **Pastes**: plain text with line numbers, wrapping, copy, raw view and download.
- **Files**: drag and drop, paste from the clipboard (screenshots), or browse; several at once, with upload progress. Images, video and audio preview in the page. Uploads stream to disk, so large files don't use much memory.
- **Expiry**: 10 minutes, 1 hour, 1 day (default), 1 week, 30 days or never. Expired items are removed every 5 minutes.
- **Delete after first open**: the item can be opened once, then it's gone. Opening takes a deliberate click (a POST), so link previews in chat apps don't use it up.
- **Recent**: an index of what you've shared, with search, Text/Files filters, image thumbnails, view counts, links and delete.
- **Collections**: named sets of config files, dotfiles and keys for setting up a machine. Give each file a target path (`~/.bashrc`, `/etc/hosts`) and a mode, then run one command on the new machine (see [Collections](#collections)). Text files can be edited in place, and collections never expire.
- **`sagacp` CLI and API keys**: share and fetch from a terminal through `/api/v1/`, which always takes a key, so it can pass Pangolin without SSO.
- **Settings**: default expiry and delete-after-first-open for new items, kept on the server so every device and script gets them.
- **Light and dark** themes, built on the same design system as our other apps.

Saga can sit behind your SSO with no sign-in of its own, or use a password of its own for sharing. Anyone who can reach Saga and has a code can open that item, so treat codes like the links they are. Lookups of codes that don't exist are rate-limited per IP (30 per 10 minutes), which makes guessing codes impractical.

## Running it

### Docker Compose

```sh
mkdir saga && cd saga
curl -fsSLO https://raw.githubusercontent.com/vitafortis/saga/main/compose.yaml
curl -fsSL https://raw.githubusercontent.com/vitafortis/saga/main/.env.example -o .env
# behind SSO, leave SAGA_PASSWORD empty; otherwise set it in .env
docker compose up -d
```

Then open `http://<host>:3040`. To build from a checkout instead of pulling the image, swap `image:` for `build: .` in `compose.yaml`.

### Behind a reverse proxy

Point your proxy at port 3040 (or put Saga on the proxy's Docker network and use port 3000). Saga builds share links from `X-Forwarded-Proto` and `X-Forwarded-Host`; to pin the address instead, set `ORIGIN=https://data.armgrp.dev`. Set `ADDRESS_HEADER=X-Forwarded-For` so rate limits see real client IPs rather than the proxy's. If the proxy limits request sizes (nginx defaults to 1 MB), raise that limit to at least `SAGA_MAX_FILE_MB`.

### Behind SSO (Pangolin and friends)

Put the whole site behind your IdP and leave `SAGA_PASSWORD` empty. Saga then has no sign-in of its own: everyone the IdP lets through can share, see the index and delete.

Scripts and `sagacp` can't log in to the IdP, so they use **`/api/v1/`**, which always takes an API key (Settings → API keys), with or without SSO. Let that path, and only that path, through without SSO:

- **Pangolin**: on the resource, add a rule *Bypass Auth* for path `/api/v1/*`.
- Others: the equivalent bypass for `/api/v1/*` (Authentik's "unauthenticated paths", Authelia's `bypass` policy, and so on).

Don't bypass `/api/` as a whole: the web app's own API has no auth of its own behind SSO.

### Settings

| Variable | Default | |
| --- | --- | --- |
| `SAGA_PASSWORD` | unset | Password for sharing and managing items. Unset: no sign-in, anyone who can reach Saga can share (for use behind SSO). |
| `SAGA_API_TOKEN` | unset | An extra API key set from the environment (keys made in Settings are usually easier). |
| `SAGA_MAX_FILE_MB` | `1024` | Largest file. |
| `SAGA_MAX_PASTE_MB` | `10` | Largest paste. |
| `SAGA_CODE_LENGTH` | `8` | Digits in new codes (6–12). |
| `SAGA_SECRET` | random, in `/data/secret.key` | Signs session cookies. Changing `SAGA_PASSWORD` also signs everyone out. |
| `SAGA_DATA_DIR` | `/data` | SQLite database, uploaded files, session key. |
| `ORIGIN` | unset | Public address, e.g. `https://data.armgrp.dev`. |

## Collections

Make one from **New collection** on the home page, then add text files or uploads and give each a target path and, if needed, a mode (`600` for keys, `755` for scripts; `644` otherwise). The collection page shows the command to run on the new machine:

```sh
sagacp --install 12345678              # install
sagacp --install 12345678 --dry-run    # preview
sagacp --install 12345678 --root       # /etc and other system paths
```

Without `sagacp`: `curl -fsSL -H "Authorization: Bearer $KEY" https://data.armgrp.dev/api/v1/collections/12345678/install.sh | sh`.

The script is plain POSIX `sh` with the files embedded, so it needs only `base64`, `mktemp` and `cmp` (Linux, BusyBox and macOS all have them). It creates folders, sets modes, leaves identical files alone and keeps any file it replaces as `<file>.saga-bak`. Under `sudo`, `~` means root's home. Files without a target path aren't installed, but they're in the `.tar.gz` download along with everything else.

Anyone who can reach Saga and has the code can read a collection, keys included. Behind SSO, installing from the command line uses an API key through `/api/v1/` (see [Behind SSO](#behind-sso-pangolin-and-friends)).

## sagacp

A small shell CLI for sharing and fetching. In Settings → **API keys**, make a key; Saga then shows a one-line command that saves the key to `~/.config/saga/token` and installs `sagacp` to `~/.local/bin`.

```sh
sagacp photo.jpg notes.txt          # share files: prints the links and copies the last one
sagacp ./configs/                   # a folder, as .tar.gz
journalctl -n 200 | sagacp          # text from a pipe
sagacp -e 1h -1 id_ed25519          # expire in an hour, delete after first open
sagacp 12345678                     # fetch: files and collections saved here, text to stdout
sagacp --install 12345678           # install a collection (--dry-run to preview, --root for /etc)
```

Options: `-e/--expire 10m|1h|1d|7d|30d|never`, `-1/--once`, `-k/--keep`, `-n/--name`, `-q/--quiet` (links only), `--no-copy`. Left out, expiry and delete-after-open use the defaults from Settings. Fetching never overwrites a file: a clash is saved as `name.1`. It needs `sh`, `curl` and `od`; `tar` for folders.

## API

Every route here takes `Authorization: Bearer <key>` (or `X-Api-Key`). Created items come back as the bare link, or `{ item, url }` with `Accept: application/json`.

```sh
H="Authorization: Bearer $(cat ~/.config/saga/token)"
curl -sH "$H" --data-binary @notes.txt 'https://data.armgrp.dev/api/v1/pastes?title=notes&expiry=1h'
curl -sH "$H" -T backup.tar.gz 'https://data.armgrp.dev/api/v1/files/?expiry=7d&burn=1'
curl -sH "$H" https://data.armgrp.dev/api/v1/paste/12345678/raw
```

| Route | |
| --- | --- |
| `POST /api/v1/pastes` | Raw text body, or JSON `{ content, title?, expiry?, burn? }`. Query: `title`, `expiry` (`10m` `1h` `1d` `7d` `30d` `never`), `burn` (`1`/`0`). |
| `PUT /api/v1/files/<name>` | Raw file body; `Content-Type` is kept. Same `expiry`/`burn` query. |
| `GET /api/v1/resolve/<code>` | `{ kind, code, name, burn }`: what a code is. |
| `GET /api/v1/paste/<code>/raw` | Paste text (`POST` for delete-after-open ones). |
| `GET /api/v1/file/<code>/download` | File, with `Range` support (`POST` for delete-after-open ones). |
| `GET /api/v1/items` | Everything shared (not in collections). |
| `PATCH`/`DELETE /api/v1/items/<code>` | `{ name?, content?, path?, mode? }` / delete. |
| `GET`/`POST /api/v1/collections` | List / create `{ name, description? }`. |
| `PATCH`/`DELETE /api/v1/collections/<code>` | Rename / delete. |
| `POST /api/v1/collections/<code>/items` | Text file: `{ name, content, path?, mode? }`. |
| `PUT /api/v1/collections/<code>/items?name=&path=&mode=` | File upload into a collection. |
| `GET /api/v1/collections/<code>/install.sh` | The install script. |
| `GET /api/v1/collections/<code>/archive` | Everything as `.tar.gz`. |
| `GET /api/v1/sagacp` | The CLI. |
| `GET /api/v1/health` | `{ ok: true }`, no key needed. |

Keys can't manage keys or settings; that stays in the web app.

## Development

Node 24 and pnpm:

```sh
pnpm install
SAGA_PASSWORD=dev pnpm dev
pnpm check && pnpm test
```

SvelteKit with Svelte 5 and Tailwind 4. Items live in SQLite (Node's built-in `node:sqlite`) and files in `data/blobs/`.
