# ヘルパゴス アセット生成プロンプト集

アートディレクション = **手描き水彩 × インク（航海日誌 / 古地図風）**。
生成AI（画像）に貼り付けて使う。**各カテゴリは同一スタイルで一括生成**すると一貫性が出ます。

---

## 0. 共通スタイル（毎回これを末尾に付ける）

```
STYLE: hand-drawn watercolor with fine ink linework, weathered nautical journal / antique
sea-chart aesthetic. Warm dusk palette — teal and deep ocean blue, sandy beige, sunset amber
and burnt orange. Soft paper grain, loose washes, delicate ink outlines, gentle hand-painted
shading. Single centered subject, ~10% padding, isolated on a fully transparent background,
soft drop shadow only. No text, no letters, no border or frame, no card layout, no UI.
```

ネガティブ（対応ツールがあれば）: `text, words, watermark, border, frame, photo, 3d render, harsh outline, busy background, multiple objects`

技術仕様: **512×512 / PNG（透過）/ 被写体中央**。ファイル名は下の `key` のまま。配置先 `packages/client/public/cards/<key>.png`

---

## 1. カードアイコン（17種）— 最優先

各行 `key` → 被写体プロンプト。末尾に上の STYLE を必ず付ける。

| key | 日本語 | 被写体プロンプト（SUBJECT） |
|---|---|---|
| `water_bottle` | 水ボトル | a clear glass bottle filled with fresh clean water, cork stopper, a few sparkling highlights |
| `dirty_water` | 濁った水 | a glass jar of murky brown stagnant water with floating sediment, slightly slimy |
| `sandwich` | サンドイッチ | a simple stacked sandwich with lettuce and filling, rustic bread |
| `sardine_can` | イワシ缶 | an open tin can of oily sardines, lid peeled back and curled |
| `rotten_fish` | 腐った魚 | a rotting fish, dull grey-green flesh, a couple of flies, faint stink lines |
| `fruit_basket` | 果物籠 | a woven wicker basket overflowing with tropical fruit — banana, mango, coconut, berries |
| `serum` | 血清 | a small medical glass vial of amber antivenom serum with a syringe beside it |
| `voodoo` | 藁人形 | a small straw voodoo doll bound with twine, a couple of pins stuck in it |
| `sleeping_pills` | 睡眠薬 | a tipped-over medicine bottle with a few round white sleeping pills spilling out |
| `alarm_clock` | 目覚まし時計 | a vintage twin-bell wind-up alarm clock, brass, little legs |
| `canteen` | 水筒 | a dented military field canteen / flask with a canvas strap and screw cap |
| `fishing_rod` | 釣り竿 | a bamboo fishing rod with line, hook and a small red float |
| `axe` | 斧 | a worn wood-chopping hatchet, wooden handle, slightly rusty steel head |
| `crystal_ball` | 水晶玉 | a glowing crystal ball on a small ornate stand, swirling mist inside |
| `gun` | 拳銃 | an old worn revolver, weathered metal and wooden grip, side profile |
| `bullet` | 弾薬 | a single brass pistol cartridge / bullet, standing upright, soft metallic sheen |
| `junk` | がらくた | a small pile of useless junk — driftwood scraps, a bent spoon, a broken shell, rusty bolt |

> 揃わない場合は **このカテゴリだけでも体感が激変**します。まずここから。

---

## 2. 背景 & タイトル

配置先 `packages/client/public/bg/`

### `bg/scene.webp` — アプリ背景（最重要）
- 仕様: **2560×1440 / WebP か JPG**。**中央〜上部は情報量控えめ・やや暗め**（UIが乗るため）。
```
A desolate desert island at dusk seen across a calm teal ocean: a small sandy island with a
lone palm and a half-built wooden raft on the shore, distant storm clouds gathering on the
horizon, warm amber sunset light low on the left. Wide cinematic seascape, lots of open sky
and water in the upper-middle area (kept calm and a touch darker for UI overlay).
STYLE: hand-painted watercolor with ink linework, antique sea-chart aesthetic, warm dusk palette
(teal/deep blue/sandy beige/sunset amber), soft paper grain, atmospheric, no text, no frame.
```

### `bg/hero.png` — Home のタイトル挿絵
- 仕様: **1600×900 / PNG（下側を透過 or ソフトに）**。
```
A small castaway raft with a tattered sail drifting toward a distant island silhouette at sunset,
seabirds, gentle waves. Centered, simple, evocative.
STYLE: (same as above)
```

---

## 3. プレイヤーアバター（12〜16種 + CPU用）

配置先 `packages/client/public/avatars/`。仕様: **320×320 / PNG透過 / 統一フレーミング（胸から上・正面〜やや斜め）**。
名前プール（カイ/ナギ/ソラ/ハル/ミオ/レン/ツバサ/コハク/シノ/リク/アサヒ/ユウ…）に合わせて多様に。

共通テンプレ（`<差し替え>` を変える）:
```
Head-and-shoulders portrait of a shipwreck survivor: <a young woman with short dark hair / an
older bearded man with a bandana / a freckled teenager / ...>, weathered clothes, tired but
determined expression, simple flat background-less bust.
STYLE: hand-drawn watercolor with ink linework, warm dusk palette, consistent framing and scale,
isolated on transparent background, soft shadow, no text, no frame.
```
バリエーション指定例: 年齢・性別・髪型・肌の色・小物（眼鏡/帽子/傷/ヒゲ）を1人ずつ変える。**同一プロンプト＋差し替えのみ**で雰囲気を統一。

CPU用 `avatars/cpu.png`: `a faceless straw-and-driftwood survivor effigy / a roughly carved wooden figure`（人間と区別がつくよう少し無機質に）。

---

## 4. 天候・イベント演出

配置先 `packages/client/public/events/`。仕様: **512×512 / PNG透過**。

| key | 被写体 |
|---|---|
| `sun` | a warm glowing sun with soft rays over calm water |
| `rain` | slanting rain streaks and a small rain cloud |
| `storm` | a dark thundercloud with a lightning bolt |
| `hurricane` | a swirling hurricane spiral / cyclone over churning sea |
| `snake` | a coiled hissing snake striking, fangs bared (menacing) |
| `escape` | a small raft with a full sail catching wind, sailing away at sunset (hopeful) |
| `death` | a single weathered wooden grave cross on a beach / a drifting empty hat (somber, not gory) |

---

## 5. サウンド（音声生成ツール用）

配置先 `packages/client/public/sfx/`。仕様: **MP3 か OGG / モノ可 / ノーマライズ（-14 LUFS目安）**。効果音は2秒以内、環境音は15〜20秒の**シームレスループ**。

| key | 内容 |
|---|---|
| `draw.mp3` | 布袋から木の玉をジャラッと引く短い乾いた音 |
| `water.mp3` | 水をすくう/注ぐ短いスプラッシュ |
| `wood.mp3` | 斧で木を一回チョップする「コンッ」 |
| `snake.mp3` | 蛇の「シャーッ」という威嚇＋ビクッとする刺し音 |
| `gun.mp3` | 古い拳銃の乾いた銃声（重すぎない） |
| `vote.mp3` | 緊張感のある低い決定音/ドラムヒット |
| `escape.mp3` | 出航の短い高揚ファンファーレ |
| `win.mp3` / `lose.mp3` | 勝利の明るいスティンガー / 敗北の沈んだスティンガー |
| `ambience.mp3` | 波＋夕暮れの風のシームレスループ（15〜20秒） |

---

## 取り込みについて

`packages/client/public/<上記フォルダ>/<key>.<ext>` の規約で置いてもらえれば、こちら（Claude）で
カード・プレイヤー・背景・演出・音に機械的に差し込みます（絵文字はフォールバックとして残します）。
不足分は絵文字/CSSのままでも動くので、**揃ったものから順に**反映できます。
