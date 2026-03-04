export function shortAddr(addr?: string) {
  if (!addr) return "";
  const s = String(addr);
  if (s.length <= 14) return s;
  return `${s.slice(0, 8)}…${s.slice(-6)}`;
}
