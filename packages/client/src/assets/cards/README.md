# カード/アイコンの実画像（任意・差し替え用）

ここに `<key>.png`（透過PNG, 512×512 推奨）を置くと、その絵が `icons.tsx` の SVG アイコンより
**自動で優先**されます（`manifest.ts` が `import.meta.glob` で検出）。1枚も無ければ SVG にフォールバックします。

水彩アートの生成プロンプトは `docs/asset-prompts.md` を参照。`key` は以下のいずれか:

- カード: `water_bottle` `dirty_water` `sandwich` `sardine_can` `rotten_fish` `fruit_basket`
  `serum` `voodoo` `sleeping_pills` `alarm_clock` `canteen` `fishing_rod` `axe` `crystal_ball` `gun` `bullet` `junk`
- 盤面グリフ: `fish`（食料/釣り） `water`（水） `wood`（木） `search`（難破船） `ship`（船） `snake`（ヘビ）

例: `packages/client/src/assets/cards/gun.png` を置くと拳銃カードがその絵になる。
