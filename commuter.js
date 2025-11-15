
(function(){
  var menuToggle = document.getElementById('menu-toggle');
  var dropdownMenu = document.querySelector('.dropdown-menu');
  if (menuToggle && dropdownMenu) {
    menuToggle.addEventListener('click', function(e){
      e.preventDefault();
      dropdownMenu.classList.toggle('show');
    });
    document.addEventListener('click', function(e){
      if(!menuToggle.contains(e.target) && !dropdownMenu.contains(e.target)) {
        dropdownMenu.classList.remove('show');
      }
    });
  }
})();

// Map and routing initialization
(function(){
  // Initialize Leaflet map
  const map = L.map('map', { zoomControl: false }).setView([14.831426, 120.976661], 13);
  // expose map globally for helpers that reference window.map
  window.map = map;

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
  }).addTo(map);

  // Passenger icon
  var PassengerIcon = L.icon({
    iconUrl: 'https://image2url.com/images/1762271241467-09178dbf-94d7-4a82-88f4-4ee7626f1570.png',
    iconSize: [50, 50],
    iconAnchor: [25, 40],
    popupAnchor: [0, -46]
  });

  // Add passenger markers
  var commuterMarker = L.marker([14.840234, 120.980678], { icon: PassengerIcon, title: 'Your Location' }).addTo(map);
  var commuterMarker2 = L.marker([14.845123, 120.982221], { icon: PassengerIcon, title: 'Passenger 2' }).addTo(map);
  var commuterMarker3 = L.marker([14.860234, 120.989678], { icon: PassengerIcon, title: 'Passenger 3' }).addTo(map);

  // Jeepney icon
  var jeepneyIcon = L.icon({
    iconUrl: 'https://image2url.com/images/1761748252176-39f2cd27-02a7-4b73-b140-6171e24e62be.png',
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -46]
  });

  // Waypoints and routing control (route 1)
  var waypoints = [
    L.latLng(14.821865560449373, 120.96157688030809),
    L.latLng(14.831341439952697, 120.97348565571966),
    L.latLng(14.87136358444958, 121.00656357695095)
  ];

  var routingControl = L.Routing.control({
    waypoints: waypoints,
    routeWhileDragging: false,
    addWaypoints: false,
    createMarker: function(i, waypoint) {
      if (i === 0) {
        var marker = L.marker(waypoint.latLng, { icon: jeepneyIcon });
        var tpl = document.getElementById('popup-commuters-info-template');
        if (tpl) {
          var popupContent = tpl.cloneNode(true);
          popupContent.style.display = 'block';
          var speedEl = popupContent.querySelector('.speed');
          var timeEl = popupContent.querySelector('.time');
          var routeEl = popupContent.querySelector('.route');
          var statusEl = popupContent.querySelector('.vehicle-status');
          if (speedEl) speedEl.textContent = '30km/hour';
          if (timeEl) timeEl.textContent = '1:00 PM';
          if (routeEl) routeEl.textContent = 'Sta Maria - Guyong - Caypombo - Pulong Buhangin';
          if (statusEl) statusEl.textContent = 'Active';
          marker.bindPopup(popupContent, { maxWidth: 320, className: 'small-popup', offset: L.point(0, -46), autoPanPadding: [20,20] });

          marker.on('popupopen', function(e){
            var contentNode = e.popup && (e.popup._contentNode || e.popup.getContent && e.popup.getContent());
            var node = (typeof contentNode === 'object' && contentNode.querySelector) ? contentNode : e.popup._container;
            if (node) {
              var btn = node.querySelector && node.querySelector('.set-notifications-button');
              if (btn && !btn._addedNotify) {
                btn._addedNotify = true;
                btn.addEventListener('click', function(){ alert('You will be notified when this vehicle approaches your waiting area.'); });
              }
            }
          });

          var __routeText = (routeEl && routeEl.textContent) ? routeEl.textContent : 'Route info';
          var __timeText = (timeEl && timeEl.textContent) ? timeEl.textContent : '';
          marker.on('click', function(){ showJeepneyBubble('<strong>' + __routeText + '</strong><br>ETA: ' + __timeText); });
        }
        return marker;
      }
      return null;
    },
    lineOptions: { styles: [{ color: 'green', weight: 4 }] },
    router: L.Routing.osrmv1({})
  }).addTo(map);

  // helper: jeepney bubble
  (function(){
    var _jbTimer = null;
    var bubble = document.getElementById('jeepney-bubble');
    function hideJeepneyBubble(){
      if(!bubble) bubble = document.getElementById('jeepney-bubble');
      if(!bubble) return;
      bubble.classList.remove('show');
      setTimeout(function(){ if(bubble && !bubble.classList.contains('show')) bubble.style.display = 'none'; }, 260);
      if(_jbTimer){ clearTimeout(_jbTimer); _jbTimer = null; }
    }
    window.showJeepneyBubble = function(html){
      if(!bubble) bubble = document.getElementById('jeepney-bubble');
      if(!bubble) return;
      bubble.innerHTML = '<button class="jb-close" aria-label="Close">&times;</button><div class="jb-content">' + html + '</div>';
      var btn = bubble.querySelector('.jb-close');
      if(btn){ btn.addEventListener('click', function(e){ e.stopPropagation(); hideJeepneyBubble(); }); }
      bubble.style.display = 'block'; void bubble.offsetWidth; bubble.classList.add('show');
      if(_jbTimer) clearTimeout(_jbTimer);
      _jbTimer = setTimeout(hideJeepneyBubble, 6000);
    };

    if(window.map && map.on){ map.on('click', function(){ hideJeepneyBubble(); }); }
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape') hideJeepneyBubble(); });
    document.addEventListener('click', function(e){ if(!bubble) return; if(!bubble.contains(e.target)) hideJeepneyBubble(); });
  })();

  // route 2
  var waypoints2 = [
    L.latLng(14.817680556970652, 120.9596894399793),
    L.latLng(14.809662089895063, 120.96345579935102),
    L.latLng(14.80746986684621, 121.01338170563866)
  ];
  var routingControl2 = L.Routing.control({
    waypoints: waypoints2,
    routeWhileDragging:false, addWaypoints:false,
    createMarker:function(i, waypoint) {
      if(i===0){
        var marker = L.marker(waypoint.latLng, { icon: jeepneyIcon });
        var tpl = document.getElementById('popup-commuters-info-template');
        if(tpl){
          var popupContent = tpl.cloneNode(true); popupContent.style.display='block';
          marker.bindPopup(popupContent, { maxWidth:320, className:'small-popup', offset: L.point(0,-46), autoPanPadding:[20,20] });
          var __rc = popupContent.querySelector('.route'); var __tm = popupContent.querySelector('.time');
          var __routeText2 = __rc && __rc.textContent ? __rc.textContent : 'Route info';
          var __timeText2 = __tm && __tm.textContent ? __tm.textContent : '';
          marker.on('click', function(){ showJeepneyBubble('<strong>' + __routeText2 + '</strong><br>ETA: ' + __timeText2); });
        }
        return marker;
      }
      return null;
    },
    lineOptions: { styles: [{ color: 'green', weight: 4 }] }, router: L.Routing.osrmv1({})
  }).addTo(map);

})();
