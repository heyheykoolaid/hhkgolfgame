// Each player's colour (name tag, RV stripe, cart paint), from their account id — the same everywhere.
export const PALETTE = ['#2f7a4b', '#e2574c', '#3f8fd2', '#7a5bd0', '#e9b23a', '#2eaa8a', '#d94f8a', '#6b8f3a', '#c86a3e', '#4a6ad8'];
export const colorFor = (id: string) => {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
};
