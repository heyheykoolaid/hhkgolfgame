// The game's own server (packages/worker), in the same shape as the Claude artifact page's runtime, so the rest of the
// game uses either without knowing which: `room` (presence), `db` (documents) and `user` (who you are and others'
// names). platform.ts picks this when the page isn't running on the artifact host and the server answers.
//
// Your account is a token this browser keeps (localStorage `gh_token`). The first visit asks for a name and gets one.
// The same token on another computer is the same player: the options menu shows it as an "account code".
import { askName } from '../ui/signup';

const TOKEN = 'gh_token';
const api = (path: string) => new URL('api/' + path, document.baseURI).href;
const wsUrl = (path: string) => api(path).replace(/^http/, 'ws');
export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN) || '';
  } catch {
    return '';
  }
};
export const setToken = (t: string) => {
  try {
    localStorage.setItem(TOKEN, t);
  } catch {}
};
async function call(path: string, init: RequestInit = {}) {
  const r = await fetch(api(path), { ...init, headers: { ...(init.headers || {}), authorization: 'Bearer ' + getToken() } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body?.error || 'http ' + r.status), { status: r.status, body });
  return body;
}
/** Is the game's own server there? (Not on the artifact host, which is told apart before this is asked.) */
export async function cloudAvailable() {
  try {
    const c = new AbortController(),
      t = setTimeout(() => c.abort(), 15000); // (a plain file server answers at once with a 404; the real one may be waking up)
    const r = await fetch(api('hello'), { signal: c.signal });
    clearTimeout(t);
    return r.ok && (await r.json())?.ok === true;
  } catch {
    return false;
  }
}
/** Make a new account with this name. Returns the error ('taken', 'name') or '' on success. */
export async function register(name: string) {
  const r = await fetch(api('register'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) return String(b?.error || 'error');
  setToken(b.token);
  return '';
}
/** Who this token belongs to, or null if it belongs to nobody. */
export async function whoAmI(token = getToken()): Promise<{ uid: string; name: string } | null> {
  if (!token) return null;
  const r = await fetch(api('me'), { headers: { authorization: 'Bearer ' + token } }).catch(() => null);
  if (!r || !r.ok) return null;
  return r.json();
}
export async function rename(name: string) {
  try {
    await call('name', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
    return '';
  } catch (e: any) {
    return String(e?.body?.error || 'error');
  }
}

// ------------------------------------------------------------------ a socket that comes back by itself
/** A WebSocket that reconnects with a growing pause, and pings so idle connections aren't dropped. */
function liveSocket(path: string, on: { open?: () => void; msg: (d: any) => void; lost?: () => void }) {
  let ws: WebSocket | null = null,
    closed = false,
    wait = 500,
    ping = 0;
  const open = () => {
    if (closed) return;
    ws = new WebSocket(wsUrl(path) + (path.includes('?') ? '&' : '?') + 't=' + encodeURIComponent(getToken()));
    ws.onopen = () => {
      wait = 500;
      clearInterval(ping);
      ping = setInterval(() => ws?.readyState === 1 && ws.send('ping'), 25000) as any;
      on.open?.();
    };
    ws.onmessage = e => {
      if (e.data === 'pong') return;
      try {
        on.msg(JSON.parse(e.data));
      } catch {}
    };
    ws.onclose = () => {
      clearInterval(ping);
      if (closed) return;
      on.lost?.();
      setTimeout(open, wait);
      wait = Math.min(wait * 2, 15000);
    };
  };
  open();
  return {
    send: (s: string) => ws?.readyState === 1 && (ws.send(s), true),
    up: () => ws?.readyState === 1,
    close() {
      closed = true;
      clearInterval(ping);
      ws?.close();
    },
  };
}

// ------------------------------------------------------------------ presence rooms
const TAB = Math.random().toString(36).slice(2, 10);
interface PeerRec {
  peer: string;
  by: string;
  tab: string;
  presence: unknown;
}
function makeRoom(name: string): any {
  const peers = new Map<string, PeerRec>(),
    listeners: ((ch: any) => void)[] = [],
    conn: (() => void)[] = [];
  let mine: unknown = null,
    queued = false;
  // tell the game at most once per turn of the event loop, however many updates arrived together
  const emit = () => {
    if (queued) return;
    queued = true;
    setTimeout(() => {
      queued = false;
      const list = [...peers.values()].map(p => ({ peer: p.peer, by: p.by, presence: p.presence, isMe: false, sameTab: p.tab === TAB }));
      for (const f of listeners)
        try {
          f({ peers: list });
        } catch {}
    }, 0);
  };
  const sock = liveSocket('room/' + encodeURIComponent(name) + '?tab=' + TAB, {
    open: () => {
      if (mine) sock.send(JSON.stringify({ t: 'p', p: mine }));
      for (const f of conn) f();
    },
    msg: d => {
      if (d.t === 'hi') {
        peers.clear();
        for (const p of d.peers || []) peers.set(p.peer, { peer: p.peer, by: p.by, tab: p.tab, presence: p.presence });
      } else if (d.t === 'join') peers.set(d.peer, { peer: d.peer, by: d.by, tab: d.tab, presence: null });
      else if (d.t === 'p') peers.set(d.peer, { peer: d.peer, by: d.by, tab: d.tab, presence: d.p });
      else if (d.t === 'x') peers.delete(d.peer);
      else if (d.t === 'resend') {
        if (mine) sock.send(JSON.stringify({ t: 'p', p: mine }));
        return;
      }
      emit();
    },
    lost: () => {
      peers.clear();
      emit();
      for (const f of conn) f();
    },
  });
  return {
    onPeers(f: (ch: any) => void) {
      listeners.push(f);
      emit();
    },
    onConnection(f: () => void) {
      conn.push(f);
    },
    get connected() {
      return sock.up();
    },
    presence(p: unknown) {
      mine = p;
      sock.send(JSON.stringify({ t: 'p', p }));
    },
    join: async (sub: string) => makeRoom(sub),
    leave() {
      sock.close();
    },
  };
}

// ------------------------------------------------------------------ documents
function makeDb() {
  return {
    doc(path: string) {
      return {
        async get() {
          const r = await call('doc/' + encodeURIComponent(path));
          return { exists: !!r.exists, data: () => r.data };
        },
        set: (data: unknown) => call('doc/' + encodeURIComponent(path), { method: 'PUT', body: JSON.stringify(data) }),
      };
    },
    collection(name: string) {
      return {
        /** Only `plots` is watched: every lot now, then each one as it changes. */
        onSnapshot(cb: (snap: any) => void, err?: (e: unknown) => void) {
          if (name !== 'plots') {
            err?.(new Error('only plots can be watched'));
            return () => {};
          }
          const all = new Map<string, unknown>(),
            send = (changed: { type: string; id: string }[], fromCache: boolean) =>
              cb({
                docs: [...all.entries()].map(([id, d]) => ({ id, data: () => d })),
                docChanges: () => changed.map(c => ({ type: c.type, doc: { id: c.id, data: () => all.get(c.id) } })),
                metadata: { fromCache },
              });
          const sock = liveSocket('watch/plots', {
            msg: d => {
              if (d.t === 'all') {
                const gone = [...all.keys()].filter(k => !d.docs.some((x: any) => x.id === k));
                all.clear();
                for (const x of d.docs) all.set(x.id, x.data);
                send([...gone.map(id => ({ type: 'removed', id })), ...d.docs.map((x: any) => ({ type: 'modified', id: x.id }))], false);
              } else if (d.t === 'set') {
                all.set(d.id, d.data);
                send([{ type: 'modified', id: d.id }], false);
              }
            },
          });
          return () => sock.close();
        },
      };
    },
  };
}

/** Connect: make sure this browser has an account (asking for a name the first time), then hand over the three
 *  pieces. Returns null if the server can't be reached. */
export async function cloudPlatform(): Promise<{ room: any; db: any; user: any; me: { uid: string; name: string } } | null> {
  let me = await whoAmI();
  while (!me) {
    await askName(); // (resolves once a name was registered or a code was pasted that works)
    me = await whoAmI();
  }
  const user = {
    id: async () => me!.uid,
    can: async () => true,
    async profiles(ids: string[]) {
      try {
        return await call('profiles?ids=' + ids.map(encodeURIComponent).join(','));
      } catch {
        return {};
      }
    },
  };
  return { room: makeRoom('lobby'), db: makeDb(), user, me };
}
