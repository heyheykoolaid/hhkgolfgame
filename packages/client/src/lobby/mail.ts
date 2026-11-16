// The mailbox at your lot's entrance (design/mailbox.md). Letters live in your progress (avatar/progress.ts); each one
// is delivered once ever, by id. Uses: news about unlocks, and later random gifts (cash, seeds, Birdie Balls).
// The flag on your mailbox goes up and the wallet pill shows ✉ when there's something unread.
import { progress, loadProgress, deliverMail, markRead, claimMail, deleteMail, onProgress, type Mail } from '../avatar/progress';

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Letters that arrive on their own. `when` decides if it's time (checked whenever you're in the lobby). */
export const LETTERS: { id: string; when: () => boolean; mail: () => Omit<Mail, 'at' | 'id'> }[] = [
  {
    id: 'welcome-1',
    when: () => true,
    mail: () => ({
      from: 'Golden Hills RV Park & Country Club',
      subject: 'Welcome to the neighbourhood',
      body: `Welcome to Golden Hills!\n\nYour lot comes with an RV, a mailbox (you found it) and a whole lot of potential. A few things to know:\n\n• The tee board in the plaza starts a round of golf: one hole, a Mini cup or a Championship. Birdies earn Birdie Dollars for the Birdie Ball machine.\n• Press B on your lot to build. The Grow tab has pots and raised beds, if you know what we mean. We don't. We're a country club.\n• The fella by the crate in the plaza buys what you grow. Cash goes to the blackjack table, your yard and your cart.\n\nKeep an eye on this mailbox: news, unlocks and the occasional surprise turn up here.\n\n— The Management`,
    }),
  },
  // DEV: a cash top-up for testing (Nov 14). Swap the id to send it again, or remove before a real launch.
  {
    id: 'dev-mom-cards-1',
    when: () => true,
    mail: () => ({
      from: 'Mom',
      subject: 'Cleaned out your old room…',
      cash: 5000,
      body: `Hi sweetie,\n\nI finally cleaned out your old room. I found a shoebox of those little monster cards you were always so careful with. A nice young man at the flea market said one of them was a "first edition shiny" something and gave me a very good price for the whole box!\n\nI know you always said never to touch them, but they were just sitting there, and you're a grown man living in an RV now. I hope you're eating properly.\n\nHere's the money. Don't spend it all on golf.\n\nLove,\nMom\n\nP.S. Your father says hi. He also says the RV park website is "a bit much."`,
    }),
  },
];

/** Random gifts for later (not switched on yet): one roll a day while you're in the lobby. */
export const GIFTS_ON = false;
export const GIFTS: { w: number; mail: () => Omit<Mail, 'at' | 'id'> }[] = [
  {
    w: 40,
    mail: () => ({
      from: 'Aunt Linda',
      subject: 'Birthday money (late)',
      cash: 250,
      body: 'Sorry this is late. Buy yourself something nice. Not a lottery ticket.\n\n— Aunt Linda',
    }),
  },
  {
    w: 25,
    mail: () => ({
      from: 'Golden Hills Pro Shop',
      subject: 'Loyalty rebate',
      cash: 400,
      body: 'Thanks for being a regular. Here is a little something back. Please stop putting your cart in the pond.',
    }),
  },
  { w: 10, mail: () => ({ from: 'Unknown', subject: 'found this', cash: 1500, body: 'you dropped this behind the fountain. dont ask.' }) },
];
async function maybeGift() {
  if (!GIFTS_ON) return;
  const day = Math.floor(Date.now() / 86400000),
    id = `gift-${day}`;
  if (progress().mailSeen.includes(id) || Math.random() > 0.35) return;
  const tot = GIFTS.reduce((a, g) => a + g.w, 0);
  let r = Math.random() * tot;
  const g = GIFTS.find(x => (r -= x.w) <= 0) || GIFTS[0];
  await deliverMail({ id, ...g.mail() });
}

export function createMail(host: { toast(html: string, ms?: number): void; onClose(): void; setFlag(up: boolean): void; setBadge(n: number): void }) {
  const ui = document.createElement('div');
  ui.id = 'lmail';
  ui.className = 'hidden';
  (document.getElementById('lobbyui') || document.body).appendChild(ui);
  let sel = '',
    openNow = false,
    html = '';
  const unread = () => progress().mail.filter(m => !m.read || (m.cash && !m.claimed)).length;
  function refresh() {
    const n = unread();
    host.setFlag(n > 0);
    host.setBadge(n);
    if (openNow) render();
  }
  onProgress(refresh);
  /** Deliver anything that's due (called when you arrive in the lobby). */
  async function check() {
    await loadProgress();
    let got = 0;
    for (const L of LETTERS) if (L.when() && (await deliverMail({ id: L.id, ...L.mail() }))) got++;
    await maybeGift();
    if (got) host.toast(`📬 You've got mail. Check the mailbox at your lot.`, 3500);
    refresh();
  }
  function render() {
    const list = progress()
      .mail.slice()
      .sort((a, b) => b.at - a.at);
    if (!sel || !list.some(m => m.id === sel)) sel = list[0]?.id || '';
    const m = list.find(x => x.id === sel);
    const date = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    let h = `<div class="card"><button class="x" data-close>✕</button><h2>Mailbox</h2><div class="mail">
      <div class="m-list">${list.length ? list.map(x => `<button class="m-item${x.id === sel ? ' on' : ''}${!x.read ? ' new' : ''}" data-sel="${esc(x.id)}"><b>${esc(x.from)}</b><span>${esc(x.subject)}</span><em>${date(x.at)}${x.cash && !x.claimed ? ' · 💵' : ''}</em></button>`).join('') : '<div class="m-empty">No mail.</div>'}</div>
      <div class="m-view">${
        m
          ? `<div class="paper"><div class="p-head"><b>From:</b> ${esc(m.from)}<br><b>Re:</b> ${esc(m.subject)}</div><div class="p-body">${esc(m.body).replace(/\n/g, '<br>')}</div>
        ${m.cash ? `<div class="p-att">📎 Enclosed: <b>${money(m.cash)}</b> cash ${m.claimed ? '<span class="taken">taken</span>' : `<button class="primary" data-claim="${esc(m.id)}">Take the ${money(m.cash)}</button>`}</div>` : ''}</div>
        ${!m.cash || m.claimed ? `<button class="m-del" data-del="${esc(m.id)}">Throw away</button>` : ''}`
          : ''
      }</div></div>
      <div class="gfoot">Cash ${money(progress().cash)}<span>Close <kbd>Esc</kbd></span></div></div>`;
    if (h === html) return;
    html = h;
    ui.innerHTML = h;
    ui.querySelector('[data-close]')?.addEventListener('click', close);
    ui.querySelectorAll<HTMLButtonElement>('[data-sel]').forEach(
      b =>
        (b.onclick = () => {
          sel = b.dataset.sel!;
          markRead(sel);
          render();
        }),
    );
    ui.querySelectorAll<HTMLButtonElement>('[data-claim]').forEach(
      b =>
        (b.onclick = async () => {
          const n = await claimMail(b.dataset.claim!);
          if (n) host.toast(`💵 <b>+${money(n)}</b> cash.`, 2500);
        }),
    );
    ui.querySelectorAll<HTMLButtonElement>('[data-del]').forEach(
      b =>
        (b.onclick = async () => {
          await deleteMail(b.dataset.del!);
          sel = '';
          render();
        }),
    );
    if (m && !m.read) markRead(m.id);
  }
  async function open() {
    await loadProgress();
    openNow = true;
    html = '';
    sel = '';
    ui.classList.remove('hidden');
    render();
  }
  function close() {
    openNow = false;
    ui.classList.add('hidden');
    host.onClose();
  }
  function key(e: KeyboardEvent) {
    if (e.code === 'Escape' || e.code === 'KeyE') close();
  }
  return { check, open, close, key, unread, isOpen: () => openNow };
}
