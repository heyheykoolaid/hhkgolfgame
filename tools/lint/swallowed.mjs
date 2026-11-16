// Finds "// comments" that swallow code: a line comment in the middle of a long line whose text still looks like
// statements (the rest of that line never runs). Use /* */ mid-line, or put the comment at the end.
//   node tools/lint/swallowed.mjs            → lists suspects, exit 1 if any
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const roots = ['packages/client/src', 'packages/shared/src'];
const files = []; const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.ts$/.test(f)) files.push(p); } };
roots.forEach(walk);
/** Index of the first // that starts a line comment (outside strings, templates and regex-ish spots), or -1. */
function commentAt(line, st) {
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (st.tpl) { if (c === '\\') i++; else if (c === '`') st.tpl = false; continue; }
    if (st.block) { if (c === '*' && line[i + 1] === '/') { st.block = false; i++; } continue; }
    if (c === '"' || c === "'") { const q = c; i++; while (i < line.length && line[i] !== q) { if (line[i] === '\\') i++; i++; } continue; }
    if (c === '`') { st.tpl = true; continue; }
    if (c === '/' && line[i + 1] === '*') { st.block = true; i++; continue; }
    if (c === '/' && line[i + 1] === '/') { if (line[i - 1] === ':') continue; /* a URL */ return i; }
    if (c === '/' && /[(,=:[!&|?{};]\s*$/.test(line.slice(0, i))) { i++; while (i < line.length && line[i] !== '/') { if (line[i] === '\\') i++; if (line[i] === '[') { while (i < line.length && line[i] !== ']') i++; } i++; } continue; }   // a regex literal
  }
  return -1;
}
let bad = 0;
for (const f of files) {
  const st = { tpl: false, block: false };
  readFileSync(f, 'utf8').split('\n').forEach((line, n) => {
    const i = commentAt(line, st); if (i < 0) return;
    const before = line.slice(0, i).trim(), text = line.slice(i + 2);
    if (!before) return;                                   // a whole-line comment is fine
    // code-looking text inside the comment: "; name(" / "; name =" / "; name." / "} else" / "); }"
    if (/;\s*(const |let |if \(|for \(|return\b|[\w$.[\]]+\s*(=[^=]|\(|\.\w+\(|\+\+|--|[-+*/]=))|\}\s*else\b|\)\s*;\s*\}/.test(text)) { bad++; console.log(`${f}:${n + 1}: …// ${text.trim().slice(0, 150)}`); }
  });
}
console.log(bad ? `${bad} suspect line(s)` : 'no swallowed code found'); process.exit(bad ? 1 : 0);
