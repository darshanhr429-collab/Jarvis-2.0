module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const apiKey = process.env.GEMINI_API_KEY || '';
  res.status(200).json({
    gemini_connected: Boolean(apiKey),
    key_preview: apiKey ? `${apiKey.substring(0, 6)}...` : '',
    model: 'gemini-2.5-flash',
    last_error: null
  });
};
