// Module isole : le code vit dans une fonction, pas dans la portee globale.
// Deux fichiers peuvent donc declarer le meme nom sans SyntaxError qui tue la page.
// Les noms ci-dessous restent volontairement globaux : l'inline script d'index.html
// et les attributs onclick du HTML les appellent par leur nom nu.
(function () {
  /* Mouse dragging complements native touch/trackpad scrolling. A drag must never create a slot. */
  function installPlanningScroll(viewport) {
    if (!viewport || viewport.dataset.scrollReady) return;
    viewport.dataset.scrollReady = 'true';
    viewport.tabIndex = 0;
    viewport.setAttribute('role', 'region');
    viewport.setAttribute('aria-label', 'Planning défilant. Glissez dans les deux sens, ou utilisez les flèches du clavier.');
    let gesture = null;
    let suppressClickUntil = 0;
    viewport.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || event.target.closest('button,input,select,a')) return;
      gesture = { id:event.pointerId, x:event.clientX, y:event.clientY, left:viewport.scrollLeft, top:viewport.scrollTop, dragged:false };
    });
    viewport.addEventListener('pointermove', event => {
      if (!gesture || gesture.id !== event.pointerId) return;
      const dx = event.clientX-gesture.x, dy = event.clientY-gesture.y;
      if (!gesture.dragged && Math.hypot(dx,dy) < 7) return;
      gesture.dragged = true;
      if (!viewport.hasPointerCapture(event.pointerId)) viewport.setPointerCapture(event.pointerId);
      viewport.classList.add('is-dragging');
      viewport.scrollLeft = gesture.left-dx;
      viewport.scrollTop = gesture.top-dy;
      event.preventDefault();
    });
    const finish = event => {
      if (!gesture || gesture.id !== event.pointerId) return;
      if (gesture.dragged) suppressClickUntil = Date.now()+350;
      gesture = null;
      viewport.classList.remove('is-dragging');
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    };
    viewport.addEventListener('pointerup', finish);
    viewport.addEventListener('pointercancel', finish);
    viewport.addEventListener('pointerleave', () => { if (gesture && !gesture.dragged) gesture=null; });
    viewport.addEventListener('lostpointercapture', () => { gesture=null; viewport.classList.remove('is-dragging'); });
    viewport.addEventListener('click', event => {
      if (Date.now() < suppressClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    viewport.addEventListener('keydown', event => {
      if(event.target!==viewport) return;
      const deltas = {ArrowLeft:[-100,0],ArrowRight:[100,0],ArrowUp:[0,-100],ArrowDown:[0,100]};
      if(deltas[event.key]) {event.preventDefault();viewport.scrollBy(...deltas[event.key]);}
    });
  }

  // Surface publique du module.
  globalThis.installPlanningScroll = installPlanningScroll;
})();
