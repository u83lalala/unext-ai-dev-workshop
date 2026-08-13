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
        const result =
