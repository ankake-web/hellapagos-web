/** 全画面の背景：夕暮れの空・太陽・流れる波（CSS/SVGのみ・外部アセット無し）。 */
export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden>
      <div className="bd-sky" />
      <div className="bd-sun" />
      <div className="bd-glow" />
      <svg className="bd-waves" viewBox="0 0 1440 200" preserveAspectRatio="none">
        <path className="wv wv1" d={wave(40)} />
        <path className="wv wv2" d={wave(70)} />
        <path className="wv wv3" d={wave(105)} />
      </svg>
    </div>
  );
}

// 波長360pxの滑らかな波。translateXを-360pxループさせると継ぎ目なく流れる。
function wave(y: number): string {
  let d = `M0 ${y} `;
  for (let x = 0; x <= 1800; x += 360) d += `q90 -26 180 0 t180 0 `;
  d += `V200 H0 Z`;
  return d;
}
