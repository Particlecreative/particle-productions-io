const router = require('express').Router();
const { verifyJWT } = require('../middleware/auth');

const MONDAY_TOKEN = process.env.MONDAY_API_TOKEN;
const MONDAY_URL = 'https://api.monday.com/v2';

router.use(verifyJWT);

// POST /api/monday/query — proxy Monday.com GraphQL queries
router.post('/query', async (req, res) => {
  if (!MONDAY_TOKEN) return res.status(400).json({ error: 'Monday.com API token not configured' });
  try {
    const response = await fetch(MONDAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': MONDAY_TOKEN,
        'API-Version': '2024-10',
      },
      body: JSON.stringify({ query: req.body.query, variables: req.body.variables }),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
