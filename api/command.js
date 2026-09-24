module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  let text = '';
  if (req.method === 'POST') {
    text = (req.body && (req.body.text || req.body.command)) || '';
    if (!text && typeof req.body === 'string') {
      try {
        const parsed = JSON.parse(req.body);
        text = parsed.text || parsed.command || '';
      } catch (e) {}
    }
  } else {
    text = (req.query && (req.query.text || req.query.command)) || '';
  }

  text = text.trim();
  if (!text) {
    return res.status(200).json({ response: "At your service, Sir. What would you like me to do?" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(200).json({
      response: "JARVIS Cloud Node online. Connect your Gemini API key in the HUD or set GEMINI_API_KEY in Vercel project environment variables, Sir."
    });
  }

  try {
    const models = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash'];
    for (const model of models) {
      try {
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: "You are JARVIS (Just A Rather Very Intelligent System), an advanced AI assistant. Address the user as 'Sir'. Keep responses concise (2-4 sentences), spoken natural English, free of markdown, bullet points, asterisks, or code blocks." }]
            },
            contents: [{ role: 'user', parts: [{ text }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 350 }
          })
        });

        if (resp.ok) {
          const data = await resp.json();
          const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (reply) return res.status(200).json({ response: reply });
        }
      } catch (err) {}
    }
    return res.status(200).json({ response: "All systems nominal, Sir, though the external neural uplink is temporarily saturated." });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
