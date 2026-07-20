export default async function handler(req, res) {
  try {
    const response = await fetch('https://sfl.world/api/v1/prices', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `API responded with status ${response.status}` });
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to connect to API', details: error.message });
  }
}