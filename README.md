# Server homepage

A static start page linking to the services on the server. It's plain HTML, CSS and JS with no build step, served by an `nginx:alpine` container.

```
homepage/
├── compose.yaml        nginx container, port 3000
└── site/
    ├── index.html      layout and pre-render theme/font script
    ├── styles.css      themes, fonts, layout
    ├── app.js          rendering, status checks, typeahead, settings
    ├── services.json   the list of services
    └── icons/          optional, self-hosted icons
```

## Running

```bash
cd ~/docker/homepage
docker compose up -d
```

The page is at `http://<server>:3000`. To use a domain, add a proxy host in Nginx Proxy Manager pointing to `homepage:80` (same Docker network) or `<server-ip>:3000`.

## Updating

`site/` is mounted read-only into the container, so changes take effect immediately: edit a file, then reload the page. No restart is needed.

You only need `docker compose up -d` again after changing `compose.yaml`, and `docker compose pull && docker compose up -d` to update nginx itself.

## Adding a service

Add an entry to `services` in `site/services.json`:

```json
{ "name": "Jellyfin", "description": "Movies and shows", "category": "Media", "subdomain": "jellyfin", "icon": "jellyfin" }
```

| Field | Description |
|---|---|
| `name` | Card title, also used for typeahead search. Required. |
| `description` | Short line under the title. |
| `category` | Groups cards under a header. New values create new sections, in order of first appearance. Matching is case-sensitive. Defaults to "Services". |
| `subdomain` | Link becomes `https://<subdomain>.<domain>`, using the top-level `domain` field. |
| `url` | Full address, overrides everything else. |
| `port`, `path`, `protocol`, `host` | Builds `protocol://host:port/path`. Host defaults to whatever host the page was opened on. |
| `icon` | Icon name from dashboard-icons, or a path or URL (see below). Falls back to the first letter. |
| `check` | `false` disables the status dot (game servers, self-signed HTTPS). |
| `checkUrl` | Address to check instead of the link, for example the direct `ip:port` behind a proxy. |
| `newTab` | `false` opens the link in the same tab. |

Top-level fields: `title` (page heading and tab title), `logo` (sidebar text, defaults to the first part of `title`) and `domain` (used with `subdomain`).

The order of entries in the file is the order on the page.

## Icons

By default, icons load from [dashboard-icons](https://github.com/homarr-labs/dashboard-icons) via jsDelivr: `"icon": "immich"` loads `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/immich.svg`. Search the repo's `svg/` folder for the right name.

### Self-hosting all icons

This downloads every icon named in `services.json` (requires `jq`, from `sudo apt install jq`):

```bash
cd ~/docker/homepage/site
mkdir -p icons
jq -r '.services[].icon // empty | select(test("^(/|https?:)") | not)' services.json |
  while read -r name; do
    curl -fsSL -o "icons/$name.svg" \
      "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/$name.svg" \
      || echo "not found: $name"
  done
```

Then point the page at the local folder by changing the first constant in `app.js`:

```js
const ICON_CDN = '/icons/'
```

The `icon` names in `services.json` stay the same. Re-run the loop after adding services.

### Custom icons

Any `icon` value starting with `/`, `http://` or `https://` is used as-is, for example `"icon": "/icons/my-logo.png"`. Icons are shown in grayscale and get their colours on hover; remove the `filter` rule on `.service__icon img` in `styles.css` to always show colours.

## Status dots

Each card's dot is checked when the page loads and every 60 seconds afterwards (`CHECK_INTERVAL` in `app.js`).

- **Green:** The service answered with any HTTP response.
- **Red:** No answer: refused connection, DNS failure, invalid certificate, or a 4-second timeout (`CHECK_TIMEOUT`).
- **Hollow:** The check is disabled with `"check": false`.

The check runs in the browser, so it reflects what you can reach from your current network. It's a reachability check, not a health check. Behind Nginx Proxy Manager, a stopped container gives a 502 from the proxy and still shows green; use `checkUrl` with the direct `ip:port` to check the container itself.

## Typeahead

Typing on the page focuses the best-matching service card, and Enter opens it. It matches the name first, then category, description and port. Escape clears the search, Backspace deletes a letter, and the buffer clears after 1.2 s.

## Themes and fonts

Theme and font are picked under Settings in the sidebar and saved in the browser's `localStorage`, separately for each address the page is opened on.

- **New theme:** Add a `:root[data-theme='id']` block in `styles.css` with the seven colour tokens (`--bg`, `--surface`, `--text`, `--text-2`, `--muted`, `--line`, `--hover-bg`), then an entry in `THEMES` in `app.js`.
- **New font:** Add a `:root[data-font='id']` rule in `styles.css`, an entry in `FONTS` in `app.js`, and the family to the Google Fonts link in `index.html`.

## Troubleshooting

- **"Could not load services.json":** The file has a syntax error. Check it with `jq . site/services.json`.
- **Changes don't show:** Do a hard reload with Ctrl+Shift+R. `services.json` is always fetched fresh, but CSS and JS may be cached.
- **Check the real ports** of your containers with `docker ps --format 'table {{.Names}}\t{{.Ports}}'`.
