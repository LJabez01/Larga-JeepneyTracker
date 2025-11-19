// driver.js - extracted from inline script in driver.html
(function(){
    'use strict';

    // Dropdown menu behavior
    var menuToggle = document.getElementById('menu-toggle');
    var dropdownMenu = document.querySelector('.dropdown-menu');
    if(menuToggle && dropdownMenu){
        menuToggle.addEventListener('click', function(e){
            e.preventDefault();
            dropdownMenu.classList.toggle('show');
        });
        document.addEventListener('click', function(e){
            if(!menuToggle.contains(e.target) && !dropdownMenu.contains(e.target)){
                dropdownMenu.classList.remove('show');
            }
        });
    }

    // Initialize Leaflet map
    if(typeof L !== 'undefined'){
        const map = L.map('map').setView([14.831426, 120.976661], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        // expose updatePanelHandle for panel UI
        (function(){
            function update(state){
                var btn = document.getElementById('panel-handle-button');
                var backdropEl = document.getElementById('panel-backdrop');
                var panelEl = document.getElementById('drivers-info');
                if(!btn) return;
                if(state){
                    if(panelEl){
                        panelEl.style.removeProperty('transform');
                        panelEl.style.removeProperty('visibility');
                        panelEl.style.removeProperty('pointer-events');
                        panelEl.classList.add('open');
                    }
                    btn.classList.add('open'); btn.setAttribute('title','Close panel');
                    if(backdropEl) backdropEl.classList.add('visible');
                } else {
                    if(panelEl){
                        panelEl.classList.remove('open');
                        panelEl.style.setProperty('transform', 'translate(-50%, 110%)', 'important');
                        panelEl.style.setProperty('visibility', 'hidden', 'important');
                        panelEl.style.setProperty('pointer-events', 'none', 'important');
                    }
                    btn.classList.remove('open'); btn.setAttribute('title','Open panel');
                    if(backdropEl) backdropEl.classList.remove('visible');
                }
            }
            window.updatePanelHandle = update;
            update(false);

            var backdrop = document.getElementById('panel-backdrop');
            var closeBtn = document.getElementById('drivers-info-close');
            if(closeBtn){ closeBtn.addEventListener('click', function(){ var panel = document.getElementById('drivers-info'); if(panel) panel.classList.remove('open'); update(false); }); }
            if(backdrop){ backdrop.addEventListener('click', function(){ var panel = document.getElementById('drivers-info'); if(panel) panel.classList.remove('open'); update(false); }); }
            var handleBtn = document.getElementById('panel-handle-button');
            if(handleBtn){
                handleBtn.addEventListener('click', function(){
                    var panel = document.getElementById('drivers-info'); if(!panel) return;
                    var opening = !panel.classList.contains('open');
                    if(opening) panel.classList.add('open'); else panel.classList.remove('open');
                    update(opening);
                });
            }
        })();

        if(map && map.zoomControl && map.zoomControl.setPosition){
            map.zoomControl.setPosition('bottomleft');
        }

        // Passenger icon
        var PassengerIcon = L.icon({
            iconUrl: 'https://image2url.com/images/1762271241467-09178dbf-94d7-4a82-88f4-4ee7626f1570.png',
            iconSize: [50, 50],
            iconAnchor: [25, 40],
            popupAnchor: [0, -46]
        });

        L.marker([14.831341439952697, 120.97348565571966], { icon: PassengerIcon, title: 'Passenger 1' }).addTo(map);
        L.marker([14.845123, 120.982221], { icon: PassengerIcon, title: 'Passenger 2' }).addTo(map);
        L.marker([14.860234, 120.989678], { icon: PassengerIcon, title: 'Passenger 3' }).addTo(map);

        // Jeepney icon and routes
        var jeepneyIcon = L.icon({
            iconUrl: 'https://image2url.com/images/1761748252176-39f2cd27-02a7-4b73-b140-6171e24e62be.png',
            iconSize: [36, 36],
            iconAnchor: [18, 36],
            popupAnchor: [0, -46]
        });

        var waypoints = [
            L.latLng(14.821865560449373, 120.96157688030809),
            L.latLng(14.831341439952697, 120.97348565571966),
            L.latLng(14.87136358444958, 121.00656357695095)
        ];

        if(L.Routing && L.Routing.control){
            var routingControl = L.Routing.control({
                waypoints: waypoints,
                routeWhileDragging: false,
                addWaypoints: false,
                createMarker: function(i, waypoint, n){ if(i===0) return L.marker(waypoint.latLng, { icon: jeepneyIcon }); return null; },
                lineOptions: { styles: [{ color: 'green', weight: 4 }] },
                router: L.Routing.osrmv1({})
            }).addTo(map);
        }

        // Driver UI interactions
        (function(){
            var startInput = document.querySelector('.start-input');
            var destInput = document.querySelector('.dest-input');
            var routePicker = document.querySelector('.route-picker');
            var routeOptions = document.querySelectorAll('.route-option');
            var recentList = document.querySelector('.recent-list');
            var tripToggle = document.getElementById('trip-toggle');
            var currentRouteEl = document.querySelector('.current-route');
            var currentRouteText = currentRouteEl ? currentRouteEl.querySelector('.current-route-text') : null;
            // combined placeholder inside the route-fields when both inputs are empty
            var combinedPlaceholderEl = document.querySelector('.route-fields .route-combined-placeholder');
            var combinedPlaceholderText = combinedPlaceholderEl ? combinedPlaceholderEl.querySelector('.text') : null;

            function ensureCombinedPlaceholder(){
                if(combinedPlaceholderEl) return;
                var container = document.querySelector('.route-fields');
                if(!container) return;
                var wrapper = document.createElement('div');
                wrapper.className = 'route-combined-placeholder';
                var txt = document.createElement('div');
                txt.className = 'text';
                txt.textContent = 'starting point and the choose destination';
                wrapper.appendChild(txt);
                // insert at top of the fields so it appears in the box area
                container.insertBefore(wrapper, container.firstChild);
                combinedPlaceholderEl = wrapper;
                combinedPlaceholderText = txt;
            }
            var vehicleStatus = document.querySelector('.vehicle-status');
            // 'Your location' button inside the drivers panel
            var yourLocationBtn = document.querySelector('.drivers-info .your-location');

            function updateTripToggleState(){ if(!tripToggle) return; var ok = startInput && startInput.value.trim() && destInput && destInput.value.trim(); tripToggle.disabled = !ok; if(!ok){ tripToggle.classList.add('disabled'); } else { tripToggle.classList.remove('disabled'); } }

            // Show/hide the starting-point floating label when a destination exists
            var startFieldEl = document.querySelector('.route-field.start-field');
            function updateStartLabelVisibility(){
                try{
                    var hasDest = destInput && destInput.value && destInput.value.trim();
                    if(startFieldEl){
                        if(hasDest) startFieldEl.classList.add('hide-label'); else startFieldEl.classList.remove('hide-label');
                    }
                }catch(e){ /* ignore */ }
            }

            // Keep the .has-value class in sync with each input's value so floating labels behave correctly
            function updateFieldClasses(){
                try{
                    if(startInput){ var sf = startInput.closest('.route-field'); if(sf){ if(startInput.value && startInput.value.trim()) sf.classList.add('has-value'); else sf.classList.remove('has-value'); } }
                    if(destInput){ var df = destInput.closest('.route-field'); if(df){ if(destInput.value && destInput.value.trim()) df.classList.add('has-value'); else df.classList.remove('has-value'); } }
                }catch(e){}
                // also update the start label visibility when dest changes
                updateStartLabelVisibility();
                // hide the compact current-route summary when a destination is already chosen
                try{
                    var hasStart = startInput && startInput.value && startInput.value.trim();
                    var hasDest = destInput && destInput.value && destInput.value.trim();
                    if(hasStart && hasDest){
                        // both typed: remove the compact summary and the combined placeholder (if any)
                        if(currentRouteEl && currentRouteEl.parentNode){
                            currentRouteEl.parentNode.removeChild(currentRouteEl);
                            currentRouteEl = null;
                        }
                        if(combinedPlaceholderEl && combinedPlaceholderEl.parentNode){
                            combinedPlaceholderEl.parentNode.removeChild(combinedPlaceholderEl);
                            combinedPlaceholderEl = null;
                            combinedPlaceholderText = null;
                        }
                    } else {
                        // when one or both are empty, ensure the combined placeholder exists inside the route box
                        try{ ensureCombinedPlaceholder(); }catch(e){}
                        if(currentRouteEl){
                            if(hasDest) currentRouteEl.classList.add('hidden'); else currentRouteEl.classList.remove('hidden');
                            setCurrentRouteCombined();
                        }
                        if(combinedPlaceholderEl){
                            // show the placeholder when not both typed
                            combinedPlaceholderEl.classList.remove('hidden');
                            if(combinedPlaceholderText) combinedPlaceholderText.textContent = (startInput && startInput.value && startInput.value.trim()) || (destInput && destInput.value && destInput.value.trim()) ? setCurrentRouteCombined() : 'starting point and the choose destination';
                        }
                    }
                }catch(e){}
            }
            function setCurrentRouteCombined(){
                var s = startInput ? startInput.value.trim() : '';
                var d = destInput ? destInput.value.trim() : '';
                var combined = '—';
                if(s && d) combined = (s + ' - ' + d);
                else if(!s && !d) combined = 'starting point and the choose destination';
                else if(s && !d) combined = (s + ' - Choose destination');
                else if(!s && d) combined = ('Choose starting point - ' + d);
                if(currentRouteText) currentRouteText.textContent = combined;
                if(combinedPlaceholderText) combinedPlaceholderText.textContent = combined === '—' ? 'starting point and the choose destination' : combined;
                return combined;
            }
            function pushRecentRoute(name){ if(!recentList) return; Array.from(recentList.children).forEach(function(li){ if(li.textContent.trim()===name) li.remove(); }); var li = document.createElement('li'); li.className='recent-item active'; li.textContent = name; Array.from(recentList.children).forEach(function(n){ n.classList.remove('active'); }); recentList.insertBefore(li, recentList.firstChild); while(recentList.children.length>5) recentList.removeChild(recentList.lastChild); }

            var _pickerStopHandler = function(e){ e.stopPropagation(); };

            function showPicker(targetType, anchorEl){
                if(!routePicker) return;
                // Close any open leaflet popups so they don't cover the picker
                try{ if(map && map.closePopup) map.closePopup(); }catch(e){}

                routePicker.style.display = 'block';
                routePicker.setAttribute('data-target', targetType);
                routePicker.style.opacity = 0; routePicker.style.transition = 'opacity 180ms ease';
                requestAnimationFrame(function(){ routePicker.style.opacity = 1; });
                // prevent clicks inside the picker from reaching the map (stop propagation)
                try{
                    if(!routePicker._pickerStopHandler){
                        routePicker.addEventListener('mousedown', _pickerStopHandler, true);
                        routePicker.addEventListener('click', _pickerStopHandler, true);
                        routePicker._pickerStopHandler = _pickerStopHandler;
                    }
                }catch(e){}

                // position under the anchor (account for page scroll so it doesn't jump to bottom)
                if(anchorEl){
                    var rect = anchorEl.getBoundingClientRect();
                    var left = rect.left + (window.scrollX || window.pageXOffset || 0);
                    var top = rect.bottom + 6 + (window.scrollY || window.pageYOffset || 0);
                    routePicker.style.position = 'absolute';
                    routePicker.style.left = (left) + 'px';
                    routePicker.style.top = (top) + 'px';
                    routePicker.style.zIndex = 13001;
                }
            }
            function hidePicker(){
                if(!routePicker) return;
                routePicker.style.display = 'none';
                routePicker.removeAttribute('data-target');
                try{
                    if(routePicker._pickerStopHandler){
                        routePicker.removeEventListener('mousedown', routePicker._pickerStopHandler, true);
                        routePicker.removeEventListener('click', routePicker._pickerStopHandler, true);
                        delete routePicker._pickerStopHandler;
                    }
                }catch(e){}
            }

            // 'Your location' button: set the starting input to user's (map) center or geolocation
            if(yourLocationBtn){
                // prevent clicks from reaching the map
                yourLocationBtn.addEventListener('mousedown', function(e){ e.stopPropagation(); }, true);
                yourLocationBtn.addEventListener('click', function(e){ e.stopPropagation(); }, true);
                yourLocationBtn.addEventListener('click', function(){
                    // try navigator geolocation first, fallback to map center
                    if(navigator.geolocation){
                        navigator.geolocation.getCurrentPosition(function(pos){
                            var label = 'Your location';
                            if(startInput) startInput.value = label; // keep driver panel inputs in sync
                            try{ updateFieldClasses(); }catch(e){}
                        }, function(){
                            var c = map && map.getCenter && map.getCenter();
                            var label = c ? 'Your location' : 'Current location';
                            if(startInput) startInput.value = label;
                            try{ updateFieldClasses(); }catch(e){}
                        });
                    } else {
                        var c = map && map.getCenter && map.getCenter();
                        var label = c ? 'Your location' : 'Current location';
                        if(startInput) startInput.value = label;
                        try{ updateFieldClasses(); }catch(e){}
                    }
                });
            }

            document.addEventListener('click', function(ev){ var field = ev.target.closest('.route-field'); if(field){ ev.preventDefault(); var type = field.getAttribute('data-type'); showPicker(type, field); return; } if(!ev.target.closest('.route-picker')) hidePicker(); });

            if(routeOptions){ routeOptions.forEach(function(op){ op.addEventListener('click', function(){ var target = routePicker ? routePicker.getAttribute('data-target') : null; var name = op.textContent.trim(); if(target==='start' && startInput){ startInput.value = name; } if(target==='dest' && destInput){ destInput.value = name; } hidePicker(); var combined = setCurrentRouteCombined(); if(combined && combined!=='—') pushRecentRoute(combined); updateTripToggleState(); updateFieldClasses(); }); }); }

            if(recentList){ recentList.addEventListener('click', function(e){ var li = e.target.closest('.recent-item'); if(!li) return; var text = li.textContent.trim(); var parts = text.split(' - '); if(parts.length>=2){ if(startInput) startInput.value = parts[0]; if(destInput) destInput.value = parts.slice(1).join(' - '); } Array.from(recentList.children).forEach(function(n){ n.classList.remove('active'); }); li.classList.add('active'); setCurrentRouteCombined(); updateTripToggleState(); updateFieldClasses(); }); }

            var tripActive = false;
            if(tripToggle){ updateTripToggleState(); tripToggle.addEventListener('click', function(){ if(tripToggle.disabled) return; tripActive = !tripActive; if(tripActive){ tripToggle.textContent = 'End Trip'; tripToggle.classList.remove('start-trip-button'); tripToggle.classList.add('end-trip-button'); if(vehicleStatus) vehicleStatus.textContent = 'On Trip'; } else { tripToggle.textContent = 'Start Trip'; tripToggle.classList.remove('end-trip-button'); tripToggle.classList.add('start-trip-button'); if(vehicleStatus) vehicleStatus.textContent = 'Standby'; } }); }

            window.setDriverRoute = function(start, dest){ if(startInput) startInput.value=start; if(destInput) destInput.value=dest; setCurrentRouteCombined(); pushRecentRoute(setCurrentRouteCombined()); updateTripToggleState(); updateFieldClasses(); };

            (function init(){ var firstActive = document.querySelector('.recent-item.active'); if(firstActive){ var txt = firstActive.textContent.trim(); var parts = txt.split(' - '); if(parts.length>=2){ if(startInput) startInput.value=parts[0]; if(destInput) destInput.value=parts.slice(1).join(' - '); } setCurrentRouteCombined(); } updateTripToggleState(); updateFieldClasses(); })();
        })();
    }
})();
