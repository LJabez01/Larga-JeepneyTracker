(function(){
  // Simple slideshow for login/registration pages.
  var INTERVAL = 3000;

  var slides = [
    { img: 'https://image2url.com/images/1763569553548-d35bcf85-551a-46d5-88bb-0ee3296fbb32.png', text: '', author: '' },
    { img: 'https://image2url.com/images/1763569516027-86d25fd9-be5d-4b4f-868c-c2000727ea56.png', text: '', author: '' }
  ];

  var container = document.getElementById('auth-slideshow');
  if(!container) return;
  var slidesEl = container.querySelector('.slides');
  var quoteEl = container.querySelector('#slide-quote');
  var authorEl = container.querySelector('#slide-author');
  var indicatorsEl = container.querySelector('#slide-indicators');

  var current = 0;
  var timer = null;
  var transitioning = false;

  function createImg(src, idx){
    var img = document.createElement('img');
    img.src = src;
    img.alt = slides[idx] && slides[idx].author ? slides[idx].author : '';
    img.style.position = 'absolute';
    img.style.top = '0'; img.style.left = '0';
    img.style.width = '100%'; img.style.height = '100%';
    img.style.objectFit = 'cover';
    img.style.opacity = '0';
    img.style.transition = 'opacity 800ms ease';
    img.setAttribute('aria-hidden','true');
    img.addEventListener('error', function onErr(){
      if(!img._triedParent){
        img._triedParent = true;
        img.removeEventListener('error', onErr);
        img.src = '../' + src;
      }
    });
    return img;
  }

  function renderIndicators(){
    indicatorsEl.innerHTML = '';
    slides.forEach(function(_, idx){
      var btn = document.createElement('button');
      if(idx === current) btn.classList.add('active');
      btn.addEventListener('click', function(){ goTo(idx); resetTimer(); });
      indicatorsEl.appendChild(btn);
    });
  }

  function showSlide(idx){
    if(transitioning) return;
    transitioning = true;
    var newImg = createImg(slides[idx].img, idx);
    slidesEl.appendChild(newImg);

    requestAnimationFrame(function(){
      newImg.style.opacity = '1';
    });
    // update text inside card
    if(quoteEl) quoteEl.textContent = '“' + slides[idx].text + '”';
    if(authorEl) authorEl.textContent = slides[idx].author || '';

    Array.from(indicatorsEl.children).forEach(function(b, i){ b.classList.toggle('active', i === idx); });
    setTimeout(function(){
      // remove all images except the last one
      var imgs = slidesEl.querySelectorAll('img');
      for(var i=0;i<imgs.length-1;i++){ imgs[i].parentNode.removeChild(imgs[i]); }
      transitioning = false;
    }, 900);
  }

  function goTo(idx){ if(idx < 0) idx = slides.length - 1; if(idx >= slides.length) idx = 0; current = idx; showSlide(current); }

  function next(){ goTo((current + 1) % slides.length); }

  function resetTimer(){ if(timer) clearInterval(timer); timer = setInterval(next, INTERVAL); }

  container.addEventListener('mouseenter', function(){ if(timer) clearInterval(timer); });
  container.addEventListener('mouseleave', function(){ resetTimer(); });
  document.addEventListener('keydown', function(e){ if(e.key === 'ArrowLeft'){ goTo((current-1+slides.length)%slides.length); resetTimer(); } if(e.key === 'ArrowRight'){ goTo((current+1)%slides.length); resetTimer(); } });
  renderIndicators();
  showSlide(current);
  resetTimer();
  // expose API to update slides later if needed
  window.authSlideshow = {
    setSlides: function(newSlides){ if(Array.isArray(newSlides) && newSlides.length){ slides = newSlides; current = 0; renderIndicators(); showSlide(0); resetTimer(); } }
  };
})();