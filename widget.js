// widget.js — the eGPT chatbox (chatboxes-egpt): a bubble and a panel holding Deep Chat (DEEP_CHAT), wired to the
// node's http limb. The page loads it as <base><client>/widget.js; the limb serves it from the chatbox's ui:
// folders, this plugin's clone with a skin folder layered over it, so everything below comes from that same
// <base><client>/: info (the limb's: client, title, max_chars, init, places), skin.json ({strings, places}) and
// skin.css. A missing or broken skin file is no skin (the defaults below); a missing info is the defaults until the
// panel opens, which asks again and shows strings.unavailable if it still fails.
// The server's log is the one source of truth: on open the panel shows GET messages, then follows GET events;
// Deep Chat keeps no browser copy. The host page's signed user, if any, is the script tag's data-identity; it goes
// with every call, and each user's session token is stored apart. The page's place, if any, is data-place: a name
// the limb knows (info.places; without that list, the skin's places) goes with each line; the skin's place of that
// name adds its css and, with user_strip, shows the signed user under the header.
// Every base selector sits in :where(), so the skin's, a place's or the page's css beats it; Deep Chat's colours
// and shapes come from the --egc-* custom properties of .egc (read once, in build()), the CSS defaults being the
// plain look. A relative url() in skin.css or a place's css is the skin folder's (resolved against <base><client>/).
(function () {
  // github.com/OvidijusParsiunas/deep-chat (MIT), 2.5.1 of 2026-08-27; integrity = sha384 of that file.
  var DEEP_CHAT = {
    url: 'https://cdn.jsdelivr.net/npm/deep-chat@2.5.1/dist/deepChat.bundle.js',
    integrity: 'sha384-djz34nrOoloJkHQBH1qoINnqdsX56zqoFpMpT0m3ghPF0o0otOUvWZEFwUViT9iF',
  };
  // The panel's texts; skin.json's strings replace any of them. waiting and waiting_cold are lists of phrases.
  var DEFAULTS = {
    title: 'Chat', open: 'Abrir chat', close: 'Cerrar', placeholder: 'Escribe tu mensaje…', send: 'Enviar',
    error: 'No se pudo enviar. Intenta de nuevo.', too_long: 'El mensaje es demasiado largo.', too_many: 'Demasiados mensajes. Espera unos minutos.',
    unavailable: 'No se pudo abrir el chat. Intenta de nuevo.',
    identity: 'No pudimos verificar tu sesión. Recarga la página o vuelve a iniciar sesión.',
    end: 'Terminar conversación', end_confirm: '¿Terminar esta conversación? El chat empezará de nuevo.', end_yes: 'Sí, terminar', cancel: 'Cancelar',
    support: 'Soporte',   // heads a human support line on the panel: "Soporte · <user>"
    intro: '',   // the panel's first line (Deep Chat introMessage), shown again after an end; empty: none
    waiting: [],   // short phrases rotating in the loading bubble instead of ⏳; empty: ⏳
    waiting_cold: [],   // the same, for a line to a cold conversation (the being not warmed lately); empty: waiting
  };
  var PHRASES = ['waiting', 'waiting_cold'];
  var NAME_RE = /^[a-z0-9][a-z0-9_-]*$/;
  var PLACE_CSS_MAX = 20000, MAX_CHARS = 4000;

  var me = document.currentScript;
  var base = ((me && me.src) || '').replace(/[^\/?#]*(?:[?#].*)?$/, '');   // <base><client>/
  var identity = (me && me.getAttribute('data-identity')) || null;
  var place = (me && me.getAttribute('data-place')) || null;

  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var isMap = function (v) { return v != null && typeof v === 'object' && !Array.isArray(v); };
  var phrases = function (v) {
    return (Array.isArray(v) ? v : []).filter(function (w) { return typeof w === 'string' && w.trim(); }).slice(0, 12).map(function (w) { return w.trim().slice(0, 80); });
  };
  // url(x) with a relative x: the skin folder's file, wherever the page is (data: and #fragment stay as they are).
  var rebase = function (css) {
    return css.replace(/url\(\s*(['"]?)([^'")\s]+)\1\s*\)/g, function (all, q, u) {
      if (/^(?:data:|#)/i.test(u)) return all;
      try { return 'url(' + q + new URL(u, base).href + q + ')'; } catch (e) { return all; }
    });
  };
  var get = function (name, how) {
    return fetch(base + name).then(function (r) { return r.ok ? r[how]() : null; }).catch(function () { return null; });
  };
  // The limb's facts into C (at load, or again when the panel opens after a failed load).
  var useInfo = function (C, info) {
    if (!isMap(info)) return false;
    C.info = true;
    if (typeof info.client === 'string' && NAME_RE.test(info.client)) C.client = info.client;
    if (!C.ownTitle && typeof info.title === 'string' && info.title.trim()) C.strings.title = info.title.trim();
    C.maxChars = Number.isInteger(info.max_chars) && info.max_chars > 0 ? info.max_chars : MAX_CHARS;
    C.init = info.init === true || info.init === 'prime' ? info.init : false;
    if (Array.isArray(info.places)) C.known = info.places.filter(function (k) { return typeof k === 'string'; });
    return true;
  };
  var configOf = function (info, skin, css) {
    var own = isMap(skin) && isMap(skin.strings) ? skin.strings : {};
    var strings = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      if (PHRASES.indexOf(k) >= 0) strings[k] = phrases(has(own, k) ? own[k] : DEFAULTS[k]);
      else strings[k] = has(own, k) && typeof own[k] === 'string' ? own[k] : DEFAULTS[k];
    });
    var places = {};
    var sp = isMap(skin) && isMap(skin.places) ? skin.places : {};
    Object.keys(sp).forEach(function (k) {
      if (NAME_RE.test(k) && isMap(sp[k])) places[k] = { user_strip: sp[k].user_strip === true, css: typeof sp[k].css === 'string' ? rebase(sp[k].css.slice(0, PLACE_CSS_MAX)) : '' };
    });
    var C = {
      client: (/([^\/]+)\/$/.exec(base) || [])[1] || '', maxChars: MAX_CHARS, init: false, info: false,
      strings: strings, ownTitle: has(own, 'title') && typeof own.title === 'string' && !!own.title.trim(),
      deepChat: DEEP_CHAT, places: places, known: Object.keys(places), css: typeof css === 'string' ? rebase(css) : '',
    };
    useInfo(C, info);
    return C;
  };

  Promise.all([get('info', 'json'), get('skin.json', 'json'), get('skin.css', 'text')]).then(function (r) {
    egptChat(configOf(r[0], r[1], r[2]));
  });

  function egptChat(C) {
    if (!document.body) { document.addEventListener('DOMContentLoaded', function () { egptChat(C); }); return; }
    var S = C.strings;
    var sent = place && C.known.indexOf(place) >= 0 ? place : undefined;   // the place the limb is told
    var look = place && has(C.places, place) ? C.places[place] : null;    // the skin's dress for it
    var who = '', p = null;
    try { p = JSON.parse(decodeURIComponent(escape(atob(identity.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))))); who = ':' + p.abrin + '/' + p.username; } catch (e) { p = null; /* none, or the server refuses it */ }
    var KEY = 'egpt-chat:' + C.client + who;
    var idq = identity ? '&identity=' + encodeURIComponent(identity) : '';
    var token = null, chat = null, sig = null, es = null, since = 0, starting = false, wantFocus = false, inflight = 0, held = [];
    var at = {};   // message id → { i: its index in chat.getMessages(), text }
    var store = function (k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
    try { token = localStorage.getItem(KEY); } catch (e) { token = null; }

    var css = ':where(.egc){position:fixed;right:16px;bottom:16px;z-index:2147483000;font:15px/1.4 system-ui,sans-serif;color-scheme:light}'
      + ':where(.egc-bubble){width:56px;height:56px;border-radius:50%;border:0;background:#1f6feb;color:#fff;font-size:26px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25)}'
      + ':where(.egc-panel){position:absolute;right:0;bottom:68px;width:360px;height:520px;max-height:calc(100vh - 100px);display:flex;flex-direction:column;background:var(--egc-bg,#f6f8fa);border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.25);overflow:hidden}'
      + ':where(.egc-panel[hidden]){display:none}'
      + ':where(.egc-head){display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#1f6feb;color:#fff;font-weight:600}'
      + ':where(.egc-head span){flex:1}'
      + ':where(.egc-x,.egc-end){background:none;border:0;color:#fff;font-size:22px;cursor:pointer}'
      + ':where(.egc-end){font-size:19px;margin-right:6px}'
      + ':where(.egc-x svg,.egc-end svg){display:block}'
      + ':where(.egc-user){padding:6px 14px;background:#fff;font-size:13px;border-bottom:1px solid #d0d7de}'
      + ':where(.egc-user[hidden]){display:none}'
      + ':where(.egc-ask){display:flex;align-items:center;gap:8px;padding:8px 14px;background:#fff8c5;font-size:13px}'
      + ':where(.egc-ask[hidden]){display:none}'
      + ':where(.egc-ask span){flex:1}'
      + ':where(.egc-ask button){border:1px solid #d0d7de;border-radius:6px;padding:4px 10px;background:#fff;cursor:pointer;font:inherit}'
      + ':where(.egc-ask .egc-yes){background:#b42318;border-color:#b42318;color:#fff}'
      + ':where(.egc-body){flex:1;min-height:0}'
      + ':where(.egc-err){padding:12px;color:#b42318;font-size:13px}'
      + '@media (max-width:480px){:where(.egc-panel){position:fixed;inset:0;width:auto;height:auto;max-height:none;border-radius:0}'
      + ':where(.egc-panel:not([hidden])~.egc-bubble){display:none}}'
      + C.css
      + (look ? look.css : '');
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    var icon = function (d) { return '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; };
    var root = document.createElement('div');
    root.className = 'egc';
    root.innerHTML = '<div class="egc-panel" role="dialog" hidden><div class="egc-head"><span></span><button type="button" class="egc-end">' + icon('<path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>') + '</button><button type="button" class="egc-x">' + icon('<path d="M5 12h14"/>') + '</button></div>'
      + '<div class="egc-user" hidden></div>'
      + '<div class="egc-ask" hidden><span></span><button type="button" class="egc-yes"></button><button type="button" class="egc-no"></button></div>'
      + '<div class="egc-err" hidden></div><div class="egc-body"></div></div>'
      + '<button type="button" class="egc-bubble">💬</button>';
    var q = function (sel) { return root.querySelector(sel); };
    var panel = q('.egc-panel'), err = q('.egc-err'), body = q('.egc-body'), ask = q('.egc-ask');
    q('.egc-head span').textContent = S.title;
    q('.egc-end').title = S.end;
    q('.egc-end').setAttribute('aria-label', S.end);
    q('.egc-ask span').textContent = S.end_confirm;
    q('.egc-yes').textContent = S.end_yes;
    q('.egc-no').textContent = S.cancel;
    q('.egc-x').title = S.close;
    q('.egc-x').setAttribute('aria-label', S.close);
    var shown = look && look.user_strip && p && (p.short_name || p.username);
    if (shown) { q('.egc-user').textContent = shown; q('.egc-user').hidden = false; }
    q('.egc-bubble').setAttribute('aria-label', S.open);
    document.body.appendChild(root);

    // Deep Chat's markdown: links only to http(s)/mailto/tel, and bare URLs become links (it has no linkify).
    var links = function (md) {
      md.core.ruler.push('egpt_links', function (state) {
        state.tokens.forEach(function (b) {
          if (b.type !== 'inline') return;
          var out = [], depth = 0;
          b.children.forEach(function (t) {
            if (t.type === 'link_open') { depth++; if (!/^(https?:|mailto:|tel:)/i.test(t.href)) t.href = '#'; }
            if (t.type === 'link_close') depth--;
            if (t.type !== 'text' || depth) return out.push(t);
            t.content.split(/(https?:\/\/[^\s<>"]*[^\s<>".,;:!?)'"])/).forEach(function (part, k) {
              if (k % 2) out.push({ type: 'link_open', href: part, level: t.level }, { type: 'text', content: part, level: t.level + 1 }, { type: 'link_close', level: t.level });
              else if (part) out.push({ type: 'text', content: part, level: t.level });
            });
          });
          b.children = out;
        });
      });
    };
    (window.remarkable_plugins = window.remarkable_plugins || []).push({ plugin: links });

    var lib = null;
    var loadLib = function () {
      return lib = lib || new Promise(function (ok, no) {
        if (window.customElements.get('deep-chat')) return ok();
        var s = document.createElement('script');
        s.type = 'module';
        s.src = C.deepChat.url;
        s.integrity = C.deepChat.integrity;
        s.crossOrigin = 'anonymous';
        s.onload = ok;
        s.onerror = function () { lib = null; s.remove(); no(); };
        document.head.appendChild(s);
      });
    };
    // info missed at load (the limb down, a proxy hiccup): asked again on open; still nothing → unavailable.
    var needInfo = function () {
      if (C.info) return Promise.resolve();
      return get('info', 'json').then(function (info) {
        if (!useInfo(C, info)) return Promise.reject(0);
        q('.egc-head span').textContent = S.title;
      });
    };
    var fetchLog = function () {
      if (!token) return Promise.resolve([]);
      return fetch(base + 'messages?session=' + encodeURIComponent(token) + idq).then(function (r) {
        if (r.status === 404) { token = null; store(KEY, null); return { seq: 0, messages: [] }; }
        return r.ok ? r.json() : Promise.reject(r.status);
      }).then(function (j) { since = j.seq; return j.messages; });
    };

    var role = function (m) { return m.from === 'visitor' ? 'user' : 'ai'; };
    // A human support line (from the team's browser) is headed with who said it: "Soporte · <user>".
    var textOf = function (m) { return m.from === 'support' ? '**' + S.support + ' · ' + m.by + '**\n\n' + m.text : m.text; };
    // A frame: a new message is added, a known one edited or removed in place. The visitor's own lines
    // are already on screen (Deep Chat put them there), so while a POST is out their frames wait for its id.
    var show = function (m) {
      if (m.seq > since) since = m.seq;
      var k = at[m.id];
      if (k) {
        if (!m.text || textOf(m) === k.text) return;
        k.text = textOf(m);
        chat.updateMessage({ text: k.text }, k.i);
        return;
      }
      if (!m.text) return;
      if (m.from === 'visitor' && inflight) { held.push(m); return; }
      chat.addMessage({ role: role(m), text: textOf(m) });
      at[m.id] = { i: chat.getMessages().length - 1, text: textOf(m) };
    };
    var listen = function () {
      if (es) es.close();
      es = null;
      if (!token || !chat || panel.hidden || !window.EventSource) return;
      es = new EventSource(base + 'events?session=' + encodeURIComponent(token) + '&since=' + since + idq);
      es.onmessage = function (e) { show(JSON.parse(e.data)); };
    };
    var BACKOFF = [1000, 3000, 9000];
    var newId = function () {
      var b = new Uint8Array(16);
      crypto.getRandomValues(b);
      return Array.prototype.map.call(b, function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('');
    };
    // No answer or a 5xx: the same line again, with the same id (the server keeps one), after BACKOFF[n].
    var postLine = function (text, id, n) {
      return fetch(base + 'messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: token, text: text, id: id, identity: identity, place: sent }) })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); }, function () { return Promise.reject(0); })
        .catch(function (status) {
          if ((status && status < 500) || n >= BACKOFF.length) return Promise.reject(status);
          return new Promise(function (ok) { setTimeout(ok, BACKOFF[n]); }).then(function () { return postLine(text, id, n + 1); });
        });
    };
    var opening = null;   // a new session's first POST: lines sent meanwhile wait for its token
    var send = function (req) {
      var text = req.messages[req.messages.length - 1].text;
      var i = chat.getMessages().length - 1;
      var id = newId();
      var go = function () { return postLine(text, id, 0); };
      var last = 0;
      try { last = Number(localStorage.getItem(KEY + ':at')) || 0; } catch (e) { /* private mode */ }
      cold(!token || !(Date.now() - last < COLD_MS));   // a guess until the server answers (j.cold)
      store(KEY + ':at', String(Date.now()));
      inflight++;
      var done = (opening ? opening.then(go) : go())
        .then(function (j) {
          if (typeof j.cold === 'boolean') cold(j.cold);
          at[j.message.id] = { i: i, text: j.message.text };
          if (j.message.seq > since) since = j.message.seq;
          var renewed = j.session !== token;
          if (renewed) { token = j.session; store(KEY, token); }
          if (renewed || !es) listen();
        })
        .catch(function (status) { sig.onResponse({ error: status === 401 ? S.identity : status === 413 ? S.too_long : status === 429 ? S.too_many : S.error }); })
        .then(function () { if (!--inflight) held.splice(0).forEach(show); });
      if (!token && !opening) opening = done.then(function () { opening = null; });
    };

    // The loading bubble: ⏳, or S.waiting's phrases stacked in one cell and faded in turn by CSS alone (WAIT_MS each,
    // looping; no timer to clean up). The phrases are the skin's, escaped as text. The keyframes sit in the
    // html because Deep Chat's shadow root does not see the page's stylesheet.
    // S.waiting_cold, if any, is a second set for a line to a cold conversation: both sets sit in the bubble and
    // the --egc-frio / --egc-tibio custom properties on the deep-chat element (they inherit into its shadow root)
    // show one, so switching never re-renders Deep Chat (see cold()).
    var WAIT_MS = 2500;
    var COLD_MS = 4 * 60000;   // the limb's prime gap: a session quiet this long is guessed cold until the POST says
    var esc = function (t) { return t.replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); };
    var rotation = function (w, k) {   // k: the keyframes' name, one per set (each set has its own count)
      var n = w.length, on = (100 / n).toFixed(3);
      return '<style>@keyframes ' + k + '{0%,' + on + '%{opacity:1}' + (+on + 0.001) + '%,100%{opacity:0}}</style>'
        + w.map(function (t, i) { return '<span style="grid-area:1/1;opacity:0;animation:' + k + ' ' + (n * WAIT_MS) + 'ms linear ' + (i * WAIT_MS) + 'ms infinite">' + esc(t) + '</span>'; }).join('');
    };
    var waitingHtml = function () {
      var w = S.waiting, c = S.waiting_cold;
      if (!c.length) {
        if (!w.length) return '⏳';
        if (w.length === 1) return esc(w[0]);
        return rotation(w, 'egc-w').replace('</style>', '</style><span style="display:inline-grid">') + '</span>';
      }
      var set = function (v, k) { return v.length > 1 ? rotation(v, k) : '<span>' + (v.length ? esc(v[0]) : '⏳') + '</span>'; };
      return '<span style="display:var(--egc-tibio,inline-grid)">' + set(w, 'egc-w') + '</span>'
        + '<span style="display:var(--egc-frio,none)">' + set(c, 'egc-wf') + '</span>';
    };
    // The bubble's set: cold or warm. Only with S.waiting_cold; the deep-chat element's own style, no re-render.
    var cold = function (on) {
      if (!chat || !chat.style || !S.waiting_cold.length) return;
      chat.style.setProperty('--egc-frio', on ? 'inline-grid' : 'none');
      chat.style.setProperty('--egc-tibio', on ? 'none' : 'inline-grid');
    };
    // Every property is set before the element renders: a later set re-renders Deep Chat from scratch.
    var build = function (messages) {
      var hist = [];
      messages.forEach(function (m) {
        if (!m.text) return;
        at[m.id] = { i: hist.length, text: textOf(m) };
        hist.push({ role: role(m), text: textOf(m) });
      });
      chat = document.createElement('deep-chat');
      chat.history = hist;
      if (S.intro) chat.introMessage = { text: S.intro };
      // websocket mode: the handler runs once; input stays open while replies arrive at any time.
      chat.connect = { websocket: true, handler: function (_, signals) {
        sig = signals;
        signals.newUserMessage.listener = send;
        signals.onOpen();
        listen();
        if (wantFocus) chat.focusInput();
      } };
      // ⏳ (or the waiting phrases) from a sent line until the next message shows (Deep Chat drops it then, or at an error).
      chat.displayLoadingBubble = true;
      chat.requestBodyLimits = { maxMessages: 1 };
      chat.errorMessages = { displayServiceErrorMessages: true };
      chat.textInput = { characterLimit: C.maxChars, placeholder: { text: S.placeholder }, styles: { text: { fontSize: '16px' } } };
      chat.submitButtonStyles = { tooltip: { text: S.send } };
      // A fontFamily of our own also keeps Deep Chat from adding a Google Fonts link to the page.
      var cs = window.getComputedStyle(root);
      var v = function (n, d) { return cs.getPropertyValue('--egc-' + n).trim() || d; };
      var avatar = (/^url\(\s*(['"]?)(.*?)\1\s*\)$/.exec(v('avatar', '')) || [])[2];
      chat.chatStyle = { display: 'block', width: '100%', height: '100%', border: 'none', backgroundColor: v('bg', '#f6f8fa'), fontFamily: 'system-ui, sans-serif', fontSize: '15px' };
      chat.messageStyles = { default: {
        shared: { bubble: { maxWidth: v('bubble-max-width', '85%'), ...(v('bubble-padding', '') ? { padding: v('bubble-padding', '') } : {}) } },
        user: { bubble: { backgroundColor: v('user-bg', '#1f6feb'), color: v('user-fg', '#fff'), ...(v('user-radius', '') ? { borderRadius: v('user-radius', '') } : {}) } },
        ai: { bubble: { backgroundColor: v('ai-bg', '#fff'), color: v('ai-fg', '#111'), border: v('ai-border', '1px solid #d0d7de'), ...(v('ai-radius', '') ? { borderRadius: v('ai-radius', '') } : {}), ...(v('ai-shadow', '') ? { boxShadow: v('ai-shadow', '') } : {}) } },
      }, loading: { message: { html: waitingHtml() } } };
      // --egc-avatar: url(...) puts that face at the foot of each ai message; the visitor has none then.
      if (avatar) chat.avatars = { ai: { src: avatar, styles: { avatar: { width: '32px', height: '32px', borderRadius: '50%' }, container: { alignSelf: 'flex-end' } } }, user: { styles: { container: { display: 'none' } } } };
      body.appendChild(chat);
    };

    var open = function (on, focus) {
      panel.hidden = !on;
      store(KEY + ':open', on ? '1' : null);
      if (!on) { if (es) { es.close(); es = null; } return; }
      if (chat) { listen(); chat.scrollToBottom(); if (focus) chat.focusInput(); return; }
      if (starting) return;
      starting = true;
      wantFocus = !!focus;
      err.hidden = true;
      Promise.all([loadLib(), Promise.resolve(opening).then(fetchLog), needInfo()]).then(function (r) { build(r[1]); }, function (status) {
        starting = false;
        err.textContent = status === 401 ? S.identity : S.unavailable;
        err.hidden = false;
      });
    };
    // End: the same token (conversation, team topic) gets a fresh thread; the panel starts over.
    var end = function () {
      ask.hidden = true;
      fetch(base + 'end', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: token, identity: identity }) })
        .then(function (r) {
          if (r.status === 404) { token = null; store(KEY, null); listen(); }
          else if (!r.ok) return Promise.reject(r.status);
          store(KEY + ':at', null);   // a fresh thread starts cold
          at = {};
          err.hidden = true;
          chat.clearMessages();
        })
        .catch(function (status) { err.textContent = status === 401 ? S.identity : S.error; err.hidden = false; });
    };
    q('.egc-end').onclick = function () { ask.hidden = !(ask.hidden && token && chat && !inflight); };
    q('.egc-no').onclick = function () { ask.hidden = true; };
    q('.egc-yes').onclick = end;
    q('.egc-bubble').onclick = function () { open(panel.hidden, true); };
    q('.egc-x').onclick = function () { open(false); };
    // C.init: the page load says so, once (POST messages, kind init); the answer's session is this page's.
    if (C.init && identity) {
      opening = fetch(base + 'messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'init', session: token, identity: identity, place: sent }) })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { if (j && j.session !== token) { token = j.session; store(KEY, token); listen(); } }, function () { /* the next line says what failed */ })
        .then(function () { opening = null; });
    }
    try { if (localStorage.getItem(KEY + ':open')) open(true); } catch (e) { /* private mode */ }
  }
})();
