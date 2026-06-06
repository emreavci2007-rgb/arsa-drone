export default async function handler(req, res) {
  const { action, x, y, mahalleId, ada, parsel } = req.query;
  const h = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://parselsorgu.tkgm.gov.tr/',
    'Origin': 'https://parselsorgu.tkgm.gov.tr',
    'Accept': 'application/json, text/plain, */*'
  };
 
  try {
    res.setHeader('Cache-Control', 's-maxage=60');
 
    // Coordinate-based parcel lookup (click on map)
    if (action === 'koordinat') {
      const r = await fetch(
        `https://cbsapi.tkgm.gov.tr/megsiswebapi.v3/api/parsel/koordinat?x=${x}&y=${y}`,
        { headers: h }
      );
      if (!r.ok) return res.status(r.status).json({ error: `TKGM: ${r.status}` });
      return res.json(await r.json());
    }
 
    // Manual ada/parsel lookup
    if (action === 'parsel') {
      const r = await fetch(
        `https://cbsapi.tkgm.gov.tr/megsiswebapi.v3/api/parsel/${mahalleId}/${ada}/${parsel}`,
        { headers: h }
      );
      if (!r.ok) return res.status(r.status).json({ error: `TKGM: ${r.status}` });
      return res.json(await r.json());
    }
 
    // Iller list (still useful for display)
    if (action === 'iller') {
      const r = await fetch(
        'https://parselsorgu.tkgm.gov.tr/app/modules/administrativeQuery/data/ilListe.json',
        { headers: h }
      );
      if (!r.ok) return res.status(r.status).json({ error: `TKGM: ${r.status}` });
      return res.json(await r.json());
    }
 
    res.status(400).json({ error: 'Invalid action' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
