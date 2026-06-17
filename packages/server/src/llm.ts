import Anthropic from '@anthropic-ai/sdk';

// CPUの発言を実際のLLM（Claude）で生成する。ANTHROPIC_API_KEY が無ければ無効（呼び出し側が定型文にフォールバック）。
// モデルは既定で claude-opus-4-8。HELPAGOS_BOT_MODEL で変更可（例: 速度/コスト重視なら claude-haiku-4-5）。
const MODEL = process.env.HELPAGOS_BOT_MODEL || 'claude-opus-4-8';
const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

export function llmEnabled(): boolean {
  return !!client;
}

export interface SpeakCtx {
  situation: 'vote' | 'reply';
  round: number;
  voteReason?: string;
  pendingEliminations?: number;
  you: string;
  persona: string;
  personaDesc: string;
  hand: string;
  sick: boolean;
  tracks: string;
  players: string;
  candidates: string[];
  recentChat: string;
}

const SYSTEM = [
  'あなたはボードゲーム「ヘルパゴス」のCPUプレイヤーを演じます。無人島からいかだで脱出するゲームで、表向きは協力、本音は自分が生き延びることです。',
  'いまは生存者同士の話し合い。あなたのキャラとして短い日本語のセリフを1つだけ言ってください。',
  '制約：40字以内・口語・1文。地の文や説明・カギ括弧・絵文字の羅列は禁止。セリフ本体だけ。',
  '振る舞い：性格に忠実に、相談したり、取引を持ちかけたり、責任をなすりつけたり、はったりや脅しをかけたり、時には群れに逆らって強行する姿勢を見せること。',
  '出力は JSON のみ：{"say": "セリフ", "voteName": "追放したい相手の名前 または null"}。voteName は候補リストの中の名前か、決めかねるなら null。',
].join('\n');

export async function botSpeak(ctx: SpeakCtx): Promise<{ say: string; voteName: string | null } | null> {
  if (!client) return null;
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 220,
      system: SYSTEM,
      messages: [{ role: 'user', content: JSON.stringify(ctx) }],
    });
    const text = res.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();
    return parseReply(text);
  } catch {
    return null;
  }
}

export function parseReply(text: string): { say: string; voteName: string | null } {
  // JSON 部分を抽出して緩くパース
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const o = JSON.parse(m[0]) as { say?: unknown; voteName?: unknown };
      const say = clean(String(o.say ?? ''));
      const voteName = typeof o.voteName === 'string' && o.voteName.trim() ? o.voteName.trim() : null;
      if (say) return { say, voteName };
    } catch {
      /* fall through */
    }
  }
  // JSON で無ければ本文をセリフとして扱う
  return { say: clean(text), voteName: null };
}

function clean(s: string): string {
  return s.replace(/^["「『]|["」』]$/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
}
