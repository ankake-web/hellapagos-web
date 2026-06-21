# ヘルパゴス アセット生成プロンプト集（画像生成AI用）

アートディレクション = **手描き水彩 × インク（航海日誌 / 古地図風）**。
各カテゴリは**同一スタイルで一括生成**すると一貫性が出ます。

## 仕組み（これだけ守れば自動で反映される）

生成したPNGを下記フォルダに **`<key>.png` という名前**で置くだけで、コード変更なしに反映されます。
ファイルが無いキーは自作SVG／絵文字に自動フォールバックするので、**揃ったものから順に**反映できます。

| 種類 | 置き場所 | 反映先 |
|---|---|---|
| カード・盤面アイコン・天気 | `packages/client/src/assets/cards/<key>.png` | `GameIcon`（手札・行動・資源トラック・アイテムモーダル・天気演出 ほか） |
| アプリ背景 | `packages/client/src/assets/bg/scene.webp`（または .png/.jpg） | 画面全体の背景 |
| ホームのタイトル挿絵 | `packages/client/src/assets/bg/hero.webp`（または .png/.jpg） | ホーム上部の挿絵 |

**反映手順**: ファイルを置く → `git add/commit/push`（main）→ GitHub Actions が自動ビルド＆Pages配信（約30秒）→ 反映。
（ローカル確認は `npm run dev` でも可。）

> ⚠️ `key` は下表の通り**正確に**。違う名前だと反映されません。

---

## 0. 共通スタイル（各プロンプトの末尾に必ず付ける）

```
STYLE: hand-drawn watercolor with fine ink linework, weathered nautical journal / antique
sea-chart aesthetic. Warm dusk palette — teal (#1d5a6e) and deep ocean blue (#0e3a47), sandy
beige (#ecdcae), sunset amber (#ffd479) and burnt orange (#ff9f43), weathered wood brown
(#8a5a34). Soft paper grain, loose washes, delicate ink outlines, gentle hand-painted shading.
Single centered subject, ~12% padding, bold readable silhouette that works small, isolated on a
fully transparent background, soft drop shadow only. No text, no letters, no border, no frame,
no card layout, no UI, no background scenery.
```

ネガティブ（対応ツールがあれば）:
`text, words, watermark, signature, border, frame, photo, 3d render, cgi, harsh black outline, busy background, multiple unrelated objects, drop shadow box`

技術仕様: **512×512 / PNG（透過）/ 被写体中央**。暗いガラス面の上に乗るので、**やや明るめ・彩度高め**に。

> 💡 一括生成のコツ: まず1枚で STYLE を固めてから、被写体だけ差し替えて連続生成すると統一感が出ます。

---

## 1. カードアイコン（17種）— 最優先（体感が最も変わる）

`key` → 被写体プロンプト（SUBJECT）。**末尾に §0 の STYLE を必ず付ける。**
置き場所: `packages/client/src/assets/cards/<key>.png`

| key | 日本語 | 被写体プロンプト（SUBJECT） |
|---|---|---|
| `water_bottle` | 水ボトル | a clear glass bottle filled with fresh clean water, cork stopper, a few sparkling highlights |
| `dirty_water` | 汚れた水 | a glass jar of murky brown-green stagnant water with floating sediment, slightly slimy, a fly |
| `sandwich` | サンドイッチ | a simple stacked triangular sandwich with green lettuce and filling, rustic bread |
| `sardine_can` | イワシ缶 | an open tin can of oily sardines, lid peeled back and curled, two little fish inside |
| `rotten_fish` | 腐った魚 | a spoiled fish skeleton / dull grey-green rotting fish, a couple of flies, faint stink lines |
| `fruit_basket` | フルーツ籠 | a woven wicker basket overflowing with tropical fruit — banana, mango, coconut, red berries |
| `serum` | 血清 | a medical syringe and a small glass vial of amber antivenom serum, tilted diagonally |
| `voodoo` | 藁人形 | a small straw / burlap voodoo doll bound with twine, one pin with a red head stuck in it |
| `sleeping_pills` | 睡眠薬 | a tipped-over medicine bottle with a few round white sleeping pills spilling out |
| `alarm_clock` | 目覚まし時計 | a vintage twin-bell wind-up brass alarm clock with little legs |
| `canteen` | 水筒 | a dented round military field canteen / flask with a canvas strap and a screw cap |
| `fishing_rod` | 釣り竿 | a bamboo fishing rod with line, hook and a small red-and-white float / bobber |
| `axe` | 斧 | a worn wood-chopping hatchet, wooden handle, slightly rusty steel head |
| `crystal_ball` | 水晶玉 | a glowing crystal ball on a small ornate wooden stand, swirling violet mist inside |
| `gun` | 拳銃 | an old worn revolver in side profile, weathered metal frame and a wooden grip |
| `bullet` | 弾薬 | a single brass pistol cartridge / bullet standing upright, soft metallic sheen |
| `junk` | がらくた | a small pile of useless junk — driftwood scraps, a bent spoon, a broken shell, a rusty bolt |

### 組み立て例（コピペ用・water_bottle）
```
a clear glass bottle filled with fresh clean water, cork stopper, a few sparkling highlights.
STYLE: hand-drawn watercolor with fine ink linework, weathered nautical journal / antique
sea-chart aesthetic. Warm dusk palette — teal (#1d5a6e) and deep ocean blue (#0e3a47), sandy
beige (#ecdcae), sunset amber (#ffd479) and burnt orange (#ff9f43), weathered wood brown
(#8a5a34). Soft paper grain, loose washes, delicate ink outlines, gentle hand-painted shading.
Single centered subject, ~12% padding, bold readable silhouette that works small, isolated on a
fully transparent background, soft drop shadow only. No text, no letters, no border, no frame,
no card layout, no UI, no background scenery.
```

---

## 2. 盤面グリフ（6種）— 任意（資源トラック・行動ボタンのアイコン）

小さく表示されるので**シンプル・大きめのシルエット**で。置き場所: `packages/client/src/assets/cards/<key>.png`

| key | 用途 | 被写体プロンプト（SUBJECT） |
|---|---|---|
| `fish` | 食料 / 釣り | a plump fresh fish in side profile, lively, teal-blue body with a lighter belly |
| `water` | 水 | a single clean water droplet, glossy, with a soft white highlight |
| `wood` | 木材 / 木集め | a short cut log / wooden plank with visible end-grain rings |
| `search` | 難破船 / 探索 | a small broken shipwreck hull on the shore, snapped mast (treasure-hunt feel) |
| `ship` | 船 / 脱出 | a sturdy little wooden boat with a single triangular sail (the escape boat) |
| `snake` | ヘビ（毒） | a coiled green snake with bared fangs, menacing but stylized |

---

## 3. 天気アイコン（4種）— 任意（ラウンド開始の大きな天気演出）

`88px` 程度で大きく出るので、**わかりやすく象徴的**に。置き場所: `packages/client/src/assets/cards/<key>.png`

| key | 天気 | 被写体プロンプト（SUBJECT） |
|---|---|---|
| `wx-sun` | 晴れ | a warm glowing sun with soft radiating rays |
| `wx-rain` | 雨 | a soft rain cloud with a few blue rain droplets falling |
| `wx-storm` | 嵐 | a dark thundercloud with a bright yellow lightning bolt and rain |
| `wx-hurricane` | ハリケーン | a swirling hurricane / cyclone spiral with an eye, ominous |

---

## 4. 背景・タイトル挿絵 — 第2優先（雰囲気が一気に上がる）

### `bg/scene.webp` — アプリ全体の背景（最重要）
- 仕様: **2560×1440 / WebP か JPG（透過不要）**。**中央〜上部は情報量を抑え・やや暗め**（UIが上に乗る）。
- 置き場所: `packages/client/src/assets/bg/scene.webp`
```
A desolate desert island at dusk seen across a calm teal ocean: a small sandy island with a lone
palm and a half-built wooden raft on the shore, distant dark storm clouds gathering on the left
horizon, warm amber sunset light low on the right. Wide cinematic seascape with lots of open sky
and calm water in the upper-middle area (kept calm and a touch darker so UI text stays readable).
STYLE: hand-painted watercolor with ink linework, antique sea-chart aesthetic, warm dusk palette
(teal #1d5a6e / deep blue #0e3a47 / sandy beige #ecdcae / sunset amber #ffd479 / burnt orange
#ff9f43), soft paper grain, atmospheric depth, quiet and a little ominous. No text, no frame, no UI.
```

### `bg/hero.webp` — ホームのタイトル挿絵
- 仕様: **約 1200×675（16:9）/ WebP か PNG**。横長。
- 置き場所: `packages/client/src/assets/bg/hero.webp`
```
A small desert island at dusk: a lone palm on a sandy mound and a half-built wooden raft on the
shore, a glowing amber sun low on the right over a calm teal sea, distant dark storm clouds with a
faint lightning hint gathering on the left. Evocative, calm but tense, cinematic 16:9 composition.
STYLE: same hand-painted watercolor / antique sea-chart aesthetic and warm dusk palette as above.
No text, no title lettering, no frame, no UI.
```

---

## 5. （任意・要追加対応）プレイヤーアバター / イベント挿絵

下記は**置くだけでは反映されません**（少しコード側のフックが必要）。やりたくなったら「アバター入れたい」と言ってください。1〜2行で組み込みます。生成だけ先に進めても構いません。

### プレイヤーアバター（`avatars/<id>.png`, 320×320 透過, 8〜16種）
名前プール（カイ/ナギ/ソラ/ハル/ミオ/レン/ツバサ/コハク/シノ/リク/アサヒ/ユウ…）に合わせ、**同一プロンプト＋差し替えのみ**で統一。
```
Head-and-shoulders portrait of a shipwreck survivor: <a young woman with short dark hair / an older
bearded man with a bandana / a freckled teenager / a stern woman with a sun hat / ...>, weathered
clothes, tired but determined expression, plain bust with no background.
STYLE: hand-drawn watercolor with ink linework, warm dusk palette, consistent framing and scale,
isolated on transparent background, soft shadow. No text, no frame.
```
CPU用 `cpu.png`: `a faceless straw-and-driftwood survivor effigy, roughly carved`（人間と区別がつくよう無機質に）。

### イベント挿絵（`death` / `escape` など）
| 想定key | 被写体 |
|---|---|
| `ev-death` | a single weathered wooden grave cross on a beach / a drifting empty hat（湿っぽいが残酷でない） |
| `ev-escape` | a small raft with a full sail catching wind, sailing away at sunset（希望的） |

---

## 6. （参考）サウンド生成プロンプト

現状BGM・効果音は**コードで合成**しているため必須ではありませんが、実音源に差し替えたい場合の指針:
- 効果音: 2秒以内・モノ可・-14 LUFS目安。`draw`(布袋から木の玉)/`water`(掬う)/`wood`(斧チョップ)/`snake`(威嚇シャーッ)/`gun`(古い銃声)/`vote`(緊張の決定音)/`escape`(出航ファンファーレ)/`win`/`lose`。
- 環境音/BGM: 波＋夕暮れの風の **15〜20秒シームレスループ**。
（差し替えには別途フックが要るので、欲しくなったら声をかけてください。）

---

## 優先順位の目安

1. **§1 カードアイコン17種** … 最も触れる要素。ここだけで体感が激変。
2. **§4 背景 scene** … 画面全体の質感が一気に上がる。
3. **§4 hero / §3 天気 / §2 グリフ** … 仕上げの統一感。
4. **§5 アバター / イベント** … さらに作り込むなら（要フック）。
