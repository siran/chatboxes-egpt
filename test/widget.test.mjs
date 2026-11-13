// widget.test.mjs — widget.js on a minimal fake page: just what the loader touches. The fake fetch serves the
// chatbox's folder (info, skin.json, skin.css: `files`, a missing one 404) and answers the limb's API calls
// (messages, end: `responses` in turn, else a default line).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const JS = readFileSync(new URL('../widget.js', import.meta.url), 'utf8');
const BASE = 'https://x.test/chat/acme/';
const INFO = { client: 'acme', title: 'Acme', max_chars: 4000, init: false };
const DEFAULT_IDENTITY = 'No pudimos verificar tu sesión. Recarga la página o vuelve a iniciar sesión.';
const AL = { abrin: 'CTS', user_type: 'P', short_name: 'Ana Demo', username: 'ademo' };
// A signed identity's shape; the widget only reads the payload (the limb checks the signature).
const tok = (who = AL) => `${Buffer.from(JSON.stringify({ ...who, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.c2ln`;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function page({ identity = null, stored = {}, place = null, vars = {}, files = { info: INFO }, src = `${BASE}widget.js` } = {}) {
  const styles = [];
  const storage = new Map(Object.entries(stored));
  const calls = [], assets = [], sources = [], parts = new Map(), responses = [];
  let chat = null;
  const node = (extra = {}) => ({ hidden: false, textContent: '', setAttribute() {}, appendChild() {}, ...extra });
  const root = node({ querySelector: (sel) => parts.get(sel) ?? (parts.set(sel, node({ hidden: ['.egc-panel', '.egc-ask', '.egc-err', '.egc-user'].includes(sel) })), parts.get(sel)) });
  const document = {
    currentScript: { src, getAttribute: (n) => (n === 'data-identity' ? identity : n === 'data-place' ? place : null) },
    body: node(), head: node({ appendChild: (s) => styles.push(s.textContent) }),
    createElement: (tag) => {
      if (tag === 'div') return root;
      if (tag === 'style') return node();
      if (tag !== 'deep-chat') return node();
      const msgs = [];
      return (chat = { addMessage: (m) => msgs.push(m), getMessages: () => msgs, updateMessage() {}, focusInput() {}, scrollToBottom() {}, clearMessages() {}, style: { props: {}, setProperty(k, v) { this.props[k] = v; } } });
    },
    addEventListener() {},
  };
  const window = { getComputedStyle: () => ({ getPropertyValue: (k) => vars[k] ?? '' }), customElements: { get: () => true }, EventSource: function (s) { sources.push(s); this.close = () => {}; } };
  const localStorage = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) };
  const fetch = async (href, init) => {
    const name = href.startsWith(BASE) ? href.slice(BASE.length).split('?')[0] : href;
    if (name === 'messages' || name === 'end') {
      calls.push({ href, init, body: init?.body ? JSON.parse(init.body) : null });
      const r = responses.shift() ?? { status: 200, json: { session: 'tok-1', message: { id: '1', seq: 1, text: 'hola' }, seq: 0, messages: [] } };
      return { ok: r.status < 300, status: r.status, json: async () => r.json };
    }
    assets.push(href);
    if (!has(files, name)) return { ok: false, status: 404, json: async () => ({ error: 'not found' }), text: async () => '' };
    const v = files[name];
    return { ok: true, status: 200, json: async () => (typeof v === 'string' ? JSON.parse(v) : v), text: async () => (typeof v === 'string' ? v : JSON.stringify(v)) };
  };
  return {
    storage, calls, assets, sources, responses, styles, files, part: (sel) => parts.get(sel), chat: () => chat,
    run: () => new Function('document', 'window', 'localStorage', 'fetch', 'EventSource', JS)(document, window, localStorage, fetch, window.EventSource),
    open: () => parts.get('.egc-bubble').onclick(),
  };
}
const flush = () => new Promise((r) => setTimeout(r, 20));
const loaded = async (o) => { const p = page(o); p.run(); await flush(); return p; };
const opened = async (o) => {
  const p = await loaded(o);
  p.open();
  await flush();
  const signals = { newUserMessage: {}, onOpen() {}, onResponse: (r) => { signals.got = r; } };
  p.chat().connect.handler(null, signals);
  return { p, signals };
};

describe('the identity', () => {
  it('reads data-identity and sends it with each line, each read and the end; each user has their own stored session', async () => {
    const identity = tok();
    const { p, signals } = await opened({ identity, stored: { 'egpt-chat:acme:CTS/ademo': 'tok-0', 'egpt-chat:acme': 'tok-anon' } });
    assert.equal(p.calls[0].href, `${BASE}messages?session=tok-0&identity=${encodeURIComponent(identity)}`);
    assert.ok(p.sources.at(-1).includes(`&identity=${encodeURIComponent(identity)}`));
    p.chat().addMessage({ role: 'user', text: 'hola' });
    signals.newUserMessage.listener({ messages: [{ text: 'hola' }] });
    await flush();
    assert.equal(p.calls[1].body.session, 'tok-0');
    assert.equal(p.calls[1].body.text, 'hola');
    assert.equal(p.calls[1].body.identity, identity);
    assert.equal(p.storage.get('egpt-chat:acme:CTS/ademo'), 'tok-1');   // the server's answer: switched to its session
    assert.equal(p.storage.get('egpt-chat:acme'), 'tok-anon');
    p.part('.egc-end').onclick();
    p.part('.egc-yes').onclick();
    await flush();
    assert.equal(p.calls.at(-1).href, `${BASE}end`);
    assert.deepEqual(p.calls.at(-1).body, { session: 'tok-1', identity });
  });

  it('a 401 shows the skin\'s identity text (default the built-in one)', async () => {
    for (const [files, want] of [[{ info: INFO }, DEFAULT_IDENTITY], [{ info: INFO, 'skin.json': { strings: { identity: 'Vuelve a entrar.' } } }, 'Vuelve a entrar.']]) {
      const { p, signals } = await opened({ identity: tok(), files });
      p.responses.push({ status: 401, json: { error: 'identity expired' } });
      signals.newUserMessage.listener({ messages: [{ text: 'otra' }] });
      await flush();
      assert.deepEqual(signals.got, { error: want });
    }
  });

  it('init (info.init true or prime): the page load sends one init (kind: init, its stored session, the identity) and keeps the answer\'s session', async () => {
    for (const init of [true, 'prime']) {
      const identity = tok();
      const p = page({ identity, stored: { 'egpt-chat:acme:CTS/ademo': 'tok-0' }, files: { info: { ...INFO, init } } });
      p.responses.push({ status: 200, json: { session: 'tok-1' } });
      p.run();
      await flush();
      assert.equal(p.calls.length, 1);
      assert.equal(p.calls[0].href, `${BASE}messages`);
      assert.deepEqual(p.calls[0].body, { kind: 'init', session: 'tok-0', identity });
      assert.equal(p.storage.get('egpt-chat:acme:CTS/ademo'), 'tok-1');
    }
  });

  it('init off (the default), an unknown init, or no identity: nothing is sent on load', async () => {
    for (const info of [INFO, { ...INFO, init: 'yes' }]) assert.deepEqual((await loaded({ identity: tok(), files: { info } })).calls, []);
    assert.deepEqual((await loaded({ files: { info: { ...INFO, init: true } } })).calls, []);
  });

  it('a page with no data-identity sends none and keeps the shared slot', async () => {
    const p = await loaded({ stored: { 'egpt-chat:acme': 'tok-anon' } });
    p.open();
    await flush();
    assert.equal(p.calls[0].href, `${BASE}messages?session=tok-anon`);
  });
});

describe('info and the skin: the chatbox\'s own folder', () => {
  it('asks info, skin.json and skin.css next to itself (the script\'s query and fragment dropped), nothing else on load', async () => {
    const p = await loaded({ src: `${BASE}widget.js?v=3#x` });
    assert.deepEqual(p.assets.sort(), [`${BASE}info`, `${BASE}skin.css`, `${BASE}skin.json`]);
    assert.deepEqual(p.calls, []);
  });

  it('no skin: the built-in texts and info\'s title; the skin\'s strings replace them one by one, non-strings ignored', async () => {
    const bare = await opened({ identity: tok() });
    assert.equal(bare.p.part('.egc-head span').textContent, 'Acme');
    assert.equal(bare.p.chat().textInput.placeholder.text, 'Escribe tu mensaje…');
    assert.equal(bare.p.chat().introMessage, undefined);
    const skin = { strings: { title: 'Ayuda', placeholder: 'Pregunta aquí', intro: '¡Hola!', send: 7, nope: 'x' } };
    const { p } = await opened({ identity: tok(), files: { info: INFO, 'skin.json': skin } });
    assert.equal(p.part('.egc-head span').textContent, 'Ayuda');   // the skin's title beats info's
    assert.equal(p.chat().textInput.placeholder.text, 'Pregunta aquí');
    assert.deepEqual(p.chat().introMessage, { text: '¡Hola!' });
    assert.equal(p.chat().submitButtonStyles.tooltip.text, 'Enviar');
    const untitled = await opened({ identity: tok(), files: { info: { ...INFO, title: '' } } });
    assert.equal(untitled.p.part('.egc-head span').textContent, 'Chat');
  });

  it('max_chars comes from info (else 4000)', async () => {
    assert.equal((await opened({ identity: tok(), files: { info: { ...INFO, max_chars: 500 } } })).p.chat().textInput.characterLimit, 500);
    assert.equal((await opened({ identity: tok(), files: { info: { ...INFO, max_chars: -1 } } })).p.chat().textInput.characterLimit, 4000);
  });

  it('a skin.json that does not parse is no skin; the widget still works', async () => {
    const { p, signals } = await opened({ identity: tok(), files: { info: INFO, 'skin.json': '{"strings": {"title": "Rota"' } });
    assert.equal(p.part('.egc-head span').textContent, 'Acme');
    signals.newUserMessage.listener({ messages: [{ text: 'hola' }] });
    await flush();
    assert.equal(p.calls.at(-1).body.text, 'hola');
  });

  it('no info at load: the bubble is there; opening asks again, still nothing shows unavailable, an answer builds the panel', async () => {
    const p = await loaded({ identity: tok(), files: {} });
    p.open();
    await flush();
    assert.equal(p.chat(), null);
    assert.equal(p.part('.egc-err').hidden, false);
    assert.equal(p.part('.egc-err').textContent, 'No se pudo abrir el chat. Intenta de nuevo.');
    p.files.info = { ...INFO, max_chars: 900 };
    p.part('.egc-x').onclick();
    p.open();
    await flush();
    assert.ok(p.chat());
    assert.equal(p.chat().textInput.characterLimit, 900);
    assert.equal(p.part('.egc-head span').textContent, 'Acme');
  });

  it('skin.css joins after the base css and before the place\'s; a relative url() is the skin folder\'s, data: and # stay', async () => {
    const css = '.egc{--egc-avatar:url("face.png");--egc-bg:#123}.egc-head{background:url(img/h.svg) no-repeat}.x{mask:url(#m);background:url(data:image/png;base64,AAAA)}';
    const p = await loaded({ identity: tok(), place: 'espacio', files: { info: INFO, 'skin.css': css, 'skin.json': { places: { espacio: { css: '.egc-place{x:y}' } } } } });
    const all = p.styles[0];
    assert.ok(all.includes(`url("${BASE}face.png")`));
    assert.ok(all.includes(`url(${BASE}img/h.svg)`));
    assert.ok(all.includes('url(#m)'));
    assert.ok(all.includes('url(data:image/png;base64,AAAA)'));
    assert.ok(all.lastIndexOf(':where(') < all.indexOf('--egc-bg:#123'));
    assert.ok(all.indexOf('--egc-bg:#123') < all.indexOf('.egc-place{x:y}'));
  });
});

describe('waiting: the loading bubble', () => {
  const html = async (strings) => (await opened({ identity: tok(), files: { info: INFO, 'skin.json': { strings } } })).p.chat().messageStyles.loading.message.html;

  it('is ⏳ unless the skin lists phrases; they rotate by CSS, one cell, escaped as text, at most 12 of 80', async () => {
    assert.equal(await html({}), '⏳');
    const on = await html({ waiting: ['Un momento…', '<img src=x onerror=alert(1)>', 'Ya casi', 7, ''] });
    assert.ok(on.includes('@keyframes egc-w'));
    assert.equal(on.match(/<span style="grid-area/g).length, 3);
    assert.ok(on.includes('animation:egc-w 7500ms linear 2500ms infinite'));
    assert.ok(on.includes('Un momento…'));
    assert.ok(!on.includes('<img'));
    assert.ok(on.includes('&#60;img src=x onerror=alert(1)&#62;'));
    assert.equal(await html({ waiting: ['Solo uno'] }), 'Solo uno');
    const many = await html({ waiting: Array.from({ length: 20 }, (_, i) => `${i}${'x'.repeat(100)}`) });
    assert.equal(many.match(/<span style="grid-area/g).length, 12);
    assert.ok(many.includes(`>0${'x'.repeat(79)}<`));
  });
});

describe('places: where the host page is', () => {
  const places = { espacio: { user_strip: true, css: '.egc{--egc-bg:#123}', ignored: 1 }, plain: {} };
  const files = (more = {}, info = INFO) => ({ info, 'skin.json': { places, ...more } });

  it('data-place names a place: its css after the base, the strip with the user, the place sent with a line and init', async () => {
    const identity = tok();
    const p = await loaded({ identity, place: 'espacio', files: files({}, { ...INFO, init: true }) });
    assert.deepEqual(p.calls[0].body, { kind: 'init', session: null, identity, place: 'espacio' });
    p.open();
    await flush();
    assert.ok(p.styles.at(-1).includes('.egc{--egc-bg:#123}'));
    assert.ok(p.styles[0].indexOf('.egc{--egc-bg:#123}') > p.styles[0].indexOf(':where('));
    assert.equal(p.part('.egc-user').textContent, 'Ana Demo');
    assert.equal(p.part('.egc-user').hidden, false);
    const signals = { newUserMessage: {}, onOpen() {}, onResponse() {} };
    p.chat().connect.handler(null, signals);
    signals.newUserMessage.listener({ messages: [{ text: 'hola' }] });
    await flush();
    assert.equal(p.calls.at(-1).body.text, 'hola');
    assert.equal(p.calls.at(-1).body.place, 'espacio');
  });

  it('info.places is what the limb knows: a place only it names is sent undressed; one only the skin names is dressed, not sent', async () => {
    const send = async (place, info) => {
      const { p, signals } = await opened({ identity: tok(), place, files: files({}, info) });
      signals.newUserMessage.listener({ messages: [{ text: 'hola' }] });
      await flush();
      return { p, body: p.calls.at(-1).body };
    };
    const limbOnly = await send('aula', { ...INFO, places: ['aula'] });
    assert.equal(limbOnly.body.place, 'aula');
    assert.ok(!limbOnly.p.styles.join('').includes('--egc-bg:#123'));
    assert.equal(limbOnly.p.part('.egc-user'), undefined);
    const skinOnly = await send('espacio', { ...INFO, places: [] });
    assert.ok(!has(skinOnly.body, 'place'));
    assert.ok(skinOnly.p.styles.join('').includes('--egc-bg:#123'));
  });

  it('an unknown place or none: no css, no strip, no place sent', async () => {
    const { p, signals } = await opened({ identity: tok(), place: 'nope', files: files() });
    assert.ok(!p.styles.join('').includes('--egc-bg:#123'));
    assert.equal(p.part('.egc-user'), undefined);   // never unhidden
    signals.newUserMessage.listener({ messages: [{ text: 'hola' }] });
    await flush();
    assert.ok(!has(p.calls.at(-1).body, 'place'));
  });

  it('the strip falls back to username, and is empty with no identity', async () => {
    const a = await loaded({ identity: tok({ abrin: 'CTS', username: 'solo' }), place: 'espacio', files: files() });
    assert.equal(a.part('.egc-user').textContent, 'solo');
    const b = await loaded({ place: 'espacio', files: files() });
    assert.equal(b.part('.egc-user'), undefined);
  });

  it('the skin\'s places: bad names dropped, css capped at 20000, user_strip only when true', async () => {
    const big = { 'Bad Name': { css: '.bad{}' }, big: { css: `.big{}${'a'.repeat(30000)}`, user_strip: 'yes' } };
    const p = await loaded({ identity: tok(), place: 'big', files: files({ places: { ...places, ...big } }) });
    assert.ok(p.styles[0].endsWith(`.big{}${'a'.repeat(20000 - 6)}`));
    assert.equal(p.part('.egc-user'), undefined);
    const bad = await loaded({ identity: tok(), place: 'Bad Name', files: files({ places: { ...places, ...big } }) });
    assert.ok(!bad.styles[0].includes('.bad{}'));
  });
});

describe('the look', () => {
  it('is overridable (:where, --egc-*, color-scheme), minimize and end are inline SVG, Deep Chat reads the variables', async () => {
    assert.ok(JS.includes('color-scheme:light'));
    assert.ok(JS.includes(':where(.egc-panel)'));
    assert.ok(JS.includes('class="egc-x">\' + icon('));
    const { p } = await opened({ identity: tok() });
    assert.equal(p.chat().chatStyle.backgroundColor, '#f6f8fa');
    assert.equal(p.chat().messageStyles.default.user.bubble.backgroundColor, '#1f6feb');
    assert.equal(p.chat().messageStyles.default.user.bubble.color, '#fff');
    assert.equal(p.chat().avatars, undefined);
    const v = await opened({ identity: tok(), vars: { '--egc-bg': ' #D3DDE9 ', '--egc-user-bg': '#345D98', '--egc-avatar': 'url("https://x.test/a.png")' } });
    assert.equal(v.p.chat().chatStyle.backgroundColor, '#D3DDE9');
    assert.equal(v.p.chat().messageStyles.default.user.bubble.backgroundColor, '#345D98');
    assert.equal(v.p.chat().avatars.ai.src, 'https://x.test/a.png');
    assert.equal(v.p.chat().avatars.user.styles.container.display, 'none');
  });

  it('loads the pinned Deep Chat: its url with the sha384 integrity', () => {
    assert.match(JS, /url: 'https:\/\/cdn\.jsdelivr\.net\/npm\/deep-chat@2\.5\.1\/dist\/deepChat\.bundle\.js'/);
    assert.match(JS, /integrity: 'sha384-[A-Za-z0-9+/]{64}'/);
  });
});

describe('waiting_cold', () => {
  const W = ['Un momento…', 'Ya casi'], COLD = ['Despertando…', 'Preparando todo…', 'Casi listo…'];
  const withSets = (strings, stored = {}) => opened({ identity: tok(), stored, files: { info: INFO, 'skin.json': { strings } } });

  it('both sets sit in the bubble, the cold one hidden by default, each switched by a custom property (no re-render)', async () => {
    const { p } = await withSets({ waiting: W, waiting_cold: COLD });
    const html = p.chat().messageStyles.loading.message.html;
    assert.ok(html.includes('<span style="display:var(--egc-tibio,inline-grid)">'));
    assert.ok(html.includes('<span style="display:var(--egc-frio,none)">'));
    assert.ok(html.includes('@keyframes egc-w{'));
    assert.ok(html.includes('@keyframes egc-wf{'));
    assert.ok(html.includes('animation:egc-wf 7500ms linear 5000ms infinite'));
    for (const t of [...W, ...COLD]) assert.ok(html.includes(t), t);
    assert.ok(html.indexOf('Un momento…') < html.indexOf('--egc-frio'));
    assert.ok(html.indexOf('Despertando…') > html.indexOf('--egc-frio'));
  });

  it('a line with no session, or after 4 minutes of quiet, starts cold; the server\'s cold then decides', async () => {
    const { p, signals } = await withSets({ waiting: W, waiting_cold: COLD });
    const props = p.chat().style.props;
    p.responses.push({ status: 200, json: { session: 'tok-1', message: { id: '1', seq: 1, text: 'hola' }, cold: false } });
    signals.newUserMessage.listener({ messages: [{ text: 'hola' }] });
    assert.deepEqual(props, { '--egc-frio': 'inline-grid', '--egc-tibio': 'none' });   // no session yet: guessed cold
    await flush();
    assert.deepEqual(props, { '--egc-frio': 'none', '--egc-tibio': 'inline-grid' });   // the server: warm
    assert.ok(Number(p.storage.get('egpt-chat:acme:CTS/ademo:at')) > 0);
    p.responses.push({ status: 200, json: { session: 'tok-1', message: { id: '2', seq: 2, text: 'otra' }, cold: true } });
    signals.newUserMessage.listener({ messages: [{ text: 'otra' }] });
    assert.equal(props['--egc-frio'], 'none');   // a line just sent: guessed warm
    await flush();
    assert.equal(props['--egc-frio'], 'inline-grid');   // the server knows better
    p.storage.set('egpt-chat:acme:CTS/ademo:at', String(Date.now() - 5 * 60_000));
    p.responses.push({ status: 200, json: { session: 'tok-1', message: { id: '3', seq: 3, text: 'tarde' } } });
    p.chat().style.setProperty('--egc-frio', 'none');
    signals.newUserMessage.listener({ messages: [{ text: 'tarde' }] });
    assert.equal(props['--egc-frio'], 'inline-grid');   // 5 minutes quiet: guessed cold, and no cold in the answer keeps the guess
  });

  it('no waiting_cold: the bubble is the plain one and nothing is switched', async () => {
    const { p, signals } = await withSets({ waiting: W });
    assert.ok(!p.chat().messageStyles.loading.message.html.includes('--egc-frio'));
    signals.newUserMessage.listener({ messages: [{ text: 'hola' }] });
    await flush();
    assert.deepEqual(p.chat().style.props, {});
  });
});
