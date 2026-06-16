interface Props {
  onClose: () => void;
}

export function Rules({ onClose }: Props) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal rules" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>🏝️ 遊び方</h2>
          <button className="btn ghost small" onClick={onClose}>
            閉じる
          </button>
        </div>

        <p className="lead">
          無人島に漂着した生存者たち。<strong>嵐が来る前にいかだを造って脱出</strong>するのが目標です。
          でも水と食料が足りなければ……誰かを犠牲にするしかありません。表向きは協力、本音は生き残り。
        </p>

        <h3>🎯 勝利と敗北</h3>
        <ul>
          <li><strong>勝ち</strong>：嵐までに「人数分のいかだの席」＋「航海用の水・食料」を揃えて脱出する。</li>
          <li><strong>負け</strong>：嵐に飲まれる／渇き・飢えで全滅する／いかだに乗れない。</li>
          <li><strong>ソロサバイバル</strong>（任意）：自分が<strong>唯一の脱出者</strong>になったときだけ勝ち。</li>
        </ul>

        <h3>🔁 1日の流れ</h3>
        <ol>
          <li><strong>天候</strong>：晴れ／雨（水が多く採れる）。嵐が来た日は最終日。</li>
          <li>
            <strong>行動</strong>（全員同時に1つ選ぶ）：
            <div className="rule-actions">
              <span>🎣 魚を釣る（食料）</span>
              <span>💧 水を汲む</span>
              <span>🪵 木材を集める（いかだ）</span>
              <span>🔍 難破船を漁る（隠し財産・道具）</span>
            </div>
          </li>
          <li>
            <strong>生存判定</strong>：生存者1人につき水1・食料1を消費。足りなければ、
            <strong>不足した人数だけ投票で追放</strong>します（＝生贄）。
          </li>
          <li><strong>脱出</strong>：席と備蓄が揃えば出航を投票。嵐の日は強制的に脱出判定。</li>
        </ol>

        <h3>🤫 隠し財産</h3>
        <p>
          難破船の探索で得た水・食料は<strong>自分だけの隠し財産</strong>。生存判定で「供出するか、隠すか」を選べます。
          出し惜しむと疑われ、投票で狙われやすくなります。
        </p>

        <h3>🎁 特殊アイテム（探索で入手）</h3>
        <ul className="rule-items">
          <li>🔫 <strong>拳銃</strong>：生存者を即座に射殺し、所持品を奪う（1回）</li>
          <li>💊 <strong>睡眠薬</strong>：その追放投票で自分を対象外にする（1回）</li>
          <li>💉 <strong>解毒剤</strong>：ヘビの毒（病気）を治す（1回）</li>
          <li>🪆 <strong>ブードゥー人形</strong>：死者1人を蘇らせる（1回）</li>
          <li>🪓🎣🧪 <strong>斧・釣り竿・浄水器</strong>：木材／魚／水の収量が永続+1</li>
        </ul>

        <h3>🤖 AIと駆け引き</h3>
        <p>
          人数が足りなければAIを追加できます。AIには
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
