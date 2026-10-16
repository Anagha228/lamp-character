import express from 'express';

const app = express();
app.use(express.json({ limit: '5mb' }));   // room for one camera frame

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// The only place that talks to the cloud model.
// messages: [{ role: 'user' | 'model', text }]; image: optional base64 JPEG (no data: prefix)
const FALLBACK = process.env.GEMINI_FALLBACK || 'gemini-2.5-flash-lite';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callModel(model, { system, messages, image, json }) {
  const contents = messages.map((m, i) => {
    const parts = [{ text: m.text }];
    const isLast = i === messages.length - 1;
    if (image && isLast) parts.push({ inlineData: { mimeType: 'image/jpeg', data: image } });
    return { role: m.role, parts };
  });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
      body: JSON.stringify({
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents,
        generationConfig: json ? { responseMimeType: 'application/json' } : undefined,
      }),
    }
  );
  if (!res.ok) {
    const err = new Error(`model error ${res.status}: ${await res.text()}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
}

// Try the main model, retry once if it is busy, then fall back to a second model.
async function askModel(args) {
  const attempts = [MODEL, MODEL, FALLBACK];
  let lastErr;
  for (let i = 0; i < attempts.length; i++) {
    try {
      return await callModel(attempts[i], args);
    } catch (err) {
      lastErr = err;
      if (err.status !== 503 && err.status !== 429) throw err;   // other errors will not fix themselves
      console.warn(`${attempts[i]} busy (${err.status}), retry ${i + 1}`);
      await sleep(600 * (i + 1));
    }
  }
  throw lastErr;
}

app.post('/api/ask', async (req, res) => {
  const t0 = Date.now();
  try {
    const text = await askModel(req.body);
    res.json({ text, ms: Date.now() - t0 });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/models', async (req, res) => {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100', {
    headers: { 'x-goog-api-key': KEY },
  });
  const data = await r.json();
  res.json(
    (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => m.name.replace('models/', ''))
  );
});

app.listen(3001, () => console.log('lamp server on :3001'));

