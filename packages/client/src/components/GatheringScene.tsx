import { useEffect, useRef, type CSSProperties } from 'react';
import { drawTiming, type PublicGameState } from '@hellapagos/shared';
import type { DrawBalls, Gathering } from '../game/gatheringPlayback.js';
import { GameIcon } from '../assets/icons.js';
import { playSound } from '../sound.js';
import './gathering.css';

const place = { fish: '波打ち際の釣り', water: '浜辺の水くみ', wood: '森の木集め' };

function BallFace({ ball, fishing }: { ball: DrawBalls[number]; fishing: boolean }) {
  const black = 'snake' in ball;
  const fish = 'fish' in ball ? ball.fish : 3;
  const label = fishing ? `${black ? '黒' : '白'}玉、魚${fish}匹` : black ? '黒玉、ヘビ' : '白玉、木材';
  return (
    <span className={`gather-ball ${black ? 'ebony' : 'ivory'}`} role="img" aria-label={label}>
      <GameIcon name={fishing ? 'fish' : black ? 'snake' : 'wood'} size={26} />
      {fishing && <b>{fish}</b>}
    </span>
  );
}

function DrawTray({ g }: { g: Gathering }) {
  return (
    <>
      <div className="gather-pouch" aria-hidden="true">
        <i />
        <GameIcon name={g.action} size={29} />
      </div>
      <div className="gather-sockets">
        {g.balls.map((ball, i) => (
          <span className="gather-socket" key={i}>
            {i < g.revealed ? (
              <BallFace ball={ball} fishing={g.action === 'fish'} />
            ) : (
              <span aria-label="未公開の玉">·</span>
            )}
          </span>
        ))}
      </div>
    </>
  );
}

function RainCup({ amount, precip }: { amount: number; precip: number }) {
  return (
    <div className="gather-waterware" aria-hidden="true">
      <div className="gather-weather-card">
        <GameIcon name={precip >= 3 ? 'wx-storm' : precip ? 'wx-rain' : 'wx-sun'} size={44} />
      </div>
      <div className={`gather-cup-scene ${amount ? 'wet' : ''}`}>
        {amount > 0 && (
          <span className="gather-drops">
            <i />
            <i />
            <i />
          </span>
        )}
        <div className="gather-cup">
          <div className="gather-liquid" style={{ '--fill': (amount / 6) * 78 + '%' } as CSSProperties} />
        </div>
      </div>
    </div>
  );
}

function Timber({ count }: { count: number }) {
  return (
    <div className="gather-timber" aria-label={`確保した木${count}本`}>
      {Array.from({ length: count }, (_, i) => (
        <span className="gather-log" key={i} />
      ))}
    </div>
  );
}

export function GatheringScene({ view, g, onReveal }: { view: PublicGameState; g: Gathering; onReveal: () => void }) {
  const actor = view.players.find((p) => p.id === g.playerId);
  const done = g.settled;
  const landing = !done && g.revealed === g.steps;
  const bag = g.balls.length > 0;
  const bite = g.action === 'wood' && g.balls.slice(0, g.revealed).some((ball) => 'snake' in ball);
  const base = actor?.permanents.includes('axe') ? 2 : 1;
  const canteen = actor?.permanents.includes('canteen');
  const amount = view.currentPrecip * (canteen ? 2 : 1);
  const soundAt = useRef(done ? g.revealed : -1);
  useEffect(() => {
    if (soundAt.current === g.revealed) return;
    soundAt.current = g.revealed;
    if (g.revealed === 0) {
      if (bag) playSound('rattle');
      else if (g.action === 'water' && amount > 0) playSound('pour');
    } else if (bag) {
      const ball = g.balls[g.revealed - 1];
      playSound(g.action === 'wood' && 'snake' in ball ? 'snake' : 'token');
    }
    else if (g.action === 'wood') playSound('timber');
    else if (amount > 0) playSound('water');
  }, [g.revealed, g.action, g.balls, bag, amount]);
  let title, detail;
  if (done) {
    title = view.tableMoment?.title;
    detail = view.tableMoment?.detail;
  } else if (g.action === 'fish') {
    title = g.revealed ? 'もうひと玉、何匹かな？' : '竿がしなる。何匹かな？';
    detail = g.steps === 2 ? '釣り竿で2玉。出た魚を合わせる。' : '袋から1玉。黒玉なら魚は3匹。';
  } else if (g.action === 'water') {
    title = amount ? '器に雨がたまっていく…' : '空を見上げる…';
    detail = `降水量 ${view.currentPrecip}${canteen ? ' × 水筒で2倍' : ''}`;
  } else if (bag) {
    title = bite ? '黒玉だ…！' : '森の奥へ。ヘビはいる？';
    detail = `入口で${base}本確保。奥であと${g.steps}本に挑戦。`;
  } else {
    title = '流木をいかだへ運ぶ…';
    detail = `森の入口で${base}本確保。`;
  }
  if (landing) title = '玉が卓に転がる…';
  return (
    <div
      className={`gather gather-${g.action} ${done ? 'settled' : landing ? 'landing' : 'drawing'} ${bite ? 'bitten' : ''}`}
      style={{ '--gather-first': drawTiming(view.config.speed).first + 'ms' } as CSSProperties}
    >
      <div className="gather-caption">
        <div className="theater-kicker">
          <strong>{actor?.name}</strong>
          <span>{place[g.action]}</span>
        </div>
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
      <div className="gather-mat" data-gather-source>
        <div className="gather-pieces">
          {bag ? (
            <DrawTray g={g} />
          ) : g.action === 'water' ? (
            <RainCup amount={amount} precip={view.currentPrecip} />
          ) : (
            <Timber count={base} />
          )}
        </div>
        {bag && (
          <div className="gather-mat-foot">
            <span>
              {g.revealed} / {g.steps} 玉
            </span>
            {actor?.isYou && g.revealed < g.steps && (
              <button className="gather-draw" type="button" onClick={onReveal}>
                {g.revealed ? '次の玉を出す' : '玉を出す'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
