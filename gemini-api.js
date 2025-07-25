const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;
const API_KEY = 'AlzaSyDVu6lfu7JpbfYumzizlPPJeJooW1gX_e8';

app.use(bodyParser.json());

// ✅ Gemini Models (official)
const MODELS = {
  '2.5-pro': 'models/gemini-2.5-pro',
  '2.5-flash': 'models/gemini-2.5-flash',
  '2.5-flash-lite': 'models/gemini-2.5-flash-lite',
  '2.0-flash': 'models/gemini-2.0-flash',
  '2.0-flash-lite': 'models/gemini-2.0-flash-lite',
};

// 🔒 Rate Limit Settings (RPM)
const RATE_LIMITS = {
  '2.5-pro': 5,
  '2.5-flash': 10,
  '2.5-flash-lite': 15,
  '2.0-flash': 15,
  '2.0-flash-lite': 30,
};

// 📦 In-memory request counter
const rateCounters = {};

// ⏱ Reset every minute
setInterval(() => {
  for (let key in rateCounters) {
    rateCounters[key] = 0;
  }
}, 60 * 1000);

// 🚔 Rate Limit Middleware
function rateLimit(model) {
  return (req, res, next) => {
    const rpm = RATE_LIMITS[model];
    if (!rateCounters[model]) rateCounters[model] = 0;
    if (rateCounters[model] >= rpm) {
      return res.status(429).json({ error: `Rate limit exceeded for model ${model}` });
    }
    rateCounters[model]++;
    next();
  };
}

// 📡 Gemini API Call
async function callGemini(model, messages) {
  try {
    const result = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${API_KEY}`,
      {
        contents: messages,
        generationConfig: {
          temperature: 0.8,
          topK: 32,
          topP: 1,
          maxOutputTokens: 2048,
          stopSequences: []
        }
      },
      { headers: { 'Content-Type': 'application/json' } }
    );
    return result.data?.candidates?.[0]?.content?.parts?.[0]?.text || '[NO RESPONSE]';
  } catch (err) {
    console.error('Gemini API Error:', err?.response?.data || err.message);
    return '[ERROR] Gemini API failed.';
  }
}

// 🧠 Message Builder (System prompt support)
const buildMessages = (messages, systemPrompt = '') => {
  const convo = [];
  if (systemPrompt) {
    convo.push({ role: 'user', parts: [{ text: systemPrompt }] });
    convo.push({ role: 'model', parts: [{ text: 'Understood.' }] });
  }
  for (let msg of messages) {
    convo.push({ role: msg.role, parts: [{ text: msg.text }] });
  }
  return convo;
};

// ✅ POST /chat — Basic chat
app.post('/chat', (req, res, next) => {
  const { model = '2.0-flash', messages } = req.body;
  if (!MODELS[model]) return res.status(400).json({ error: 'Invalid model' });
  rateLimit(model)(req, res, async () => {
    const built = buildMessages(messages || []);
    const reply = await callGemini(MODELS[model], built);
    res.json({ response: reply });
  });
});

// 🤖 POST /agent — AI assistant with custom system prompt
app.post('/agent', (req, res, next) => {
  const { model = '2.5-flash', query, context = '' } = req.body;
  if (!MODELS[model]) return res.status(400).json({ error: 'Invalid model' });
  const systemPrompt = `
You are a top-level intelligent coding assistant AI.
Respond concisely and plan step-by-step like a developer.
Context: ${context}
  `;
  const msgs = [{ role: 'user', text: query }];
  rateLimit(model)(req, res, async () => {
    const built = buildMessages(msgs, systemPrompt);
    const reply = await callGemini(MODELS[model], built);
    res.json({ response: reply });
  });
});

// 🌐 GET / — Ping route
app.get('/', (req, res) => {
  res.send('🔥 Gemini API with 2.0/2.5 models + RPM limit running!');
});

app.listen(PORT, () => {
  console.log(`🚀 Server ready at http://localhost:${PORT}`);
});
