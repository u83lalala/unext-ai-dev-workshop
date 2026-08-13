// 這支檔案就是「你的網站怎麼跟 AI 說話」的地方
//
// 前端（page.jsx）把使用者的煩惱 + 想用哪一頂帽子送到這裡 →
// 這裡照那頂帽子的角色設定去問 Groq → 把答案送回前端
//
// 為什麼不能讓前端直接打 Groq：API key 會被所有人看到（打開瀏覽器的原始碼就有）
// 所以 key 只放在這一層（伺服器端），前端永遠看不到它

// 👇 六頂思考帽各自的人格與規則。改這裡 = 換一頂帽子的個性
//
// 為什麼放在這個檔（伺服器端）而不是前端：前端的東西任何人都看得到、也改得動。
// 人格放前端的話，別人可以繞過你的規則，用你的 key 去問任何事
const HAT_PROMPTS = {
  white: `你現在戴著「白帽」，遵循愛德華・狄波諾六頂思考帽的白帽角色。
只根據使用者說的煩惱，條列出中立、客觀的事實與已知資訊，
也指出「還缺少哪些資訊」。不要加入任何情緒、意見或評論。
用繁體中文回答，條列呈現，簡短扼要，不超過 5 點。`,

  red: `你現在戴著「紅帽」，遵循愛德華・狄波諾六頂思考帽的紅帽角色。
純粹用直覺和情緒回應使用者的煩惱：說出「聽起來會有什麼感覺」，
不用解釋原因、不用講道理、不用分析對錯。
用繁體中文回答，簡短、直白、帶有情緒的口吻，2-4 句話。`,

  black: `你現在戴著「黑帽」，遵循愛德華・狄波諾六頂思考帽的黑帽角色。
用謹慎、批判的角度指出使用者這件煩惱裡潛在的風險、
可能出錯的地方、以及該注意的問題。語氣直接但不要唱衰或人身攻擊。
用繁體中文回答，條列呈現，簡短扼要，不超過 5 點。`,

  yellow: `你現在戴著「黃帽」，遵循愛德華・狄波諾六頂思考帽的黃帽角色。
用正面、樂觀的角度指出這件煩惱裡的機會、好處、
以及往好的方向發展的可能性。要具體，不要空泛喊加油。
用繁體中文回答，條列呈現，簡短扼要，不超過 5 點。`,

  green: `你現在戴著「綠帽」，遵循愛德華・狄波諾六頂思考帽的綠帽角色。
發揮創意，針對使用者的煩惱提出幾個不同角度、跳脫常規的新點子或做法。
鼓勵天馬行空，但每個點子要講清楚具體是什麼。
用繁體中文回答，條列呈現，簡短扼要，不超過 4 點。`,

  blue: `你現在戴著「藍帽」，遵循愛德華・狄波諾六頂思考帽的藍帽角色，
負責統籌全局。用一小段話，幫使用者整理「接下來可以先做哪一步」，
像主持人一樣做總結，不要重複前面幾頂帽子的內容。
用繁體中文回答，簡短扼要，3-4 句話的一段總結建議。`,
};

const HAT_NAMES = {
  white: '白帽',
  red: '紅帽',
  black: '黑帽',
  yellow: '黃帽',
  green: '綠帽',
  blue: '藍帽',
};

// 一次最多接受多長的輸入
//
// 為什麼要有這行：沒有它，任何人都能貼 10 萬字進來，一次就把你的免費額度燒一大塊。
// 這叫 size cap，是最便宜的一道防線
const MAX_INPUT_CHARS = 4000;

// ⚠️ 這支 API 沒有做「認證」—— 也就是說，任何知道你網址的人都可以用它
//
// 今天這樣是刻意的（加登入會讓課程做不完），但你要知道這件事：
// 你的網址一貼出去，別人就能拿你的 key 去問 AI 問題
//
// 真的要給不特定的人用，最少要加這三樣（今天不做，但你該知道名字）：
//   1. 限流 rate limit — 同一個人一分鐘最多幾次
//   2. 認證 auth — 只有登入的人能用
//   3. 用量上限 quota — 一天最多花多少
export async function POST(request) {
  // 1. 拿到前端送來的東西：煩惱內容 + 要用哪一頂帽子
  const { input, hat } = await request.json();

  if (!input || !input.trim()) {
    return Response.json({ error: '沒有輸入內容' }, { status: 400 });
  }

  if (input.length > MAX_INPUT_CHARS) {
    return Response.json(
      { error: `一次最多 ${MAX_INPUT_CHARS} 個字，你給了 ${input.length} 個` },
      { status: 413 }
    );
  }

  const systemPrompt = HAT_PROMPTS[hat];
  if (!systemPrompt) {
    return Response.json(
      { error: `不認識的帽子：${hat}。只接受 white / red / black / yellow / green / blue` },
      { status: 400 }
    );
  }

  // 2. 拿 API key —— 這個值來自 Vercel 的環境變數，不在程式碼裡
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: '還沒設定 GROQ_API_KEY。到 Vercel 專案 → Settings → Environment Variables 加上它，然後 Redeploy' },
      { status: 500 }
    );
  }

  // 3. 呼叫 Groq，用這頂帽子對應的角色設定
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // ⚠️ 這行不能拿掉 —— 少了 User-Agent，Groq 會回 403
        'User-Agent': 'unext-ai-dev-workshop/1.0',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          { role: 'user', content: `我的煩惱是：${input}` },
        ],
        max_completion_tokens: 500,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return Response.json(
        { error: `Groq 回了 ${res.status}`, detail: detail.slice(0, 500) },
        { status: 502 }
      );
    }

    const data = await res.json();
    const output = data.choices?.[0]?.message?.content ?? '(AI 沒有回傳內容)';
    return Response.json({ output, hat, hatName: HAT_NAMES[hat] });
  } catch (err) {
    return Response.json({ error: `呼叫失敗：${err.message}` }, { status: 500 });
  }
}
