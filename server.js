import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const geminiKey = process.env.GEMINI_API_KEY;

app.post('/api/process-audio', async (req, res) => {
  try {
    const { transcript } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: 'Missing transcript' });
    }

    if (!geminiKey) {
      console.warn("GEMINI_API_KEY is not configured.");
      return res.status(500).json({ error: 'Gemini API key is missing.' });
    }

    const ai = new GoogleGenerativeAI(geminiKey);
    const model = ai.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: {
        responseMimeType: 'application/json',
      }
    });

    const systemPrompt = `You are an expert, highly efficient executive assistant AI. You are listening to a live, continuous meeting transcript in chunks. 

Your sole purpose is to analyze the text, ignore the fluff, and instantly extract key decisions, general action items, and any direct mentions or tasks assigned to "Halem".

**INSTRUCTIONS:**
1. **Analyze Context:** Read the provided chunk of transcript. 
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

    const result = await model.generateContent([
      systemPrompt,
      `TRANSCRIPT CHUNK:\n${transcript}`
    ]);

    const rawResponse = result.response.text();
    const parsedData = JSON.parse(rawResponse);
    res.json(parsedData);

  } catch (error) {
    console.error('Error processing transcript:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint for summarization
app.post('/api/summarize', async (req, res) => {
  try {
    const { fullTranscript } = req.body;
    if (!fullTranscript) {
      return res.status(400).json({ error: 'Missing full transcript' });
    }
    if (!geminiKey) {
      return res.status(500).json({ error: 'Gemini API key is missing' });
    }

    const ai = new GoogleGenerativeAI(geminiKey);
    const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = `Provide a concise, high-level executive summary of the following meeting transcript. Format the output in clean, brief bullet points. Focus on key discussions, highlights, and primary themes.

TRANSCRIPT:
${fullTranscript}`;

    const result = await model.generateContent(prompt);
    res.json({ summary: result.response.text() });
  } catch (error) {
    console.error('Error summarizing:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
