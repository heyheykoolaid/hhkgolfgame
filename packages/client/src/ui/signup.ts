// Your account on the game's own server (net/cloud.ts): the name card on a first visit, and the Account section of
// the options menu. There are no passwords: the account is a code this browser keeps. Paste the same code on
// another computer and you're the same player there, with the same lot, wallet and clothes.
import { register, whoAmI, rename, getToken, setToken } from '../net/cloud';
import { esc } from './dom';

/** Show the name card and wait until this browser has an account. */
export function askName(): Promise<void> {
  return new Promise(done => {
    const el = document.createElement('div');
    el.id = 'signup';
    let codeMode = false,
      busy = false;
    const draw = (err = '') => {
      el.innerHTML = codeMode
        ? `<form class="wcard">
            <h2>Welcome back</h2>
            <p>Paste the account code from your other computer (Options → Account on that one).</p>
            <input name="v" autocomplete="off" spellcheck="false" placeholder="account code" maxlength="64">
            <div class="err">${esc(err)}</div>
            <div class="acts"><button type="button" class="link" data-swap>I'm new here</button><button type="submit">Use this code</button></div>
          </form>`
        : `<form class="wcard">
            <h2>Golden Hills</h2>
            <p>What should everyone call you?</p>
            <input name="v" autocomplete="off" spellcheck="false" placeholder="your name" maxlength="20">
            <div class="err">${esc(err)}</div>
            <p class="small">This computer remembers you. To play as the same person somewhere else, copy your account code from the options menu.</p>
            <div class="acts"><button type="button" class="link" data-swap>I already have an account code</button><button type="submit">Let's play</button></div>
          </form>`;
      const f = el.querySelector('form')!,
        inp = f.querySelector('input')!;
      setTimeout(() => inp.focus(), 30);
      (f.querySelector('[data-swap]') as HTMLButtonElement).onclick = () => {
        codeMode = !codeMode;
        draw();
      };
      f.onsubmit = async e => {
        e.preventDefault();
        if (busy) return;
        const v = inp.value.trim();
        if (!v) return draw(codeMode ? 'Paste your code first.' : 'Pick a name first.');
        busy = true;
        try {
          if (codeMode) {
            const me = await whoAmI(v);
            if (!me) return draw("That code doesn't belong to anyone. Check you copied all of it.");
            setToken(v);
          } else {
            const r = await register(v);
            if (r === 'taken') return draw('Somebody already has that name. Try another.');
            if (r) return draw("That name won't work. Letters, numbers and spaces, up to 20.");
          }
          el.remove();
          removeEventListener('keydown', stop, true);
          done();
        } catch {
          draw("Couldn't reach the server. Try again in a moment.");
        } finally {
          busy = false;
        }
      };
    };
    // the game underneath doesn't hear keys while you type
    const stop = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) e.stopImmediatePropagation();
    };
    addEventListener('keydown', stop, true);
    draw();
    document.body.appendChild(el);
  });
}

// ------------------------------------------------------------------ the options menu's Account section
let account: { name: string } | null = null;
/** On the game's own server, the options menu shows your name and your account code. */
export function setAccount(me: { name: string } | null) {
  account = me;
}
export function accountHTML(show: boolean) {
  if (!account) return '';
  const code = getToken();
  return `<h3>Account</h3>
    <label class="orow"><span>Name</span><span class="oseg"><input class="oname" value="${esc(account.name)}" maxlength="20" spellcheck="false"><button data-rename>Change</button></span></label>
    <label class="orow"><span>Account code<small>play as you on another computer: paste it there. Keep it to yourself: whoever has it is you.</small></span>
      <span class="oseg"><code class="ocode">${show ? esc(code) : '••••••••'}</code><button data-showcode>${show ? 'Hide' : 'Show'}</button><button data-copycode>Copy</button></span></label>
    <div class="omsg"></div>`;
}
/** Wire the section's buttons after the menu has drawn it; `redraw(show)` draws the menu again. */
export function wireAccount(root: HTMLElement, show: boolean, redraw: (show: boolean) => void) {
  if (!account) return;
  const msg = (t: string) => {
    const m = root.querySelector('.omsg');
    if (m) m.textContent = t;
  };
  root.querySelector<HTMLButtonElement>('[data-showcode]')!.onclick = () => redraw(!show);
  root.querySelector<HTMLButtonElement>('[data-copycode]')!.onclick = async () => {
    try {
      await navigator.clipboard.writeText(getToken());
      msg('Copied. Paste it on the other computer when it asks your name.');
    } catch {
      redraw(true);
      msg("Couldn't copy by itself: select the code and copy it.");
    }
  };
  root.querySelector<HTMLButtonElement>('[data-rename]')!.onclick = async () => {
    const v = root.querySelector<HTMLInputElement>('.oname')!.value.trim();
    if (!v || v === account!.name) return;
    const r = await rename(v);
    if (r === 'taken') return msg('Somebody already has that name.');
    if (r) return msg("That name won't work.");
    account!.name = v;
    msg('Done. Others see the new name from their next visit.');
  };
}
