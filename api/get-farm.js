export default async function handler(req, res) {
  const { farmId } = req.query;

  if (!farmId) {
    return res.status(400).json({ error: 'Farm ID is required' });
  }

  try {
    const response = await fetch(`https://api.sunflower-land.com/community/farms/${farmId}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ 
        error: `Sunflower Land API returned status ${response.status}. Double check your Farm ID.` 
      });
    }

    const data = await response.json();
    res.status(200).json({ success: true, farm: data });
  } catch (error) {
    res.status(500).json({ error: 'Server connection failed', details: error.message });
  }
}
     
