interface Props {
  onClose: () => void;
}

export function Rules({ onClose }: Props) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal rules" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>遊び方</h2>
          <button className="btn ghost small" onClick={onClose}>
            閉じる
          </button>
        </div>

        <p className="lead">
          無人島に漂着した生存者たち。<strong>嵐が来る前に船（いかだ）を造って脱出</strong>するのが目標です。
          でも水と食料が足りなければ……誰かを犠牲にするしかありません。表向きは協力、本音は生き残り。
        </p>

        <h3>勝利と敗北</h3>
        <ul>
          <li><strong>勝ち</strong>：嵐までに「生存人数ぶんの船の席」＋「航海用の水・食料」を揃えて脱出する。</li>
          <li><strong>負け</strong>：嵐に飲まれる／渇き・飢えで全滅する／船に乗れない。</li>
          <li><strong>ソロサバイバル</strong>（任意）：自分が<strong>唯一の脱出者</strong>になったときだけ勝ち。</li>
        </ul>

        <h3>1日の流れ</h3>
        <ol>
          <li><strong>天候</strong>：降水量が多いほど水を多く汲める。嵐（ハリケーン）が出た日は最終日。</li>
          <li>
            <strong>行動</strong>（手番が来たら、順番に1つ選ぶ）：
            <div className="rule-actions">
              <span>釣り（食料）</span>
              <span>水汲み</span>
              <span>木集め（船）</span>
              <span>難破船を漁る（カード）</span>
            </div>
            木集めは「さらに引く」とヘビ（黒玉）の危険。噛まれると病気で次の手番を休み、追加ぶんの木も失います。
          </li>
          <li>
            <strong>生存判定</strong>：生存者1人につき水1・食料1を消費。足りなければ
            <strong>不足ぶんの人数だけ投票で追放</strong>します（＝生贄）。
          </li>
          <li><strong>脱出</strong>：席と備蓄が揃えば出航を投票。嵐の日は強制的に脱出判定。</li>
        </ol>

        <h3>カードの使い方（難破船で入手）</h3>
        <ul className="rule-items">
          <li>
            <strong>資源（水/食料）</strong>：生存判定で「みんなの蓄えに出す（全員のため）」か、
            投票になったら「<strong>自分だけに使って身を守る</strong>（自分だけ助かる）」かを選べます。
          </li>
          <li>
            <strong>永続（斧・釣り竿・水筒・水晶玉・棍棒）</strong>：
            <strong>使って初めて発動＆公開</strong>され、以後ずっと効果が続きます（斧＝木+1／釣り竿＝魚×2／水筒＝水×2／棍棒＝自分の票が2票）。
            使うまで他人には見えません。
          </li>
          <li>
            <strong>単発</strong>：拳銃（射殺して所持品を奪う・トタン板で1回防げる）／睡眠薬（3人から各1枚奪う）／
            血清（ヘビ毒を治すが、その回の木は失う）／ブードゥー人形（死者を蘇生）／
            望遠鏡（相手の手札を覗く）／マッチ（汚れた水・腐った魚の病気を防ぐ）／
            人肉BBQ（死体を食料に変える）／ほら貝（進行中の追放を1回無効化）。
          </li>
          <li>
            <strong>無用品</strong>：効果はなく<strong>使えません</strong>。手札に残るので、
            「カードを使わない＝何を隠しているのか」と<strong>怪しまれる</strong>材料になります。
          </li>
        </ul>

        <h3>AIと駆け引き</h3>
        <p>
          人数が足りなければAIを追加できます（オフラインは最初からCPU3人）。AIには
          <strong>協力的・溜め込み屋・狙撃手・臆病者</strong>の性格があり（正体はゲーム終了時に判明）、
          投票前のチャットで煽り合います。疑い、説得し、生き延びましょう。
        </p>

        <button className="btn primary block" onClick={onClose}>
          わかった！
        </button>
      </div>
    </div>
  );
}
