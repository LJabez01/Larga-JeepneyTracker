// Commuter-side map, GPS tracking, and live jeepney location display
import { supabase } from '../login/supabaseClient.js';

// Dropdown menu control
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

// Map, GPS, and live jeepney tracking module
(function () {
  // Route lookup maps for displaying route names in jeepney popups
  const routeNameToId = new Map();
  const routeIdToName = new Map();

  // Initialize Leaflet map
  const map = L.map('map', { zoomControl: false }).setView([14.831426, 120.976661], 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
  }).addTo(map);

  // Position zoom control at bottom-left to avoid overlapping UI elements
  if (map && map.zoomControl && map.zoomControl.setPosition) {
    map.zoomControl.setPosition('bottomleft');
  } else {
    L.control.zoom({ position: 'bottomleft' }).addTo(map);
  }

  // Custom Leaflet icons (paths relative to /mainpage/commuter.html)
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

  // Commuter marker state
  let commuterMarker = null;
  let hasCenteredOnCommuter = false;

  // Commuter position for calculating jeepney distance and ETA
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

  // Haversine formula for accurate great-circle distance between GPS coordinates
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

  // Fallback speed for ETA when real GPS speed unavailable
  const FALLBACK_JEEP_SPEED_KMH = 18;
  // Hide jeepneys that haven't reported location updates recently
  const JEEP_STALE_MS = 60_000;

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
      map.setView(pos, 16);
    }
  }

  // Active jeepney markers (keyed by driver_id) and cached driver details
  const jeepneyMarkers = new Map();
  const driverInfoCache = new Map();

  function getRouteDisplayName(row) {
    const id = row?.route_id;
    if (!id) return '—';
    const byId = routeIdToName.get(id);
    if (byId) return byId;
    // Fallback lookup if bidirectional map isn't synchronized
    for (const [name, rid] of routeNameToId.entries()) {
      if (rid === id) return name;
    }
    return `Route ${id}`;
  }

  // Calculate distance, ETA, and speed text for a jeepney relative to commuter
  function computeJeepStats(row) {
    const ctx = getCommuterGeoContext();

    const hasSpeed = typeof row?.speed === 'number' && Number.isFinite(row.speed) && row.speed >= 0;

    // Only display actual GPS speed from driver (never show fallback speed)
    let displaySpeedText = '—';
    if (hasSpeed) {
      const kmh = row.speed * 3.6;
      // Treat near-zero as stopped to prevent UI flicker
      if (kmh < 1) {
        displaySpeedText = '0.0 km/h';
      } else {
        displaySpeedText = `${kmh.toFixed(1)} km/h`;
      }
    }

    // Can't calculate distance/ETA without both positions
    if (typeof row?.lat !== 'number' || typeof row?.lng !== 'number' ||
      typeof ctx.lat !== 'number' || typeof ctx.lng !== 'number') {
      return {
        distanceText: '—',
        etaText: '—',
        speedText: displaySpeedText
      };
    }

    const distance = distanceMeters({ lat: ctx.lat, lng: ctx.lng }, { lat: row.lat, lng: row.lng });

    // Use real speed for ETA when available; fallback speed otherwise (never shown to user)
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

  // Load and cache driver profile data (plate number) from database
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
    if (!row || typeof row.lat !== 'number' || typeof row.lng !== 'number') {
      return false;
    }

    // Hide stale jeepneys in case DELETE events are missed during logout/offline
    if (row.updated_at) {
      const t = new Date(row.updated_at).getTime();
      if (Number.isFinite(t) && (Date.now() - t) > JEEP_STALE_MS) {
        return false;
      }
    }

    return true;
  }

  // Update DOM elements inside a jeepney marker's popup with current data
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

    // Lazy-load driver details if not already cached
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

    // Remove marker if jeepney no longer meets display criteria
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
          // Offset centers popup pointer on jeepney icon
          offset: L.point(6, -32),
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

  // Commuter GPS tracking and database synchronization
  let commuterId = null;
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

    // Show GPS waiting indicator
    const gpsStatus = document.getElementById('gps-status');
    if (gpsStatus) {
      gpsStatus.classList.remove('hidden');
    }

    let firstFixReceived = false;

    const success = (pos) => {
      const { latitude, longitude } = pos.coords || {};
      if (typeof latitude === 'number' && typeof longitude === 'number') {
        // Hide GPS status on first successful fix
        if (!firstFixReceived && gpsStatus) {
          gpsStatus.classList.add('hidden');
          firstFixReceived = true;
        }
        updateCommuterMarker(latitude, longitude);
        void sendCommuterLocation(pos);
      }
    };

    const error = (err) => {
      console.error('[Commuter GPS] watchPosition error', err);
      // Keep showing the indicator if GPS fails
      if (gpsStatus && err.code === 3) {
        // Timeout: GPS is trying but signal is weak
        gpsStatus.innerHTML = '<i class="bi bi-geo-alt"></i> GPS signal weak, retrying...';
      }
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

  async function clearCommuterLocationRow() {
    if (!commuterId) return;
    try {
      const { error } = await supabase
        .from('commuter_locations')
        .delete()
        .eq('commuter_id', commuterId);

      if (error) {
        console.error('[Commuter GPS] Failed to delete commuter_locations row on logout', error);
      }
    } catch (err) {
      console.error('[Commuter GPS] Unexpected error while deleting commuter_locations row on logout', err);
    }
  }

  async function loadInitialJeepneys() {
    try {
      const { data, error } = await supabase
        .from('jeepney_locations')
        .select('driver_id, lat, lng, route_id, speed, updated_at')
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('[Jeepneys] Failed to load initial jeepneys', error);
        return;
      }

      if (Array.isArray(data)) {
        const currentDriverIds = new Set();
        data.forEach((row) => {
          const key = row.driver_id;
          if (key) {
            currentDriverIds.add(String(key));
            const existing = jeepneyMarkers.get(key);
            if (existing) existing.lastRow = row;
          }
          upsertJeepneyMarker(row);
        });

        // Remove markers for drivers no longer in the database
        Array.from(jeepneyMarkers.keys()).forEach((driverId) => {
          if (!currentDriverIds.has(String(driverId))) {
            console.log('[Jeepneys] Removing marker for driver_id:', driverId, '(no longer in DB)');
            removeJeepneyMarker(driverId);
          }
        });
      }
    } catch (err) {
      console.error('[Jeepneys] Unexpected error while loading initial data', err);
    }
  }

  // Polling fallback keeps jeepneys updated if Realtime subscription fails
  function startJeepPollingFallback() {
    const INTERVAL_MS = 3_000;
    if (typeof window === 'undefined') return;
    if (window.__largaJeepPollingTimer) return;

    window.__largaJeepPollingTimer = window.setInterval(() => {
      void loadInitialJeepneys();
    }, INTERVAL_MS);
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
            console.log('[Jeepneys] DELETE event for driver_id:', row.driver_id);
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

      // Preload route names for displaying in jeepney popups
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

      // Load initial jeepney markers and subscribe to real-time updates
      await loadInitialJeepneys();
      subscribeToJeepneys();
      startJeepPollingFallback();
    } catch (err) {
      console.error('[Commuter init] Unexpected error', err);
    }
  }

  // Start GPS tracking immediately (commuter marker appears before auth completes)
  startCommuterTracking();
  initCommuterSide();

  // Expose functions for logout handler
  if (typeof window !== 'undefined') {
    window.stopCommuterTracking = stopCommuterTracking;
    window.clearCommuterLocationRow = clearCommuterLocationRow;
  }
})();

// Notification panel UI control
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

  // Close panel when clicking outside
  document.addEventListener('click', function (e) {
    if (!notifPanel.classList.contains('show')) return;
    const target = e.target;
    if (!notifPanel.contains(target) && !notifToggle.contains(target)) {
      notifPanel.classList.remove('show');
      notifPanel.setAttribute('aria-hidden', 'true');
    }
  });

  // Escape key closes panel
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && notifPanel.classList.contains('show')) {
      notifPanel.classList.remove('show');
      notifPanel.setAttribute('aria-hidden', 'true');
    }
  });

  if (notifInbox) {
    notifInbox.addEventListener('click', function (e) {
      e.preventDefault();
      window.location.href = '../mainmenu/notifications.html';
    });
  }

  if (notifMute) {
    notifMute.addEventListener('click', function (e) {
      e.preventDefault();
      notifMute.classList.toggle('muted');
      notifMute.title = notifMute.classList.contains('muted') ? 'Unmute notifications' : 'Mute notifications';
    });
  }

  renderNotifications(sampleNotifs);

})();

// Logout handler: cleanup GPS tracking and database row before sign out
(function () {
  const logoutLink = document.querySelector('.dropdown-menu a[href="../login/Log-in.html"]');
  if (!logoutLink) return;

  logoutLink.addEventListener('click', async (e) => {
    e.preventDefault();

    try {
      if (typeof window !== 'undefined' && window.stopCommuterTracking) {
        window.stopCommuterTracking();
      }
    } catch (err) {
      console.error('[Commuter logout] Error while stopping GPS tracking', err);
    }

    try {
      if (typeof window !== 'undefined' && window.clearCommuterLocationRow) {
        await window.clearCommuterLocationRow();
      }
    } catch (err) {
      console.error('[Commuter logout] Error clearing commuter row', err);
    }

    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('[Commuter logout] Error signing out', err);
    }

    window.location.href = '../login/Log-in.html';
  });
})();