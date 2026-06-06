import { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';

const SUPABASE_URL = 'https://smcudgtdhxfdaocnrnuo.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtY3VkZ3RkaHhmZGFvY25ybnVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2OTM5NDgsImV4cCI6MjA5NjI2OTk0OH0.aMJuV2VYg3D9y8DWvilXNbptC2Xh4u7lgbbsNZMihLU';

const centroid = (coords) => {
  const pts = coords[0];
  const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const lng = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  return { lat, lng };
};

export default function Home() {
  const [iller, setIller] = useState([]);
  const [ilceler, setIlceler] = useState([]);
  const [mahalleler, setMahalleler] = useState([]);
  const [sel, setSel] = useState({ il: '', ilce: '', mahalle: '', ada: '', parsel: '' });
  const [parselData, setParselData] = useState(null);
  const [loading, setLoading] = useState({ iller: true, ilceler: false, mahalle: false, parsel: false, drone: false });
  const [droneResult, setDroneResult] = useState(null);
  const [error, setError] = useState('');
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerRef = useRef(null);

  useEffect(() => {
    fetch('/api/tkgm?action=iller')
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : (data.features || []);
        setIller(list);
        setLoading(l => ({ ...l, iller: false }));
      })
      .catch(() => setLoading(l => ({ ...l, iller: false })));
  }, []);

  useEffect(() => {
    if (!sel.il) return;
    setLoading(l => ({ ...l, ilceler: true }));
    setIlceler([]); setMahalleler([]);
    setSel(s => ({ ...s, ilce: '', mahalle: '' }));
    fetch(`/api/tkgm?action=ilceler&ilId=${sel.il}`)
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : (data.features || []);
        setIlceler(list);
        setLoading(l => ({ ...l, ilceler: false }));
      });
  }, [sel.il]);

  useEffect(() => {
    if (!sel.ilce) return;
    setLoading(l => ({ ...l, mahalle: true }));
    setMahalleler([]);
    setSel(s => ({ ...s, mahalle: '' }));
    fetch(`/api/tkgm?action=mahalleler&ilceId=${sel.ilce}`)
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : (data.features || []);
        setMahalleler(list);
        setLoading(l => ({ ...l, mahalle: false }));
      });
  }, [sel.ilce]);

  useEffect(() => {
    if (typeof window === 'undefined' || mapInstanceRef.current) return;
    import('leaflet').then(({ default: L }) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
      setTimeout(() => {
        const map = L.map(mapRef.current, { center: [39.9, 32.8], zoom: 6, zoomControl: true, attributionControl: false });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        mapInstanceRef.current = map;
      }, 100);
    });
  }, []);

  const getId = (item) => {
    if (!item) return '';
    return (item.id ?? item.value ?? item.properties?.id ?? '').toString();
  };
  const getName = (item) => {
    if (!item) return '';
    return item.text ?? item.ad ?? item.name ?? item.properties?.ad ?? item.properties?.text ?? '';
  };

  const handleParselSorgu = async () => {
    if (!sel.mahalle || !sel.ada || !sel.parsel) {
      setError('Mahalle, ada ve parsel numarasını giriniz.'); return;
    }
    setError(''); setParselData(null); setDroneResult(null);
    setLoading(l => ({ ...l, parsel: true }));
    try {
      const r = await fetch(`/api/tkgm?action=parsel&mahalleId=${sel.mahalle}&ada=${sel.ada}&parsel=${sel.parsel}`);
      const data = await r.json();
      if (!data?.geometry) throw new Error('Parsel bulunamadı');
      setParselData(data);
      const L = (await import('leaflet')).default;
      if (mapInstanceRef.current) {
        if (layerRef.current) mapInstanceRef.current.removeLayer(layerRef.current);
        const layer = L.geoJSON(data, { style: { color: '#f59e0b', weight: 2.5, fillColor: '#f59e0b', fillOpacity: 0.15 } }).addTo(mapInstanceRef.current);
        layerRef.current = layer;
        mapInstanceRef.current.fitBounds(layer.getBounds(), { padding: [40, 40] });
      }
    } catch (e) { setError('Parsel bulunamadı. Bilgileri kontrol edin.'); }
    setLoading(l => ({ ...l, parsel: false }));
  };

  const handleDroneShot = async () => {
    if (!parselData) return;
    setLoading(l => ({ ...l, drone: true }));
    setDroneResult(null);
    const { lat, lng } = centroid(parselData.geometry.coordinates);
    const p = parselData.properties;
    const jobId = crypto.randomUUID();
    try {
      await fetch('/api/drone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, property_id: crypto.randomUUID(), latitude: lat.toFixed(6), longitude: lng.toFixed(6), address: `${p.mahalleAd || ''} ${p.adaNo}/${p.parselNo}` })
      });
      setDroneResult({ status: 'processing', jobId });
      pollResult(jobId);
    } catch (e) {
      setError('Drone çekimi başlatılamadı.');
      setLoading(l => ({ ...l, drone: false }));
    }
  };

  const pollResult = useCallback(async (jobId) => {
    let attempts = 0;
    const poll = setInterval(async () => {
      attempts++;
      try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/drone_images?job_id=eq.${jobId}&order=created_at.desc&limit=1`, {
          headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}` }
        });
        const data = await r.json();
        if (data?.length > 0) {
          clearInterval(poll);
          setDroneResult(prev => ({ ...prev, status: 'done', image: data[0].cloudinary_secure_url }));
          setLoading(l => ({ ...l, drone: false }));
        }
      } catch {}
      if (attempts > 20) { clearInterval(poll); setLoading(l => ({ ...l, drone: false })); }
    }, 3000);
  }, []);

  return (
    <>
      <Head><title>ARDRONE — Parsel Drone Görüntüsü</title></Head>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <div style={{ width: 340, background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>AR<span style={{ color: 'var(--text)' }}>DRONE</span></div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Parsel → AI Drone Görüntüsü</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'İL', items: iller, val: sel.il, key: 'il', loading: loading.iller },
                { label: 'İLÇE', items: ilceler, val: sel.ilce, key: 'ilce', loading: loading.ilceler, disabled: !sel.il },
                { label: 'MAHALLE', items: mahalleler, val: sel.mahalle, key: 'mahalle', loading: loading.mahalle, disabled: !sel.ilce },
              ].map(({ label, items, val, key, loading: ld, disabled }) => (
                <div key={key}>
                  <label style={labelStyle}>{label}</label>
                  <select value={val} onChange={e => setSel(s => ({ ...s, [key]: e.target.value }))} disabled={disabled} style={selectStyle}>
                    <option value="">{ld ? 'Yükleniyor...' : items.length === 0 && !disabled ? 'Veri yok' : `${label.charAt(0) + label.slice(1).toLowerCase()} seçin`}</option>
                    {items.map(i => <option key={getId(i)} value={getId(i)}>{getName(i)}</option>)}
                  </select>
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[['ada', 'ADA', 'Örn: 123'], ['parsel', 'PARSEL', 'Örn: 45']].map(([key, label, ph]) => (
                  <div key={key}>
                    <label style={labelStyle}>{label}</label>
                    <input placeholder={ph} value={sel[key]} onChange={e => setSel(s => ({ ...s, [key]: e.target.value }))} style={inputStyle} />
                  </div>
                ))}
              </div>
              {error && <div style={{ fontSize: 12, color: 'var(--danger)', padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 6 }}>{error}</div>}
              <button onClick={handleParselSorgu} disabled={loading.parsel || !sel.mahalle} style={btn('#e8eaed', '#0a0b0d', loading.parsel)}>
                {loading.parsel ? 'Sorgulanıyor...' : 'Parseli Sorgula'}
              </button>
            </div>

            {parselData && (
              <div style={{ marginTop: 16, padding: 14, background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--mono)', marginBottom: 8 }}>PARSEL BİLGİLERİ</div>
                {[['Ada/Parsel', `${parselData.properties.adaNo}/${parselData.properties.parselNo}`], ['Mahalle', parselData.properties.mahalleAd], ['Nitelik', parselData.properties.nitelik], ['Alan', `${parselData.properties.alan} m²`]].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: 'var(--muted)' }}>{k}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{v}</span>
                  </div>
                ))}
                <button onClick={handleDroneShot} disabled={loading.drone} style={{ ...btn('#f59e0b', '#000', loading.drone), marginTop: 12, width: '100%' }}>
                  {loading.drone ? '⏳ İşleniyor...' : '🛸 Drone Çekimi Al'}
                </button>
              </div>
            )}

            {droneResult?.status === 'processing' && (
              <div style={{ marginTop: 12, padding: 12, background: 'rgba(245,158,11,0.08)', borderRadius: 8, border: '1px solid rgba(245,158,11,0.2)', fontSize: 12, color: 'var(--accent)' }}>
                🛰 AI görüntüyü işliyor... (8-15 sn)
              </div>
            )}
            {droneResult?.image && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, color: '#10b981', fontFamily: 'var(--mono)', marginBottom: 6 }}>✓ DRONE GÖRSELİ HAZIR</div>
                <img src={droneResult.image} alt="Drone" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)' }} />
                <a href={droneResult.image} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 8, ...btn('#10b981', '#000', false), textDecoration: 'none', textAlign: 'center', padding: '10px' }}>İndir</a>
              </div>
            )}
          </div>
        </div>
        <div style={{ flex: 1, position: 'relative' }}>
          <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
        </div>
      </div>
    </>
  );
}

const labelStyle = { display: 'block', fontSize: 11, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 };
const selectStyle = { width: '100%', background: 'var(--surface2)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'var(--text)', padding: '9px 12px', fontSize: 13, outline: 'none', appearance: 'none' };
const inputStyle = { width: '100%', background: 'var(--surface2)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'var(--text)', padding: '9px 12px', fontSize: 13, outline: 'none', fontFamily: 'var(--mono)' };
const btn = (bg, color, disabled) => ({ width: '100%', padding: '10px 16px', borderRadius: 8, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, background: bg, color, opacity: disabled ? 0.5 : 1 });
