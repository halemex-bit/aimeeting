import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const geminiKey = process.env.GEMINI_API_KEY;

// Endpoint to handle audio chunk processing
app.post('/api/process-audio', async (req, res) => {
  try {
    const { audioData, mimeType } = req.body;

    if (!audioData) {
      return res.status(400).json({ error: 'Missing audio data' });
    }

    if (!geminiKey) {
      console.warn("GEMINI_API_KEY is not configured. Falling back to mocked JSON simulation.");
      return res.json(getMockedResponse());
    }

    const ai = new GoogleGenerativeAI(geminiKey);
    
    // We target gemini-2.5-flash (or similar model) as it natively processes multimodal inputs (audio/JSON output)
    const model = ai.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: {
        responseMimeType: 'application/json',
      }
    });

    const systemPrompt = `You are an expert, highly efficient executive assistant AI. You are listening to a live, continuous meeting transcript in chunks. 

Your sole purpose is to analyze the text, ignore the fluff, and instantly extract key decisions, general action items, and any direct mentions or tasks assigned to "Halem".

**INSTRUCTIONS:**
1. **Analyze Context:** Read/listen to the provided chunk of transcript/audio. 
2. **Filter Noise:** Ignore casual greetings, filler words, or irrelevant small talk.
3. **Target "Halem":** Pay strict attention anytime the name "Halem" (or variations like Halim) is mentioned. If Halem is assigned a task or asked a question, this is a HIGH PRIORITY alert.
4. **Output Format:** You MUST respond ONLY with a strictly formatted JSON object. Do not include markdown formatting like \`\`\`json or any conversational text.

**JSON OUTPUT STRUCTURE:**
{
  "has_significant_update": boolean, // true ONLY if there is a decision, action item, or direct mention. False if it's just general chatter.
  "direct_alerts_for_halem": [
    // Array of strings detailing what Halem needs to know or do right now. Leave empty if none.
  ],
  "general_key_notes": [
    // Array of strings summarizing major decisions, numbers discussed (e.g., budgets in RM), or project pivots. Leave empty if none.
  ],
  "general_action_items": [
    // Array of objects for tasks assigned to other people: {"assignee": "Name", "task": "description"}. Leave empty if none.
  ]
}`;

    const prompt = "Analyze this audio chunk and return the structured JSON results.";

    const result = await model.generateContent([
      prompt,
      systemPrompt,
      {
        inlineData: {
          data: audioData, // Base64 chunk from client
          mimeType: mimeType || 'audio/webm'
        }
      }
    ]);

    const rawResponse = result.response.text();
    const parsedData = JSON.parse(rawResponse);
    res.json(parsedData);

  } catch (error) {
    console.error('Error processing audio endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper for local mock updates when Gemini Key is not supplied yet
function getMockedResponse() {
  const decisions = [
    "Bajet pemasaran diluluskan (RM 15,000).",
    "Tarikh pelancaran ditukar kepada 15 Ogos.",
    "Vendor katering disahkan untuk acara."
  ];
  const alerts = [
    "Halem, tolong siapkan sebut harga vendor sebelum Jumaat.",
    "Halem dikehendaki menyemak draf kontrak perundangan.",
    "Halem sila update status tugas dalam group telegram nanti."
  ];
  const items = [
    { assignee: "Sarah", task: "Sediakan laporan slaid pembentangan" },
    { assignee: "Luqman", task: "Hubungi vendor sistem bunyi" },
    { assignee: "Ain", task: "Kemaskini reka bentuk poster media sosial" }
  ];

  const hasUpdate = Math.random() > 0.4;
  return {
    has_significant_update: hasUpdate,
    direct_alerts_for_halem: hasUpdate ? [alerts[Math.floor(Math.random() * alerts.length)]] : [],
    general_key_notes: hasUpdate ? [decisions[Math.floor(Math.random() * decisions.length)]] : [],
    general_action_items: hasUpdate ? [items[Math.floor(Math.random() * items.length)]] : []
  };
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
