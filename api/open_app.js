module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    response: "OS application launching requires the local desktop runtime, Sir. In this cloud preview, browser commands, voice control, and AI conversations are fully active."
  });
};
