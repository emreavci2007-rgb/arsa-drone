export default async function handler(req, res) {
  const { endpoint } = req.query;
  const base = 'https://cbsapi.tkgm.gov.tr/megsiswebapi.v3/api';
  try {
    const r = await fetch(`${base}/${endpoint}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://parselsorgu.tkgm.gov.tr/' }
    });
    const data = await r.json();
    res.setHeader('Cache-Control', 's-maxage=3600');
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
