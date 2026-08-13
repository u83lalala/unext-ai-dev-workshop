'use client';

// 這是你的網站首頁
//
// 它現在長得很樸素，那是刻意的 —— 你要把它改成「你的那個應用」
// 改法：把這整個檔案貼給 Codex，跟它說你要做什麼（見 repo 根目錄的 SPEC-TEMPLATE.md）

import { useState, useRef, useEffect } from 'react';

// 👇 改這兩行就換了一個應用（先改這裡，再改介面）
// AI 的人格不在這裡 —— 它在 app/api/ai/route.js 的 SYSTEM_PROMPT（伺服器端）
const APP_TITLE = '我的第一個 AI 應用';
const PLACEHOLDER = '在這裡輸入你要問的東西⋯⋯';

export default function Home() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]); // { role: 'user' | 'ai', content: string }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);
  const isComposingRef = useRef(false); // 追蹤中文輸入法是否正在選字

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setError('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: text }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setMessages((prev) => [...prev, { role: 'ai', content: data.output }]);
      }
    } catch (err) {
      setError(`送出失敗：${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      // 中文（或其他）輸入法選字中按 Enter 是在確認選字，不是要送出
      if (isComposingRef.current || e.nativeEvent.isComposing) return;
      e.preventDefault();
      handleSubmit(e);
    }
  }

  return (
    <main style={S.page}>
      <header style={S.header}>
        <h1 style={S.h1}>{APP_TITLE}</h1>
        <p style={S.sub}>輸入內容 → 按送出 → AI 幫你處理</p>
      </header>

      <section style={S.chatArea}>
        {messages.length === 0 && !loading && (
          <div style={S.emptyState}>還沒有對話，輸入內容開始吧</div>
        )}

        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} style={S.rowUser}>
              <div style={S.bubbleUser}>{m.content}</div>
            </div>
          ) : (
            <div key={i} style={S.rowAI}>
              <div style={S.bubbleAI}>{m.content}</div>
            </div>
          )
        )}

        {loading && (
          <div style={S.rowAI}>
            <div style={{ ...S.bubbleAI, ...S.bubbleLoading }}>AI 正在想⋯⋯</div>
          </div>
        )}

        {error && (
          <div style={S.error}>
            <strong>出錯了：</strong> {error}
            <div style={S.errorHint}>看 repo 的 docs/03-troubleshooting.md，裡面有每一種錯誤怎麼修</div>
          </div>
        )}

        <div ref={bottomRef} />
      </section>

      <form onSubmit={handleSubmit} style={S.inputBar}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => { isComposingRef.current = true; }}
          onCompositionEnd={() => { isComposingRef.current = false; }}
          placeholder={PLACEHOLDER}
          rows={1}
          style={S.textarea}
        />
        <button type="submit" disabled={loading || !input.trim()} style={S.button} aria-label="送出">
          ↑
        </button>
      </form>

      <footer style={S.footer}>
        改這個頁面：把 <code>app/page.jsx</code> 貼給 Codex，跟它說你要什麼
        <br />
        換 AI 的個性：改 <code>app/api/ai/route.js</code> 的 <code>SYSTEM_PROMPT</code>
      </footer>
    </main>
  );
}

// 樣式集中放這裡，改配色只改這一塊
const S = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    maxWidth: 760,
    margin: '0 auto',
    padding: '0 1.5rem',
    fontFamily: 'system-ui, -apple-system, "Noto Sans TC", sans-serif',
    color: '#3D3D3A',
    background: '#FAFAF8',
    boxSizing: 'border-box',
  },
  header: {
    paddingTop: '2.5rem',
    paddingBottom: '1rem',
  },
  h1: { fontSize: '1.6rem', margin: 0, marginBottom: '0.35rem', color: '#30302E' },
  sub: { color: '#8A8A85', margin: 0, fontSize: '0.95rem' },

  chatArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.9rem',
    paddingBottom: '1.5rem',
    overflowY: 'auto',
  },
  emptyState: {
    color: '#B0AFA8',
    fontSize: '0.95rem',
    textAlign: 'center',
    marginTop: '3rem',
  },

  rowUser: { display: 'flex', justifyContent: 'flex-end' },
  rowAI: { display: 'flex', justifyContent: 'flex-start' },

  bubbleUser: {
    maxWidth: '78%',
    background: '#30302E',
    color: '#FAFAF8',
    padding: '0.7rem 1rem',
    borderRadius: '16px 16px 4px 16px',
    fontSize: '1rem',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
  },
  bubbleAI: {
    maxWidth: '78%',
    background: '#F0EEE6',
    color: '#30302E',
    padding: '0.7rem 1rem',
    borderRadius: '16px 16px 16px 4px',
    fontSize: '1rem',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
  },
  bubbleLoading: { color: '#9A9990', fontStyle: 'italic' },

  error: {
    marginTop: '0.4rem',
    padding: '0.9rem 1.1rem',
    background: '#FDF2F0',
    border: '1px solid #F3D2CB',
    borderRadius: 10,
    fontSize: '0.95rem',
    color: '#8A3B2E',
  },
  errorHint: { marginTop: '0.4rem', color: '#A08880', fontSize: '0.85rem' },

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
    width: 36,
    height: 36,
    borderRadius: '50%',
    border: 'none',
    background: '#CC785C',
    color: '#fff',
    fontSize: '1.1rem',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  footer: {
    padding: '1rem 0 2rem',
    borderTop: '1px solid #EDEBE3',
    color: '#B0AFA8',
    fontSize: '0.82rem',
    textAlign: 'center',
  },
};
