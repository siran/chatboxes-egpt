# chatboxes-egpt

The website chatbox for [eGPT](https://github.com/siran/egpt)'s http limb: the widget a page embeds, and the skins, phrases and places that dress it.

eGPT's core keeps only the transport. Its http limb handles the API (messages, events, end), visitor sessions, the signed identity, rate limits and the delivery to the being. Everything the visitor sees lives here:

- `widget.js`: the loader. It draws a bubble and a panel holding [Deep Chat](https://github.com/OvidijusParsiunas/deep-chat) (MIT, pinned by version and sha384 integrity), wired to the limb.
- **Skins**: a folder with `skin.json` (texts, phrases, places), `skin.css` (the look) and any images they name.

## Install on a node

Clone the plugin under the node's home, then list it in each chatbox's `ui:` folders. Put the chatbox's own skin folder after the plugin:

```sh
git clone https://github.com/siran/chatboxes-egpt.git "$EGPT_HOME/plugins/chatboxes-egpt"
```

```yaml
limbs:
  http:
    port: 8095
    path: /chat
    chatboxes: [contoso_help]

contoso_help:
  url: contoso
  being: helper
  title: Contoso
  ui: [plugins/chatboxes-egpt, plugins/contoso-skin]   # under the node's home; the last folder holding a file wins
```

The limb serves each chatbox's folders at `<path>/<client>/<file>`. Files are flat and need an extension; only js, css, json, svg, png, jpg, jpeg, webp, gif and woff2 are served. When the same file is in several folders, the copy in the last one wins. So `widget.js` comes from the plugin, while `skin.json`, `skin.css` and the images come from the skin folder. A skin folder can also replace `widget.js` if it needs to.

Updating the widget is `git pull` in the clone. There is no build step and no dependencies.

## The page

```html
<script src="https://www.example.com/chat/contoso/widget.js" data-identity="…" data-place="dashboard" defer></script>
```

- `data-identity` (optional): the host page's signed user, as the chatbox's `identity:` setting expects. The widget sends it with every call and keeps one stored session per user.
- `data-place` (optional): where on the site the page is. If the limb knows that place, it goes with each line, and the being reads `(in dashboard) …`. If the skin has a place of that name, its css and user strip apply.

The widget asks for three files next to itself, using the script's own URL minus the file name:

| file | from | if missing |
|------|------|------------|
| `info` | the limb: `{ client, title, max_chars, init, places? }` | the defaults (4000 characters, no init). Opening the panel asks again; if it still fails, the panel shows `strings.unavailable`. |
| `skin.json` | the skin folder | the built-in texts (Spanish, below) |
| `skin.css` | the skin folder | the plain look |

What `info` holds:
- `init` is `true` or `"prime"`: the page load sends one `{kind: init}`, but only with an identity.
- `places`, when present, lists the names the limb accepts. Without it, the skin's place names are used.

## skin.json

```json
{
  "strings": { "title": "…", "intro": "…", "waiting": ["…"], "waiting_cold": ["…"] },
  "places": { "dashboard": { "user_strip": true, "css": ".egc{right:24px}" } }
}
```

`strings` replaces any of the built-in texts, one key at a time. A value that is not a string is ignored.

| key | default | what |
|-----|---------|------|
| `title` | info's title, else `Chat` | the panel's header |
| `intro` | (none) | the panel's first line, shown again after an end |
| `placeholder` | `Escribe tu mensaje…` | the input's placeholder |
| `send` | `Enviar` | the send button's tooltip |
| `open`, `close` | `Abrir chat`, `Cerrar` | the bubble's and the minimise button's labels |
| `end`, `end_confirm`, `end_yes`, `cancel` | `Terminar conversación`, … | ending the conversation: the button, the question, yes, no |
| `error`, `too_long`, `too_many`, `unavailable` | `No se pudo enviar…`, … | a failed line (any failure, 413, 429), and a panel that cannot open |
| `identity` | `No pudimos verificar tu sesión…` | a 401: the signed identity was refused or has expired |
| `support` | `Soporte` | heads a human support line: `Soporte · <user>` |
| `waiting` | `[]` (⏳) | phrases rotating in the loading bubble, each shown for 2.5 s; at most 12 phrases of 80 characters |
| `waiting_cold` | `[]` (= waiting) | the set used when the line goes to a cold conversation, one the being has not been warmed for lately. The limb says which in the POST's `cold`; until it answers, the widget guesses from its own last line. |

`places` gives each place name (lowercase letters, digits, `-` and `_`) two optional settings:
- `css`: up to 20000 characters, added after `skin.css`.
- `user_strip: true`: shows the signed user's `short_name`, or else `username`, under the header.

## skin.css

The base rules sit inside `:where()`, so every rule in a skin beats them. Deep Chat's own parts read these custom properties from `.egc` once, when the panel is built:

| property | default | what |
|----------|---------|------|
| `--egc-bg` | `#f6f8fa` | the panel's background |
| `--egc-user-bg`, `--egc-user-fg` | `#1f6feb`, `#fff` | the visitor's bubbles |
| `--egc-ai-bg`, `--egc-ai-fg` | `#fff`, `#111` | the being's bubbles |
| `--egc-ai-border` | `1px solid #d0d7de` | the being's bubble border |
| `--egc-ai-radius`, `--egc-user-radius` | Deep Chat's | bubble corners |
| `--egc-ai-shadow` | (none) | the being's bubble shadow |
| `--egc-bubble-max-width` | `85%` | the widest a bubble gets |
| `--egc-bubble-padding` | Deep Chat's | bubble padding |
| `--egc-avatar` | (none) | `url(face.png)`: the being's face at the foot of each of its messages. The visitor then shows no avatar. |

A relative `url()` in `skin.css` or in a place's css points into the skin folder, wherever the host page is. `data:` and `#fragment` URLs are left as they are. Everything else, such as `.egc-bubble`, `.egc-head`, `.egc-panel` and `.egc-user`, is plain CSS. `skins/example/` shows a full skin.

## Tests

```sh
npm test   # node --test, no dependencies
```

## License

MIT, see [LICENSE](LICENSE).
