// 這支檔案負責把「一個煩惱」從頭到尾的討論（六頂帽子的所有回覆）存進 Notion 資料庫
//
// 前端（page.jsx）在你按下「結束這個煩惱，存到 Notion」時，
// 把這個煩惱從第一句到現在、六頂帽子講過的所有內容送到這裡 →
// 這裡先視需要把標題濃縮到 100 字以內 → 再呼叫 Notion API 建立一個新頁面
//
// 為什麼不在前端直接打 Notion：跟 Groq 一樣，key 只能放伺服器端，
// 前端看得到的東西任何人都能複製走

const HAT_NAMES = {
  white: '⚪ 白帽（客觀事實）',
  red: '🔴 紅帽（直覺情緒）',
  black: '⚫ 黑帽（謹慎風險）',
  yellow: '🟡 黃帽（正面樂觀）',
  green: '🟢 綠帽（創意點子）',
  blue: '🔵 藍帽（統籌總結）',
};

const HAT_ORDER = ['white', 'red', 'black', 'yellow', 'green', 'blue'];

const TITLE_LIMIT = 100;
const NOTION_TEXT_CHUNK = 1900; // Notion 一個文字區塊最多 2000 字，留一點餘裕

// 把長文字切成 Notion 吃得下的小段落
function chunkText(text) {
  const chunks = [];
  let rest = text;
  while (rest.length > NOTION_TEXT_CHUNK) {
    chunks.push(rest.slice(0, NOTION_TEXT_CHUNK));
    rest = rest.slice(NOTION_TEXT_CHUNK);
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function paragraphBlock(text) {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: chunkText(text).map((t) => ({ type: 'text', text: { content: t } })),
    },
  };
}

function headingBlock(text) {
  return {
    object: 'block',
    type: 'heading_2',
    heading_2: { rich_text: [{ type: 'text', text: { content: text } }] },
  };
}

function dividerBlock() {
  return { object: 'block', type: 'divider', divider: {} };
}

export async function POST(request) {
  const { title, askedAt, hats } = await request.json();

  if (!title || !title.trim()) {
    return Response.json({ error: '沒有煩惱標題' }, { status: 400 });
  }
  if (!hats || typeof hats !== 'object') {
    return Response.json({ error: '沒有帽子的討論內容' }, { status: 400 });
  }

  const notionKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!notionKey || !databaseId) {
    return Response.json(
      {
        error:
          '還沒設定 NOTION_API_KEY 或 NOTION_DATABASE_ID。到 Vercel 專案 → Settings → Environment Variables 加上它們，然後 Redeploy',
      },
      { status: 500 }
    );
  }

  // 1. 標題超過 100 字就先用 Groq 濃縮
  let finalTitle = title.trim();
  if (finalTitle.length > TITLE_LIMIT) {
    const apiKey = process.env.GROQ_API_KEY;
    if (apiKey) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': 'unext-ai-dev-workshop/1.0',
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
              {
                role: 'system',
                content:
                  '把使用者給的這段話濃縮成一句繁體中文摘要，務必在 100 個中文字以內，不要加任何前言、引號或解釋，只回摘要本身。',
              },
              { role: 'user', content: finalTitle },
            ],
            max_completion_tokens: 120,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const summary = data.choices?.[0]?.message?.content?.trim();
          if (summary) finalTitle = summary;
        }
      } catch (_) {
        // 摘要失敗就繼續往下走，用硬裁切當備案
      }
    }
    // 保險：不管摘要有沒有成功，都確保不超過 100 字
    if (finalTitle.length > TITLE_LIMIT) {
      finalTitle = finalTitle.slice(0, TITLE_LIMIT - 1) + '…';
    }
  }

  // 2. 組出頁面內容：每頂有參與的帽子各一個標題，底下是它在這個煩惱裡講過的所有內容
  const children = [];
  HAT_ORDER.forEach((hatId) => {
    const entries = hats[hatId];
    if (!entries || entries.length === 0) return;
    children.push(headingBlock(HAT_NAMES[hatId]));
    entries.forEach((entry) => {
      children.push(paragraphBlock(`你：${entry.worry}`));
      children.push(paragraphBlock(entry.text));
    });
    children.push(dividerBlock());
  });

  // Notion 建立頁面時最多只能帶 100 個 block，超過要分批補上
  const firstBatch = children.slice(0, 100);
  const restBatches = [];
  for (let i = 100; i < children.length; i += 100) {
    restBatches.push(children.slice(i, i + 100));
  }

  try {
    const createRes = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${notionKey}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties: {
          標題: { title: [{ text: { content: finalTitle } }] },
          日期: { date: { start: new Date(askedAt || Date.now()).toISOString() } },
        },
        children: firstBatch,
      }),
    });

    if (!createRes.ok) {
      const detail = await createRes.text();
      return Response.json(
        { error: `Notion 回了 ${createRes.status}`, detail: detail.slice(0, 800) },
        { status: 502 }
      );
    }

    const page = await createRes.json();

    // 內容太長的話，分批補上剩下的區塊
    for (const batch of restBatches) {
      await fetch(`https://api.notion.com/v1/blocks/${page.id}/children`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${notionKey}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28',
        },
        body: JSON.stringify({ children: batch }),
      });
    }

    return Response.json({ ok: true, url: page.url, title: finalTitle });
  } catch (err) {
    return Response.json({ error: `呼叫 Notion 失敗：${err.message}` }, { status: 500 });
  }
}
