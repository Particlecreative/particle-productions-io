import { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';

// Free stack — no API key, no billing, no Google Cloud permissions:
//   • Map tiles + library: OpenStreetMap via Leaflet (loaded on demand from unpkg)
//   • Geocoding: OpenStreetMap Nominatim (light use, cached + throttled)
const TAXI_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
const TLV = { lat: 32.0853, lng: 34.7818 };

let leafletPromise = null;
function loadLeaflet() {
  if (typeof window !== 'undefined' && window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css'; link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.async = true;
    s.onload = () => resolve(window.L);
    s.onerror = () => reject(new Error('Failed to load map library'));
    document.body.appendChild(s);
  });
  return leafletPromise;
}

const geoCache = new Map();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function geocode(query) {
  const q = (query || '').trim();
  if (!q) return null;
  const key = q.toLowerCase();
  if (geoCache.has(key)) return geoCache.get(key);
  try {
    const withCountry = /israel|ישראל/i.test(q) ? q : `${q}, Israel`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=il&q=${encodeURIComponent(withCountry)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const data = await res.json();
    const hit = Array.isArray(data) && data[0] ? { lat: +data[0].lat, lng: +data[0].lon } : null;
    geoCache.set(key, hit);
    return hit;
  } catch {
    geoCache.set(key, null);
    return null;
  }
}

function pinSvg(color) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="38" viewBox="0 0 26 38"><path d="M13 0C5.8 0 0 5.8 0 13c0 9.7 13 25 13 25s13-15.3 13-25C26 5.8 20.2 0 13 0z" fill="${color}"/><circle cx="13" cy="13" r="5" fill="#fff"/></svg>`
  )}`;
}

export default function TaxiMap({ plan }) {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const LRef = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [progress, setProgress] = useState({ done: 0, total: 0, located: 0 });

  // Init Leaflet once.
  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then(L => {
      if (cancelled || !mapEl.current) return;
      LRef.current = L;
      const map = L.map(mapEl.current, { zoomControl: true, attributionControl: true }).setView([TLV.lat, TLV.lng], 11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '© OpenStreetMap',
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setStatus('ready');
      setTimeout(() => map.invalidateSize(), 100);
    }).catch(() => setStatus('error'));
    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  // Plot the plan whenever it (or map readiness) changes.
  useEffect(() => {
    if (status !== 'ready' || !plan) return;
    const L = LRef.current, map = mapRef.current, layer = layerRef.current;
    if (!L || !map || !layer) return;
    let cancelled = false;

    async function plot() {
      layer.clearLayers();
      const taxis = plan.taxis || [];
      const addresses = [];
      if (plan.shoot_location) addresses.push(plan.shoot_location);
      taxis.forEach(t => (t.passengers || []).forEach(p => { if (p.pickup_address) addresses.push(p.pickup_address); }));
      const uniqueNew = [...new Set(addresses)].filter(a => !geoCache.has(a.trim().toLowerCase()));
      setProgress({ done: 0, total: uniqueNew.length, located: 0 });

      // Geocode any not-yet-cached addresses, throttled (~1.1s) per Nominatim policy.
      let done = 0;
      for (const a of uniqueNew) {
        if (cancelled) return;
        await geocode(a);
        done++;
        setProgress(p => ({ ...p, done }));
        if (done < uniqueNew.length) await sleep(1100);
      }
      if (cancelled) return;

      const bounds = [];
      let located = 0;

      // Shoot marker (destination)
      let shootPt = null;
      if (plan.shoot_location) {
        shootPt = await geocode(plan.shoot_location);
        if (shootPt) {
          L.marker([shootPt.lat, shootPt.lng], { icon: L.icon({ iconUrl: pinSvg('#111827'), iconSize: [30, 44], iconAnchor: [15, 44], popupAnchor: [0, -40] }) })
            .bindPopup(`<b>Set</b><br>${plan.shoot_location}`)
            .addTo(layer);
          bounds.push([shootPt.lat, shootPt.lng]);
          located++;
        }
      }

      // Passenger markers + per-taxi route lines
      for (let ti = 0; ti < taxis.length; ti++) {
        const color = TAXI_COLORS[ti % TAXI_COLORS.length];
        const linePts = [];
        for (const p of (taxis[ti].passengers || [])) {
          const pt = p.pickup_address ? await geocode(p.pickup_address) : null;
          if (!pt) continue;
          located++;
          bounds.push([pt.lat, pt.lng]);
          linePts.push([pt.lat, pt.lng]);
          L.marker([pt.lat, pt.lng], { icon: L.icon({ iconUrl: pinSvg(color), iconSize: [26, 38], iconAnchor: [13, 38], popupAnchor: [0, -34] }) })
            .bindPopup(`<b>${p.name}</b>${p.role ? `<br>${p.role}` : ''}${p.pickup_time ? `<br>Pickup ${p.pickup_time}` : ''}${p.phone ? `<br>${p.phone}` : ''}`)
            .addTo(layer);
        }
        if (shootPt && taxis[ti].leg !== 'from_set') linePts.push([shootPt.lat, shootPt.lng]);
        if (linePts.length >= 2) {
          L.polyline(linePts, { color, weight: 3, opacity: 0.65 }).addTo(layer);
        }
      }

      setProgress(p => ({ ...p, located }));
      if (bounds.length && !cancelled) {
        try { map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 }); } catch {}
      }
    }

    plot();
    return () => { cancelled = true; };
  }, [status, plan]);

  return (
    <div className="relative w-full h-full min-h-[320px]">
      <div ref={mapEl} className="absolute inset-0 rounded-xl overflow-hidden" style={{ zIndex: 0 }} />
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 bg-gray-50 rounded-xl">
          <Loader2 size={20} className="animate-spin" />
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-gray-50 rounded-xl text-center px-6">
          <MapPin size={26} className="mb-2 opacity-40" />
          <p className="text-sm font-semibold">Couldn't load the map</p>
          <p className="text-xs mt-0.5">Check your connection — the ride list still works.</p>
        </div>
      )}
      {status === 'ready' && progress.total > 0 && progress.done < progress.total && (
        <div className="absolute top-3 left-3 z-[400] bg-white/95 backdrop-blur rounded-lg shadow px-3 py-1.5 text-[11px] text-gray-600 flex items-center gap-2">
          <Loader2 size={12} className="animate-spin" /> Locating addresses… {progress.done}/{progress.total}
        </div>
      )}
      {status === 'ready' && progress.total >= 0 && progress.done >= progress.total && progress.located === 0 && (plan?.taxis?.length > 0) && (
        <div className="absolute top-3 left-3 z-[400] bg-amber-50 border border-amber-200 rounded-lg shadow px-3 py-1.5 text-[11px] text-amber-700 max-w-[240px]">
          Couldn't pin these addresses automatically — add a street + city in chat (e.g. "Dana is at Vital 8, Florentin") and they'll drop on the map.
        </div>
      )}
    </div>
  );
}
