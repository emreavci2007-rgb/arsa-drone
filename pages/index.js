import { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
 
const SUPABASE_URL = 'https://smcudgtdhxfdaocnrnuo.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtY3VkZ3RkaHhmZGFvY25ybnVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2OTM5NDgsImV4cCI6MjA5NjI2OTk0OH0.aMJuV2VYg3D9y8DWvilXNbptC2Xh4u7lgbbsNZMihLU';
 
const centroid = (coords) => {
  const pts = Array.isArray(coords[0][0]) ? coords[0] : coords;
  const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const lng = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  return { lat, lng };
};
 
export default function Home() {
  const [parselData, setParselData] = useState(null);
  const [loading, setLoading] = useState({ parsel: false, drone: false });
  const [droneResult, setDroneResult] = useState(null);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('Haritada parseline tıkla');
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerRef = useRef(null);
  const markerRef = useRef(null);
 
  useEffect(() => {
    if (typeof window === 'undefined' || mapInstanceRef.current) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
 
    import('leaflet').then(({ default: L }) => {
      setTimeout(() => {
        const map = L.map(mapRef.current, {
          center: [39.9, 32.8], zoom: 6,
          zoomControl: true, attributionControl: false
        });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
 
        // Satellite tile layer toggle
        const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {});
        map._satLayer = sat;
 
        map.on('click', async (e) => {
          const { lat, lng } = e.latlng;
          setLoading(l => ({ ...l, parsel: true }));
          setError('');
          setParselData(null);
          setDroneResult(null);
          setHint('Parsel sorgulanıyor...');
 
          // Add click marker
          if (markerRef.current) map.removeLayer(markerRef.current);
          markerRef.current = L.circleMarker([lat, lng], {
            radius: 6, color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 1, weight: 2
          }).addTo(map);
 
          try {
            const r = await fetch(`/api/tkgm?action=koordinat&x=${lng.toFixed(8)}&y=${lat.toFixed(8)}`);
            const data = await r.json();
 
            if (data?.geometry) {
              setParselData(data);
              if (layerRef.current) map.removeLayer(layerRef.current);
              const layer = L.geoJSON(data, {
                style: { color: '#f59e0b', weight: 2.5, fillColor: '#f59e0b', fillOpacity: 0.2 }
              }).addTo(map);
              layerRef.current = layer;
              map.fitBounds(layer.getBounds(), { padding: [20, 20] });
              setHint('Parsel bulundu ✓');
            } else {
              setError('Bu noktada parsel bulunamadı. Başka bir yere tıkla.');
              setHint('Haritada parseline tıkla');
            }
          } catch (e) {
            setError('Bağlantı hatası. Tekrar dene.');
            setHint('Haritada parseline tıkla');
          }
          setLoading(l => ({ ...l, parsel: false }));
        });
 
        mapInstanceRef.current = map;
      }, 100);
    });
  }, []);
 
  const toggleSat = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (map._satLayer._map) {
      map.removeLayer(map._satLayer);
    } else {
      map._satLayer.addTo(map);
      map._satLayer.bringToFront();
    }
  };
 
  const handleDroneShot = async () => {
    if (!parselData) return;
    setLoading(l => ({ ...l, drone: true }));
    setDroneResult(null);
    const coords = parselData.geometry.coordinates;
    const { lat, lng } = centroid(coords);
    const p = parselData.properties || {};
    const jobId = crypto.randomUUID();
 
    try {
      await fetch('/api/drone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: jobId,
          property_id: crypto.randomUUID(),
          latitude: lat.toFixed(6),
          longitude: lng.toFixed(6),
          address: `${p.mahalleAd || ''} Ada:${p.adaNo} Parsel:${p.parselNo}`
        })
      });
      setDroneResult({ status: 'processing', jobId });
      pollResult(jobId);
    } catch {
      setError('Drone çekimi başlatılamadı.');
      setLoading(l => ({ ...l, drone: false }));
    }
  };
 
  const pollResult = useCallback((jobId) => {
    let attempts = 0;
    const poll = setInterval(async () => {
      attempts++;
      try {
        const r = await fetch(
          `${SUPABASE_URL}/rest/v1/drone_images?job_id=eq.${jobId}&order=created_at.desc&limit=1`,
          { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }
        );
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
 
  const p = parselData?.properties || {};
 
  return (
    <>
      <Head><title>ARDRONE — Parsel Drone Görüntüsü</title></Head>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        {/* Sidebar */}
        <div style={{ width: 320, background: '#111318', borderRight: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700, color: '#f59e0b', letterSpacing: 1 }}>
              AR<span style={{ color: '#e8eaed' }}>DRONE</span>
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Parsel → AI Drone Görüntüsü</div>
          </div>
 
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            {/* Hint */}
            <div style={{ padding: '12px 14px', background: loading.parsel ? 'rgba(245,158,11,0.08)' : parselData ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.04)', borderRadius: 10, border: `1px solid ${loading.parsel ? 'rgba(245,158,11,0.3)' : parselData ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.08)'}`, fontSize: 13, color: loading.parsel ? '#f59e0b' : parselData ? '#10b981' : '#9ca3af', marginBottom: 16 }}>
              {loading.parsel ? '🔍 ' : parselData ? '✅ ' : '👆 '}{hint}
            </div>
 
            {/* Satellite toggle */}
            <button onClick={toggleSat} style={{ width: '100%', padding: '9px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#e8eaed', fontSize: 13, cursor: 'pointer', marginBottom: 12 }}>
              🛰 Uydu Görüntüsü Aç/Kapat
            </button>
 
            {error && <div style={{ fontSize: 12, color: '#ef4444', padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 6, marginBottom: 12 }}>{error}</div>}
 
            {/* Parsel Info */}
            {parselData && (
              <div style={{ padding: 14, background: '#1a1d24', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ fontSize: 11, color: '#f59e0b', fontFamily: 'monospace', letterSpacing: '0.06em', marginBottom: 10 }}>PARSEL BİLGİLERİ</div>
                {[
                  ['Ada / Parsel', `${p.adaNo || '-'} / ${p.parselNo || '-'}`],
                  ['Mahalle', p.mahalleAd || '-'],
                  ['İlçe', p.ilceAd || '-'],
                  ['Nitelik', p.nitelik || '-'],
                  ['Alan', p.alan ? `${p.alan} m²` : '-'],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6, alignItems: 'flex-start' }}>
                    <span style={{ color: '#6b7280', flexShrink: 0 }}>{k}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#e8eaed', textAlign: 'right', marginLeft: 8 }}>{v}</span>
                  </div>
                ))}
 
                <button onClick={handleDroneShot} disabled={loading.drone} style={{ width: '100%', marginTop: 14, padding: '11px', borderRadius: 8, border: 'none', background: loading.drone ? '#6b7280' : '#f59e0b', color: '#000', fontSize: 13, fontWeight: 700, cursor: loading.drone ? 'not-allowed' : 'pointer' }}>
                  {loading.drone ? '⏳ İşleniyor...' : '🛸 Drone Çekimi Al'}
                </button>
              </div>
            )}
 
            {droneResult?.status === 'processing' && (
              <div style={{ marginTop: 12, padding: 12, background: 'rgba(245,158,11,0.08)', borderRadius: 8, border: '1px solid rgba(245,158,11,0.2)', fontSize: 12, color: '#f59e0b' }}>
                🛰 AI görüntüyü işliyor... (8-15 sn)
              </div>
            )}
 
            {droneResult?.image && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, color: '#10b981', fontFamily: 'monospace', marginBottom: 8 }}>✓ DRONE GÖRSELİ HAZIR</div>
                <img src={droneResult.image} alt="Drone" style={{ width: '100%', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }} />
                <a href={droneResult.image} target="_blank" rel="noreferrer"
                  style={{ display: 'block', marginTop: 8, padding: '10px', borderRadius: 8, background: '#10b981', color: '#000', fontSize: 13, fontWeight: 700, textDecoration: 'none', textAlign: 'center' }}>
                  İndir
                </a>
              </div>
            )}
          </div>
        </div>
 
        {/* Map */}
        <div style={{ flex: 1, position: 'relative' }}>
          <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
          {!mapInstanceRef.current && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0b0d', fontSize: 13, color: '#6b7280' }}>
              Harita yükleniyor...
            </div>
          )}
        </div>
      </div>
    </>
  );
}
