// 既存の手描きSVGと同じ48px座標・配色。外部のカード画像は使わない。
const g = (s: string) =>
  `<g stroke="#16242c" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${s}</g>`;
const gold = '#e9be6b',
  cream = '#f1dfb4',
  blue = '#6fd0f5',
  wood = '#95613b';
export const EXTRA_ICON_SVG: Record<string, string> = {
  coffee: g(
    `<path d="M10 18h23v14a9 9 0 0 1-9 9h-5a9 9 0 0 1-9-9z" fill="${cream}"/><path d="M33 20h4a6 6 0 0 1 0 12h-4M9 43h28" fill="none"/><path d="M17 13q-5-5 0-10m8 10q-5-5 0-10" fill="none" stroke="${gold}"/>`,
  ),
  barometer: g(
    `<circle cx="24" cy="26" r="18" fill="${wood}"/><circle cx="24" cy="26" r="14" fill="${cream}"/><path d="M24 26 32 17M24 12v3M10 26h3M35 26h3M24 37v3" fill="none"/><circle cx="24" cy="26" r="3" fill="${gold}"/>`,
  ),
  wooden_plank: g(
    `<path d="m6 17 33-8 4 23-33 8z" fill="${wood}"/><path d="m13 20 17-4m-14 9 20-5m-18 11 13-4" fill="none" stroke="${cream}"/>`,
  ),
  food_mill: g(
    `<path d="M8 12h32l-9 13v11H17V25z" fill="${cream}"/><path d="M24 7v19m-9-19h18M13 40h22" fill="none"/><path d="M18 36h12v5H18z" fill="${gold}"/>`,
  ),
  pendulum: g(
    `<path d="M24 4v24" stroke="${gold}" stroke-width="3"/><path d="m24 27 9 9-9 10-9-10z" fill="${blue}"/><path d="M9 16q-5 10 0 18m30-18q5 10 0 18" fill="none" stroke="${gold}"/>`,
  ),
  flashlight: g(
    `<path d="m8 33 17-17 8 8-17 17z" fill="${wood}"/><path d="m22 14 7-7 12 12-7 7z" fill="${gold}"/><path d="m34 6 5-3m4 11 4-1M25 2l2 4" fill="none" stroke="${cream}"/>`,
  ),
  hollow_bullet: g(
    `<path d="M17 17q7-14 14 0v25H17z" fill="${gold}"/><ellipse cx="24" cy="15" rx="5" ry="3" fill="#16242c"/><path d="M17 34h14M17 38h14" fill="none"/>`,
  ),
  fish_tank: g(
    `<path d="M9 10h30v29H9z" fill="${blue}"/><path d="M9 18q7-4 15 0t15 0" fill="none"/><path d="m16 28 9-5 6 5-6 5z" fill="${gold}"/><path d="m30 28 5-4v8z" fill="${gold}"/>`,
  ),
  duck_float: g(
    `<ellipse cx="24" cy="32" rx="20" ry="11" fill="${gold}"/><ellipse cx="24" cy="32" rx="9" ry="4" fill="${blue}"/><path d="M11 31V17a8 8 0 0 1 16 0v11" fill="${gold}"/><path d="m11 17-8 4 8 3" fill="#dc8f48"/><circle cx="20" cy="16" r="1.6" fill="#16242c"/>`,
  ),
  wooden_crate: g(
    `<path d="M7 10h34v31H7z" fill="${wood}"/><path d="M11 14h26v23H11zm0 0 26 23m0-23L11 37" fill="none" stroke="${cream}"/>`,
  ),
  cat: g(
    `<path d="m12 18-1-11 11 6h4l11-6-1 11q8 21-12 23-20-2-12-23z" fill="${gold}"/><path d="M16 24h3m10 0h3m-10 8h4M24 29v3M13 29l-9-3m9 7-9 2m31-6 9-3m-9 7 9 2" fill="none"/>`,
  ),
  metal_detector: g(
    `<ellipse cx="14" cy="37" rx="11" ry="6" fill="${gold}"/><path d="m15 36 18-24h8m-14 8-8-6 6-7 9 6" fill="none" stroke="${cream}" stroke-width="4"/>`,
  ),
  whip: g(
    `<path d="M11 40 22 29" stroke="${wood}" stroke-width="7"/><path d="M22 29q-5-18 11-19t1 18q-14 5-7-9" fill="none" stroke="${gold}" stroke-width="3"/>`,
  ),
  shaman_kit: g(
    `<path d="M13 10h22l-3 26-8 8-8-8z" fill="${wood}"/><path d="m16 19 6 4-6 3m16-7-6 4 6 3M21 34h6" fill="none" stroke="${cream}"/><path d="M13 11 7 3m28 8 6-8M24 10V2" stroke="${gold}"/>`,
  ),
  diet_magazine: g(
    `<path d="m8 7 31-3 3 37-31 3z" fill="${cream}"/><path d="m13 14 19-2m-18 7 14-1m-12 20 20-2" fill="none"/><ellipse cx="25" cy="27" rx="7" ry="5" fill="#83a46a"/>`,
  ),
  instant_noodles: g(
    `<path d="M8 20h32l-6 23H14z" fill="${cream}"/><path d="M9 26h30v8H12z" fill="#b06a41"/><path d="M15 16q-5-7 0-12m9 12q-5-7 0-12m9 12q-5-7 0-12" fill="none" stroke="${gold}"/>`,
  ),
  whetstone: g(
    `<path d="m6 29 27-15 10 7-27 17z" fill="#9eb3b4"/><path d="M6 29v8l10 7 27-15v-8M16 38v6" fill="#698d92"/><path d="m12 18 4-9m7 4 7-8" stroke="${gold}"/>`,
  ),
  concave_plate: g(
    `<path d="M8 9q16 16 32 0v27q-16 17-32 0z" fill="#b7c2c4"/><path d="M16 13v22m16-22v22" stroke="#6d9195"/><path d="m18 26 10-7-1 6h10m-9-6 7 1" fill="none" stroke="#efb767" stroke-width="3"/>`,
  ),
  rum: g(
    `<path d="M19 4h10v12l7 7v20H12V23l7-7z" fill="${wood}"/><path d="M12 27h24v10H12z" fill="${cream}"/><path d="M18 7h12" stroke="${gold}" stroke-width="5"/>`,
  ),
  taser: g(
    `<path d="M8 16h31v12H26l-2 15H13l4-15H8z" fill="#87a2a7"/><path d="M12 16V7m23 9V7" stroke="${cream}" stroke-width="4"/><path d="m25 3-7 8h6l-3 7 10-10h-7z" fill="${gold}"/>`,
  ),
};
