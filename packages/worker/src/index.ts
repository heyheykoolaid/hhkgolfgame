// Golden Hills' own server, for running the game away from the Claude artifact page. It provides the three things
// that page provided, in the same shape, so the game barely knows the difference (client: src/net/cloud.ts):
//
//  · Accounts. A player picks a name on their first visit and gets back a secret token, which their browser keeps.
//    The token is the account: anyone holding it is that player. It can be copied to another computer ("account
//    code" in the options menu). Only its SHA-256 is stored here.
//  · Documents. A tiny database of JSON documents by path: `plots/<uid>` (a lot: readable by all, written by its
//    owner) and `data/users/<uid>/<name>` (looks and progress: read and written only by their owner). Changes to plots
//    are pushed to everyone watching over a WebSocket.
//  · Presence rooms. Each player publishes one small object (where they are, what they wear, what they're doing);
//    everyone in the room gets everyone else's latest. One Durable Object per room: the lobby, and each golf match.
//
// Everything else (shots, blackjack, bets) is worked out by the players' own browsers from presence, as before.
import { DurableObject } from 'cloudflare:workers';

export interface Env {
  WORLD: DurableObjectNamespace<World>;
  ROOM: DurableObjectNamespace<Room>;
  ASSETS: Fetcher;
}
interface Me {
  uid: string;
  name: string;
}

const MAX_DOC = 512 * 1024, // bytes in one document
  MAX_PRES = 24 * 1024, // bytes in one presence message
  MAX_NAME = 20;
const json = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const rand = (n: number) => {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};
const sha = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
/** A display name as it may be stored: printable, single spaces, 1 to 20 characters. */
export function cleanName(n: unknown) {
  return String(n ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME);
}
const SEG = '[A-Za-z0-9_-]{1,48}';
const PLOT = new RegExp(`^plots/(${SEG})$`),
  USERDOC = new RegExp(`^data/users/(${SEG})/(${SEG})$`);

// ------------------------------------------------------------------ the Worker: routes requests
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    const world = env.WORLD.get(env.WORLD.idFromName('world')),
      p = url.pathname.slice(5);
    try {
      if (p === 'hello') return json({ ok: true, v: 1 });
      if (p === 'register' && req.method === 'POST') {
        const body = (await req.json().catch(() => ({}))) as { name?: string };
        const r = await world.register(cleanName(body.name));
        return 'error' in r ? json(r, 400) : json(r);
      }
      // everything below needs an account
      const token = (req.headers.get('authorization') || '').replace(/^Bearer /, '') || url.searchParams.get('t') || '';
      const me = token ? await world.auth(token) : null;
      if (!me) return json({ error: 'auth' }, 401);
      if (p === 'me') return json(me);
      if (p === 'name' && req.method === 'POST') {
        const body = (await req.json().catch(() => ({}))) as { name?: string };
        const r = await world.rename(me.uid, cleanName(body.name));
        return 'error' in r ? json(r, 400) : json(r);
      }
      if (p === 'profiles') {
        const ids = (url.searchParams.get('ids') || '').split(',').filter(Boolean).slice(0, 64);
        return json(await world.profiles(ids));
      }
      if (p.startsWith('doc/')) {
        const path = decodeURIComponent(p.slice(4));
        if (req.method === 'GET') {
          const r = await world.getDoc(me.uid, path);
          return 'error' in r ? json(r, 403) : json(r);
        }
        if (req.method === 'PUT') {
          const text = await req.text();
          if (text.length > MAX_DOC) return json({ error: 'too big' }, 413);
          const r = await world.setDoc(me.uid, path, text);
          return 'error' in r ? json(r, 403) : json(r);
        }
      }
      if (p === 'watch/plots' || p.startsWith('room/')) {
        if (req.headers.get('upgrade') !== 'websocket') return json({ error: 'websocket only' }, 426);
        const h = new Headers(req.headers);
        h.set('x-uid', me.uid);
        h.set('x-name', encodeURIComponent(me.name));
        const fwd = new Request(req, { headers: h });
        if (p === 'watch/plots') return world.fetch(fwd);
        const name = decodeURIComponent(p.slice(5));
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) return json({ error: 'room' }, 400);
        return env.ROOM.get(env.ROOM.idFromName(name)).fetch(fwd);
      }
      return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: 'server', detail: String(e).slice(0, 200) }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

// ------------------------------------------------------------------ World: accounts and documents
export class World extends DurableObject<Env> {
  private sql: SqlStorage;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS users (uid TEXT PRIMARY KEY, name TEXT NOT NULL, lname TEXT NOT NULL UNIQUE, token TEXT NOT NULL UNIQUE, created INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS docs (path TEXT PRIMARY KEY, data TEXT NOT NULL, at INTEGER NOT NULL)`);
  }
  /** A new player: a name nobody else has, a new id and a new token. */
  async register(name: string): Promise<{ uid: string; name: string; token: string } | { error: string }> {
    if (!name) return { error: 'name' };
    if (this.sql.exec('SELECT 1 FROM users WHERE lname = ?', name.toLowerCase()).toArray().length) return { error: 'taken' };
    const uid = 'u' + rand(9).toLowerCase().replace(/[^a-z0-9]/g, 'x'),
      token = rand(24);
    this.sql.exec('INSERT INTO users (uid, name, lname, token, created) VALUES (?, ?, ?, ?, ?)', uid, name, name.toLowerCase(), await sha(token), Date.now());
    return { uid, name, token };
  }
  async auth(token: string): Promise<Me | null> {
    const r = this.sql.exec<{ uid: string; name: string }>('SELECT uid, name FROM users WHERE token = ?', await sha(token)).toArray()[0];
    return r ? { uid: r.uid, name: r.name } : null;
  }
  rename(uid: string, name: string): Me | { error: string } {
    if (!name) return { error: 'name' };
    const other = this.sql.exec<{ uid: string }>('SELECT uid FROM users WHERE lname = ?', name.toLowerCase()).toArray()[0];
    if (other && other.uid !== uid) return { error: 'taken' };
    this.sql.exec('UPDATE users SET name = ?, lname = ? WHERE uid = ?', name, name.toLowerCase(), uid);
    return { uid, name };
  }
  profiles(ids: string[]) {
    const out: Record<string, { name: string }> = {};
    for (const id of ids) {
      const r = this.sql.exec<{ name: string }>('SELECT name FROM users WHERE uid = ?', id).toArray()[0];
      if (r) out[id] = { name: r.name };
    }
    return out;
  }
  /** Who may read and write a path: plots are public to read and private to write; a player's own data is private. */
  private allowed(uid: string, path: string, write: boolean) {
    const pl = PLOT.exec(path);
    if (pl) return !write || pl[1] === uid;
    const ud = USERDOC.exec(path);
    return !!ud && ud[1] === uid;
  }
  getDoc(uid: string, path: string): { exists: boolean; data?: unknown } | { error: string } {
    if (!this.allowed(uid, path, false)) return { error: 'forbidden' };
    const r = this.sql.exec<{ data: string }>('SELECT data FROM docs WHERE path = ?', path).toArray()[0];
    return r ? { exists: true, data: JSON.parse(r.data) } : { exists: false };
  }
  setDoc(uid: string, path: string, text: string): { ok: true } | { error: string } {
    if (!this.allowed(uid, path, true)) return { error: 'forbidden' };
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return { error: 'json' };
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { error: 'json' };
    this.sql.exec('INSERT INTO docs (path, data, at) VALUES (?, ?, ?) ON CONFLICT(path) DO UPDATE SET data = excluded.data, at = excluded.at', path, text, Date.now());
    const pl = PLOT.exec(path);
    if (pl) {
      const msg = JSON.stringify({ t: 'set', id: pl[1], data });
      for (const ws of this.ctx.getWebSockets('plots'))
        try {
          ws.send(msg);
        } catch {}
    }
    return { ok: true };
  }
  /** Watching the plots: every lot now, then each change as it is saved. */
  async fetch(req: Request): Promise<Response> {
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, ['plots']);
    const all = this.sql
      .exec<{ path: string; data: string }>("SELECT path, data FROM docs WHERE path LIKE 'plots/%'")
      .toArray()
      .map(r => ({ id: r.path.slice(6), data: JSON.parse(r.data) }));
    server.send(JSON.stringify({ t: 'all', docs: all }));
    void req;
    return new Response(null, { status: 101, webSocket: client });
  }
  webSocketMessage() {} // (watchers only listen; pings are answered without waking: see Room)
  webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 ? 1000 : code, 'bye');
    } catch {}
  }
}

// ------------------------------------------------------------------ Room: presence
interface Peer {
  peer: string;
  by: string;
  name: string;
  tab: string;
}
/** One presence room. It sleeps (hibernates) when nobody is talking, which keeps it inside the free plan; what each
 *  player last published is kept in memory, so after a sleep it asks everyone to publish again. */
export class Room extends DurableObject<Env> {
  private pres = new Map<string, unknown>();
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }
  private meta(ws: WebSocket) {
    return ws.deserializeAttachment() as Peer;
  }
  private others(ws: WebSocket) {
    return this.ctx.getWebSockets().filter(o => o !== ws);
  }
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url),
      m: Peer = {
        peer: rand(8),
        by: req.headers.get('x-uid') || '',
        name: decodeURIComponent(req.headers.get('x-name') || ''),
        tab: (url.searchParams.get('tab') || '').slice(0, 32),
      };
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(m);
    // who is here already (and anyone whose presence was lost in a sleep is asked for it again)
    let lost = false;
    const peers = this.others(server).map(o => {
      const om = this.meta(o);
      if (!this.pres.has(om.peer)) lost = true;
      return { ...om, presence: this.pres.get(om.peer) ?? null };
    });
    server.send(JSON.stringify({ t: 'hi', peer: m.peer, peers }));
    const join = JSON.stringify({ t: 'join', ...m });
    for (const o of this.others(server))
      try {
        o.send(lost ? '{"t":"resend"}' : join);
        if (lost) o.send(join);
      } catch {}
    return new Response(null, { status: 101, webSocket: client });
  }
  webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer) {
    if (typeof msg !== 'string' || msg.length > MAX_PRES) return;
    let d: { t?: string; p?: unknown };
    try {
      d = JSON.parse(msg);
    } catch {
      return;
    }
    if (d.t !== 'p') return;
    const m = this.meta(ws);
    this.pres.set(m.peer, d.p);
    const out = JSON.stringify({ t: 'p', peer: m.peer, by: m.by, tab: m.tab, name: m.name, p: d.p });
    for (const o of this.others(ws))
      try {
        o.send(out);
      } catch {}
  }
  private gone(ws: WebSocket) {
    const m = this.meta(ws);
    if (!m) return;
    this.pres.delete(m.peer);
    const out = JSON.stringify({ t: 'x', peer: m.peer });
    for (const o of this.others(ws))
      try {
        o.send(out);
      } catch {}
  }
  webSocketClose(ws: WebSocket, code: number) {
    this.gone(ws);
    try {
      ws.close(code === 1005 ? 1000 : code, 'bye');
    } catch {}
  }
  webSocketError(ws: WebSocket) {
    this.gone(ws);
  }
}
