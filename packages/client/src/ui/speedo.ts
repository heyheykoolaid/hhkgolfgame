// The dash read-out while you drive: speed, and for cars the gear and a rev bar that reddens toward the limiter.
let el: HTMLDivElement | null = null,
  shown = false;
const GEARS = ['R', '1', '2', '3', '4', '5', '6'];
interface Drivable {
  speed(): number;
  engine?(): { rpm: number; gear: number; load: number; tone: number } | null;
}
function make() {
  el = document.createElement('div');
  el.id = 'speedo';
  el.style.cssText =
    'position:fixed;left:50%;transform:translateX(-50%);bottom:16px;z-index:6;display:none;align-items:flex-end;gap:10px;padding:10px 14px;border-radius:14px;' +
    'background:rgba(22,16,10,.72);border:1px solid rgba(255,236,200,.16);color:#f6ead0;font-family:Inter,system-ui,sans-serif;pointer-events:none;backdrop-filter:blur(6px)';
  el.innerHTML =
    '<div style="text-align:right;line-height:1"><b id="spd-n" style="font:900 34px/1 Inter,system-ui,sans-serif;font-variant-numeric:tabular-nums">0</b>' +
    '<div style="font-size:10px;letter-spacing:.14em;opacity:.7;margin-top:3px">MPH</div></div>' +
    '<div id="spd-eng" style="display:flex;flex-direction:column;gap:5px;align-items:flex-start">' +
    '<b id="spd-g" style="font:900 20px/1 Inter,system-ui,sans-serif;color:#ffd27a;min-width:14px">1</b>' +
    '<div style="width:92px;height:7px;border-radius:4px;background:rgba(255,255,255,.12);overflow:hidden"><i id="spd-r" style="display:block;height:100%;width:10%;background:#ffd27a"></i></div></div>';
  document.body.appendChild(el);
}
/** Call every frame: the vehicle being driven, or null to hide the read-out. */
export function speedo(v: Drivable | null) {
  if (!v) {
    if (shown && el) el.style.display = 'none';
    shown = false;
    return;
  }
  if (!el) make();
  if (!shown) el!.style.display = 'flex';
  shown = true;
  const e = v.engine?.() || null;
  (el!.querySelector('#spd-n') as HTMLElement).textContent = String(Math.round(Math.abs(v.speed()) * 2.237));
  const eng = el!.querySelector('#spd-eng') as HTMLElement;
  eng.style.display = e ? 'flex' : 'none';
  if (e) {
    (el!.querySelector('#spd-g') as HTMLElement).textContent = GEARS[e.gear] || '1';
    const bar = el!.querySelector('#spd-r') as HTMLElement,
      k = Math.min(1, e.rpm / 8000);
    bar.style.width = Math.round(k * 100) + '%';
    bar.style.background = k > 0.85 ? '#ff5a4a' : k > 0.7 ? '#ff9a3a' : '#ffd27a';
  }
}
