import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { X, MapPin, Users, Car, Shuffle, ChevronDown, GripVertical, Navigation, Phone } from 'lucide-react';
import { GoogleMap, LoadScript, Marker, InfoWindow, Polyline } from '@react-google-maps/api';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';

// ── Tel Aviv default ──
const DEFAULT_CENTER = { lat: 32.0853, lng: 34.7818 };
const DEFAULT_ZOOM = 11;

// ── Group colors ──
const GROUP_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

// ── Map container style ──
const MAP_STYLE = { width: '100%', height: '100%' };

// ── Haversine distance (km) ──
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Geocode an address using Google Maps Geocoding API ──
async function geocodeAddress(address) {
  if (!address || !API_KEY) return null;
  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${API_KEY}`
    );
    const data = await response.json();
    if (data.results && data.results[0]) {
      return data.results[0].geometry.location; // { lat, lng }
    }
  } catch (err) {
    console.warn('Geocode failed for:', address, err);
  }
  return null;
}

// ── Auto-group people into taxi clusters ──
function autoGroupTaxis(people, shootLocation, maxPerTaxi = 4) {
  if (!people.length) return [];
  if (!shootLocation) {
    // Just chunk evenly if no shoot location
    const groups = [];
    for (let i = 0; i < people.length; i += maxPerTaxi) {
      groups.push(people.slice(i, i + maxPerTaxi));
    }
    return groups;
  }

  // 1. Calculate distance from each person to shoot location
  const withDist = people
    .filter(p => p.lat != null && p.lng != null)
    .map(p => ({
      ...p,
      distToShoot: haversine(p.lat, p.lng, shootLocation.lat, shootLocation.lng),
    }));

  // People without coordinates go at the end
  const noCoords = people.filter(p => p.lat == null || p.lng == null);

  // 2. Sort by distance to shoot
  withDist.sort((a, b) => a.distToShoot - b.distToShoot);

  // 3. Greedy nearest-neighbor clustering
  const used = new Set();
  const groups = [];

  for (const person of withDist) {
    if (used.has(person.id)) continue;
    const group = [person];
    used.add(person.id);

    // Find nearest unused neighbors
    const candidates = withDist
      .filter(p => !used.has(p.id))
      .map(p => ({
        ...p,
        distToLeader: haversine(person.lat, person.lng, p.lat, p.lng),
      }))
      .sort((a, b) => a.distToLeader - b.distToLeader);

    for (const c of candidates) {
      if (group.length >= maxPerTaxi) break;
      if (used.has(c.id)) continue;
      group.push(c);
      used.add(c.id);
    }

    groups.push(group);
  }

  // Add people without coordinates to existing groups or new group
  if (noCoords.length > 0) {
    for (const p of noCoords) {
      // Try to add to last group if it has space
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.length < maxPerTaxi) {
        lastGroup.push(p);
      } else {
        groups.push([p]);
      }
    }
  }

  return groups;
}


// ── Pin icon URLs for Google Maps ──
function pinIcon(color) {
  // Use Google Charts API for colored markers
  return `https://chart.googleapis.com/chart?chst=d_map_pin_letter&chld=%E2%80%A2|${color.replace('#', '')}`;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function TaxiWizard({ production, people = [], cast = [], onClose }) {
  const [map, setMap] = useState(null);
  const [shootAddress, setShootAddress] = useState(production?.location || production?.shoot_location || '');
  const [shootCoords, setShootCoords] = useState(null);
  const [maxPerTaxi, setMaxPerTaxi] = useState(4);
  const [groups, setGroups] = useState([]);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [geocodeCache, setGeocodeCache] = useState({});
  const [geocoding, setGeocoding] = useState(false);
  const [dragOverGroup, setDragOverGroup] = useState(null);
  const [dragPerson, setDragPerson] = useState(null);

  // Combine all people (crew + cast) into unified list
  const allPeople = useMemo(() => {
    const combined = [];

    // People from PeopleOnSet / budget crew
    people.forEach((p, i) => {
      combined.push({
        id: p._id || p.id || `person-${i}`,
        name: p.full_name || p.name || 'Unknown',
        role: p.role || p.item || '',
        phone: p.phone || '',
        email: p.email || '',
        address: p.address || '',
        type: 'crew',
        lat: null,
        lng: null,
      });
    });

    // Cast members
    cast.forEach((c, i) => {
      combined.push({
        id: c.id || `cast-${i}`,
        name: c.name || 'Unknown',
        role: c.role || 'Talent',
        phone: c.phone || '',
        email: c.email || '',
        address: c.address || '',
        type: 'cast',
        lat: null,
        lng: null,
      });
    });

    return combined;
  }, [people, cast]);

  // Geocode all addresses on mount
  useEffect(() => {
    async function geocodeAll() {
      setGeocoding(true);
      const cache = { ...geocodeCache };

      // Geocode shoot location
      if (shootAddress && !cache[shootAddress]) {
        const coords = await geocodeAddress(shootAddress);
        if (coords) cache[shootAddress] = coords;
      }
      if (cache[shootAddress]) {
        setShootCoords(cache[shootAddress]);
      }

      // Geocode people addresses
      for (const person of allPeople) {
        if (person.address && !cache[person.address]) {
          const coords = await geocodeAddress(person.address);
          if (coords) cache[person.address] = coords;
        }
      }

      setGeocodeCache(cache);
      setGeocoding(false);
    }
    geocodeAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Geocode shoot address on change
  const geocodeTimeout = useRef(null);
  function handleShootAddressChange(val) {
    setShootAddress(val);
    clearTimeout(geocodeTimeout.current);
    geocodeTimeout.current = setTimeout(async () => {
      if (!val.trim()) { setShootCoords(null); return; }
      if (geocodeCache[val]) { setShootCoords(geocodeCache[val]); return; }
      const coords = await geocodeAddress(val);
      if (coords) {
        setGeocodeCache(prev => ({ ...prev, [val]: coords }));
        setShootCoords(coords);
      }
    }, 800);
  }

  // Enrich allPeople with cached geocode coords
  const enrichedPeople = useMemo(() => {
    return allPeople.map(p => {
      if (p.address && geocodeCache[p.address]) {
        return { ...p, ...geocodeCache[p.address] };
      }
      return p;
    });
  }, [allPeople, geocodeCache]);

  // Auto group handler
  function handleAutoGroup() {
    const result = autoGroupTaxis(enrichedPeople, shootCoords, maxPerTaxi);
    setGroups(result);
  }

  // Drag & drop between groups
  function handleDragStart(person, fromGroupIdx) {
    setDragPerson({ person, fromGroupIdx });
  }

  function handleDrop(toGroupIdx) {
    if (!dragPerson) return;
    const { person, fromGroupIdx } = dragPerson;
    if (fromGroupIdx === toGroupIdx) { setDragPerson(null); setDragOverGroup(null); return; }

    setGroups(prev => {
      const next = prev.map(g => [...g]);
      // Remove from old group
      next[fromGroupIdx] = next[fromGroupIdx].filter(p => p.id !== person.id);
      // Add to new group
      next[toGroupIdx].push(person);
      // Clean up empty groups
      return next.filter(g => g.length > 0);
    });

    setDragPerson(null);
    setDragOverGroup(null);
  }

  // Map center: shoot coords or default
  const mapCenter = shootCoords || DEFAULT_CENTER;

  // Total taxis needed
  const taxiCount = groups.length;

  // Fit map bounds to show all markers
  const onMapLoad = useCallback((mapInstance) => {
    setMap(mapInstance);
  }, []);

  useEffect(() => {
    if (!map) return;
    const bounds = new window.google.maps.LatLngBounds();
    let hasPoints = false;

    if (shootCoords) {
      bounds.extend(shootCoords);
      hasPoints = true;
    }
    enrichedPeople.forEach(p => {
      if (p.lat != null && p.lng != null) {
        bounds.extend({ lat: p.lat, lng: p.lng });
        hasPoints = true;
      }
    });

    if (hasPoints) {
      map.fitBounds(bounds, 60);
    }
  }, [map, shootCoords, enrichedPeople]);

  // Get person's group index (for coloring)
  function getGroupIdx(personId) {
    for (let i = 0; i < groups.length; i++) {
      if (groups[i].some(p => p.id === personId)) return i;
    }
    return -1;
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 flex items-stretch">
      {/* ── Map Section (70%) ── */}
      <div className="flex-[7] relative">
        {API_KEY ? (
          <LoadScript googleMapsApiKey={API_KEY}>
            <GoogleMap
              mapContainerStyle={MAP_STYLE}
              center={mapCenter}
              zoom={DEFAULT_ZOOM}
              onLoad={onMapLoad}
              options={{
                streetViewControl: false,
                mapTypeControl: false,
                fullscreenControl: false,
              }}
            >
              {/* Shoot location marker (red) */}
              {shootCoords && (
                <Marker
                  position={shootCoords}
                  icon={pinIcon('FF0000')}
                  onClick={() => setSelectedMarker({ type: 'shoot', name: 'Shoot Location', address: shootAddress, ...shootCoords })}
                  title="Shoot Location"
                />
              )}

              {/* People markers */}
              {enrichedPeople.map(person => {
                if (person.lat == null || person.lng == null) return null;
                const gIdx = getGroupIdx(person.id);
                const color = gIdx >= 0 ? GROUP_COLORS[gIdx % GROUP_COLORS.length].replace('#', '') : (person.type === 'cast' ? '22c55e' : '3b82f6');
                return (
                  <Marker
                    key={person.id}
                    position={{ lat: person.lat, lng: person.lng }}
                    icon={pinIcon(color)}
                    onClick={() => setSelectedMarker(person)}
                    title={person.name}
                  />
                );
              })}

              {/* InfoWindow */}
              {selectedMarker && (
                <InfoWindow
                  position={{ lat: selectedMarker.lat, lng: selectedMarker.lng }}
                  onCloseClick={() => setSelectedMarker(null)}
                >
                  <div className="p-1 min-w-[160px]">
                    <div className="font-bold text-sm text-gray-800">{selectedMarker.name}</div>
                    {selectedMarker.role && <div className="text-xs text-gray-500">{selectedMarker.role}</div>}
                    {selectedMarker.phone && (
                      <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                        <Phone size={10} /> {selectedMarker.phone}
                      </div>
                    )}
                    {selectedMarker.address && <div className="text-xs text-gray-400 mt-1">{selectedMarker.address}</div>}
                    {selectedMarker.type === 'shoot' && <div className="text-xs text-red-500 font-semibold mt-1">Shoot Location</div>}
                  </div>
                </InfoWindow>
              )}

              {/* Polylines per group */}
              {groups.map((group, gIdx) => {
                const color = GROUP_COLORS[gIdx % GROUP_COLORS.length];
                const points = group
                  .filter(p => p.lat != null && p.lng != null)
                  .map(p => ({ lat: p.lat, lng: p.lng }));
                if (shootCoords) points.push(shootCoords);
                if (points.length < 2) return null;
                return (
                  <Polyline
                    key={`line-${gIdx}`}
                    path={points}
                    options={{
                      strokeColor: color,
                      strokeOpacity: 0.7,
                      strokeWeight: 3,
                    }}
                  />
                );
              })}
            </GoogleMap>
          </LoadScript>
        ) : (
          <div className="flex items-center justify-center h-full bg-gray-100 text-gray-400">
            <div className="text-center p-8">
              <MapPin size={48} className="mx-auto mb-3 opacity-40" />
              <p className="text-lg font-semibold">Google Maps API Key Required</p>
              <p className="text-sm mt-2">Set <code className="bg-gray-200 px-1.5 py-0.5 rounded text-xs">VITE_GOOGLE_MAPS_KEY</code> in your .env file</p>
            </div>
          </div>
        )}

        {/* Geocoding indicator */}
        {geocoding && (
          <div className="absolute top-4 left-4 bg-white/90 backdrop-blur rounded-lg shadow-lg px-4 py-2 text-sm text-gray-600 flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            Geocoding addresses...
          </div>
        )}
      </div>

      {/* ── Sidebar Panel (30%) ── */}
      <div className="flex-[3] bg-white dark:bg-gray-900 flex flex-col overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
              style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)', color: 'white' }}>
              <Car size={18} />
            </div>
            <div>
              <h2 className="text-lg font-black text-gray-800 dark:text-gray-100">Taxi Wizard</h2>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Route Planner</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        {/* Controls */}
        <div className="px-5 py-4 space-y-4 border-b border-gray-100 dark:border-gray-800">

          {/* Shoot location */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
              <MapPin size={10} className="inline mr-1" />
              Shoot Location
            </label>
            <input
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
              placeholder="Enter shoot address..."
              value={shootAddress}
              onChange={e => handleShootAddressChange(e.target.value)}
            />
            {shootCoords && (
              <div className="text-[10px] text-green-600 mt-1 flex items-center gap-1">
                <Navigation size={9} /> {shootCoords.lat.toFixed(4)}, {shootCoords.lng.toFixed(4)}
              </div>
            )}
          </div>

          {/* Max per taxi */}
          <div className="flex items-center gap-3">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">
              <Users size={10} className="inline mr-1" />
              Max per Taxi
            </label>
            <select
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              value={maxPerTaxi}
              onChange={e => setMaxPerTaxi(Number(e.target.value))}
            >
              {[2, 3, 4, 5].map(n => <option key={n} value={n}>{n} passengers</option>)}
            </select>
          </div>

          {/* Auto-Group button */}
          <button
            onClick={handleAutoGroup}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}
          >
            <Shuffle size={14} />
            Auto-Group ({enrichedPeople.length} people)
          </button>

          {/* People without addresses notice */}
          {enrichedPeople.filter(p => !p.address).length > 0 && (
            <div className="text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
              {enrichedPeople.filter(p => !p.address).length} people have no address &mdash; they will be grouped but not shown on the map.
            </div>
          )}
        </div>

        {/* Taxi Groups */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {groups.length === 0 && (
            <div className="text-center py-12 text-gray-300">
              <Car size={36} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">No groups yet</p>
              <p className="text-xs mt-1">Click "Auto-Group" to create taxi groups</p>
            </div>
          )}

          {groups.map((group, gIdx) => {
            const color = GROUP_COLORS[gIdx % GROUP_COLORS.length];
            const isOver = dragOverGroup === gIdx;
            return (
              <div
                key={gIdx}
                className="rounded-xl border-2 transition-all"
                style={{
                  borderColor: isOver ? color : 'transparent',
                  background: isOver ? `${color}08` : 'rgba(0,0,0,0.02)',
                }}
                onDragOver={e => { e.preventDefault(); setDragOverGroup(gIdx); }}
                onDragLeave={() => setDragOverGroup(null)}
                onDrop={e => { e.preventDefault(); handleDrop(gIdx); }}
              >
                {/* Group header */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-t-xl" style={{ background: `${color}15` }}>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: color }}>
                    {gIdx + 1}
                  </div>
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-200">
                    Taxi {gIdx + 1}
                  </span>
                  <span className="text-[10px] text-gray-400 ml-auto">
                    {group.length}/{maxPerTaxi}
                  </span>
                </div>

                {/* Passengers */}
                <div className="px-2 py-1.5 space-y-0.5">
                  {group.map(person => (
                    <div
                      key={person.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white dark:hover:bg-gray-800 cursor-grab active:cursor-grabbing transition-colors group"
                      draggable
                      onDragStart={() => handleDragStart(person, gIdx)}
                    >
                      <GripVertical size={12} className="text-gray-300 group-hover:text-gray-500 shrink-0" />
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: person.type === 'cast' ? '#22c55e' : '#3b82f6' }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate">{person.name}</div>
                        <div className="text-[10px] text-gray-400 truncate">{person.role}</div>
                      </div>
                      {person.lat != null && shootCoords && (
                        <span className="text-[9px] text-gray-400 shrink-0">
                          {haversine(person.lat, person.lng, shootCoords.lat, shootCoords.lng).toFixed(1)} km
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary footer */}
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Car size={16} className="text-gray-500" />
              <span className="text-sm font-bold text-gray-700 dark:text-gray-200">
                {taxiCount} {taxiCount === 1 ? 'taxi' : 'taxis'} needed
              </span>
            </div>
            <div className="text-xs text-gray-400">
              {enrichedPeople.length} people total
            </div>
          </div>
          {groups.length > 0 && (
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {groups.map((g, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold text-white"
                  style={{ background: GROUP_COLORS[i % GROUP_COLORS.length] }}
                >
                  <Car size={9} /> {g.length}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
