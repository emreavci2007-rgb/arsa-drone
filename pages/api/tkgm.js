export default async function handler(req, res) {
  const { action, ilId, ilceId, mahalleId, ada, parsel } = req.query;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://parselsorgu.tkgm.gov.tr/',
    'Origin': 'https://parselsorgu.tkgm.gov.tr'
  };
  try {
    let url;
    if (action === 'iller') {
      url = 'https://parselsorgu.tkgm.gov.tr/app/modules/administrativeQuery/data/ilListe.json';
    } else if (action === 'ilceler') {
      url = `https://cbsapi.tkgm.gov.tr/megsiswebapi.v3.1/api/idariYapi/ilceListe?ilId=${ilId}`;
    } else if (action === 'mahalleler') {
      url = `https://cbsapi.tkgm.gov.tr/megsiswebapi.v3.1/api/idariYapi/mahalleListe?ilceId=${ilceId}`;
    } else if (action === 'parsel') {
      url = `https://cbsapi.tkgm.gov.tr/megsiswebapi.v3/api/parsel/${mahalleId}/${ada}/${parsel}`;
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }
    const r = await fetch(url, { headers });
    if (!r.ok) return res.status(r.status).json({ error: `TKGM API error: ${r.status}` });
    const data = await r.json();
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
