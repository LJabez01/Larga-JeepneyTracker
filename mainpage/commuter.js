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

// Map and routing initialization
(function () {
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

  // Passenger icon
  const PassengerIcon = L.icon({
    iconUrl: 'https://image2url.com/images/1762271241467-09178dbf-94d7-4a82-88f4-4ee7626f1570.png',
    iconSize: [50, 50],
    iconAnchor: [25, 40],
    popupAnchor: [0, -46]
  });

  // Add passenger marker
  L.marker([14.840234, 120.980678], {
    icon: PassengerIcon,
    title: 'Your Location'
  }).addTo(map);

  // Jeepney icon
  const jeepneyIcon = L.icon({
    iconUrl: 'https://image2url.com/images/1761748252176-39f2cd27-02a7-4b73-b140-6171e24e62be.png',
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -46]
  });

  // Helper: Create jeepney marker with popup
  function createJeepneyMarker(waypoint, routeText, timeText) {
    const marker = L.marker(waypoint.latLng, { icon: jeepneyIcon });
    const tpl = document.getElementById('popup-commuters-info-template');

    if (tpl) {
      const popupContent = tpl.cloneNode(true);
      popupContent.style.display = 'block';

      marker.bindPopup(popupContent, {
        maxWidth: 320,
        className: 'small-popup', /* class of pop up*/
        offset: L.point(0, -46),
        autoPanPadding: [20, 20]
      });

      marker.on('click', function () {
        showJeepneyBubble(`<strong>${routeText}</strong><br>ETA: ${timeText}`);
      });
    }

    return marker;
  }

  // Jeepney bubble helper
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

  // Route 1 waypoints
  const waypoints1 = [
    L.latLng(14.821865560449373, 120.96157688030809),
    L.latLng(14.831341439952697, 120.97348565571966),
    L.latLng(14.87136358444958, 121.00656357695095)
  ];

  L.Routing.control({
    waypoints: waypoints1,
    routeWhileDragging: false,
    addWaypoints: false,
    createMarker: function (i, waypoint) {
      if (i === 0) {
        const tpl = document.getElementById('popup-commuters-info-template');
        if (tpl) {
          const popupContent = tpl.cloneNode(true);
          popupContent.style.display = 'block';

          const speedEl = popupContent.querySelector('.speed');
          const timeEl = popupContent.querySelector('.time');
          const routeEl = popupContent.querySelector('.route');
          const statusEl = popupContent.querySelector('.vehicle-status');

          if (speedEl) speedEl.textContent = '30km/hour';
          if (timeEl) timeEl.textContent = '1:00 PM';
          if (routeEl) routeEl.textContent = 'Sta Maria - Guyong - Caypombo - Pulong Buhangin';
          if (statusEl) statusEl.textContent = 'Active';

          const routeText = routeEl?.textContent || 'Route info';
          const timeText = timeEl?.textContent || '';

          return createJeepneyMarker(waypoint, routeText, timeText);
        }
      }
      return null;
    },
    lineOptions: { styles: [{ color: 'green', weight: 4 }] },
    router: L.Routing.osrmv1({})
  }).addTo(map);

  // Route 2 waypoints
  const waypoints2 = [
    L.latLng(14.817680556970652, 120.9596894399793),
    L.latLng(14.809662089895063, 120.96345579935102),
    L.latLng(14.80746986684621, 121.01338170563866)
  ];

  L.Routing.control({
    waypoints: waypoints2,
    routeWhileDragging: false,
    addWaypoints: false,
    createMarker: function (i, waypoint) {
      if (i === 0) {
        const tpl = document.getElementById('popup-commuters-info-template');
        if (tpl) {
          const popupContent = tpl.cloneNode(true);
          popupContent.style.display = 'block';

          const routeText = popupContent.querySelector('.route')?.textContent || 'Route info';
          const timeText = popupContent.querySelector('.time')?.textContent || '';

          return createJeepneyMarker(waypoint, routeText, timeText);
        }
      }
      return null;
    },
    lineOptions: { styles: [{ color: 'green', weight: 4 }] },
    router: L.Routing.osrmv1({})
  }).addTo(map);
})();