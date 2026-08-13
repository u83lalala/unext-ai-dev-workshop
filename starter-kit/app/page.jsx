'use client';

// 這是你的網站首頁 —— 六頂思考帽煩惱諮詢室
//
// 送出一個煩惱後，會同時打 6 支請求（一頂帽子一支），
// 每頂帽子的角色設定在 app/api/ai/route.js 的 HAT_PROMPTS

import { useState } from 'react';

const APP_TITLE = '六頂思考帽煩惱諮詢室';
const PLACEHOLDER = '說說你的煩惱⋯⋯';

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

export default function Home() {
  const [input, setInput] = useState('');
  const [rounds, setRounds] = useState([]); // { worry, results: { hatId: { status, text } } }
  const [busy, setBusy] = useState(false);
  const isComposingRef = { current: false };

  async function handleSubmit(e) {
    e.preventDefault();
    const worry = input.trim();
    if (!worry || busy) return;

    setBusy(true);
    setInput('');

    const initialResults = {};
    HATS.forEach((h) => {
      initialResults[h.id] = { status: 'loading', text: '' };
    });

    const roundIndex = rounds.length;
    setRounds((prev) => [...prev, { worry, results: initialResults }]);

    // 六頂帽子平行送出，各自回來各自更新，不互相等待
    await Promise.all(
      HATS.map(async (h) => {
        try {
          const res = await fetch('/api/ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: worry, hat: h.id }),
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
        <p style={S.sub}>說一個你的煩惱，六頂思考帽會分別給你不同角度的回應</p>
      </header>

      <section style={S.body}>
        {rounds.length === 0 && (
          <div style={S.emptyState}>還沒有煩惱被討論，在下面輸入開始吧</div>
        )}

        {rounds.map((r, i) => (
          <div key={i} style={S.round}>
            <div style={S.worryRow}>
              <div style={S.worryBubble}>{r.worry}</div>
            </div>

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
                      {result.status === 'done' && result.text}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <form onSubmit={handleSubmit} style={S.inputBar}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => { isComposingRef.current = true; }}
          onCompositionEnd={() => { isComposingRef.current = false; }}
          placeholder={PLACEHOLDER}
          rows={2}
          style={S.textarea}
          disabled={busy}
        />
        <button type="submit" disabled={busy || !input.trim()} style={S.button}>
          {busy ? '六頂帽子思考中⋯' : '送出'}
        </button>
      </form>

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

  hatsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '0.9rem',
  },
  card: {
    border: '1px solid',
    borderRadius: 14,
    padding: '1rem 1.1rem',
  },
  cardHeader: { display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.6rem' },
  avatar: { fontSize: '1.4rem' },
  hatName: { fontSize: '0.95rem', fontWeight: 700 },
  hatDesc: { fontSize: '0.78rem', color: '#8A8A85' },
  cardBody: { fontSize: '0.92rem', lineHeight: 1.65, whiteSpace: 'pre-wrap', color: '#3D3D3A' },
  thinking: { color: '#9A9990', fontStyle: 'italic' },
  errText: { color: '#8A3B2E' },

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
