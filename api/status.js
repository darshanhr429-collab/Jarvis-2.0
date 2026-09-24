module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const apiKey = process.env.GEMINI_API_KEY || '';
  res.status(200).json({
    status: 'online',
    version: '5.0',
    edition: 'Kali Ops Terminal (Cloud)',
    platform: 'Vercel Serverless',
    using_gemini: Boolean(apiKey),
    model_name: 'gemini-2.5-flash',
    key_preview: apiKey ? `${apiKey.substring(0, 6)}...` : '',
    active_voice_mode: 'browser',
    cpu_percent: Math.floor(Math.random() * 15) + 12,
    memory_percent: Math.floor(Math.random() * 20) + 28,
    net_sent: '42.8 KB',
    net_recv: '128.4 KB',
    memories: [],
    last_error: null
  });
};
