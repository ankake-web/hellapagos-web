import type { ReactNode } from 'react';

/** 確認シートの明細1行。「何を失うか／何が起きるか」を実数で見せるための行。 */
export interface ConfirmLine {
  label: string;
  value: string;
  /** 強調の色味。danger=赤（失うもの）、good=緑（得るもの）。 */
  tone?: 'danger' | 'good';
}

interface Props {
  title: string;
  /** 見出しの下に置く一言（取り消せないことを明記する）。 */
  lead?: ReactNode;
  /** 実行すると何が起きるかの明細。 */
  lines?: ConfirmLine[];
  confirmLabel: string;
  cancelLabel?: string;
  /** 人が死ぬ・資源を失うなど、取り返しがつかない操作は赤くする。 */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 取り消せない操作の前に1枚だけ挟む共通の確認シート。
 *  投票・行動・出航・射撃など、ワンタップで確定してしまう箇所すべてで使う。 */
export function ConfirmModal({ title, lead, lines, confirmLabel, cancelLabel, danger, onConfirm, onCancel }: Props) {
  return (
    <div className="overlay" onClick={onCancel}>
      <div
        className={`modal confirm-modal ${danger ? 'danger' : ''}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{title}</h3>
        {lead && <p className="hint">{lead}</p>}
        {lines && lines.length > 0 && (
          <ul className="confirm-lines">
            {lines.map((l) => (
              <li key={l.label} className={l.tone ?? ''}>
                <span className="cl-label">{l.label}</span>
                <span className="cl-value">{l.value}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="panel-actions">
          <button className="btn ghost" onClick={onCancel}>{cancelLabel ?? 'やめる'}</button>
          <button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
