import { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';

const tkgm = (path) => fetch(`/api/tkgm?endpoint=${encodeURIComponent(path)}`).then(r => r.json());

const centroid = (coords) => {
  const pts = coords[0];
  const n = pts.length;
  const lat = pts.reduce((s, p) => s + p[1], 0) / n;
  const lng = pts.reduce((s, p) => s + p[0], 0) / n;
  return { lat, lng };
};

const SUPABASE_URL = 'https://smcudgtdhxfdaocnrnuo.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtY3VkZ3RkaHhmZGFvY25ybnVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2OTM5NDgsImV4cCI6MjA5NjI2OTk0OH0.aMJuV2VYg3D9y8DWvilXNbptC2Xh4u7lgbbsNZMihLU';

export default function Home() {
  const [iller, setIller] = useState([]);
  const [ilceler, setIlceler] = useState([]);
  const [mahalleler, setMahalleler] = useState([]);
  const [sel, setSel] = useState({ il: '', ilce: '', mahalle: '', ada: '', parsel: '' });
  const [parselData, setParselData] = useState(null);
  const [loading, setLoading] = useState({ iller: true, ilceler: false, mahalle: false, parsel: false, drone: false });
  const [droneResult, setDroneResult] = useState(null);
  const [error, setError] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerRef = useRef(null);

  useEffect(() => {
    tkgm('idaribirim/iller').then(d => {
      setIller(Array.isArray(d) ? d : d.features || []);
      setLoading(l => ({ ...l, iller: false }));
    });
  }, []);

  useEffect(() => {
    if (!sel.il) return;
    setLoading(l => ({ ...l, ilceler: true }));
    setIlceler([]); setMahalleler([]);
    setSel(s => ({ ...s, ilce: '', mahalle: '', ada: '', parsel: '' }));
    tkgm(`idaribirim/ilceler/${sel.il}`).then(d => {
      setIlceler(Array.isArray(d) ? d : d.features || []);
      setLoading(l => ({ ...l, ilceler: false }));
    });
  }, [sel.il]);

  useEffect(() => {
    if (!sel.ilce) return;
    setLoading(l => ({ ...l, mahalle: true }));
    setMahalleler([]);
    setSel(s => ({ ...s, mahalle: '', ada: '', parsel: '' }));
    tkgm(`idaribirim/mahalleler/${sel.ilce}`).then(d => {
      setMahalleler(Array.isArray(d) ? d : d.features || []);
      setLoading(l => ({ ...l, mahalle: false }));
    });
  }, [sel.ilce]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (mapInstanceRef.current) return;
    import('leaflet').then(L => {
      import('leaflet/dist/leaflet.css');
      const map = L.map(mapRef.current, {
        center: [39.9, 32.8], zoom: 6,
        zoomControl: true,
        attributionControl: false
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
      mapInstanceRef.current = map;
      setMapReady(true);
    });
  }, []);

  const handleParselSorgu = async () => {
    if (!sel.mahalle || !sel.ada || !sel.parsel) {
      setError('Mahalle, ada ve parsel numarasını giriniz.');
      return;
    }
    setError(''); setParselData(null); setDroneResult(null);
    setLoading(l => ({ ...l, parsel: true }));
    try {
      const data = await tkgm(`parsel/${sel.mahalle}/${sel.ada}/${sel.parsel}`);
      if (!data || !data.geometry) throw new Error('Parsel bulunamadı');
      setParselData(data);
      if (mapInstanceRef.current) {
        const L = (await import('leaflet')).default;
        if (layerRef.current) mapInstanceRef.current.removeLayer(layerRef.current);
        const layer = L.geoJSON(data, {
          style: { color: '#f59e0b', weight: 2.5, fillColor: '#f59e0b', fillOpacity: 0.15 }
        }).addTo(mapInstanceRef.current);
        layerRef.current = layer;
        mapInstanceRef.current.fitBounds(layer.getBounds(), { padding: [40, 40] });
      }
    } catch (e) {
      setError('Parsel bulunamadı. Bilgileri kontrol edin.');
    }
    setLoading(l => ({ ...l, parsel: false }));
  };

  const handleDroneShot = async () => {
    if (!parselData) return;
    setLoading(l => ({ ...l, drone: true }));
    setDroneResult(null);
    const { lat, lng } = centroid(parselData.geometry.coordinates);
    const p = parselData.properties;
    const jobId = crypto.randomUUID();
    const propertyId = crypto.randomUUID();
    try {
      await fetch('/api/drone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: jobId, property_id: propertyId,
          latitude: lat.toFixed(6), longitude: lng.toFixed(6),
          address: `${p.mahalleAd || ''} ${p.adaNo}/${p.parselNo}`
        })
      });
      setDroneResult({ status: 'processing', jobId, lat, lng });
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
        const r = await fetch(
          `${SUPABASE_URL}/rest/v1/drone_images?job_id=eq.${jobId}&order=created_at.desc&limit=1`,
          { headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}` } }
        );
        const data = await r.json();
        if (data && data.length > 0) {
          clearInterval(poll);
          setDroneResult(prev => ({ ...prev, status: 'done', image: data[0].cloudinary_secure_url }));
          setLoading(l => ({ ...l, drone: false }));
        }
      } catch {}
      if (attempts > 20) {
        clearInterval(poll);
        setLoading(l => ({ ...l, drone: false }));
      }
    }, 3000);
  }, []);

  const il = iller.find(i => (i.id || i.properties?.id)?.toString() === sel.il);
  const ilce = ilceler.find(i => (i.id || i.properties?.id)?.toString() === sel.ilce);
  const mahalle = mahalleler.find(i => (i.id || i.properties?.id)?.toString() === sel.mahalle);

  const getName = (item) => item?.ad || item?.properties?.ad || item?.text || '';
  const getId = (item) => (item?.id || item?.properties?.id)?.toString() || '';

  return (
    <>
      <Head>
        <title>ArDrone — Parsel Drone Görüntüsü</title>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      </Head>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        {/* Sidebar */}
        <div style={{
          width: 360, background: 'var(--surface)', borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0
        }}>
          {/* Header */}
          <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.5px' }}>
              AR<span style={{ color: 'var(--text)' }}>DRONE</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Parsel → AI Drone Görüntüsü</div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            {/* Form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>İl</label>
              <select value={sel.il} onChange={e => setSel(s => ({ ...s, il: e.target.value }))} style={selectStyle}>
                <option value="">{loading.iller ? 'Yükleniyor...' : 'İl seçin'}</option>
                {iller.map(i => <option key={getId(i)} value={getId(i)}>{getName(i)}</option>)}
              </select>

              <label style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>İlçe</label>
              <select value={sel.ilce} onChange={e => setSel(s => ({ ...s, ilce: e.target.value }))} disabled={!sel.il} style={selectStyle}>
                <option value="">{loading.ilceler ? 'Yükleniyor...' : 'İlçe seçin'}</option>
                {ilceler.map(i => <option key={getId(i)} value={getId(i)}>{getName(i)}</option>)}
              </select>

              <label style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Mahalle</label>
              <select value={sel.mahalle} onChange={e => setSel(s => ({ ...s, mahalle: e.target.value }))} disabled={!sel.ilce} style={selectStyle}>
                <option value="">{loading.mahalle ? 'Yükleniyor...' : 'Mahalle seçin'}</option>
                {mahalleler.map(i => <option key={getId(i)} value={getId(i)}>{getName(i)}</option>)}
              </select>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Ada</label>
                  <input placeholder="Örn: 123" value={sel.ada} onChange={e => setSel(s => ({ ...s, ada: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Parsel</label>
                  <input placeholder="Örn: 45" value={sel.parsel} onChange={e => setSel(s => ({ ...s, parsel: e.target.value }))} style={inputStyle} />
                </div>
              </div>

              {error && <div style={{ fontSize: 12, color: 'var(--danger)', padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 6 }}>{error}</div>}

              <button onClick={handleParselSorgu} disabled={loading.parsel || !sel.mahalle} style={btnStyle('primary', loading.parsel)}>
                {loading.parsel ? 'Sorgulanıyor...' : 'Parseli Sorgula'}
              </button>
            </div>

            {/* Parsel Info */}
            {parselData && (
              <div style={{ marginTop: 20, padding: 16, background: 'var(--surface2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--mono)', letterSpacing: '0.06em', marginBottom: 10 }}>PARSEL BİLGİLERİ</div>
                {[
                  ['Ada / Parsel', `${parselData.properties.adaNo} / ${parselData.properties.parselNo}`],
                  ['Mahalle', parselData.properties.mahalleAd],
                  ['Nitelik', parselData.properties.nitelik],
                  ['Alan', `${parselData.properties.alan} m²`],
                  ['İlçe', parselData.properties.ilceAd],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                    <span style={{ color: 'var(--muted)' }}>{k}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)' }}>{v}</span>
                  </div>
                ))}

                <button onClick={handleDroneShot} disabled={loading.drone} style={{ ...btnStyle('accent', loading.drone), marginTop: 14, width: '100%' }}>
                  {loading.drone ? '⏳ İşleniyor...' : '🛸 Drone Çekimi Al'}
                </button>
              </div>
            )}

            {/* Result */}
            {droneResult?.status === 'processing' && (
              <div style={{ marginTop: 16, padding: 14, background: 'rgba(245,158,11,0.08)', borderRadius: 8, border: '1px solid rgba(245,158,11,0.2)', fontSize: 12, color: 'var(--accent)' }}>
                🛰 AI görüntüyü işliyor... (8-15 sn)
              </div>
            )}

            {droneResult?.image && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--accent2)', fontFamily: 'var(--mono)', marginBottom: 8 }}>✓ DRONE GÖRSELİ HAZIR</div>
                <img src={droneResult.image} alt="Drone görüntüsü" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)' }} />
                <a href={droneResult.image} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 8, ...btnStyle('success', false), textDecoration: 'none', textAlign: 'center' }}>
                  İndir
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Map */}
        <div style={{ flex: 1, position: 'relative' }}>
          <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
          {!mapReady && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', fontSize: 12, color: 'var(--muted)' }}>
              Harita yükleniyor...
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const selectStyle = {
  width: '100%', background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8,
  color: 'var(--text)', padding: '9px 12px', fontSize: 13, outline: 'none',
  appearance: 'none', cursor: 'pointer', marginBottom: 4
};

const inputStyle = {
  width: '100%', background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8,
  color: 'var(--text)', padding: '9px 12px', fontSize: 13, outline: 'none', fontFamily: 'var(--mono)'
};

const btnStyle = (type, disabled) => ({
  width: '100%', padding: '10px 16px', borderRadius: 8, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: 13, fontWeight: 600, transition: 'opacity 0.15s',
  opacity: disabled ? 0.5 : 1,
  background: type === 'primary' ? 'var(--text)' : type === 'accent' ? 'var(--accent)' : 'var(--accent2)',
  color: type === 'primary' ? 'var(--bg)' : '#000',
});
