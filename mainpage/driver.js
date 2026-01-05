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
  const dgSpeed = q('#dg-speed');
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

    // Toggle a navigation-focused UI mode so the driver can
    // focus on guidance while on trip
    if (typeof document !== 'undefined' && document.body) {
      if (phase === DriverPhase.NAVIGATING) {
        document.body.classList.add('navigation-mode');
      } else {
        document.body.classList.remove('navigation-mode');
      }
    }
  }

  function setGuidanceEmpty() {
    if (dgNextTerminal) dgNextTerminal.textContent = '—';
    if (dgDistance) dgDistance.textContent = '—';
    if (dgSpeed) dgSpeed.textContent = '—';
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
  let terminalsById = new Map();
  let routesByDestTerminalId = new Map();
  let activeRouteControl = null;
  let activeRouteOverlay = null;
  let activeRouteMarkers = [];

  // Navigation state for dynamic driver -> terminal routing
  const navState = {
    activeTerminal: null, // { id, name, lat, lng }
    routeCoords: [], // [{ lat, lng }, ...] from OSRM
    cumulativeDistances: [], // meters along route for each coord index
    totalDistance: 0, // meters
    totalTimeSec: 0, // seconds
    routeBounds: null, // { minLat, maxLat, minLng, maxLng }
    lastRecalcAt: 0 // timestamp ms
  };
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

  // Build / rebuild OSRM route from current driver location to the active terminal
  function recomputeRouteFromHere(currentLat, currentLng) {
    if (!map || typeof L === 'undefined') return;
    if (!navState.activeTerminal) return;

    const { lat: tLat, lng: tLng, name } = navState.activeTerminal;
    if (typeof tLat !== 'number' || typeof tLng !== 'number') return;

    const fromLatLng = L.latLng(currentLat, currentLng);
    const toLatLng = L.latLng(tLat, tLng);
    const color = '#1e6b35';

    clearActiveRoute();

    // Reset navigation metadata
    navState.routeCoords = [];
    navState.cumulativeDistances = [];
    navState.totalDistance = 0;
    navState.totalTimeSec = 0;
    navState.routeBounds = null;

    if (L.Routing && typeof L.Routing.control === 'function') {
      let overlayRoute = null;

      activeRouteControl = L.Routing.control({
        waypoints: [fromLatLng, toLatLng],
        addWaypoints: false,
        draggableWaypoints: false,
        fitSelectedRoutes: true,
        show: false,
        routeWhileDragging: false,
        lineOptions: {
          styles: [
            { color, weight: 8, opacity: 0.95 },
            { color, weight: 4, opacity: 0.7 }
          ]
        },
        createMarker: (i, wp) => {
          const label = i === 0 ? 'You' : 'Destination';
          const marker = L.circleMarker(wp.latLng, {
            radius: 7,
            color,
            weight: 3,
            fillColor: '#ffffff',
            fillOpacity: 1
          }).bindTooltip(`${name} - ${label}`, {
            permanent: false,
            direction: 'top',
            opacity: 0.95,
            sticky: true
          });

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

          // Capture OSRM geometry + summary for guidance
          navState.totalDistance = r.summary?.totalDistance || 0;
          navState.totalTimeSec = r.summary?.totalTime || 0;

          navState.routeCoords = r.coordinates.map((c) => ({ lat: c.lat, lng: c.lng }));
          navState.cumulativeDistances = [];

          let acc = 0;
          navState.routeCoords.forEach((pt, idx) => {
            if (idx === 0) {
              navState.cumulativeDistances.push(0);
            } else {
              const prev = navState.routeCoords[idx - 1];
              acc += distanceMeters(prev, pt);
              navState.cumulativeDistances.push(acc);
            }
          });

          // Compute simple bounding box for commuter queries
          let minLat = Infinity;
          let maxLat = -Infinity;
          let minLng = Infinity;
          let maxLng = -Infinity;
          navState.routeCoords.forEach((pt) => {
            if (pt.lat < minLat) minLat = pt.lat;
            if (pt.lat > maxLat) maxLat = pt.lat;
            if (pt.lng < minLng) minLng = pt.lng;
            if (pt.lng > maxLng) maxLng = pt.lng;
          });
          if (Number.isFinite(minLat)) {
            navState.routeBounds = { minLat, maxLat, minLng, maxLng };
          }

          navState.lastRecalcAt = Date.now();

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
            // Show a popup that mirrors the current guidance panel
            const guidanceEl = document.getElementById('driver-guidance');

            let html;
            if (guidanceEl) {
              // Reuse existing guidance markup so Status / Next terminal /
              // Distance / Speed / ETA / Commuters look consistent.
              html = `<div class="driver-guidance driver-guidance-popup">${guidanceEl.innerHTML}</div>`;
            } else {
              // Fallback to simple distance/ETA summary if the panel is missing
              const meters = (r.summary && r.summary.totalDistance) || navState.totalDistance;
              const mins = ((r.summary && r.summary.totalTime) || navState.totalTimeSec) / 60;
              if (!meters || !mins) return;
              html =
                `<strong>${name}</strong><br>` +
                `${(meters / 1000).toFixed(1)} km · ~${Math.round(mins)} min`;
            }

            L.popup({ closeButton: false, autoClose: true })
              .setLatLng(ev.latlng)
              .setContent(html)
              .openOn(map);
          });
        });
    } else {
      // Fallback: straight line if routing machine is not available
      activeRouteOverlay = L.polyline([fromLatLng, toLatLng], {
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

      const originMarker = L.circleMarker(fromLatLng, markerOpts)
        .addTo(map)
        .bindTooltip('You', { direction: 'top' });
      const destMarker = L.circleMarker(toLatLng, markerOpts)
        .addTo(map)
        .bindTooltip(`${name} - Destination`, { direction: 'top' });

      activeRouteMarkers.push(originMarker, destMarker);

      if (map && map.fitBounds) {
        map.fitBounds(L.latLngBounds([fromLatLng, toLatLng]), {
          padding: [30, 30]
        });
      }

      // Straight line meta for guidance
      navState.routeCoords = [
        { lat: currentLat, lng: currentLng },
        { lat: tLat, lng: tLng }
      ];
      const straightDist = distanceMeters(navState.routeCoords[0], navState.routeCoords[1]);
      navState.cumulativeDistances = [0, straightDist];
      navState.totalDistance = straightDist;
      navState.totalTimeSec = (straightDist / 1000 / FALLBACK_SPEED_KMH) * 3600;
      navState.routeBounds = {
        minLat: Math.min(currentLat, tLat),
        maxLat: Math.max(currentLat, tLat),
        minLng: Math.min(currentLng, tLng),
        maxLng: Math.max(currentLng, tLng)
      };
      navState.lastRecalcAt = Date.now();
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
  // Resolve logged-in driver + load terminals, set window.currentDriverId/TerminalId
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

      // Load available terminals into the dropdown and wire selection to window.currentTerminalId
      const routeSelect = q('#driver-route');
      const useLastRouteBtn = q('#use-last-route');
      if (!routeSelect) return;

      const { data: terminals, error: terminalsError } = await supabase
        .from('jeepney_terminals')
        .select('terminal_id, name, lat, lng')
        .order('name', { ascending: true });

      if (terminalsError) {
        console.error('[Driver init] Failed to load jeepney_terminals', terminalsError);
        return;
      }

      terminalsById = new Map();
      const terminalsList = Array.isArray(terminals) ? terminals : [];
      terminalsList.forEach((t) => {
        if (typeof t.lat === 'number' && typeof t.lng === 'number') {
          terminalsById.set(t.terminal_id, t);
        }
      });

      // Load routes so we can map the selected destination terminal -> route_id
      try {
        const { data: routes, error: routesError } = await supabase
          .from('routes')
          .select('route_id, name, origin_terminal_id, destination_terminal_id');

        if (routesError) {
          console.error('[Driver init] Failed to load routes', routesError);
        } else if (Array.isArray(routes)) {
          const mapByDest = new Map();
          routes.forEach((r) => {
            if (r && typeof r.destination_terminal_id === 'number') {
              mapByDest.set(r.destination_terminal_id, r);
            }
          });
          routesByDestTerminalId = mapByDest;
        }
      } catch (routesErr) {
        console.error('[Driver init] Unexpected error while loading routes', routesErr);
      }

      const appendOptions = () => {
        // keep first placeholder option; remove others
        while (routeSelect.options.length > 1) {
          routeSelect.remove(1);
        }
        if (!terminalsList.length) return;
        terminalsList.forEach((t) => {
          const opt = document.createElement('option');
          opt.value = String(t.terminal_id);
          opt.textContent = t.name || `Terminal ${t.terminal_id}`;
          routeSelect.appendChild(opt);
        });
      };

      appendOptions();

      const handleRouteChange = (ev) => {
        // Prevent changing route while actively navigating; require Wakasan first
        if (driverState.phase === DriverPhase.NAVIGATING) {
          if (typeof window !== 'undefined') {
            const currentId = window.currentTerminalId ? String(window.currentTerminalId) : '';
            if (routeSelect) {
              routeSelect.value = currentId || '';
            }
          }
          alert('Press "Wakasan" first to end your current trip before choosing a different route.');
          return;
        }

        const val = ev.target.value;
        if (!val) {
          if (typeof window !== 'undefined') window.currentTerminalId = null;
          navState.activeTerminal = null;
          clearActiveRoute();
          setDriverPhase(window.currentDriverId ? DriverPhase.IDLE : DriverPhase.NO_DRIVER);
          setGuidanceEmpty();
          clearCommuterMarkers();
          updateStartButtonState();
          return;
        }
        const idNum = Number(val);
        if (!Number.isNaN(idNum) && typeof window !== 'undefined') {
          window.currentTerminalId = idNum;
          const terminal = terminalsById.get(idNum) || null;
          if (terminal) {
            navState.activeTerminal = {
              id: terminal.terminal_id,
              name: terminal.name || 'Selected terminal',
              lat: terminal.lat,
              lng: terminal.lng
            };

            // Try to resolve the associated route for this terminal so
            // commuters can see where this jeepney is heading.
            const routeMeta = routesByDestTerminalId.get(terminal.terminal_id) || null;
            if (routeMeta) {
              window.currentRouteId = routeMeta.route_id;
              console.log('[Driver init] currentRouteId set to', window.currentRouteId, routeMeta.name);
            } else {
              window.currentRouteId = null;
            }
          } else {
            navState.activeTerminal = null;
            window.currentRouteId = null;
          }
          console.log('[Driver init] currentTerminalId set to', window.currentTerminalId, navState.activeTerminal);
          if (window.currentDriverId) {
            updateStartButtonState();
          }
        }
        // Reset route geometry; a new OSRM route will be computed on next GPS fix
        clearActiveRoute();
        navState.routeCoords = [];
        navState.cumulativeDistances = [];
        navState.totalDistance = 0;
        navState.totalTimeSec = 0;
        navState.routeBounds = null;
        navState.lastRecalcAt = 0;

        setDriverPhase(navState.activeTerminal ? DriverPhase.ROUTE_SELECTED : DriverPhase.IDLE);
        setGuidanceEmpty();
        clearCommuterMarkers();

        if (map && navState.activeTerminal) {
          const tPos = [navState.activeTerminal.lat, navState.activeTerminal.lng];
          map.setView(tPos, 15);
        }
      };

      routeSelect.addEventListener('change', handleRouteChange);

      // expose a 'Use last route/terminal' shortcut if we have one stored locally
      if (window.currentDriverId && useLastRouteBtn) {
        const last = loadLastRouteForDriver(window.currentDriverId);
        if (last && last.routeId) {
          const opt = routeSelect.querySelector(`option[value="${last.routeId}"]`);
          if (opt) {
            const label = last.routeName || opt.textContent || 'last route';
            useLastRouteBtn.textContent = `Use last route (${label})`;
            useLastRouteBtn.style.display = 'inline-block';
            // When clicked, always load the latest stored route for this driver
            useLastRouteBtn.addEventListener('click', () => {
              const latest = loadLastRouteForDriver(window.currentDriverId);
              if (!latest || !latest.routeId) return;
              routeSelect.value = String(latest.routeId);
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
    terminalId: window.currentTerminalId || null,
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

      // Immediately refresh the button label so it matches the latest choice
      const useLastRouteBtn = q('#use-last-route');
      if (useLastRouteBtn) {
        const label = routeName || 'last route';
        useLastRouteBtn.textContent = `Use last route (${label})`;
      }
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
    const { driverId, terminalId } = getDriverContext();
    const ready = Boolean(driverId && terminalId);
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
  const DRIVER_ROUTE_DRIFT_THRESHOLD_METERS = 60;
  const DRIVER_ROUTE_RECALC_MIN_INTERVAL_MS = 20_000;
  const COMMUTER_ROUTE_RADIUS_METERS = 50;
  const COMMUTER_BBOX_PADDING_DEGREES = 0.01;

  // Helpers to derive progress along the current OSRM route
  function getNearestRoutePoint(here) {
    if (!Array.isArray(navState.routeCoords) || !navState.routeCoords.length) {
      return { index: -1, distance: Infinity };
    }
    let bestIndex = -1;
    let bestDist = Infinity;
    navState.routeCoords.forEach((pt, idx) => {
      const d = distanceMeters(here, pt);
      if (d < bestDist) {
        bestDist = d;
        bestIndex = idx;
      }
    });
    return { index: bestIndex, distance: bestDist };
  }

  function getRouteProgress(here) {
    const { index, distance } = getNearestRoutePoint(here);
    if (index < 0 || !Array.isArray(navState.cumulativeDistances) || !navState.cumulativeDistances.length) {
      return { distanceAlong: 0, offRouteDistance: distance };
    }
    const distanceAlong = navState.cumulativeDistances[index] ?? 0;
    return { distanceAlong, offRouteDistance: distance };
  }

  // Smooth speed based on recent fixes (meters/second)
  function updateSpeedSamples(lat, lng) {
    const now = Date.now();
    const here = { lat, lng };

    if (!driverState.speedSamples) {
      driverState.speedSamples = [];
    }

    if (driverState.lastFix && Number.isFinite(driverState.lastFixAt)) {
      const dtSec = (now - driverState.lastFixAt) / 1000;
      if (dtSec > 0.5) {
        const dist = distanceMeters(driverState.lastFix, here);
        const instSpeed = dist / dtSec;
        if (Number.isFinite(instSpeed) && instSpeed >= 0) {
          driverState.speedSamples.push(instSpeed);
          if (driverState.speedSamples.length > 8) {
            driverState.speedSamples.shift();
          }
        }
      }
    }

    driverState.lastFix = here;
    driverState.lastFixAt = now;

    if (!driverState.speedSamples.length) return null;
    const sum = driverState.speedSamples.reduce((acc, v) => acc + v, 0);
    const avg = sum / driverState.speedSamples.length;
    const safeAvg = Number.isFinite(avg) ? avg : null;

    // store a km/h approximation for simple safety checks
    if (safeAvg !== null) {
      driverState.lastSpeedKmh = safeAvg * 3.6;
    }

    return safeAvg;
  }

  function updateGuidanceFromFix(lat, lng, speedMps) {
    const here = { lat, lng };

    if (!navState.activeTerminal) {
      setGuidanceEmpty();
      return;
    }

    if (dgNextTerminal) dgNextTerminal.textContent = navState.activeTerminal.name || 'Destination';

    // Decide whether to recompute OSRM route
    const now = Date.now();
    let offRouteDistance = null;
    let hasRouteGeometry = Array.isArray(navState.routeCoords) && navState.routeCoords.length > 1;

    if (hasRouteGeometry) {
      const progress = getRouteProgress(here);
      offRouteDistance = progress.offRouteDistance;
    }

    const tooOld = now - navState.lastRecalcAt > DRIVER_ROUTE_RECALC_MIN_INTERVAL_MS;
    const tooFar = offRouteDistance !== null && offRouteDistance > DRIVER_ROUTE_DRIFT_THRESHOLD_METERS;

    if (!hasRouteGeometry || tooOld || tooFar) {
      recomputeRouteFromHere(lat, lng);
      hasRouteGeometry = Array.isArray(navState.routeCoords) && navState.routeCoords.length > 1;
    }

    let remainingDistance;
    let etaMinutes;

    if (hasRouteGeometry && navState.totalDistance > 0) {
      const { distanceAlong, offRouteDistance: offDist } = getRouteProgress(here);
      remainingDistance = Math.max(navState.totalDistance - distanceAlong, 0);

      // If we're extremely close, treat as arrived
      if (remainingDistance <= ARRIVAL_RADIUS_METERS && offDist <= ARRIVAL_RADIUS_METERS) {
        remainingDistance = 0;
      }

      // ETA: prefer smoothed GPS speed, else proportion of OSRM duration
      if (typeof speedMps === 'number' && Number.isFinite(speedMps) && speedMps > 0.8) {
        etaMinutes = (remainingDistance / speedMps) / 60;
      } else if (navState.totalTimeSec > 0 && navState.totalDistance > 0) {
        const fraction = remainingDistance / navState.totalDistance;
        etaMinutes = (navState.totalTimeSec * fraction) / 60;
      } else {
        // final fallback to simple speed
        const fallbackSpeedMps = (FALLBACK_SPEED_KMH * 1000) / 3600;
        etaMinutes = (remainingDistance / fallbackSpeedMps) / 60;
      }
    } else {
      // No OSRM geometry yet: straight-line fallback
      const dest = navState.activeTerminal;
      remainingDistance = distanceMeters(here, dest);
      const effectiveSpeed = (typeof speedMps === 'number' && Number.isFinite(speedMps) && speedMps > 0.8)
        ? speedMps
        : (FALLBACK_SPEED_KMH * 1000) / 3600;
      etaMinutes = (remainingDistance / effectiveSpeed) / 60;
    }

    if (dgDistance) dgDistance.textContent = formatDistance(remainingDistance);

    // Show current speed in km/h, based on smoothed GPS speed
    let speedKmh = null;
    if (typeof speedMps === 'number' && Number.isFinite(speedMps) && speedMps >= 0) {
      speedKmh = speedMps * 3.6;
    } else if (driverState.lastSpeedKmh && Number.isFinite(driverState.lastSpeedKmh)) {
      speedKmh = driverState.lastSpeedKmh;
    }
    if (dgSpeed) {
      dgSpeed.textContent = Number.isFinite(speedKmh) ? `${speedKmh.toFixed(1)} km/h` : '—';
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
    if (!map) return;
    if (!navState.activeTerminal) return;
    if (!navState.routeBounds || !Array.isArray(navState.routeCoords) || !navState.routeCoords.length) return;

    // Basic throttling for commuter refresh
    const now = Date.now();
    if (now - driverState.lastCommutersRefreshAt < 8_000) return;
    driverState.lastCommutersRefreshAt = now;

    try {
      const since = new Date(Date.now() - 5 * 60_000).toISOString();
      const pad = COMMUTER_BBOX_PADDING_DEGREES;
      const { minLat, maxLat, minLng, maxLng } = navState.routeBounds;

      const { data, error } = await supabase
        .from('commuter_locations')
        .select('commuter_id, lat, lng, updated_at')
        .gte('updated_at', since)
        .gte('lat', (minLat ?? -90) - pad)
        .lte('lat', (maxLat ?? 90) + pad)
        .gte('lng', (minLng ?? -180) - pad)
        .lte('lng', (maxLng ?? 180) + pad);

      if (error) {
        console.error('[Driver commuters] Failed to fetch commuter_locations', error);
        return;
      }

      const commuters = Array.isArray(data) ? data : [];

      const seen = new Set();
      let visibleCount = 0;

      commuters.forEach((c) => {
        if (!c || !c.commuter_id) return;
        if (typeof c.lat !== 'number' || typeof c.lng !== 'number') return;

        const id = String(c.commuter_id);
        seen.add(id);

        const point = { lat: c.lat, lng: c.lng };
        const { distance: dToRoute } = getNearestRoutePoint(point);
        if (!Number.isFinite(dToRoute) || dToRoute > COMMUTER_ROUTE_RADIUS_METERS) {
          // Too far from the jeepney route; hide if marker exists
          const existingFar = driverState.commutersMarkers.get(id);
          if (existingFar) {
            try { map.removeLayer(existingFar); } catch (e) { /* ignore */ }
            driverState.commutersMarkers.delete(id);
          }
          return;
        }

        visibleCount += 1;

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

      if (dgCommuters) dgCommuters.textContent = String(visibleCount || 0);

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
          route_id: routeId || null,
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
        const smoothSpeedMps = updateSpeedSamples(latitude, longitude);
        updateGuidanceFromFix(latitude, longitude, smoothSpeedMps);
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

      // Refresh commuters along the current route only (lightweight + throttled)
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

  async function stopGpsTracking() {
    // Stop browser-side GPS watcher
    if (geoWatchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(geoWatchId);
      geoWatchId = null;
      console.log('[GPS] Tracking stopped');
    }

    // Remove driver marker from the driver map and reset centering state
    if (map && driverMarker) {
      try {
        map.removeLayer(driverMarker);
      } catch (e) {
        console.warn('[GPS] Failed to remove driver marker', e);
      }
      driverMarker = null;
      hasCenteredOnDriver = false;
    }

    // Stop periodic commuter refreshes on this page
    if (driverState.commutersTimer) {
      clearInterval(driverState.commutersTimer);
      driverState.commutersTimer = null;
    }

    clearCommuterMarkers();

    // Also remove this driver's live location row so commuters stop seeing it
    const { driverId } = getDriverContext();
    if (driverId) {
      try {
        const { error } = await supabase
          .from('jeepney_locations')
          .delete()
          .eq('driver_id', driverId);

        if (error) {
          console.error('[GPS] Failed to delete jeepney_locations row on stop', error);
        }
      } catch (err) {
        console.error('[GPS] Unexpected error while deleting jeepney_locations row on stop', err);
      }
    }
  }

  if (startBtn) {
    startBtn.addEventListener('click', () => {
      if (startBtn.disabled) return;

      const { driverId, terminalId } = getDriverContext();
      if (!driverId || !terminalId) {
        updateStartButtonState();
        return;
      }

      // Simple safety confirmation so the driver stays focused on the road
      const safetyOk = window.confirm(
        'Safety reminder:\n\nFor your safety, do not operate this app while driving. '
        + 'Let a passenger handle it or adjust settings only when stopped.\n\nStart navigation now?'
      );
      if (!safetyOk) return;

      // remember this as the driver's last route choice on this device
      const routeSelect = q('#driver-route');
      let routeName = null;
      if (routeSelect) {
        const opt = routeSelect.options[routeSelect.selectedIndex];
        routeName = opt ? opt.textContent : null;
      }
      saveLastRouteForDriver(driverId, terminalId, routeName);

      // Initialize trip phase and start periodic route-scoped commuter refresh
      driverState.leg = 'TO_ORIGIN';
      setDriverPhase(DriverPhase.NAVIGATING);

       // While navigating, hide the "Use last route" button for extra focus
       const useLastRouteBtn = q('#use-last-route');
       if (useLastRouteBtn) {
         useLastRouteBtn.style.display = 'none';
       }

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
      const confirmEnd = window.confirm(
        'Are you sure you want to end this trip and stop sharing your live location?'
      );
      if (!confirmEnd) return;

      // Fully stop tracking and reset navigation state
      void (async () => {
        await stopGpsTracking();

        const routeSelect = q('#driver-route');
        if (routeSelect) {
          routeSelect.value = '';
        }

        const useLastRouteBtn = q('#use-last-route');
        if (useLastRouteBtn) {
          // Restore button visibility so drivers can quickly reuse the last route
          useLastRouteBtn.style.display = 'inline-block';
        }

        if (typeof window !== 'undefined') {
          window.currentTerminalId = null;
          window.currentRouteId = null;
        }

        clearActiveRoute();
        navState.activeTerminal = null;
        navState.routeCoords = [];
        navState.cumulativeDistances = [];
        navState.totalDistance = 0;
        navState.totalTimeSec = 0;
        navState.routeBounds = null;
        navState.lastRecalcAt = 0;

        setGuidanceEmpty();

        // Recenter the map back to the default home view
        if (map && typeof map.setView === 'function') {
          map.setView([14.831426, 120.976661], 13);
        }

        // Back to idle/standby phase (driver still logged in)
        setDriverPhase(window.currentDriverId ? DriverPhase.IDLE : DriverPhase.NO_DRIVER);
      })();
    });
  }

  // Fire-and-forget; driver page does not depend on awaiting this for UI
  void initDriverIdentityAndRoutes();

  // Initialize default guidance UI state
  setDriverPhase(window.currentDriverId ? DriverPhase.IDLE : DriverPhase.NO_DRIVER);
  setGuidanceEmpty();
});
