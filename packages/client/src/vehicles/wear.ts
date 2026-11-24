// Car wear and the tow truck (money sinks, Nov 24). Crashes wear your car (vehicles.ts Cart.wear: less pull, a lower
// top speed, backfires, then smoke); the wear is saved per car and Wrench & Ride fixes it for a price. Drive a car into
// a pond on the course and the tow truck takes it to the impound lot: pay the fee at Wrench & Ride to get it back.
import { progress, setCarWear, impoundCar } from '../avatar/progress';
import { CAR, type Vehicle } from './vehicles';
import { money } from '../ui/dom';

const carId = (v: Vehicle) => (v.kind.startsWith('car:') ? v.kind.split(':')[1] : '');
/** A repair costs 40% of the car's price at full wear (never under $250). */
export const repairPrice = (id: string, wear: number) => Math.max(250, Math.round(((CAR.get(id)?.price ?? 5000) * 0.4 * wear) / 100 / 10) * 10);
/** Getting it back from the impound lot: a quarter of its price, never under $750. */
export const impoundFee = (id: string) => Math.max(750, Math.round(((CAR.get(id)?.price ?? 5000) * 0.25) / 50) * 50);

/** Give your own car its saved wear, and save new wear as it crashes (with a word when it gets bad). */
export function hookWear(v: Vehicle, toast: (h: string, ms?: number) => void) {
  const id = carId(v);
  if (!id) return;
  v.wear = (progress().carWear[id] || 0) / 100;
  let saveT: ReturnType<typeof setTimeout> | null = null,
    said = v.wear;
  v.onCrash = () => {
    const w = v.wear ?? 0;
    if (saveT) clearTimeout(saveT);
    saveT = setTimeout(() => void setCarWear(id, w * 100), 800);
    if (w > 0.3 && said <= 0.3) toast(`Crunch. Your ${v.name.toLowerCase()} is down on power. Wrench & Ride can fix it.`, 3000);
    else if (w > 0.6 && said <= 0.6) toast(`Your ${v.name.toLowerCase()} is smoking. It needs Wrench & Ride.`, 3000);
    said = w;
  };
}
/** The car went into the water: towed. Returns the toast to show. */
export async function towIt(v: Vehicle) {
  const id = carId(v);
  if (!id) return '';
  const fee = impoundFee(id);
  await impoundCar(id, fee);
  return `🚚 Splash! The tow truck has taken your ${esc(v.name.toLowerCase())} to the impound lot. ${money(fee)} at Wrench & Ride gets it back.`;
}
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
