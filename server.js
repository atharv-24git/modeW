// server.js — simple Express proxy
require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// Basic CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Helper: call Gemini with correct API format
async function callGemini(text, tone) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Gemini API key not configured in .env');
  
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${key}`;
  
  const prompt = `Analyze the following text in a ${tone} tone and provide:

1. Mood label (single word or short phrase)
2. Emotional tone analysis (3-4 key emotions detected)
3. Suggested empathetic response
4. Writing style observations

Text to analyze: "${text}"

Return the response as a JSON object with these exact keys: mood, emotions, suggestedResponse, writingStyle.`;

  const body = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }]
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status} - ${await response.text()}`);
  }

  const data = await response.json();
  
  // Extract the text from Gemini response
  if (data.candidates && data.candidates[0] && data.candidates[0].content) {
    const responseText = data.candidates[0].content.parts[0].text;
    
    // Try to parse JSON from the response, or return as is
    try {
      return JSON.parse(responseText);
    } catch (e) {
      return { rawResponse: responseText };
    }
  }
  
  throw new Error('Unexpected response format from Gemini');
}

// Helper: call DeepSeek with correct API format
async function callDeepseak(text, tone) {
  const key = process.env.DEEPSEAK_API_KEY;
  if (!key) throw new Error('DeepSeek API key not configured in .env');
  
  const url = 'https://api.deepseek.com/v1/chat/completions';
  
  const prompt = `Analyze the following text in a ${tone} tone and provide a JSON response with these exact fields:
- mood: single word or short phrase describing the overall mood
- emotions: array of 3-4 key emotions detected  
- suggestedResponse: an empathetic response paragraph
- writingStyle: observations about writing style and tone

Text: "${text}"`;

  const body = {
    model: "deepseek-chat",
    messages: [
      {
        role: "user",
        content: prompt
      }
    ],
    max_tokens: 1000,
    temperature: 0.7
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`DeepSeek API error: ${response.status} - ${await response.text()}`);
  }

  const data = await response.json();
  
  if (data.choices && data.choices[0] && data.choices[0].message) {
    const responseText = data.choices[0].message.content;
    
    // Try to parse JSON from the response
    try {
      return JSON.parse(responseText);
    } catch (e) {
      return { rawResponse: responseText };
    }
  }
  
  throw new Error('Unexpected response format from DeepSeek');
}

app.post('/api/analyze', async (req, res) => {
  try {
    const { text, providers, tone = 'empathetic' } = req.body;
    
    if (!text) return res.status(400).json({ error: 'Missing text' });
    
    const results = {};
    
    if (providers && providers.gemini) {
      try {
        results.Gemini = await callGemini(text, tone);
      } catch (e) {
        results.Gemini = { error: e.message };
      }
    }
    
    if (providers && providers.deepseak) {
      try {
        results.Deepseak = await callDeepseak(text, tone);
      } catch (e) {
        results.Deepseak = { error: e.message };
      }
    }
    
    res.json(results);
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log('Server running on http://localhost:' + PORT));