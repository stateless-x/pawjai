// Neutral "art coming soon" image: a soft paw on a transparent square.
// Written at an asset's final path so real art can replace it later with no
// code change (owner decision 2026-10-03).
export function placeholderSvg(size: number): Buffer {
  const s = size;
  const c = "#CFC6B8";
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 100 100">
  <rect x="6" y="6" width="88" height="88" rx="22" fill="#F4EFE7"/>
  <ellipse cx="50" cy="62" rx="16" ry="13" fill="${c}"/>
  <ellipse cx="31" cy="44" rx="6.5" ry="8.5" fill="${c}"/>
  <ellipse cx="43" cy="34" rx="6.5" ry="8.5" fill="${c}"/>
  <ellipse cx="57" cy="34" rx="6.5" ry="8.5" fill="${c}"/>
  <ellipse cx="69" cy="44" rx="6.5" ry="8.5" fill="${c}"/>
</svg>`);
}
