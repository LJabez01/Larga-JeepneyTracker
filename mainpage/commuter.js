// commuter.js - ES module: dropdown, map, GPS for commuter, and live jeepney markers
import { supabase } from '../login/supabaseClient.js';

// Dropdown menu toggle
(function () {
  const menuToggle = document.getElementById('menu-toggle');
  const dropdownMenu = document.querySelector('.dropdown-menu');

  if (menuToggle && dropdownMenu) {
    menuToggle.addEventListener('click', function (e) {
      e.preventDefault();
      dropdownMenu.classList.toggle('show');
    });

    document.addEventListener('click', function (e) {
      const isClickOutside = !menuToggle.contains(e.target) && !dropdownMenu.contains(e.target);
      if (isClickOutside) {
        dropdownMenu.classList.remove('show');
      }
    });
  }
})();

// Map + GPS + live jeepneys
(function () {
  // Route name lookup for popups only (no commuter route selection UI)
  const routeNameToId = new Map();
  const routeIdToName = new Map();

  // Initialize Leaflet map
  const map = L.map('map', { zoomControl: false }).setView([14.831426, 120.976661], 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
  }).addTo(map);

  // Ensure zoom control is visible and placed bottom-left
  if (map && map.zoomControl && map.zoomControl.setPosition) {
    map.zoomControl.setPosition('bottomleft');
  } else {
    L.control.zoom({ position: 'bottomleft' }).addTo(map);
  }

  // -------------------------------------------------------------------------
  // Custom map icons (visual only; logic unchanged)
  // NOTE: iconUrl paths are relative to commuter.html in /mainpage
  // Make sure these image files exist in /images
  //   ../images/commuter-icon.png
  //   ../images/jeepney-icon.png
  // -------------------------------------------------------------------------
  const commuterIcon = L.icon({
    iconUrl: '../images/commuter-icon.png',
    iconSize: [64, 64],
    iconAnchor: [32, 64],
    popupAnchor: [0, -64]
  });

  const jeepneyIcon = L.icon({
    iconUrl: '../images/jeepney-icon.png',
    iconSize: [64, 64],
    iconAnchor: [32, 64],
    popupAnchor: [0, -64]
  });

  // Commuter marker (updated from GPS)
  let commuterMarker = null;
  let hasCenteredOnCommuter = false;

  // Latest commuter context for distance/ETA and filtering
  const commuterState = {
    lat: null,
    lng: null
  };

  function getCommuterGeoContext() {
    return {
      lat: commuterState.lat,
      lng: commuterState.lng
    };
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

  const FALLBACK_JEEP_SPEED_KMH = 18;

  function updateCommuterMarker(lat, lng) {
    const pos = [lat, lng];
    commuterState.lat = lat;
    commuterState.lng = lng;
    if (!commuterMarker) {
      commuterMarker = L.marker(pos, {
        title: 'Your Location',
        icon: commuterIcon
      }).addTo(map);
    } else {
      commuterMarker.setLatLng(pos);
    }

    if (!hasCenteredOnCommuter && map && typeof map.setView === 'function') {
      hasCenteredOnCommuter = true;
      map.setView(pos, 16); // zoom in closer to the commuter
    }
  }

  // Jeepney markers keyed by driver_id
  const jeepneyMarkers = new Map();
  const driverInfoCache = new Map(); // optional: plate number and other details per driver

  function getRouteDisplayName(row) {
    const id = row?.route_id;
    if (!id) return '—';
    const byId = routeIdToName.get(id);
    if (byId) return byId;
    // Fallback: attempt to invert the name->id map if needed
    for (const [name, rid] of routeNameToId.entries()) {
      if (rid === id) return name;
    }
    return `Route ${id}`;
  }

  function computeJeepStats(row) {
    const ctx = getCommuterGeoContext();
    if (typeof row?.lat !== 'number' || typeof row?.lng !== 'number' ||
      typeof ctx.lat !== 'number' || typeof ctx.lng !== 'number') {
      return {
        distanceText: '—',
        etaText: '—',
        speedText: '—'
      };
    }

    const distance = distanceMeters({ lat: ctx.lat, lng: ctx.lng }, { lat: row.lat, lng: row.lng });
    const hasSpeed = typeof row.speed === 'number' && Number.isFinite(row.speed) && row.speed >= 0;

    // Displayed speed: only show real values coming from the driver.
    let displaySpeedText = '—';
    if (hasSpeed) {
      const kmh = row.speed * 3.6;
      // Treat near-zero speeds as stopped to avoid flicker.
      if (kmh < 1) {
        displaySpeedText = '0.0 km/h';
      } else {
        displaySpeedText = `${kmh.toFixed(1)} km/h`;
      }
    }

    // ETA: prefer real speed when we have it, otherwise fall back
    // to a typical jeepney speed, but do NOT use the fallback for
    // the displayed "Speed" field.
    const effectiveSpeedMps = hasSpeed && row.speed > 0.8
      ? row.speed
      : (FALLBACK_JEEP_SPEED_KMH * 1000) / 3600;
    const etaMinutes = (distance / effectiveSpeedMps) / 60;

    return {
      distanceText: formatDistance(distance),
      etaText: formatEtaMinutes(etaMinutes),
      speedText: displaySpeedText
    };
  }

  async function ensureDriverInfo(driverId) {
    if (!driverId) return null;
    if (driverInfoCache.has(driverId)) return driverInfoCache.get(driverId);

    try {
      const { data, error } = await supabase
        .from('drivers')
        .select('driver_id, plate_number')
        .eq('driver_id', driverId)
        .maybeSingle();

      if (error) {
        console.error('[Commuter] Failed to load driver info for popup', error);
        driverInfoCache.set(driverId, null);
        return null;
      }

      driverInfoCache.set(driverId, data || null);
      return data || null;
    } catch (err) {
      console.error('[Commuter] Unexpected error while loading driver info', err);
      driverInfoCache.set(driverId, null);
      return null;
    }
  }

  function shouldShowJeep(row) {
    // For now: show every jeep that shares its location.
    // We keep distance calculations only for ETA/distance in the popup.
    return !!row && typeof row.lat === 'number' && typeof row.lng === 'number';
  }

  function updateJeepPopupDom(info, row) {
    if (!info || !row || !info.dom) return;
    const { statusEl, speedEl, routeEl, timeEl, distanceEl, plateEl } = info.dom;

    if (statusEl) statusEl.textContent = 'Active';
    if (routeEl) routeEl.textContent = getRouteDisplayName(row);

    const stats = computeJeepStats(row);
    if (speedEl) speedEl.textContent = stats.speedText;
    if (timeEl) timeEl.textContent = stats.etaText;
    if (distanceEl) distanceEl.textContent = `Distance: ${stats.distanceText}`;

    if (plateEl) {
      const cached = driverInfoCache.get(row.driver_id) || null;
      if (cached && cached.plate_number) {
        plateEl.textContent = cached.plate_number;
      } else {
        plateEl.textContent = '—';
      }
    }

    // Fire off one-time async load of driver details (plate) if not cached yet
    if (!driverInfoCache.has(row.driver_id) && plateEl) {
      void ensureDriverInfo(row.driver_id).then((profile) => {
        if (!profile || !profile.plate_number) return;
        const current = jeepneyMarkers.get(row.driver_id);
        if (!current || current.dom !== info.dom) return;
        current.dom.plateEl.textContent = profile.plate_number;
      }).catch(() => { /* already logged */ });
    }
  }

  function upsertJeepneyMarker(row) {
    if (!row || typeof row.lat !== 'number' || typeof row.lng !== 'number') return;
    const key = row.driver_id;
    if (!key) return;

    // Apply route + 50 m proximity filter
    if (!shouldShowJeep(row)) {
      removeJeepneyMarker(key);
      return;
    }

    const pos = [row.lat, row.lng];
    let info = jeepneyMarkers.get(key);

    if (!info) {
      const tpl = document.getElementById('popup-commuters-info-template');
      let popupContent = null;
      if (tpl) {
        popupContent = tpl.cloneNode(true);
        popupContent.style.display = 'block';
      }

      const marker = L.marker(pos, {
        title: 'Jeepney',
        icon: jeepneyIcon
      });
      if (popupContent) {
        marker.bindPopup(popupContent, {
          maxWidth: 320,
          className: 'small-popup',
          offset: L.point(0, -46),
          autoPanPadding: [20, 20]
        });
      }
      marker.addTo(map);

      const dom = popupContent
        ? {
            statusEl: popupContent.querySelector('.vehicle-status'),
            speedEl: popupContent.querySelector('.speed'),
            routeEl: popupContent.querySelector('.route'),
            timeEl: popupContent.querySelector('.time'),
            distanceEl: popupContent.querySelector('.distance'),
            plateEl: popupContent.querySelector('.plate-number')
          }
        : {};

      info = { marker, dom, lastRow: row };
      jeepneyMarkers.set(key, info);
    } else {
      info.marker.setLatLng(pos);
      info.lastRow = row;
    }

    updateJeepPopupDom(info, row);
  }

  function removeJeepneyMarker(driverId) {
    const info = jeepneyMarkers.get(driverId);
    if (info && info.marker) {
      map.removeLayer(info.marker);
    }
    jeepneyMarkers.delete(driverId);
  }

  // ---------------------------------------------------------------------------
  // Supabase-backed GPS tracking for commuter + live jeepney locations
  // ---------------------------------------------------------------------------
  let commuterId = null; // from public.commuters.commuter_id
  let geoWatchId = null;

  async function sendCommuterLocation(position) {
    const { coords } = position || {};
    if (!coords || !commuterId) return;

    const { latitude, longitude } = coords;

    try {
      const { error } = await supabase
        .from('commuter_locations')
        .upsert({
          commuter_id: commuterId,
          route_id: null,
          lat: latitude,
          lng: longitude,
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('[Commuter GPS] Failed to upsert commuter_locations', error);
      }
    } catch (err) {
      console.error('[Commuter GPS] Unexpected error while sending location', err);
    }
  }

  function startCommuterTracking() {
    if (!navigator.geolocation) {
      console.warn('Geolocation is not supported on this device/browser.');
      return;
    }

    if (geoWatchId !== null) return;

    const success = (pos) => {
      const { latitude, longitude } = pos.coords || {};
      if (typeof latitude === 'number' && typeof longitude === 'number') {
        updateCommuterMarker(latitude, longitude);
        void sendCommuterLocation(pos);
      }
    };

    const error = (err) => {
      console.error('[Commuter GPS] watchPosition error', err);
    };

    geoWatchId = navigator.geolocation.watchPosition(success, error, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 15000
    });

    console.log('[Commuter GPS] Tracking started');
  }

  function stopCommuterTracking() {
    if (geoWatchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(geoWatchId);
      geoWatchId = null;
      console.log('[Commuter GPS] Tracking stopped');
    }
  }

  async function loadInitialJeepneys() {
    try {
      const { data, error } = await supabase
        .from('jeepney_locations')
        .select('driver_id, lat, lng, route_id, speed')
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('[Jeepneys] Failed to load initial jeepneys', error);
        return;
      }

      if (Array.isArray(data)) {
        data.forEach((row) => {
          const key = row.driver_id;
          if (key) {
            const existing = jeepneyMarkers.get(key);
            if (existing) existing.lastRow = row;
          }
          upsertJeepneyMarker(row);
        });
      }
    } catch (err) {
      console.error('[Jeepneys] Unexpected error while loading initial data', err);
    }
  }

  function subscribeToJeepneys() {
    const channel = supabase
      .channel('jeepney-locations-commuter')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'jeepney_locations' },
        (payload) => {
          const row = payload.new || payload.old;
          if (!row) return;

          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const key = row.driver_id;
            if (key) {
              const existing = jeepneyMarkers.get(key);
              if (existing) existing.lastRow = row;
            }
            upsertJeepneyMarker(row);
          } else if (payload.eventType === 'DELETE') {
            removeJeepneyMarker(row.driver_id);
          }
        }
      )
      .subscribe((status) => {
        console.log('[Jeepneys] Realtime subscription status:', status);
      });

    return channel;
  }

  async function initCommuterSide() {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.error('[Commuter init] Failed to get user', error);
        return;
      }
      const user = data?.user;
      if (!user) {
        console.warn('[Commuter init] No logged-in user; skipping GPS + jeepneys.');
        return;
      }

      // Resolve commuter_id for this auth user
      const { data: commuterRow, error: commuterError } = await supabase
        .from('commuters')
        .select('commuter_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (commuterError) {
        console.error('[Commuter init] Failed to resolve commuter_id', commuterError);
        return;
      }

      if (!commuterRow?.commuter_id) {
        console.warn('[Commuter init] No commuter profile found for this user; skipping GPS + jeepneys.');
        return;
      }

      commuterId = commuterRow.commuter_id;

      // Preload routes for popup display (routeId -> name); no commuter selection UI
      try {
        const { data: routes, error: routesError } = await supabase
          .from('routes')
          .select('route_id, name')
          .order('name', { ascending: true });

        if (routesError) {
          console.error('[Commuter init] Failed to load routes', routesError);
        } else if (Array.isArray(routes)) {
          routeNameToId.clear();
          routeIdToName.clear();
          routes.forEach((r) => {
            const name = r.name || `Route ${r.route_id}`;
            routeNameToId.set(name, r.route_id);
            routeIdToName.set(r.route_id, name);
          });
        }
      } catch (routesErr) {
        console.error('[Commuter init] Unexpected error while loading routes', routesErr);
      }

      // Start GPS tracking automatically after login
      startCommuterTracking();

      // Load existing jeepney locations that RLS allows this commuter to see
      await loadInitialJeepneys();

      // Subscribe to live updates
      subscribeToJeepneys();
    } catch (err) {
      console.error('[Commuter init] Unexpected error', err);
    }
  }

  // Kick off Supabase-backed commuter behavior
  initCommuterSide();

  // Expose stop function if needed from other scripts
  if (typeof window !== 'undefined') {
    window.stopCommuterTracking = stopCommuterTracking;
  }
})();


// Notification panel: toggle, populate sample items, close handlers
(function () {
  const notifToggle = document.getElementById('notifToggle');
  const notifPanel = document.getElementById('notifPanel');
  const notificationList = document.getElementById('notificationList');
  const notifMute = document.getElementById('notifMute');
  const notifInbox = document.getElementById('notifInbox');

  if (!notifPanel || !notificationList) return;

  const sampleNotifs = [
    { id: 1, title: 'A jeepney has passed your waiting area', date: 'December 2, 2026', type: 'passed' },
    { id: 2, title: 'A jeepney is approaching your waiting area', date: 'December 2, 2026', type: 'approaching' },
    { id: 3, title: 'A jeepney has passed your waiting area', date: 'December 2, 2026', type: 'passed' },
    { id: 4, title: 'A jeepney is approaching your waiting area', date: 'December 2, 2026', type: 'approaching' }
  ];

  function renderNotifications(items) {
    notificationList.innerHTML = '';
    items.forEach((n) => {
      const item = document.createElement('div');
      item.className = 'notif-item';

      const dot = document.createElement('div');
      dot.className = 'notif-dot';
      dot.style.background = n.type === 'approaching' ? '#3fa65a' : '#d64545';

      const content = document.createElement('div');
      content.className = 'notif-content';

      const title = document.createElement('div');
      title.className = 'notif-title';
      title.textContent = n.title;

      const date = document.createElement('div');
      date.className = 'notif-date';
      date.textContent = n.date;

      content.appendChild(title);
      content.appendChild(date);

      item.appendChild(dot);
      item.appendChild(content);

      item.addEventListener('click', function (e) {
        item.classList.toggle('notif-highlight');
      });

      notificationList.appendChild(item);
    });
  }

  // Toggle panel visibility
  function togglePanel() {
    notifPanel.classList.toggle('show');
    const isShown = notifPanel.classList.contains('show');
    notifPanel.setAttribute('aria-hidden', (!isShown).toString());
  }

  if (notifToggle) {
    notifToggle.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      togglePanel();
    });
  }

  // Close when clicking outside
  document.addEventListener('click', function (e) {
    if (!notifPanel.classList.contains('show')) return;
    const target = e.target;
    if (!notifPanel.contains(target) && !notifToggle.contains(target)) {
      notifPanel.classList.remove('show');
      notifPanel.setAttribute('aria-hidden', 'true');
    }
  });

  // Escape closes
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && notifPanel.classList.contains('show')) {
      notifPanel.classList.remove('show');
      notifPanel.setAttribute('aria-hidden', 'true');
    }
  });

  if (notifInbox) {
    notifInbox.addEventListener('click', function (e) {
      e.preventDefault();
      // navigate to notifications page
      window.location.href = '../mainmenu/notifications.html';
    });
  }

  if (notifMute) {
    notifMute.addEventListener('click', function (e) {
      e.preventDefault();
      // simple feedback toggle (could be wired to user prefs)
      notifMute.classList.toggle('muted');
      notifMute.title = notifMute.classList.contains('muted') ? 'Unmute notifications' : 'Mute notifications';
    });
  }

  // initial render with sample notifications
  renderNotifications(sampleNotifs);

})();