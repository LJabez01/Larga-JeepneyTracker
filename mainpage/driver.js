// driver.js - cleaned and formatted
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
  if (typeof L !== 'undefined' && mapRoot) {
    const map = L.map('map').setView([14.831426, 120.976661], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    if (map?.zoomControl?.setPosition) {
      map.zoomControl.setPosition('bottomleft');
    }

    // Passenger icon
    const PassengerIcon = L.icon({
      iconUrl: 'https://image2url.com/images/1762271241467-09178dbf-94d7-4a82-88f4-4ee7626f1570.png',
      iconSize: [50, 50],
      iconAnchor: [25, 40],
      popupAnchor: [0, -46]
    });

    // sample passenger markers
    L.marker([14.831341439952697, 120.97348565571966], { icon: PassengerIcon, title: 'Passenger 1' }).addTo(map);
    L.marker([14.845123, 120.982221], { icon: PassengerIcon, title: 'Passenger 2' }).addTo(map);
    L.marker([14.860234, 120.989678], { icon: PassengerIcon, title: 'Passenger 3' }).addTo(map);

    // Jeepney icon and routing
    const jeepneyIcon = L.icon({
      iconUrl: 'https://image2url.com/images/1761748252176-39f2cd27-02a7-4b73-b140-6171e24e62be.png',
      iconSize: [36, 36],
      iconAnchor: [18, 36],
      popupAnchor: [0, -46]
    });

    const waypoints = [
      L.latLng(14.821865560449373, 120.96157688030809),
      L.latLng(14.831341439952697, 120.97348565571966),
      L.latLng(14.87136358444958, 121.00656357695095)
    ];

    if (L.Routing?.control) {
      L.Routing.control({
        waypoints,
        routeWhileDragging: false,
        addWaypoints: false,
        createMarker: (i, waypoint) => (i === 0 ? L.marker(waypoint.latLng, { icon: jeepneyIcon }) : null),
        lineOptions: { styles: [{ color: 'green', weight: 4 }] },
        router: L.Routing.osrmv1({})
      }).addTo(map);
    }

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
});
