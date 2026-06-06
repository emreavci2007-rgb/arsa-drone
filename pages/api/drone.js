export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { job_id, property_id, latitude, longitude, address } = req.body;
  const N8N_WEBHOOK = 'https://codex5087.app.n8n.cloud/webhook/drone-shot';
  try {
    const r = await fetch(N8N_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id, property_id, latitude, longitude, address })
    });
    const data = await r.text();
    res.status(200).json({ ok: true, response: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
