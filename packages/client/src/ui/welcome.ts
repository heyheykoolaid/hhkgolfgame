// The welcome card: shown once, the first time someone opens the game, so they know where things are and that the
// controls panel and the options menu exist. "Let's go" (or Enter / Esc) closes it for good.
const KEY = 'gh_welcomed';
export function showWelcome() {
  try {
    if (localStorage.getItem(KEY)) return;
  } catch {
    return;
  }
  const el = document.createElement('div');
  el.id = 'welcome';
  el.innerHTML = `<div class="wcard">
    <h2>Golden Hills</h2>
    <p>A golf course with a little town attached. Wander about, or head straight for a round.</p>
    <ul>
      <li><b>Play golf</b><span>Walk to the Tee Times board at the top of the plaza and press E.</span></li>
      <li><b>Your place</b><span>One of the RV lots is yours. Press B there to build on it.</span></li>
      <li><b>The plaza</b><span>Pro shop for clothes, the Birdie Ball machine, a blackjack table and a dealer.</span></li>
      <li><b>Controls</b><span>The panel on the right always shows what the keys do right now.</span></li>
      <li><b>Options</b><span>Press Esc, or the gear in the corner, for sound and picture settings.</span></li>
    </ul>
    <button>Let’s go</button>
  </div>`;
  document.body.appendChild(el);
  const close = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {}
    el.remove();
    removeEventListener('keydown', onKey, true);
  };
  const onKey = (e: KeyboardEvent) => {
    e.stopImmediatePropagation();
    if (e.code === 'Enter' || e.code === 'Escape' || e.code === 'Space') close();
  };
  addEventListener('keydown', onKey, true);
  el.querySelector('button')!.onclick = close;
}
