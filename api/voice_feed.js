module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    events: [],
    mode: "browser",
    engine_running: false
  });
};
