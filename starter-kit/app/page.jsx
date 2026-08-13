'use client';

// 這是你的網站首頁 —— 六頂思考帽煩惱諮詢室
//
// 三種決定「問誰」的方式，優先順序由上到下：
// 1. 輸入框裡打 @帽名（例如 @白帽），該次送出只問這頂帽子
// 2. 輸入框上方的帽子按鈕選了某一頂 → 之後送出都只問那頂
// 3. 兩者都沒選 → 六頂一起問
//
// 每頂帽子會記得「自己」跟你聊過的內容（不管是六頂一起問，還是單獨被 @），
// 所以可以先看六頂的第一輪回應，再指定某一頂繼續往下聊
//
// 每頂帽子的角色設定在 app/api/ai/route.js 的 HAT_PROMPTS（伺服器端）

import { useState, useRef } from 'react';

const APP_TITLE = '六頂思考帽煩惱諮詢室';

// 👇 六頂帽子的顯示資訊（名字、頭像、配色）
// 角色的「思考邏輯」不在這裡 —— 在 app/api/ai/route.js 的 HAT_PROMPTS（伺服器端）
const HATS = [
  { id: 'white', name: '白帽', desc: '客觀事實', avatar: '⚪', bg: '#F5F5F2', accent: '#8A8A85' },
  { id: 'red', name: '紅帽', desc: '直覺情緒', avatar: '🔴', bg: '#FCEEEC', accent: '#C6584B' },
  { id: 'black', name: '黑帽', desc: '謹慎風險', avatar: '⚫', bg: '#ECECEA', accent: '#3D3D3A' },
  { id: 'yellow', name: '黃帽', desc: '正面樂觀', avatar: '🟡', bg: '#FEF6E4', accent: '#C99A2E' },
  { id: 'green', name: '綠帽', desc: '創意點子', avatar: '🟢', bg: '#EFF5EC', accent: '#5F8D5A' },
  { id: 'blue', name: '藍帽', desc: '統籌總結', avatar: '🔵', bg: '#EAF1F6', accent: '#4A7A96' },
];

const NAME_TO_ID = { 白帽: 'white', 紅帽: 'red', 黑帽: 'black', 黃帽: 'yellow', 綠帽: 'green', 藍帽: 'blue' };
const MENTION_PREFIX = /^@(白帽|紅帽|黑帽|黃帽|綠帽|藍帽)\s*/;

// ────────────────────────────────────────────
// 輕量 markdown 轉換：不裝套件，自己處理常見的幾種語法
// 支援：**粗體**、`行內程式碼`、* 條列 / - 條列、1. 編號列表、# 標題、換行
// ────────────────────────────────────────────
function renderInline(text, keyPrefix) {
  const nodes = [];
  const regex = /(\*\*(.+?)\*\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match;
  let i = 0;
  while ((match = regex.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[2] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-${i++}`}>{match[2]}</strong>);
    } else if (match[3] !== undefined) {
      nodes.push(
        <code key={`${keyPrefix}-${i++}`} style={S.inlineCode}>
          {match[3]}
        </code>
      );
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function renderMarkdown(text) {
  if (!text) return null;
  const blocks = text.trim().split(/\n\s*\n/);

  return blocks.map((block, bi) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const isBulletList = lines.length > 0 && lines.every((l) => /^[-*]\s+/.test(l));
    const isNumberList = lines.length > 0 && lines.every((l) => /^\d+\.\s+/.test(l));
    const headerMatch = block.match(/^(#{1,3})\s+(.*)$/);

    if (isBulletList) {
      return (
        <ul key={bi} style={S.mdList}>
          {lines.map((l, li) => (
            <li key={li}>{renderInline(l.replace(/^[-*]\s+/, ''), `${bi}-${li}`)}</li>
          ))}
        </ul>
      );
    }

    if (isNumberList) {
      return (
        <ol key={bi} style={S.mdList}>
          {lines.map((l, li) => (
            <li key={li}>{renderInline(l.replace(/^\d+\.\s+/, ''), `${bi}-${li}`)}</li>
          ))}
        </ol>
      );
    }

    if (headerMatch) {
      const level = headerMatch[1].length;
      const style = level === 1 ? S.mdH1 : level === 2 ? S.mdH2 : S.mdH3;
      return (
        <div key={bi} style={style}>
          {renderInline(headerMatch[2], `${bi}-h`)}
        </div>
      );
    }

    const paraLines = block.split('\n');
    return (
      <p key={bi} style={S.mdP}>
        {paraLines.map((l, li) => (
          <span key={li}>
            {renderInline(l, `${bi}-p-${li}`)}
            {li < paraLines.length - 1 && <br />}
          </span>
        ))}
      </p>
    );
  });
}

export default function Home() {
  const [input, setInput] = useState('');
  const [rounds, setRounds] = useState([]); // { worry, mode: 'all' | hatId, results }
  const [busy, setBusy] = useState(false);
  const [selectedHat, setSelectedHat] = useState(null); // 按鈕選的預設帽子，null = 全部六頂
  const [mention, setMention] = useState({ open: false, query: '', start: 0, highlight: 0 });
  const isComposingRef = useRef(false);
  const textareaRef = useRef(null);

  const filteredMentionHats = HATS.filter((h) => h.name.includes(mention.query));

  const placeholder = selectedHat
    ? `跟${HATS.find((h) => h.id === selectedHat)?.name}聊聊你的煩惱⋯⋯（也可以打 @ 換一頂）`
    : '說說你的煩惱⋯⋯（可以打 @ 指定要問哪一頂帽子）';

  // 從之前所有回合裡，把「這頂帽子」講過的話整理成 user/assistant 交替的歷史紀錄
  // 只算已經回答完成（status === 'done'）的，並且只留最近幾輪，避免每次都送一長串
  function buildHistoryForHat(hatId, roundsSoFar) {
    const history = [];
    roundsSoFar.forEach((r) => {
      if (r.mode === 'all' || r.mode === hatId) {
        const result = r.results[hatId];
        if (result && result.status === 'done') {
          history.push({ role: 'user', content: r.worry });
          history.push({ role: 'assistant', content: result.text });
        }
      }
    });
    return history.slice(-8); // 最近 4 輪一問一答
  }

  // 偵測游標前面是不是正在打 @提及：@ 之後、還沒出現空白之前，都算在打帽子名字
  function detectMention(value, cursor) {
    const uptoCursor = value.slice(0, cursor);
    const atIndex = uptoCursor.lastIndexOf('@');
    if (atIndex === -1) {
      setMention({ open: false, query: '', start: 0, highlight: 0 });
      return;
    }
    const before = uptoCursor[atIndex - 1];
    const isValidStart = atIndex === 0 || before === ' ' || before === '\n';
    const fragment = uptoCursor.slice(atIndex + 1);
    if (!isValidStart || /\s/.test(fragment)) {
      setMention({ open: false, query: '', start: 0, highlight: 0 });
      return;
    }
    setMention({ open: true, query: fragment, start: atIndex, highlight: 0 });
  }

  function handleChange(e) {
    const value = e.target.value;
    setInput(value);
    detectMention(value, e.target.selectionStart);
  }

  // 從選單挑一頂帽子，把 @查詢字串換成完整的 @帽名（後面補一個空白讓你接著打）
  function selectMention(hat) {
    const before = input.slice(0, mention.start);
    const afterCursorIndex = mention.start + 1 + mention.query.length;
    const after = input.slice(afterCursorIndex);
    const newValue = `${before}@${hat.name} ${after}`;
    setInput(newValue);
    setMention({ open: false, query: '', start: 0, highlight: 0 });
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  // 解析輸入開頭的 @帽名，回傳要問哪頂帽子、以及拿掉前綴後的實際內容
  function parseMentionPrefix(text) {
    const m = text.match(MENTION_PREFIX);
    if (!m) return null;
    return { hatId: NAME_TO_ID[m[1]], rest: text.slice(m[0].length).trim() };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const raw = input.trim();
    if (!raw || busy) return;

    const mentioned = parseMentionPrefix(raw);
    const worry = mentioned ? mentioned.rest : raw;
    if (!worry) return; // 只打了 @帽名沒接內容，先不送

    const mode = mentioned ? mentioned.hatId : (selectedHat || 'all');
    const activeHats = mode === 'all' ? HATS : HATS.filter((h) => h.id === mode);

    // 這裡的 rounds 是「送出這次之前」的所有回合，拿來組每頂帽子各自的歷史紀錄
    const roundsBeforeThis = rounds;

    setBusy(true);
    setInput('');
    setMention({ open: false, query: '', start: 0, highlight: 0 });

    const initialResults = {};
    activeHats.forEach((h) => {
      initialResults[h.id] = { status: 'loading', text: '' };
    });

    const roundIndex = roundsBeforeThis.length;
    setRounds((prev) => [...prev, { worry, mode, results: initialResults }]);

    await Promise.all(
      activeHats.map(async (h) => {
        const history = buildHistoryForHat(h.id, roundsBeforeThis);
        try {
          const res = await fetch('/api/ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: worry, hat: h.id, history }),
          });
          const data = await res.json();
          setRounds((prev) => {
            const next = [...prev];
            next[roundIndex] = {
              ...next[roundIndex],
              results: {
                ...next[roundIndex].results,
                [h.id]: data.error
                  ? { status: 'error', text: data.error }
                  : { status: 'done', text: data.output },
              },
            };
            return next;
          });
        } catch (err) {
          setRounds((prev) => {
            const next = [...prev];
            next[roundIndex] = {
              ...next[roundIndex],
              results: {
                ...next[roundIndex].results,
                [h.id]: { status: 'error', text: `送出失敗：${err.message}` },
              },
            };
            return next;
          });
        }
      })
    );

    setBusy(false);
  }

  function handleKeyDown(e) {
    // @ 選單開著的時候，方向鍵/Enter/Tab/Esc 先給選單用
    if (mention.open && filteredMentionHats.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMention((m) => ({ ...m, highlight: (m.highlight + 1) % filteredMentionHats.length }));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMention((m) => ({
          ...m,
          highlight: (m.highlight - 1 + filteredMentionHats.length) % filteredMentionHats.length,
        }));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectMention(filteredMentionHats[mention.highlight]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMention({ open: false, query: '', start: 0, highlight: 0 });
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      if (isComposingRef.current || e.nativeEvent.isComposing) return;
      e.preventDefault();
      handleSubmit(e);
    }
  }

  return (
    <main style={S.page}>
      <header style={S.header}>
        <h1 style={S.h1}>{APP_TITLE}</h1>
        <p style={S.sub}>
          說一個你的煩惱 —— 打 <code>@</code> 指定一頂帽子聊、或用下面按鈕選、不選就六頂一起問。
          帽子會記得自己講過什麼，可以接著聊
        </p>
      </header>

      <section style={S.body}>
        {rounds.length === 0 && (
          <div style={S.emptyState}>還沒有煩惱被討論，在下面輸入開始吧</div>
        )}

        {rounds.map((r, i) => (
          <div key={i} style={S.round}>
            <div style={S.worryRow}>
              <div style={S.worryBubble}>
                {r.mode !== 'all' && (
                  <span style={S.mentionTag}>
                    @{HATS.find((h) => h.id === r.mode)?.name}
                  </span>
                )}
                {r.worry}
              </div>
            </div>

            {r.mode === 'all' ? (
              <div style={S.hatsGrid}>
                {HATS.map((h) => {
                  const result = r.results[h.id];
                  return (
                    <div key={h.id} style={{ ...S.card, background: h.bg, borderColor: h.accent }}>
                      <div style={S.cardHeader}>
                        <span style={S.avatar}>{h.avatar}</span>
                        <div>
                          <div style={{ ...S.hatName, color: h.accent }}>{h.name}</div>
                          <div style={S.hatDesc}>{h.desc}</div>
                        </div>
                      </div>
                      <div style={S.cardBody}>
                        {result.status === 'loading' && <span style={S.thinking}>思考中⋯⋯</span>}
                        {result.status === 'error' && <span style={S.errText}>{result.text}</span>}
                        {result.status === 'done' && renderMarkdown(result.text)}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              (() => {
                const h = HATS.find((x) => x.id === r.mode);
                const result = r.results[r.mode];
                return (
                  <div style={S.singleRow}>
                    <span style={S.avatarSmall}>{h.avatar}</span>
                    <div style={{ ...S.singleBubble, borderColor: h.accent, background: h.bg }}>
                      <div style={{ ...S.hatName, color: h.accent, marginBottom: '0.3rem' }}>
                        {h.name}
                      </div>
                      {result.status === 'loading' && <span style={S.thinking}>思考中⋯⋯</span>}
                      {result.status === 'error' && <span style={S.errText}>{result.text}</span>}
                      {result.status === 'done' && renderMarkdown(result.text)}
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        ))}
      </section>

      {/* 帽子選擇列：沒打 @ 的時候，這裡選的就是預設要問誰 */}
      <div style={S.hatPicker}>
        <button
          type="button"
          onClick={() => setSelectedHat(null)}
          style={{ ...S.chip, ...(selectedHat === null ? S.chipActive : {}) }}
        >
          全部六頂
        </button>
        {HATS.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => setSelectedHat(h.id)}
            style={{
              ...S.chip,
              ...(selectedHat === h.id ? { ...S.chipActive, borderColor: h.accent, color: h.accent } : {}),
            }}
          >
            {h.avatar} {h.name}
          </button>
        ))}
      </div>

      <div style={S.inputWrap}>
        {mention.open && filteredMentionHats.length > 0 && (
          <div style={S.mentionMenu}>
            {filteredMentionHats.map((h, idx) => (
              <div
                key={h.id}
                onMouseDown={(e) => {
                  e.preventDefault(); // 避免搶走 textarea 的 focus
                  selectMention(h);
                }}
                style={{
                  ...S.mentionItem,
                  ...(idx === mention.highlight ? S.mentionItemActive : {}),
                }}
              >
                <span style={S.avatar}>{h.avatar}</span>
                <div>
                  <div style={{ ...S.hatName, color: h.accent }}>{h.name}</div>
                  <div style={S.hatDesc}>{h.desc}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} style={S.inputBar}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => { isComposingRef.current = true; }}
            onCompositionEnd={() => { isComposingRef.current = false; }}
            placeholder={placeholder}
            rows={2}
            style={S.textarea}
            disabled={busy}
          />
          <button type="submit" disabled={busy || !input.trim()} style={S.button}>
            {busy ? '思考中⋯' : '送出'}
          </button>
        </form>
      </div>

      <footer style={S.footer}>
        改這個頁面：把 <code>app/page.jsx</code> 貼給 Codex，跟它說你要什麼
        <br />
        換帽子的個性：改 <code>app/api/ai/route.js</code> 的 <code>HAT_PROMPTS</code>
      </footer>
    </main>
  );
}

const S = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    maxWidth: 980,
    margin: '0 auto',
    padding: '0 1.5rem',
    fontFamily: 'system-ui, -apple-system, "Noto Sans TC", sans-serif',
    color: '#3D3D3A',
    background: '#FAFAF8',
    boxSizing: 'border-box',
  },
  header: { paddingTop: '2.5rem', paddingBottom: '1rem' },
  h1: { fontSize: '1.6rem', margin: 0, marginBottom: '0.35rem', color: '#30302E' },
  sub: { color: '#8A8A85', margin: 0, fontSize: '0.95rem' },

  body: { flex: 1, display: 'flex', flexDirection: 'column', gap: '2rem', paddingBottom: '1.5rem' },
  emptyState: { color: '#B0AFA8', fontSize: '0.95rem', textAlign: 'center', marginTop: '3rem' },

  round: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  worryRow: { display: 'flex', justifyContent: 'flex-end' },
  worryBubble: {
    maxWidth: '78%',
    background: '#30302E',
    color: '#FAFAF8',
    padding: '0.7rem 1rem',
    borderRadius: '16px 16px 4px 16px',
    fontSize: '1rem',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
  },
  mentionTag: {
    display: 'inline-block',
    background: 'rgba(255,255,255,0.15)',
    borderRadius: 999,
    padding: '0.1rem 0.55rem',
    fontSize: '0.8rem',
    marginRight: '0.5rem',
    verticalAlign: 'middle',
  },

  hatsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '0.9rem',
  },
  card: { border: '1px solid', borderRadius: 14, padding: '1rem 1.1rem' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.6rem' },
  avatar: { fontSize: '1.4rem' },
  avatarSmall: { fontSize: '1.3rem', flexShrink: 0, marginTop: '0.3rem' },
  hatName: { fontSize: '0.95rem', fontWeight: 700 },
  hatDesc: { fontSize: '0.78rem', color: '#8A8A85' },
  cardBody: { fontSize: '0.92rem', color: '#3D3D3A' },
  thinking: { color: '#9A9990', fontStyle: 'italic' },
  errText: { color: '#8A3B2E' },

  singleRow: { display: 'flex', gap: '0.6rem', alignItems: 'flex-start' },
  singleBubble: {
    maxWidth: '78%',
    border: '1px solid',
    borderRadius: '4px 16px 16px 16px',
    padding: '0.7rem 1rem',
    fontSize: '0.95rem',
  },

  // markdown 元素樣式
  mdP: { margin: '0 0 0.5rem', lineHeight: 1.65 },
  mdList: { margin: '0 0 0.5rem', paddingLeft: '1.3rem', lineHeight: 1.65 },
  mdH1: { fontSize: '1.05rem', fontWeight: 700, margin: '0 0 0.4rem' },
  mdH2: { fontSize: '1rem', fontWeight: 700, margin: '0 0 0.4rem' },
  mdH3: { fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.4rem' },
  inlineCode: {
    background: 'rgba(0,0,0,0.06)',
    borderRadius: 4,
    padding: '0.1rem 0.35rem',
    fontSize: '0.9em',
  },

  hatPicker: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    padding: '0.6rem 0.2rem',
  },
  chip: {
    padding: '0.4rem 0.8rem',
    borderRadius: 999,
    border: '1px solid #E5E3DB',
    background: '#FFFFFF',
    color: '#8A8A85',
    fontSize: '0.85rem',
    cursor: 'pointer',
  },
  chipActive: {
    borderColor: '#CC785C',
    color: '#CC785C',
    fontWeight: 700,
  },

  inputWrap: { position: 'relative' },
  mentionMenu: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    right: 0,
    marginBottom: '0.4rem',
    background: '#FFFFFF',
    border: '1px solid #E5E3DB',
    borderRadius: 14,
    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
    padding: '0.4rem',
    maxHeight: '16rem',
    overflowY: 'auto',
    zIndex: 10,
  },
  mentionItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    padding: '0.5rem 0.6rem',
    borderRadius: 10,
    cursor: 'pointer',
  },
  mentionItemActive: { background: '#F5F4EF' },

  inputBar: {
    position: 'sticky',
    bottom: 0,
    display: 'flex',
    alignItems: 'flex-end',
    gap: '0.6rem',
    padding: '0.9rem',
    marginBottom: '1rem',
    background: '#FFFFFF',
    border: '1px solid #E5E3DB',
    borderRadius: 20,
    boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
  },
  textarea: {
    flex: 1,
    resize: 'none',
    border: 'none',
    outline: 'none',
    fontFamily: 'inherit',
    fontSize: '1rem',
    lineHeight: 1.5,
    background: 'transparent',
    color: '#30302E',
    maxHeight: '8rem',
  },
  button: {
    flexShrink: 0,
    padding: '0.6rem 1.1rem',
    borderRadius: 16,
    border: 'none',
    background: '#CC785C',
    color: '#fff',
    fontSize: '0.92rem',
    fontWeight: 600,
    cursor: 'pointer',
  },

  footer: {
    padding: '1rem 0 2rem',
    borderTop: '1px solid #EDEBE3',
    color: '#B0AFA8',
    fontSize: '0.82rem',
    textAlign: 'center',
  },
};
