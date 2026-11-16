// Three small helpers every panel uses.
/** The element with this id (it is there: the page's shell is fixed). */
export const $ = (id: string) => document.getElementById(id)!;
/** Text made safe to put inside HTML. */
export const esc = (t: string) => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** Cash as it is shown: $12,450 */
export const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
