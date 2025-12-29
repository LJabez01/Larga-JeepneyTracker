// driver.js - cleaned and formatted
// ES module so we can import the shared Supabase client used by login/registration
import { supabase } from '../login/supabaseClient.js';

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const q = (sel) => document.querySelector(sel);
  const qAll = (sel) => Array.from(document.querySelectorAll(sel));

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

    // Driver UI interactions
    (function initDriverUI() {
      // DOM helpers
      const startInput = q('.start-input');
      const destInput = q('.dest-input');
      const routePicker = q('.route-picker');
      const routeOptions = qAll('.route-option');
      const recentList = q('.recent-list');
      const tripToggle = q('#trip-toggle');
      let currentRouteEl = q('.current-route');
      let currentRouteText = currentRouteEl ? currentRouteEl.querySelector('.current-route-text') : null;
      let combinedPlaceholderEl = q('.route-fields .route-combined-placeholder');
      let combinedPlaceholderText = combinedPlaceholderEl ? combinedPlaceholderEl.querySelector('.text') : null;
      const vehicleStatus = q('.vehicle-status');
      const yourLocationBtn = q('.drivers-info .your-location');
      const startFieldEl = q('.route-field.start-field');

      const ensureCombinedPlaceholder = () => {
        if (combinedPlaceholderEl) return;
        const container = q('.route-fields');
        if (!container) return;
        const wrapper = document.createElement('div');
        wrapper.className = 'route-combined-placeholder';
        const txt = document.createElement('div');
        txt.className = 'text';
        txt.textContent = 'starting point and the choose destination';
        wrapper.appendChild(txt);
        container.insertBefore(wrapper, container.firstChild);
        combinedPlaceholderEl = wrapper;
        combinedPlaceholderText = txt;
      };

      const updateTripToggleState = () => {
        if (!tripToggle) return;
        const ok = startInput?.value?.trim() && destInput?.value?.trim();
        tripToggle.disabled = !ok;
        tripToggle.classList.toggle('disabled', !ok);
      };

      const updateStartLabelVisibility = () => {
        try {
          const hasDest = Boolean(destInput?.value?.trim());
          if (startFieldEl) startFieldEl.classList.toggle('hide-label', hasDest);
        } catch (e) { /* ignore */ }
      };

      const setCurrentRouteCombined = () => {
        const s = startInput?.value?.trim() || '';
        const d = destInput?.value?.trim() || '';
        let combined = '';
        if (s && d) combined = `${s} - ${d}`;
        else if (!s && !d) combined = 'starting point and the choose destination';
        else if (s && !d) combined = `${s} - Choose destination`;
        else if (!s && d) combined = `Choose starting point - ${d}`;

        if (currentRouteText) currentRouteText.textContent = combined;
        if (combinedPlaceholderText) combinedPlaceholderText.textContent = combined === '' ? 'starting point and the choose destination' : combined;
        return combined;
      };

      const updateFieldClasses = () => {
        try {
          if (startInput) {
            const sf = startInput.closest('.route-field');
            if (sf) sf.classList.toggle('has-value', Boolean(startInput.value?.trim()));
          }
          if (destInput) {
            const df = destInput.closest('.route-field');
            if (df) df.classList.toggle('has-value', Boolean(destInput.value?.trim()));
          }
        } catch (e) { /* ignore */ }

        updateStartLabelVisibility();

        try {
          const hasStart = Boolean(startInput?.value?.trim());
          const hasDest = Boolean(destInput?.value?.trim());

          if (hasStart && hasDest) {
            if (currentRouteEl && currentRouteEl.parentNode) {
              currentRouteEl.parentNode.removeChild(currentRouteEl);
              currentRouteEl = null;
            }
            if (combinedPlaceholderEl && combinedPlaceholderEl.parentNode) {
              combinedPlaceholderEl.parentNode.removeChild(combinedPlaceholderEl);
              combinedPlaceholderEl = null;
              combinedPlaceholderText = null;
            }
          } else {
            ensureCombinedPlaceholder();
            if (currentRouteEl) {
              currentRouteEl.classList.toggle('hidden', hasDest);
              setCurrentRouteCombined();
            }
            if (combinedPlaceholderEl) {
              combinedPlaceholderEl.classList.remove('hidden');
              combinedPlaceholderText.textContent = (startInput?.value?.trim() || destInput?.value?.trim()) ? setCurrentRouteCombined() : 'starting point and the choose destination';
            }
          }
        } catch (e) { /* ignore */ }
      };

      const pushRecentRoute = (name) => {
        if (!recentList) return;
        Array.from(recentList.children).forEach((li) => { if (li.textContent.trim() === name) li.remove(); });
        const li = document.createElement('li');
        li.className = 'recent-item active';
        li.textContent = name;
        Array.from(recentList.children).forEach((n) => n.classList.remove('active'));
        recentList.insertBefore(li, recentList.firstChild);
        while (recentList.children.length > 5) recentList.removeChild(recentList.lastChild);
      };

      const _pickerStopHandler = (e) => e.stopPropagation();

      const showPicker = (targetType, anchorEl) => {
        if (!routePicker) return;
        try { if (map?.closePopup) map.closePopup(); } catch (e) { /* ignore */ }

        routePicker.style.display = 'block';
        routePicker.setAttribute('data-target', targetType);
        routePicker.style.opacity = 0;
        routePicker.style.transition = 'opacity 180ms ease';
        requestAnimationFrame(() => { routePicker.style.opacity = 1; });

        try {
          if (!routePicker._pickerStopHandler) {
            routePicker.addEventListener('mousedown', _pickerStopHandler, true);
            routePicker.addEventListener('click', _pickerStopHandler, true);
            routePicker._pickerStopHandler = _pickerStopHandler;
          }
        } catch (e) { /* ignore */ }

        if (anchorEl) {
          const rect = anchorEl.getBoundingClientRect();
          const left = rect.left + (window.scrollX || window.pageXOffset || 0);
          const top = rect.bottom + 6 + (window.scrollY || window.pageYOffset || 0);
          routePicker.style.position = 'absolute';
          routePicker.style.left = `${left}px`;
          routePicker.style.top = `${top}px`;
          routePicker.style.zIndex = 13001;
        }
      };

      const hidePicker = () => {
        if (!routePicker) return;
        routePicker.style.display = 'none';
        routePicker.removeAttribute('data-target');
        try {
          if (routePicker._pickerStopHandler) {
            routePicker.removeEventListener('mousedown', routePicker._pickerStopHandler, true);
            routePicker.removeEventListener('click', routePicker._pickerStopHandler, true);
            delete routePicker._pickerStopHandler;
          }
        } catch (e) { /* ignore */ }
      };

      if (yourLocationBtn) {
        yourLocationBtn.addEventListener('mousedown', (e) => e.stopPropagation(), true);
        yourLocationBtn.addEventListener('click', (e) => e.stopPropagation(), true);
        yourLocationBtn.addEventListener('click', () => {
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(() => {
              const label = 'Your location';
              if (startInput) startInput.value = label;
              updateFieldClasses();
            }, () => {
              const c = map?.getCenter?.();
              const label = c ? 'Your location' : 'Current location';
              if (startInput) startInput.value = label;
              updateFieldClasses();
            });
          } else {
            const c = map?.getCenter?.();
            const label = c ? 'Your location' : 'Current location';
            if (startInput) startInput.value = label;
            updateFieldClasses();
          }
        });
      }

      document.addEventListener('click', (ev) => {
        const field = ev.target.closest('.route-field');
        if (field) {
          ev.preventDefault();
          const type = field.getAttribute('data-type');
          showPicker(type, field);
          return;
        }
        if (!ev.target.closest('.route-picker')) hidePicker();
      });

      if (routeOptions?.length) {
        routeOptions.forEach((op) => {
          op.addEventListener('click', () => {
            const target = routePicker?.getAttribute('data-target');
            const name = op.textContent.trim();
            if (target === 'start' && startInput) startInput.value = name;
            if (target === 'dest' && destInput) destInput.value = name;
            hidePicker();
            const combined = setCurrentRouteCombined();
            if (combined && combined !== '') pushRecentRoute(combined);
            updateTripToggleState();
            updateFieldClasses();
          });
        });
      }

      if (recentList) {
        recentList.addEventListener('click', (e) => {
          const li = e.target.closest('.recent-item');
          if (!li) return;
          const text = li.textContent.trim();
          const parts = text.split(' - ');
          if (parts.length >= 2) {
            if (startInput) startInput.value = parts[0];
            if (destInput) destInput.value = parts.slice(1).join(' - ');
          }
          Array.from(recentList.children).forEach((n) => n.classList.remove('active'));
          li.classList.add('active');
          setCurrentRouteCombined();
          updateTripToggleState();
          updateFieldClasses();
        });
      }

      let tripActive = false;
      if (tripToggle) {
        updateTripToggleState();
        tripToggle.addEventListener('click', () => {
          if (tripToggle.disabled) return;
          tripActive = !tripActive;
          if (tripActive) {
            tripToggle.textContent = 'End Trip';
            tripToggle.classList.remove('start-trip-button');
            tripToggle.classList.add('end-trip-button');
            if (vehicleStatus) vehicleStatus.textContent = 'On Trip';
          } else {
            tripToggle.textContent = 'Start Trip';
            tripToggle.classList.remove('end-trip-button');
            tripToggle.classList.add('start-trip-button');
            if (vehicleStatus) vehicleStatus.textContent = 'Standby';
          }
        });
      }

      window.setDriverRoute = (start, dest) => {
        if (startInput) startInput.value = start;
        if (destInput) destInput.value = dest;
        setCurrentRouteCombined();
        pushRecentRoute(setCurrentRouteCombined());
        updateTripToggleState();
        updateFieldClasses();
      };

      // initialize values from any existing recent-item
      (function init() {
        const firstActive = q('.recent-item.active');
        if (firstActive) {
          const txt = firstActive.textContent.trim();
          const parts = txt.split(' - ');
          if (parts.length >= 2) {
            if (startInput) startInput.value = parts[0];
            if (destInput) destInput.value = parts.slice(1).join(' - ');
          }
          setCurrentRouteCombined();
        }
        updateTripToggleState();
        updateFieldClasses();
      })();
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
      } else if (typeof window !== 'undefined') {
        window.currentDriverId = driverRow.driver_id;
        console.log('[Driver init] currentDriverId set to', window.currentDriverId);
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
        if (!val) return;
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
          } else {
            clearActiveRoute();
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

  async function sendDriverLocation(position) {
    const { coords } = position || {};
    if (!coords) return;

    const { latitude, longitude, speed, heading } = coords;
    const { driverId, routeId } = getDriverContext();

    if (!driverId) {
      console.warn('[GPS] No driverId set (window.currentDriverId). Skipping upload.');
      return;
    }

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

      startGpsTracking();
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      stopGpsTracking();
    });
  }

  // Fire-and-forget; driver page does not depend on awaiting this for UI
  void initDriverIdentityAndRoutes();
});
