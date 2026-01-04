// driver.js - cleaned and formatted
// ES module so we can import the shared Supabase client used by login/registration
import { supabase } from '../login/supabaseClient.js';

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const q = (sel) => document.querySelector(sel);

  // ---------------------------------------------------------------------------
  // Minimal driver state + guidance UI (keeps existing behavior)
  // ---------------------------------------------------------------------------
  const DriverPhase = Object.freeze({
    NO_DRIVER: 'NO_DRIVER',
    IDLE: 'IDLE',
    ROUTE_SELECTED: 'ROUTE_SELECTED',
    NAVIGATING: 'NAVIGATING'
  });

  const driverState = {
    phase: DriverPhase.IDLE,
    leg: 'TO_ORIGIN', // TO_ORIGIN -> TO_DEST
    lastSent: null,
    lastSentAt: 0,
    commutersTimer: null,
    commutersMarkers: new Map(),
    lastCommutersRefreshAt: 0
  };

  const dgStatus = q('#dg-status');
  const dgNextTerminal = q('#dg-next-terminal');
  const dgDistance = q('#dg-distance');
  const dgEta = q('#dg-eta');
  const dgCommuters = q('#dg-commuters');

  function setDriverPhase(phase) {
    driverState.phase = phase;
    if (dgStatus) {
      const label =
        phase === DriverPhase.NAVIGATING ? 'On Trip' :
          phase === DriverPhase.ROUTE_SELECTED ? 'Ready' :
            phase === DriverPhase.NO_DRIVER ? 'Not logged in' : 'Standby';
      dgStatus.textContent = label;
    }
  }

  function setGuidanceEmpty() {
    if (dgNextTerminal) dgNextTerminal.textContent = '—';
    if (dgDistance) dgDistance.textContent = '—';
    if (dgEta) dgEta.textContent = '—';
    if (dgCommuters) dgCommuters.textContent = '—';
  }

  function toRad(d) {
    return (d * Math.PI) / 180;
  }

  function distanceMeters(a, b) {
    const R = 6371000;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);
    const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function formatDistance(meters) {
    if (!Number.isFinite(meters)) return '—';
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(2)} km`;
  }

  function formatEtaMinutes(minutes) {
    if (!Number.isFinite(minutes)) return '—';
    if (minutes < 1) return '< 1 min';
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return `${h}h ${m}m`;
  }

  // Dropdown menu behavior
  const menuToggle = q('#menu-toggle');
  const dropdownMenu = q('.dropdown-menu');

  if (menuToggle && dropdownMenu) {
    const toggleMenu = (e) => {
      e.preventDefault();
      dropdownMenu.classList.toggle('show');
    };

    const closeMenuOnDocClick = (e) => {
      if (!menuToggle.contains(e.target) && !dropdownMenu.contains(e.target)) {
        dropdownMenu.classList.remove('show');
      }
    };

    menuToggle.addEventListener('click', toggleMenu);
    document.addEventListener('click', closeMenuOnDocClick);
  }

  // Initialize Leaflet map (only if Leaflet is loaded and the #map element exists)
  const mapRoot = q('#map');
  let map = null;
  let driverMarker = null;
  let hasCenteredOnDriver = false;
  let routesMeta = [];
  let terminalsById = new Map();
  let routesMetadataLoaded = false;
  let activeRouteControl = null;
  let activeRouteOverlay = null;
  let activeRouteMarkers = [];
  function clearActiveRoute() {
    if (map) {
      if (activeRouteControl) {
        try {
          map.removeControl(activeRouteControl);
        } catch (e) {
          console.warn('[Driver map] Failed to remove active route control', e);
        }
      }

      if (activeRouteOverlay) {
        try {
          map.removeLayer(activeRouteOverlay);
        } catch (e) {
          console.warn('[Driver map] Failed to remove active route overlay', e);
        }
      }

      if (Array.isArray(activeRouteMarkers) && activeRouteMarkers.length) {
        activeRouteMarkers.forEach((m) => {
          try {
            map.removeLayer(m);
          } catch (e) {
            console.warn('[Driver map] Failed to remove route marker', e);
          }
        });
      }
    }

    activeRouteControl = null;
    activeRouteOverlay = null;
    activeRouteMarkers = [];
  }

  async function drawSelectedRouteOnMap(routeId) {
    if (!map || typeof L === 'undefined') return;
    if (!routesMetadataLoaded || !Array.isArray(routesMeta) || !routesMeta.length) return;
    if (!routeId) {
      clearActiveRoute();
      return;
    }

    const route = routesMeta.find((r) => r.route_id === routeId);
    if (!route) return;

    const origin = terminalsById.get(route.origin_terminal_id);
    const dest = terminalsById.get(route.destination_terminal_id);
    if (!origin || !dest) return;

    if (
      typeof origin.lat !== 'number' ||
      typeof origin.lng !== 'number' ||
      typeof dest.lat !== 'number' ||
      typeof dest.lng !== 'number'
    ) {
      return;
    }

    clearActiveRoute();

    const originLatLng = L.latLng(origin.lat, origin.lng);
    const destLatLng = L.latLng(dest.lat, dest.lng);
    const color = route.color || '#1e6b35';

    if (L.Routing && typeof L.Routing.control === 'function') {
      let overlayRoute = null;

      activeRouteControl = L.Routing.control({
        waypoints: [originLatLng, destLatLng],
        addWaypoints: false,
        draggableWaypoints: false,
        fitSelectedRoutes: true,
        show: false,
        routeWhileDragging: false,
        lineOptions: {
          styles: [
            { color, weight: 8, opacity: 0.95 }, // outer colored
            { color, weight: 4, opacity: 0.7 } // inner same color, slightly lighter
          ]
        },
        createMarker: (i, wp) => {
          const label = i === 0 ? 'Origin' : 'Destination';
          const marker = L.circleMarker(wp.latLng, {
            radius: 7,
            color,
            weight: 3,
            fillColor: '#ffffff',
            fillOpacity: 1
          }).bindTooltip(`${route.name} - ${label}`, {
            permanent: false,
            direction: 'top',
            opacity: 0.95,
            sticky: true
          });

          // Toggle tooltip visibility on click (click to show/hide)
          marker._tooltipOpen = false;
          marker.on('click', () => {
            if (marker._tooltipOpen) {
              marker.closeTooltip();
            } else {
              marker.openTooltip();
            }
            marker._tooltipOpen = !marker._tooltipOpen;
          });

          return marker;
        },
        router: L.Routing.osrmv1 ? L.Routing.osrmv1({}) : undefined
      })
        .addTo(map)
        .on('routesfound', (e) => {
          const r = e.routes && e.routes[0];
          if (!r || !Array.isArray(r.coordinates) || !r.coordinates.length) return;

          // Remove any previous clickable overlay for this route
          if (overlayRoute) {
            try {
              map.removeLayer(overlayRoute);
            } catch (err) {
              console.warn('[Driver map] Failed to remove previous overlay route', err);
            }
          }

          // Create a nearly invisible but clickable polyline over the route
          overlayRoute = L.polyline(r.coordinates, {
            color,
            weight: 20,
            opacity: 0.01,
            interactive: true
          }).addTo(map);

          activeRouteOverlay = overlayRoute;

          overlayRoute.on('click', (ev) => {
            const meters = r.summary && r.summary.totalDistance;
            const mins = r.summary && r.summary.totalTime / 60;
            if (!meters || !mins) return;

            L.popup({ closeButton: false, autoClose: true })
              .setLatLng(ev.latlng)
              .setContent(
                `<strong>${route.name}</strong><br>` +
                  `${(meters / 1000).toFixed(1)} km · ~${Math.round(mins)} min`
              )
              .openOn(map);
          });
        });
    } else {
      // Fallback: straight line if routing machine is not available
      activeRouteOverlay = L.polyline([originLatLng, destLatLng], {
        color,
        weight: 8,
        opacity: 0.95
      }).addTo(map);

      const markerOpts = {
        radius: 7,
        color,
        fillColor: '#ffffff',
        fillOpacity: 1,
        weight: 3
      };

      const originMarker = L.circleMarker(originLatLng, markerOpts)
        .addTo(map)
        .bindTooltip(`${route.name} - Origin`, { direction: 'top' });
      const destMarker = L.circleMarker(destLatLng, markerOpts)
        .addTo(map)
        .bindTooltip(`${route.name} - Destination`, { direction: 'top' });

      activeRouteMarkers.push(originMarker, destMarker);

      if (map && map.fitBounds) {
        map.fitBounds(L.latLngBounds([originLatLng, destLatLng]), {
          padding: [30, 30]
        });
      }
    }
  }

  if (typeof L !== 'undefined' && mapRoot) {
    map = L.map('map').setView([14.831426, 120.976661], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    if (map?.zoomControl?.setPosition) {
      map.zoomControl.setPosition('bottomleft');
    }

    // Pre-load route and terminal metadata from Supabase (no drawing yet)
    (async function loadRoutesMetadata() {
      try {
        const { data: routes, error: routesError } = await supabase
          .from('routes')
          .select('route_id, name, color, origin_terminal_id, destination_terminal_id')
          .order('route_id', { ascending: true });

        if (routesError) {
          console.error('[Driver map] Failed to load routes', routesError);
          return;
        }

        if (!Array.isArray(routes) || !routes.length) return;
        routesMeta = routes;

        const terminalIds = new Set();
        routesMeta.forEach((r) => {
          if (r.origin_terminal_id) terminalIds.add(r.origin_terminal_id);
          if (r.destination_terminal_id) terminalIds.add(r.destination_terminal_id);
        });

        if (!terminalIds.size) {
          routesMetadataLoaded = true;
          return;
        }

        const { data: terminals, error: terminalsError } = await supabase
          .from('jeepney_terminals')
          .select('terminal_id, name, lat, lng')
          .in('terminal_id', Array.from(terminalIds));

        if (terminalsError) {
          console.error('[Driver map] Failed to load jeepney_terminals', terminalsError);
          return;
        }

        terminalsById = new Map();
        if (Array.isArray(terminals)) {
          terminals.forEach((t) => {
            if (typeof t.lat === 'number' && typeof t.lng === 'number') {
              terminalsById.set(t.terminal_id, t);
            }
          });
        }

        routesMetadataLoaded = true;

        // If a route is already selected when metadata finishes loading,
        // draw it on the map.
        if (typeof window !== 'undefined' && window.currentRouteId) {
          drawSelectedRouteOnMap(window.currentRouteId);
        }
      } catch (err) {
        console.error('[Driver map] Unexpected error while loading route metadata', err);
      }
    })();
  }

  // route-card show/hide behaviour (slide-in / slide-out)
  const routeCard = q('.route-card');
  const hideBtn = q('#hideBtn');
  const showBtn = q('#showBtn');

  if (routeCard && hideBtn && showBtn) {
    hideBtn.addEventListener('click', () => {
      routeCard.classList.add('slide-out');
      routeCard.classList.remove('slide-in');
      hideBtn.classList.add('hidden');
      showBtn.classList.remove('hidden');
    });

    showBtn.addEventListener('click', () => {
      routeCard.classList.remove('slide-out');
      routeCard.classList.add('slide-in');
      showBtn.classList.add('hidden');
      hideBtn.classList.remove('hidden');
    });
  }

  // ---------------------------------------------------------------------------
  // Resolve logged-in driver + load routes, set window.currentDriverId/RouteId
  // ---------------------------------------------------------------------------
  async function initDriverIdentityAndRoutes() {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.error('[Driver init] Failed to get user', error);
        return;
      }
      const user = data?.user;
      if (!user) {
        console.warn('[Driver init] No logged-in user; GPS uploads will be skipped.');
        setDriverPhase(DriverPhase.NO_DRIVER);
        return;
      }

      // Resolve driver_id for this auth user
      const { data: driverRow, error: driverError } = await supabase
        .from('drivers')
        .select('driver_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (driverError) {
        console.error('[Driver init] Failed to resolve driver_id', driverError);
      } else if (!driverRow?.driver_id) {
        console.warn('[Driver init] No driver profile found for this user; GPS uploads will be skipped.');
        setDriverPhase(DriverPhase.NO_DRIVER);
      } else if (typeof window !== 'undefined') {
        window.currentDriverId = driverRow.driver_id;
        console.log('[Driver init] currentDriverId set to', window.currentDriverId);
        setDriverPhase(DriverPhase.IDLE);
      }

      // Load available routes into the two dropdowns and wire selection to window.currentRouteId
      const routeSelect = q('#driver-route');
      const useLastRouteBtn = q('#use-last-route');
      if (!routeSelect) return;

      const { data: routes, error: routesError } = await supabase
        .from('routes')
        .select('route_id, name')
        .order('name', { ascending: true });

      if (routesError) {
        console.error('[Driver init] Failed to load routes', routesError);
        return;
      }

      const appendOptions = () => {
        // keep first placeholder option; remove others
        while (routeSelect.options.length > 1) {
          routeSelect.remove(1);
        }
        if (!Array.isArray(routes)) return;
        routes.forEach((r) => {
          const opt = document.createElement('option');
          opt.value = String(r.route_id);
          opt.textContent = r.name || `Route ${r.route_id}`;
          routeSelect.appendChild(opt);
        });
      };

      appendOptions();

      const handleRouteChange = (ev) => {
        const val = ev.target.value;
        if (!val) {
          if (typeof window !== 'undefined') window.currentRouteId = null;
          clearActiveRoute();
          setDriverPhase(window.currentDriverId ? DriverPhase.IDLE : DriverPhase.NO_DRIVER);
          setGuidanceEmpty();
          clearCommuterMarkers();
          updateStartButtonState();
          return;
        }
        const idNum = Number(val);
        if (!Number.isNaN(idNum) && typeof window !== 'undefined') {
          window.currentRouteId = idNum;
          console.log('[Driver init] currentRouteId set to', window.currentRouteId);
          if (window.currentDriverId) {
            updateStartButtonState();
          }
        }
          // Draw only the selected route on the map
          if (window.currentRouteId) {
            drawSelectedRouteOnMap(window.currentRouteId);
            setDriverPhase(DriverPhase.ROUTE_SELECTED);
            driverState.leg = 'TO_ORIGIN';
            setGuidanceEmpty();
            clearCommuterMarkers();
          } else {
            clearActiveRoute();
            setGuidanceEmpty();
            clearCommuterMarkers();
          }
      };

      routeSelect.addEventListener('change', handleRouteChange);

      // expose a 'Use last route' shortcut if we have one stored locally
      if (window.currentDriverId && useLastRouteBtn) {
        const last = loadLastRouteForDriver(window.currentDriverId);
        if (last && last.routeId) {
          const opt = routeSelect.querySelector(`option[value="${last.routeId}"]`);
          if (opt) {
            const label = last.routeName || opt.textContent || 'last route';
            useLastRouteBtn.textContent = `Use last route (${label})`;
            useLastRouteBtn.style.display = 'inline-block';
            useLastRouteBtn.addEventListener('click', () => {
              routeSelect.value = String(last.routeId);
              const ev = new Event('change', { bubbles: true });
              routeSelect.dispatchEvent(ev);
            });
          }
        }
      }

      // after resolving driver and any initial route, update button state
      updateStartButtonState();
    } catch (err) {
      console.error('[Driver init] Unexpected error', err);
    }
  }

  // ---------------------------------------------------------------------------
  // GPS tracking wiring for "Largaaaa!" and "Stop Showing Live Location"
  // ---------------------------------------------------------------------------
  const startBtn = q('.start-btn');
  const stopBtn = q('.stop-btn');

  // These should be set after login / route selection.
  // For now we read optional globals you can populate from your auth/route logic.
  const getDriverContext = () => ({
    driverId: window.currentDriverId || null,
    routeId: window.currentRouteId || null
  });

  const LAST_ROUTE_KEY_PREFIX = 'larga:lastRoute:';

  function saveLastRouteForDriver(driverId, routeId, routeName) {
    if (!driverId || !routeId || typeof window === 'undefined') return;
    try {
      const key = `${LAST_ROUTE_KEY_PREFIX}${driverId}`;
      const payload = {
        routeId,
        routeName: routeName || null,
        savedAt: new Date().toISOString()
      };
      window.localStorage.setItem(key, JSON.stringify(payload));
    } catch (e) {
      console.warn('[LastRoute] Failed to save last route', e);
    }
  }

  function loadLastRouteForDriver(driverId) {
    if (!driverId || typeof window === 'undefined') return null;
    try {
      const key = `${LAST_ROUTE_KEY_PREFIX}${driverId}`;
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.routeId) return null;
      return parsed;
    } catch (e) {
      console.warn('[LastRoute] Failed to load last route', e);
      return null;
    }
  }

  function updateStartButtonState() {
    if (!startBtn) return;
    const { driverId, routeId } = getDriverContext();
    const ready = Boolean(driverId && routeId);
    startBtn.disabled = !ready;
    startBtn.classList.toggle('disabled', !ready);
  }

  let geoWatchId = null;

  // GPS write throttling (efficiency)
  const GPS_MIN_MOVE_METERS = 20;
  const GPS_MIN_INTERVAL_MS = 10_000;

  // Guidance: consider we "arrived" at a terminal if within this radius
  const ARRIVAL_RADIUS_METERS = 60;
  // Basic ETA assumptions (kept simple): use GPS speed when available, else fallback
  const FALLBACK_SPEED_KMH = 18;

  function getRouteEndpoints(routeId) {
    if (!routesMetadataLoaded || !Array.isArray(routesMeta) || !routeId) return null;
    const route = routesMeta.find((r) => r.route_id === routeId);
    if (!route) return null;
    const origin = terminalsById.get(route.origin_terminal_id);
    const dest = terminalsById.get(route.destination_terminal_id);
    if (!origin || !dest) return null;
    if (typeof origin.lat !== 'number' || typeof origin.lng !== 'number') return null;
    if (typeof dest.lat !== 'number' || typeof dest.lng !== 'number') return null;
    return {
      origin: { id: route.origin_terminal_id, name: origin.name || 'Origin terminal', lat: origin.lat, lng: origin.lng },
      dest: { id: route.destination_terminal_id, name: dest.name || 'Destination terminal', lat: dest.lat, lng: dest.lng }
    };
  }

  function updateGuidanceFromFix(lat, lng, speedMps) {
    const { routeId } = getDriverContext();
    if (!routeId) {
      setGuidanceEmpty();
      return;
    }

    const endpoints = getRouteEndpoints(routeId);
    if (!endpoints) {
      setGuidanceEmpty();
      return;
    }

    const here = { lat, lng };
    const dToOrigin = distanceMeters(here, endpoints.origin);
    const dToDest = distanceMeters(here, endpoints.dest);

    // Decide leg: if we are close to origin, start guiding to destination.
    if (driverState.leg === 'TO_ORIGIN' && dToOrigin <= ARRIVAL_RADIUS_METERS) {
      driverState.leg = 'TO_DEST';
    }

    const next = driverState.leg === 'TO_DEST' ? endpoints.dest : endpoints.origin;
    const dist = driverState.leg === 'TO_DEST' ? dToDest : dToOrigin;

    if (dgNextTerminal) dgNextTerminal.textContent = next.name;
    if (dgDistance) dgDistance.textContent = formatDistance(dist);

    // ETA: prefer GPS speed if it's valid and non-trivial, otherwise fallback speed
    let etaMinutes = null;
    if (typeof speedMps === 'number' && Number.isFinite(speedMps) && speedMps > 0.8) {
      etaMinutes = (dist / speedMps) / 60;
    } else {
      etaMinutes = ((dist / 1000) / FALLBACK_SPEED_KMH) * 60;
    }
    if (dgEta) dgEta.textContent = formatEtaMinutes(etaMinutes);
  }

  function clearCommuterMarkers() {
    if (!map || !driverState.commutersMarkers) return;
    driverState.commutersMarkers.forEach((marker) => {
      try {
        map.removeLayer(marker);
      } catch (e) { /* ignore */ }
    });
    driverState.commutersMarkers.clear();
    if (dgCommuters) dgCommuters.textContent = '—';
  }

  async function refreshCommutersForRoute() {
    const { routeId } = getDriverContext();
    if (!routeId || !map) return;

    // Basic throttling for commuter refresh
    const now = Date.now();
    if (now - driverState.lastCommutersRefreshAt < 8_000) return;
    driverState.lastCommutersRefreshAt = now;

    try {
      const since = new Date(Date.now() - 5 * 60_000).toISOString();
      const { data, error } = await supabase
        .from('commuter_locations')
        .select('commuter_id, lat, lng, updated_at')
        .eq('route_id', routeId)
        .gte('updated_at', since);

      if (error) {
        console.error('[Driver commuters] Failed to fetch commuter_locations', error);
        return;
      }

      const commuters = Array.isArray(data) ? data : [];
      if (dgCommuters) dgCommuters.textContent = String(commuters.length);

      const seen = new Set();
      commuters.forEach((c) => {
        if (!c || !c.commuter_id) return;
        if (typeof c.lat !== 'number' || typeof c.lng !== 'number') return;

        const id = String(c.commuter_id);
        seen.add(id);

        const pos = [c.lat, c.lng];
        const existing = driverState.commutersMarkers.get(id);

        if (existing) {
          existing.setLatLng(pos);
          return;
        }

        // Use existing palette: border uses #0a714e and white fill
        const marker = L.circleMarker(pos, {
          radius: 5,
          color: '#0a714e',
          weight: 2,
          fillColor: '#ffffff',
          fillOpacity: 1
        }).bindTooltip('Commuter (same route)', {
          permanent: false,
          direction: 'top',
          opacity: 0.95,
          sticky: true
        });

        marker.addTo(map);
        driverState.commutersMarkers.set(id, marker);
      });

      // Remove markers for commuters no longer present
      Array.from(driverState.commutersMarkers.keys()).forEach((id) => {
        if (seen.has(id)) return;
        const marker = driverState.commutersMarkers.get(id);
        if (marker) {
          try { map.removeLayer(marker); } catch (e) { /* ignore */ }
        }
        driverState.commutersMarkers.delete(id);
      });
    } catch (err) {
      console.error('[Driver commuters] Unexpected error while fetching commuters', err);
    }
  }

  async function sendDriverLocation(position) {
    const { coords } = position || {};
    if (!coords) return;

    const { latitude, longitude, speed, heading } = coords;
    const { driverId, routeId } = getDriverContext();

    if (!driverId) {
      console.warn('[GPS] No driverId set (window.currentDriverId). Skipping upload.');
      return;
    }

    // Throttle writes (avoid hammering DB): only send if moved enough or enough time passed
    const now = Date.now();
    const curr = { lat: latitude, lng: longitude };
    if (driverState.lastSent && Number.isFinite(driverState.lastSentAt)) {
      const moved = distanceMeters(driverState.lastSent, curr);
      const dt = now - driverState.lastSentAt;
      if (moved < GPS_MIN_MOVE_METERS && dt < GPS_MIN_INTERVAL_MS) {
        return;
      }
    }
    driverState.lastSent = curr;
    driverState.lastSentAt = now;

    try {
      const { error } = await supabase
        .from('jeepney_locations')
        .upsert({
          driver_id: driverId,
          route_id: routeId ?? null,
          lat: latitude,
          lng: longitude,
          speed: typeof speed === 'number' ? speed : null,
          heading: typeof heading === 'number' ? heading : null,
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('[GPS] Failed to upsert jeepney_locations', error);
      }
    } catch (err) {
      console.error('[GPS] Unexpected error while sending location', err);
    }
  }

  function startGpsTracking() {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported on this device/browser.');
      return;
    }

    if (geoWatchId !== null) {
      // already tracking
      return;
    }

    const success = (position) => {
      const { latitude, longitude } = position.coords || {};

      // Update guidance (even if we skip upload due to throttling)
      if (typeof latitude === 'number' && typeof longitude === 'number') {
        const speedMps = position?.coords?.speed;
        updateGuidanceFromFix(latitude, longitude, speedMps);
      }

      if (typeof latitude === 'number' && typeof longitude === 'number' && map) {
        const pos = [latitude, longitude];
        if (!driverMarker) {
          driverMarker = L.marker(pos, { title: 'Your Location' }).addTo(map);
        } else {
          driverMarker.setLatLng(pos);
        }

        if (!hasCenteredOnDriver && typeof map.setView === 'function') {
          hasCenteredOnDriver = true;
          map.setView(pos, 16); // zoom closer to the driver on first fix
        }
      }

      // Send to backend regardless of whether map centering ran
      void sendDriverLocation(position);

      // Refresh commuters on this route only (lightweight + throttled)
      void refreshCommutersForRoute();
    };

    const error = (err) => {
      console.error('[GPS] watchPosition error', err);
    };

    geoWatchId = navigator.geolocation.watchPosition(success, error, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 15000
    });

    console.log('[GPS] Tracking started');
  }

  function stopGpsTracking() {
    if (geoWatchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(geoWatchId);
      geoWatchId = null;
      console.log('[GPS] Tracking stopped');
    }

    if (driverState.commutersTimer) {
      clearInterval(driverState.commutersTimer);
      driverState.commutersTimer = null;
    }

    clearCommuterMarkers();
  }

  if (startBtn) {
    startBtn.addEventListener('click', () => {
      if (startBtn.disabled) return;

      const { driverId, routeId } = getDriverContext();
      if (!driverId || !routeId) {
        updateStartButtonState();
        return;
      }

      // remember this as the driver's last route choice on this device
      const routeSelect = q('#driver-route');
      let routeName = null;
      if (routeSelect) {
        const opt = routeSelect.options[routeSelect.selectedIndex];
        routeName = opt ? opt.textContent : null;
      }
      saveLastRouteForDriver(driverId, routeId, routeName);

      // Initialize trip phase and start periodic route-scoped commuter refresh
      driverState.leg = 'TO_ORIGIN';
      setDriverPhase(DriverPhase.NAVIGATING);

      if (driverState.commutersTimer) {
        clearInterval(driverState.commutersTimer);
      }
      driverState.commutersTimer = setInterval(() => {
        void refreshCommutersForRoute();
      }, 15_000);

      startGpsTracking();
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      stopGpsTracking();
      // Back to ready state if a route is still selected
      const { routeId } = getDriverContext();
      setDriverPhase(routeId ? DriverPhase.ROUTE_SELECTED : DriverPhase.IDLE);
    });
  }

  // Fire-and-forget; driver page does not depend on awaiting this for UI
  void initDriverIdentityAndRoutes();

  // Initialize default guidance UI state
  setDriverPhase(window.currentDriverId ? DriverPhase.IDLE : DriverPhase.NO_DRIVER);
  setGuidanceEmpty();
});
