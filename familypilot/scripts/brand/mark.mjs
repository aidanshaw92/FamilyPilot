// The approved E3 mark as SVG, from the Figma Brand / Mark geometry (120 grid): a leader on its
// point (soft square, three corners r25, forward corner r11, rotated 45° about (73,60), size 54) and
// two followers (r18 at (40,38), r15 at (42,84)) cut by the leader grown by a kerf. Corner
// smoothing has no SVG equivalent; the radii carry the softness.
export const GRID = 120;
function roundedSquarePath(size, rBig, rPoint) {
  // Local coordinates 0..size, corners: TL, TR, BR (point), BL.
  const s = size, b = rBig, p = rPoint;
  return [
    `M ${b} 0`, `L ${s - b} 0`, `A ${b} ${b} 0 0 1 ${s} ${b}`,
    `L ${s} ${s - p}`, `A ${p} ${p} 0 0 1 ${s - p} ${s}`,
    `L ${b} ${s}`, `A ${b} ${b} 0 0 1 0 ${s - b}`,
    `L 0 ${b}`, `A ${b} ${b} 0 0 1 ${b} 0`, 'Z',
  ].join(' ');
}
export function markSvg({ size = 120, leader = '#0F4A3E', follower = '#3F9A82', background = null, kerf = 3, padding = 0, radius = 0 }) {
  const k = (size - padding * 2) / GRID;
  const c = Math.SQRT1_2;
  const sq = (grow) => {
    const s = 54 + grow * 2;
    const cx = 73, cy = 60;
    // rotate 45° about the square's centre, placed at (cx, cy)
    return `<path d="${roundedSquarePath(s, 25 + grow, 11 + grow)}" transform="translate(${cx} ${cy}) rotate(45) translate(${-s / 2} ${-s / 2})"/>`;
  };
  const id = Math.random().toString(36).slice(2, 8);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
${background ? `<rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${background}"/>` : ''}
<g transform="translate(${padding} ${padding}) scale(${k})">
  <defs>
    <mask id="cut-${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${GRID}" height="${GRID}">
      <rect width="${GRID}" height="${GRID}" fill="white"/>
      <g fill="black">${sq(kerf / k > 3 ? kerf / k : 3)}</g>
    </mask>
  </defs>
  <g fill="${follower}" mask="url(#cut-${id})">
    <circle cx="40" cy="38" r="18"/>
    <circle cx="42" cy="84" r="15"/>
  </g>
  <g fill="${leader}">${sq(0)}</g>
</g>
</svg>`;
}
