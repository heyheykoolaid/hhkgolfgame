import { cloudAvailable, cloudPlatform } from './net/cloud';
import { setAccount } from './ui/signup';
// The artifact runtime (when published): presence rooms, the shared database and the viewer's identity.
// Everything degrades to solo/offline when it isn't there (local dev, file preview).
export interface Platform {
  room: any | null;
  db: any | null;
  user: any | null;
  uid: string;
  name: string;
  canWrite: boolean;
  names: Map<string, string>;
}
let P: Promise<Platform> | null = null;
function localUid() {
  try {
    let u = localStorage.getItem('gh_uid');
    if (!u) {
      u = 'local-' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('gh_uid', u);
    }
    return u;
  } catch {
    return 'local-' + Math.random().toString(36).slice(2, 10);
  }
}
export function platform(): Promise<Platform> {
  if (P) return P;
  P = (async () => {
    const c = (window as any).claude,
      use = (n: string) => (c && typeof c.use === 'function' ? Promise.resolve(c.use(n)).catch(() => null) : Promise.resolve(null));
    // on the Claude artifact page its runtime provides all three; anywhere else, the game's own server does if it
    // answers (net/cloud.ts, packages/worker); with neither, it's solo play with saves in this browser
    const cloud = !c && (await cloudAvailable()) ? await cloudPlatform() : null;
    const [room, db, user] = cloud ? [cloud.room, cloud.db, cloud.user] : await Promise.all([use('room'), use('db'), use('user')]);
    const p: Platform = { room, db, user, uid: localUid(), name: 'You', canWrite: !!db, names: new Map() };
    if (cloud) {
      p.names.set(cloud.me.uid, cloud.me.name);
      setAccount(cloud.me);
    }
    if (user) {
      try {
        p.uid = (await user.id()) || p.uid;
      } catch {}
      try {
        const can = user.can ? await user.can('data.write') : null;
        if (can === false) p.canWrite = false;
      } catch {}
    }
    await resolveNames(p, [p.uid]);
    p.name = p.names.get(p.uid) || 'You';
    return p;
  })();
  return P;
}
/** Display names for account ids (cached). */
export async function resolveNames(p: Platform, ids: string[]) {
  const want = [...new Set(ids.filter(Boolean))].filter(id => !p.names.has(id));
  if (!want.length || !p.user || !p.user.profiles) return;
  try {
    const ps = await p.user.profiles(want);
    for (const id of want) p.names.set(id, (ps && ps[id] && ps[id].name) || 'A golfer');
  } catch {
    for (const id of want) p.names.set(id, 'A golfer');
  }
}
