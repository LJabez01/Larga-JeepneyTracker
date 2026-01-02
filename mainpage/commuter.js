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
  const routeSearchInput = document.querySelector('.search-bar');
  const routesDatalist = document.getElementById('routes');
  const routeNameToId = new Map();

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

  // Commuter marker (updated from GPS)
  let commuterMarker = null;
  let hasCenteredOnCommuter = false;

  function updateCommuterMarker(lat, lng) {
    const pos = [lat, lng];
    if (!commuterMarker) {
      commuterMarker = L.marker(pos, { title: 'Your Location' }).addTo(map);
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

  function upsertJeepneyMarker(row) {
    if (!row || typeof row.lat !== 'number' || typeof row.lng !== 'number') return;
    const key = row.driver_id;
    if (!key) return;

    const pos = [row.lat, row.lng];
    let marker = jeepneyMarkers.get(key);

    if (!marker) {
      const tpl = document.getElementById('popup-commuters-info-template');
      let popupContent = null;
      if (tpl) {
        popupContent = tpl.cloneNode(true);
        popupContent.style.display = 'block';
      }

      marker = L.marker(pos, { title: 'Jeepney' });
      if (popupContent) {
        marker.bindPopup(popupContent, {
          maxWidth: 320,
          className: 'small-popup',
          offset: L.point(0, -46),
          autoPanPadding: [20, 20]
        });
      }
      marker.addTo(map);
      jeepneyMarkers.set(key, marker);
    } else {
      marker.setLatLng(pos);
    }
  }

  function removeJeepneyMarker(driverId) {
    const marker = jeepneyMarkers.get(driverId);
    if (marker) {
      map.removeLayer(marker);
      jeepneyMarkers.delete(driverId);
    }
  }

  // Optional Jeepney bubble helper remains (no change to markup required)
  (function () {
    let _jbTimer = null;
    let bubble = document.getElementById('jeepney-bubble');

    function hideJeepneyBubble() {
      bubble = bubble || document.getElementById('jeepney-bubble');
      if (!bubble) return;

      bubble.classList.remove('show');
      setTimeout(() => {
        if (!bubble.classList.contains('show')) {
          bubble.style.display = 'none';
        }
      }, 260);

      if (_jbTimer) {
        clearTimeout(_jbTimer);
        _jbTimer = null;
      }
    }

    window.showJeepneyBubble = function (html) {
      bubble = bubble || document.getElementById('jeepney-bubble');
      if (!bubble) return;

      bubble.innerHTML = `
        <button class="jb-close" aria-label="Close">&times;</button>
        <div class="jb-content">${html}</div>
      `;

      const btn = bubble.querySelector('.jb-close');
      if (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          hideJeepneyBubble();
        });
      }

      bubble.style.display = 'block';
      void bubble.offsetWidth; // force reflow
      bubble.classList.add('show');

      if (_jbTimer) clearTimeout(_jbTimer);
      _jbTimer = setTimeout(hideJeepneyBubble, 6000);
    };

    if (map && map.on) {
      map.on('click', hideJeepneyBubble);
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') hideJeepneyBubble();
    });

    document.addEventListener('click', function (e) {
      if (bubble && !bubble.contains(e.target)) hideJeepneyBubble();
    });
  })();

  // ---------------------------------------------------------------------------
  // Supabase-backed GPS tracking for commuter + live jeepney locations
  // ---------------------------------------------------------------------------
  let commuterId = null; // from public.commuters.commuter_id
  let geoWatchId = null;

  const getCommuterContext = () => ({
    commuterId,
    // Optional: set this from your UI search bar when route is chosen
    routeId: window.currentRouteId || null
  });

  async function sendCommuterLocation(position) {
    const { coords } = position || {};
    if (!coords || !commuterId) return;

    const { latitude, longitude } = coords;
    const { routeId } = getCommuterContext();

    try {
      const { error } = await supabase
        .from('commuter_locations')
        .upsert({
          commuter_id: commuterId,
          route_id: routeId,
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
        .select('driver_id, lat, lng, route_id')
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('[Jeepneys] Failed to load initial jeepneys', error);
        return;
      }

      if (Array.isArray(data)) {
        data.forEach((row) => upsertJeepneyMarker(row));
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

      // Load routes list for search bar and wire to window.currentRouteId
      if (routesDatalist || routeSearchInput) {
        try {
          const { data: routes, error: routesError } = await supabase
            .from('routes')
            .select('route_id, name')
            .order('name', { ascending: true });

          if (routesError) {
            console.error('[Commuter init] Failed to load routes', routesError);
          } else if (Array.isArray(routes)) {
            routeNameToId.clear();
            routes.forEach((r) => {
              const name = r.name || `Route ${r.route_id}`;
              routeNameToId.set(name, r.route_id);
              if (routesDatalist) {
                const opt = document.createElement('option');
                opt.value = name;
                routesDatalist.appendChild(opt);
              }
            });

            if (routeSearchInput) {
              const onRouteChange = () => {
                const val = routeSearchInput.value.trim();
                if (!val) return;
                const routeId = routeNameToId.get(val);
                if (routeId && typeof window !== 'undefined') {
                  window.currentRouteId = routeId;
                  console.log('[Commuter] currentRouteId set to', window.currentRouteId);
                }
              };
              routeSearchInput.addEventListener('change', onRouteChange);
              routeSearchInput.addEventListener('blur', onRouteChange);
            }
          }
        } catch (routesErr) {
          console.error('[Commuter init] Unexpected error while loading routes', routesErr);
        }
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