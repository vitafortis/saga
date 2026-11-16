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
- **Recent**: a list of what you've shared, with view counts, links and delete.
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

### Behind SSO

Put the whole site behind your IdP's forward auth (Authentik, Authelia, Pomerium, oauth2-proxy, Pangolin…) and leave `SAGA_PASSWORD` empty. Saga then has no sign-in: everyone the IdP lets through can share, see the recent list and delete. Cover every path, `/api/` included, or uploads are open to anyone who finds the address. Every device opening a code goes through the IdP too.

Scripts can't get past forward auth on their own: give them the proxy's own bypass (a service token or API key), or upload from the web app.

### Settings

| Variable | Default | |
| --- | --- | --- |
| `SAGA_PASSWORD` | unset | Password for sharing and managing items. Unset: no sign-in, anyone who can reach Saga can share (for use behind SSO). |
| `SAGA_API_TOKEN` | unset | Token for scripts, `Authorization: Bearer <token>`. Only needed with `SAGA_PASSWORD`. |
| `SAGA_MAX_FILE_MB` | `1024` | Largest file. |
| `SAGA_MAX_PASTE_MB` | `10` | Largest paste. |
| `SAGA_CODE_LENGTH` | `8` | Digits in new codes (6–12). |
| `SAGA_SECRET` | random, in `/data/secret.key` | Signs session cookies. Changing `SAGA_PASSWORD` also signs everyone out. |
| `SAGA_DATA_DIR` | `/data` | SQLite database, uploaded files, session key. |
| `ORIGIN` | unset | Public address, e.g. `https://data.armgrp.dev`. |

## From the command line

With `SAGA_PASSWORD` and `SAGA_API_TOKEN` set (behind SSO, drop the `Authorization` header and use your proxy's bypass instead):

```sh
H="Authorization: Bearer $SAGA_API_TOKEN"

# Paste text (prints the link)
echo "hello" | curl -sH "$H" --data-binary @- https://data.armgrp.dev/api/pastes
curl -sH "$H" --data-binary @notes.txt 'https://data.armgrp.dev/api/pastes?title=notes&expiry=1h'

# Upload a file (curl adds the name to the trailing slash)
curl -sH "$H" -T photo.jpg https://data.armgrp.dev/api/files/
curl -sH "$H" -T backup.tar.gz 'https://data.armgrp.dev/api/files/backup.tar.gz?expiry=7d&burn'

# Fetch
curl -s https://data.armgrp.dev/paste/12345678/raw
curl -sOJ https://data.armgrp.dev/file/87654321/download
curl -sOJ -X POST https://data.armgrp.dev/file/87654321/download   # delete-after-open items
```

Options go in the query string: `expiry` (`10m`, `1h`, `1d`, `7d`, `30d`, `never`), `burn` (delete after first open) and `title` (pastes). Send `Accept: application/json` to get `{ item, url }` back instead of the bare link.

| Route | |
| --- | --- |
| `POST /api/pastes` | Raw text body, or JSON `{ content, title?, expiry?, burn? }`. |
| `PUT /api/files/<name>` | Raw file body; `Content-Type` is kept. |
| `GET /api/items` | Everything you've shared. |
| `DELETE /api/items/<code>` | Delete an item. |
| `GET /paste/<code>/raw` | Paste as text (`?download` to save it). |
| `GET /file/<code>/download` | File as an attachment; supports `Range`. |
| `GET /api/health` | `{ ok: true }` |

## Development

Node 24 and pnpm:

```sh
pnpm install
SAGA_PASSWORD=dev pnpm dev
pnpm check && pnpm test
```

SvelteKit with Svelte 5 and Tailwind 4. Items live in SQLite (Node's built-in `node:sqlite`) and files in `data/blobs/`.
