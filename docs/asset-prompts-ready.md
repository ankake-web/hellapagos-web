# ヘルパゴス 画像生成プロンプト（貼るだけ・1ブロック=1枚）

各コードブロックを**そのまま画像生成AIに貼って1枚ずつ**生成してください。SUBJECTとSTYLEは結合済みです。
見出しの「保存名」どおりにリネームし、指定フォルダに置けば反映されます（無いものは自作SVGにフォールバック）。

- **カード/グリフ/天気** → `packages/client/src/assets/cards/<保存名>` ／ **透過PNG必須・512×512**
- **背景 scene / ヒーロー hero** → `packages/client/src/assets/bg/<保存名>` ／ **透過不要・横長(16:9)**
- 反映: ファイルを置く → `git push`（main）→ 自動配信（約30秒）。

> 💡 効率化: 最初に下の「スタイル固定メッセージ」を1回送り、以降は各ブロック上部の **SUBJECT 行だけ**を送ってもOK。
> ⚠️ 透過が苦手なモデルでは背景が残ります。その場合は後処理（remove.bg等）で透過してください。背景/ヒーローは透過不要。

<details><summary>（任意）最初に1回送る「スタイル固定メッセージ」</summary>

```
これから「SUBJECT:」で被写体を1つずつ渡します。毎回その被写体だけを、次の固定スタイルで描いてください。
出力は 512×512・背景は完全に透明・中央に被写体1個のみ・文字や枠は無し。
STYLE: hand-drawn watercolor with fine ink linework, weathered nautical journal / antique sea-chart aesthetic. Warm dusk palette — teal (#1d5a6e), deep ocean blue (#0e3a47), sandy beige (#ecdcae), sunset amber (#ffd479), burnt orange (#ff9f43), weathered wood brown (#8a5a34). Soft paper grain, loose washes, delicate ink outlines, gentle hand-painted shading. Bold readable silhouette that works small, slightly bright/saturated so it reads on a dark teal UI. Soft drop shadow only.
```
</details>

---

# 1. カードアイコン（17種・最優先）　→ `src/assets/cards/`

### 保存名: `water_bottle.png`
```
SUBJECT: a clear glass bottle filled with fresh clean water, cork stopper, a few sparkling highlights.
STYLE: hand-drawn watercolor with fine ink linework, weathered nautical journal / antique sea-chart aesthetic. Warm dusk palette — teal (#1d5a6e), deep ocean blue (#0e3a47), sandy beige (#ecdcae), sunset amber (#ffd479), burnt orange (#ff9f43), weathered wood brown (#8a5a34). Soft paper grain, loose washes, delicate ink outlines, gentle hand-painted shading. Single centered subject, ~12% padding, bold readable silhouette that works small, slightly bright and saturated so it reads on a dark teal UI. Isolated on a fully transparent background, soft drop shadow only. Square 512x512. No text, no border, no frame, no UI, no background scenery.
```

### 保存名: `dirty_water.png`
```
SUBJECT: a glass jar of murky brown-green stagnant water with floating sediment, slightly slimy, one fly.
STYLE: hand-drawn watercolor with fine ink linework, weathered nautical journal / antique sea-chart aesthetic. Warm dusk palette — teal (#1d5a6e), deep ocean blue (#0e3a47), sandy beige (#ecdcae), sunset amber (#ffd479), burnt orange (#ff9f43), weathered wood brown (#8a5a34). Soft paper grain, loose washes, delicate ink outlines, gentle hand-painted shading. Single centered subject, ~12% padding, bold readable silhouette that works small, slightly bright and saturated so it reads on a dark teal UI. Isolated on a fully transparent background, soft drop shadow only. Square 512x512. No text, no border, no frame, no UI, no background scenery.
```

### 保存名: `sandwich.png`
```
SUBJECT: a simple stacked triangular sandwich with green lettuce and filling, rustic bread.
STYLE: hand-drawn watercolor with fine ink linework, weathered nautical journal / antique sea-chart aesthetic. Warm dusk palette — teal (#1d5a6e), deep ocean blue (#0e3a47), sandy beige (#ecdcae), sunset amber (#ffd479), burnt orange (#ff9f43), weathered wood brown (#8a5a34). Soft paper grain, loose washes, delicate ink outlines, gentle hand-painted shading. Single centered subject, ~12% padding, bold readable silhouette that works small, slightly bright and saturated so it reads on a dark teal UI. Isolated on a fully transparent background, soft drop shadow only. Square 512x512. No text, no border, no frame, no UI, no background scenery.
```

### 保存名: `sardine_can.png`
```
SUBJECT: an open tin can of oily sardines, lid peeled back and curled, two little fish inside.
STYLE: hand-drawn watercolor with fine ink linework, weathered nautical journal / antique sea-chart aesthetic. Warm dusk palette — teal (#1d5a6e), deep ocean blue (#0e3a47), sandy beige (#ecdcae), sunset amber (#ffd479), burnt orange (#ff9f43), weathered wood brown (#8a5a34). Soft paper grain, loose washes, delicate ink outlines, gentle hand-painted shading. Single centered subject, ~12% padding, bold readable silhouette that works small, slightly bright and saturated so it reads on a dark teal UI. Isolated on a fully transparent background, soft drop shadow only. Square 512x512. No text, no border, no frame, no UI, no background scenery.
```

### 保存名: `rotten_fish.png`
```
SUBJECT: a spoiled grey-green rotting fish (or fish skeleton), a couple of flies, faint stink lines.
STYLE: hand-drawn watercolor with fine ink linework, weathered nautical journal / antique sea-chart aesthetic. Warm dusk palette — teal (#1d5a6e), deep ocean blue (#0e3a47), sandy beige (#ecdcae), sunset amber (#ffd479), burnt orange (#ff9f43), weathered wood brown (#8a5a34). Soft paper grain, loose washes, delicate ink outlines, gentle hand-painted shading. Single centered subject, ~12% padding, bold readable silhouette that works small, slightly bright and saturated so it reads on a dark teal UI. Isolated on a fully transparent background, soft drop shadow only. Square 512x512. No text, no border, no frame, no UI, no background scenery.
```

### 保存名: `fruit_basket.png`
```
SUBJECT: a woven wicker basket overflowing with tropical fruit — banana, mango, coconut, red berries.
STYLE: hand-drawn watercolor with fine ink linework, weathered nautical journal / antique sea-chart aesthetic. Warm dusk palette — teal (#1d5a6e), deep ocean blue (#0e3a47), sandy beige (#ecdcae), sunset amber (#ffd479), burnt orange (#ff9f43), weathered wood brown (#8a5a34). Soft paper grain, loose washes, delicate ink outlines, gentle hand-painted shading. Single centered subject, ~12% padding, bold readable silhouette that works small, slightly bright and saturated so it reads on a dark teal UI. Isolated on a fully transparent background, soft drop shadow only. Square 512x512. No text, no border, no frame, no UI, no background scenery.
```

### 保存名: `serum.png`
```
SUBJECT: a medical syringe and a small glass vial of amber antivenom serum, tilted diagonally.
STYLE: hand-drawn watercolor with fine ink linework, weathered nautical journal / antique sea-chart aesthetic. Warm dusk palette — teal (#1d5a6e), deep ocean blue (#0e3a47), sandy beige (#ecdcae), sunset amber (#ffd479), burnt orange (#ff9f43), weathered wood brown (#8a5a34). Soft paper grain, loose washes, delicate ink outlines, gentle hand-painted shading. Single centered subject, ~12% padding, bold readable silhouette that works small, slightly bright and saturated so it reads on a dark teal UI. Isolated on a fully transparent background, soft drop shadow only. Square 512x512. No text, no border, no frame, no UI, no background scenery.
```

### 保存名: `voodoo.png`
```
SUBJECT: a small straw / burlap voodoo doll bound with twine, one pin with a red head stuck in it.
STYLE: hand-drawn watercolor with fine ink linework, weathered nautical journal / antique sea-chart aesthetic. Warm dusk palette — teal (#1d5a6e), deep ocean blue (#0e3a47), sandy beige (#ecdcae), sunset amber (#ffd479), burnt orange (#ff9f43), weathered wood brown (#8a5a34). Soft paper grain, loose washes, delicate ink outlines, gentle hand-painted shading. Single centered subject, ~12% padding, bold readable silhouette that works small, slightly bright and saturated so it reads on a dark teal UI. Isolated on a fully transparent background, soft drop shadow only. Square 512x512. No text, no border, no frame, no UI, no background scenery.
```

### 保存名: `sleeping_pills.png`
```
SUBJECT: a tipped-over medicine bottle with a few round white sleeping pills spilling out.
STYLE: hand-drawn watercolor with fine ink linework, weathered nautical journal / antique sea-chart aesthetic. Warm dusk palette — teal (#1d5a6e), deep ocean blue (#0e3a47), sandy beige (#ecdcae), sunset amber (#ffd479), burnt orange (#ff9f43), weathered wood brown (#8a5a34). Soft paper grain, loose washes, delicate ink outlines, gentle hand-painted shading. Single centered subject, ~12% padding, bold readable silhouette that works small, slightly bright and saturated so it reads on a dark teal UI. Isolated on a fully transparent background, soft drop shadow only. Square 512x512. No text, no border, no frame, no UI, no background scenery.
```

### 保存名: `alarm_clock.png`
```
SUBJECT: a vintage twin-bell wind-up brass alarm clock with little legs.
STYLE: hand-drawn watercolor with fine ink linework, weathered nautical journal / antique sea-chart aesthetic. Warm dusk palette — teal (#1d5a6e), deep ocean blue (#0e3a47), sandy beige (#ecdcae), sunset amber (#ffd479), burnt orange (#ff9f43), weathered wood brown (#8a5a34). Soft paper grain, loose washes, delicate ink outlines, gentle hand-painted shading. Single centered subject, ~12% padding, bold readable silhouette that works small, slightly bright and saturated so it reads on a dark teal UI. Isolated on a fully transparent background, soft drop shadow only. Square 512x512. No text, no border, no frame, no UI, no background scenery.
```

### 保存名: `canteen.png`
```
SUBJECT: a dented round military field canteen / flask with a canvas strap and a screw cap.
STYLE: hand-drawn watercolor with fine ink linework, weathered nautical journal / antique sea-chart aesthetic. Warm dusk palette — teal (#1d5a6e), deep ocean blue (#0e3a47), sandy beige (#ecdcae), sunset amber (#ffd479), burnt orange (#ff9f43), weathered wood brown (#8a5a34). Soft paper grain, loose washes, delicate ink outlines, gentle hand-painted shading. Single centered subject, ~12% padding, bold readable silhouette that works small, slightly bright and saturated so it reads on a dark teal UI. Isolated on a fully transparent background, soft drop shadow only. Square 512x512. No text, no border, no frame, no UI, no background scenery.
```

### 保存名: `fishing_rod.png`
```
SUBJECT: a bamboo fishing rod with line, hook and a small red-and-white float / bobber.
STYLE: hand-drawn watercolor with fine ink linework, weathered nautical journal / antique sea-chart aesthetic. Warm dusk palette — teal (#1d5a6e), deep ocean blue (#0e3a47), sandy beige (#ecdcae), sunset amber (#ffd479), burnt orange (#ff9f43), weathered wood brown (#8a5a34). Soft paper grain, loose washes, delicate ink outlines, gentle hand-painted shading. Single centered subject, ~12% padding, bold readable silhouette that works small, slightly bright and saturated so it reads on a dark teal UI. Isolated on a fully transparent background, soft drop shadow only. Square 512x512. No text, no border, no frame, no UI, no background scenery.
```

### 保存名: `axe.png`
```
SUBJECT: a worn wood-chopping hatchet, wooden handle, slightly rusty steel head.
STYLE: hand-drawn watercolor with fine ink linework, weathered nautical journal / antique sea-chart aesthetic. Warm dusk palette — teal (#1d5a6e), deep ocean blue (#0e3a47), sandy beige (#ecdcae), sunset amber (#ffd479), burnt orange (#ff9f43), weathered wood brown (#8a5a34). Soft paper grain, loose washes, delicate ink outlines, gentle hand-painted shading. Single centered subject, ~12% padding, bold readable silhouette that works small, slightly bright and saturated so it reads on a dark teal UI. Isolated on a fully transparent background, soft drop shadow only. Square 512x512. No text, no border, no frame, no UI, no background scenery.
```

### 保存名: `crystal_ball.png`
```
SUBJECT: a glowing crystal ball on a small ornate wooden stand, swirling violet mist inside.
STYLE: hand-drawn watercolor with fine ink linework, weathered nautical journal / antique sea-chart aesthetic. Warm dusk palette — teal (#1d5a6e), deep ocean blue (#0e3a47), sandy beige (#ecdcae), sunset amber (#ffd479), burnt orange (#ff9f43), weathered wood brown (#8a5a34). Soft paper grain, loose washes, delicate ink outlines, gentle hand-painted shading. Single centered subject, ~12% padding, bold readable silhouette that works small, slightly bright and saturated so it reads on a dark teal UI. Isolated on a fully transparent background, soft drop shadow only. Square 512x512. No text, no border, no frame, no UI, no background scenery.
```

### 保存名: `gun.png`
```
SUBJECT: an old worn revolver in side profile, weathered metal frame and a wooden grip.
STYLE: hand-drawn watercolor with fine ink linework, weathered nautical journal / antique sea-chart aesthetic. Warm dusk palette — teal (#1d5a6e), deep ocean blue (#0e3a47), sandy beige (#ecdcae), sunset amber (#ffd479), burnt orange (#ff9f43), weathered wood brown (#8a5a34). Soft paper grain, loose washes, delicate ink outlines, gentle hand-painted shading. Single centered subject, ~12% padding, bold readable silhouette that works small, slightly bright and saturated so it reads on a dark teal UI. Isolated on a fully transparent background, soft drop shadow only. Square 512x512. No text, no border, no frame, no UI, no background scenery.
```

### 保存名: `bullet.png`
```
SUBJECT: a single brass pistol cartridge / bullet standing upright, soft metallic sheen.
STYLE: hand-drawn watercolor with fine ink linework, weathered nautical journal / antique sea-chart aesthetic. Warm dusk palette — teal (#1d5a6e), deep ocean blue (#0e3a47), sandy beige (#ecdcae), sunset amber (#ffd479), burnt orange (#ff9f43), weathered wood brown (#8a5a34). Soft paper grain, loose washes, delicate ink outlines, gentle hand-painted shading. Single centered subject, ~12% padding, bold readable silhouette that works small, slightly bright and saturated so it reads on a dark teal UI. Isolated on a fully transparent background, soft drop shadow only. Square 512x512. No text, no border, no frame, no UI, no background scenery.
```

### 保存名: `junk.png`
```
SUBJECT: a small pile of useless junk — driftwood scraps, a bent spoon, a broken shell, a rusty bolt.
STYLE: hand-drawn watercolor with fine ink linework, weathered nautical journal / antique sea-chart aesthetic. Warm dusk palette — teal (#1d5a6e), deep ocean blue (#0e3a47), sandy beige (#ecdcae), sunset amber (#ffd479), burnt orange (#ff9f43), weathered wood brown (#8a5a34). Soft paper grain, loose washes, delicate ink outlines, gentle hand-painted shading. Single centered subject, ~12% padding, bold readable silhouette that works small, slightly bright and saturated so it reads on a dark teal UI. Isolated on a fully transparent background, soft drop shadow only. Square 512x512. No text, no border, no frame, no UI, no background scenery.
```

---

# 2. 盤面グリフ（6種・任意）　→ `src/assets/cards/`

### 保存名: `fish.png`
```
SUBJECT: a plump fresh fish in side profile, lively, teal-blue body with a lighter belly.
STYLE: hand-drawn watercolor with fine ink linework, weathered nautical journal / antique sea-chart aesthetic. Warm dusk palette — teal (#1d5a6e), deep ocean blue (#0e3a47), sandy beige (#ecdcae), sunset amber (#ffd479), burnt orange (#ff9f43), weathered wood brown (#8a5a34). Soft paper grain, loose washes, delicate ink outlines. Single centered subject, ~12% padding, very bold simple silhouette that reads at tiny size on a dark teal UI. Isolated on a fully transparent background, soft drop shadow only. Square 512x512. No text, no border, no frame, no UI, no background scenery.
```

### 保存名: `water.png`
```
SUBJECT: a single clean water droplet, glossy, with a soft white highlight.
STYLE: hand-drawn watercolor with fine ink linework, weathered nautical journal / antique sea-chart aesthetic. Warm dusk palette — teal (#1d5a6e), deep ocean blue (#0e3a47), sandy beige (#ecdcae), sunset amber (#ffd479), burnt orange (#ff9f43), weathered wood brown (#8a5a34). Soft paper grain, loose washes, delicate ink outlines. Single centered subject, ~12% padding, very bold simple silhouette that reads at tiny size on a dark teal UI. Isolated on a fully transparent background, soft drop shadow only. Square 512x512. No text, no border, no frame, no UI, no background scenery.
```

### 保存名: `wood.png`
```
SUBJECT: a short cut log / wooden plank with visible end-grain rings.
STYLE: hand-drawn watercolor with fine ink linework, weathered nautical journal / antique sea-chart aesthetic. Warm dusk palette — teal (#1d5a6e), deep ocean blue (#0e3a47), sandy beige (#ecdcae), sunset amber (#ffd479), burnt orange (#ff9f43), weathered wood brown (#8a5a34). Soft paper grain, loose washes, delicate ink outlines. Single centered subject, ~12% padding, very bold simple silhouette that reads at tiny size on a dark teal UI. Isolated on a fully transparent background, soft drop shadow only. Square 512x512. No text, no border, no frame, no UI, no background scenery.
```

### 保存名: `search.png`
```
SUBJECT: a small broken shipwreck hull on the shore with a snapped mast, a treasure-hunt feel.
STYLE: hand-drawn watercolor with fine ink linework, weathered nautical journal / antique sea-chart aesthetic. Warm dusk palette — teal (#1d5a6e), deep ocean blue (#0e3a47), sandy beige (#ecdcae), sunset amber (#ffd479), burnt orange (#ff9f43), weathered wood brown (#8a5a34). Soft paper grain, loose washes, delicate ink outlines. Single centered subject, ~12% padding, very bold simple silhouette that reads at tiny size on a dark teal UI. Isolated on a fully transparent background, soft drop shadow only. Square 512x512. No text, no border, no frame, no UI, no background scenery.
```

### 保存名: `ship.png`
```
SUBJECT: a sturdy little wooden boat with a single triangular sail, the escape boat.
STYLE: hand-drawn watercolor with fine ink linework, weathered nautical journal / antique sea-chart aesthetic. Warm dusk palette — teal (#1d5a6e), deep ocean blue (#0e3a47), sandy beige (#ecdcae), sunset amber (#ffd479), burnt orange (#ff9f43), weathered wood brown (#8a5a34). Soft paper grain, loose washes, delicate ink outlines. Single centered subject, ~12% padding, very bold simple silhouette that reads at tiny size on a dark teal UI. Isolated on a fully transparent background, soft drop shadow only. Square 512x512. No text, no border, no frame, no UI, no background scenery.
```

### 保存名: `snake.png`
```
SUBJECT: a coiled green snake with bared fangs, menacing but stylized.
STYLE: hand-drawn watercolor with fine ink linework, weathered nautical journal / antique sea-chart aesthetic. Warm dusk palette — teal (#1d5a6e), deep ocean blue (#0e3a47), sandy beige (#ecdcae), sunset amber (#ffd479), burnt orange (#ff9f43), weathered wood brown (#8a5a34). Soft paper grain, loose washes, delicate ink outlines. Single centered subject, ~12% padding, very bold simple silhouette that reads at tiny size on a dark teal UI. Isolated on a fully transparent background, soft drop shadow only. Square 512x512. No text, no border, no frame, no UI, no background scenery.
```

---

# 3. 天気アイコン（4種・任意）　→ `src/assets/cards/`

### 保存名: `wx-sun.png`
```
SUBJECT: a warm glowing sun with soft radiating rays.
STYLE: hand-drawn watercolor with fine ink linework, antique sea-chart aesthetic. Warm dusk palette — teal (#1d5a6e), sandy beige (#ecdcae), sunset amber (#ffd479), burnt orange (#ff9f43). Soft paper grain, loose washes, delicate ink outlines. Single centered symbolic icon, ~12% padding, bold and clear. Isolated on a fully transparent background, soft drop shadow only. Square 512x512. No text, no border, no frame, no UI, no background scenery.
```

### 保存名: `wx-rain.png`
```
SUBJECT: a soft rain cloud with a few blue rain droplets falling.
STYLE: hand-drawn watercolor with fine ink linework, antique sea-chart aesthetic. Warm dusk palette — teal (#1d5a6e), deep ocean blue (#0e3a47), light blue, sandy beige (#ecdcae). Soft paper grain, loose washes, delicate ink outlines. Single centered symbolic icon, ~12% padding, bold and clear. Isolated on a fully transparent background, soft drop shadow only. Square 512x512. No text, no border, no frame, no UI, no background scenery.
```

### 保存名: `wx-storm.png`
```
SUBJECT: a dark thundercloud with a bright yellow lightning bolt and rain.
STYLE: hand-drawn watercolor with fine ink linework, antique sea-chart aesthetic. Warm dusk palette — deep ocean blue (#0e3a47), slate grey, sunset amber (#ffd479) lightning. Soft paper grain, loose washes, delicate ink outlines. Single centered symbolic icon, ~12% padding, bold and clear, a bit ominous. Isolated on a fully transparent background, soft drop shadow only. Square 512x512. No text, no border, no frame, no UI, no background scenery.
```

### 保存名: `wx-hurricane.png`
```
SUBJECT: a swirling hurricane / cyclone spiral with an eye, ominous.
STYLE: hand-drawn watercolor with fine ink linework, antique sea-chart aesthetic. Warm dusk palette — teal (#1d5a6e), deep ocean blue (#0e3a47), slate grey. Soft paper grain, loose washes, delicate ink outlines. Single centered symbolic icon, ~12% padding, bold and clear, menacing. Isolated on a fully transparent background, soft drop shadow only. Square 512x512. No text, no border, no frame, no UI, no background scenery.
```

---

# 4. 背景・タイトル挿絵（第2優先・透過不要）　→ `src/assets/bg/`

### 保存名: `scene.webp`（または scene.jpg / scene.png）— アプリ全体の背景
```
A desolate desert island at dusk seen across a calm teal ocean: a small sandy island with a lone palm and a half-built wooden raft on the shore, distant dark storm clouds gathering on the left horizon, warm amber sunset light low on the right. Wide cinematic seascape with lots of open sky and calm water in the upper-middle area, kept calm and a touch darker so UI text stays readable over it.
STYLE: hand-painted watercolor with ink linework, antique sea-chart aesthetic, warm dusk palette (teal #1d5a6e / deep blue #0e3a47 / sandy beige #ecdcae / sunset amber #ffd479 / burnt orange #ff9f43), soft paper grain, atmospheric depth, quiet and a little ominous. Wide landscape 16:9, high resolution (about 2560x1440). No text, no frame, no UI, no characters in the foreground.
```

### 保存名: `hero.webp`（または hero.png / hero.jpg）— ホームのタイトル挿絵
```
A small desert island at dusk: a lone palm on a sandy mound and a half-built wooden raft on the shore, a glowing amber sun low on the right over a calm teal sea, distant dark storm clouds with a faint lightning hint gathering on the left. Evocative, calm but tense, cinematic 16:9 composition.
STYLE: hand-painted watercolor with ink linework, antique sea-chart aesthetic, warm dusk palette (teal #1d5a6e / deep blue #0e3a47 / sandy beige #ecdcae / sunset amber #ffd479 / burnt orange #ff9f43), soft paper grain. Landscape 16:9 (about 1200x675). No text, no title lettering, no frame, no UI.
```

---

## チェックリスト（反映前）
- [ ] ファイル名が `key` と完全一致（例 `water_bottle.png`、`wx-sun.png`、`scene.webp`）
- [ ] カード/グリフ/天気は**背景透過**になっている
- [ ] カード/グリフ/天気は `src/assets/cards/`、背景/ヒーローは `src/assets/bg/` に置いた
- [ ] `git add . && git commit && git push`（main）→ 約30秒で自動配信

> 置き場所までやってもらえれば、コミット＆配信はこちらでも回せます（「pngを置いた」と教えてください）。
