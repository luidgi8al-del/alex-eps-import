/* Entrée parcourt les critères, puis l'élève suivant, sans modifier les barèmes. */
(function () {
  'use strict';
  const panels = '#toolPanel,#liveToolPanel';
  const controls = 'tbody input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=hidden]):not([type=button]):not([type=submit]),tbody select';
  const fields = table => [...table.querySelectorAll(controls)].filter(n => !n.disabled && !n.readOnly && n.getClientRects().length && !n.closest('[hidden],[inert]'));
  const context = input => {
    const panel = input?.closest?.(panels), table = input?.closest?.('table');
    return panel && table && !input.closest('[role=dialog],dialog') ? {panel, table} : null;
  };
  let focusedPanel = null, frame = 0;

  // Do not use a raw array index after a redraw: filtering/reordering could focus another pupil.
  function identity(control) {
    const row = control.closest('tr'), cell = control.closest('td,th');
    const attributes = [...control.attributes].filter(a => a.name === 'id' || a.name === 'name' || a.name.startsWith('data-')).map(a => [a.name, a.value]);
    return JSON.stringify([attributes, row?.dataset.studentId || row?.querySelector('td,th')?.textContent.trim(), cell?.cellIndex, [...(cell?.querySelectorAll('input,select') || [])].indexOf(control)]);
  }

  function scrollVertical(input, delta) {
    for (let node = input.parentElement; node && Math.abs(delta) > 1; node = node.parentElement) {
      if (!/(auto|scroll|overlay)/.test(getComputedStyle(node).overflowY) || node.scrollHeight <= node.clientHeight) continue;
      const before = node.scrollTop;
      node.scrollTop += delta;
      delta -= node.scrollTop - before;
    }
    if (Math.abs(delta) > 1) window.scrollBy(0, delta);
  }

  function reveal(input) {
    if (!input?.isConnected || document.activeElement !== input) return;
    const where = context(input); if (!where) return;
    input.scrollIntoView({block: 'nearest', inline: 'nearest'});
    // Native scrollIntoView ignores the sticky name column. Keep the edited cell beside it.
    const first = input.closest('tr')?.querySelector('td,th');
    if (first && !first.contains(input) && getComputedStyle(first).position === 'sticky') {
      let scroll = where.table.parentElement;
      while (scroll && scroll !== where.panel && (!/(auto|scroll|overlay)/.test(getComputedStyle(scroll).overflowX) || scroll.scrollWidth <= scroll.clientWidth)) scroll = scroll.parentElement;
      if (scroll && scroll.scrollWidth > scroll.clientWidth) {
        const bounds = scroll.getBoundingClientRect(), name = first.getBoundingClientRect(), rect = input.getBoundingClientRect();
        const left = Math.max(bounds.left + 6, name.right + 6), right = bounds.right - 6;
        if (rect.left < left) scroll.scrollLeft += rect.left - left;
        else if (rect.right > right) scroll.scrollLeft += rect.right - right;
      }
    }
    const viewport = window.visualViewport, top = (viewport?.offsetTop || 0) + 12;
    const bottom = (viewport?.offsetTop || 0) + (viewport?.height || innerHeight) - 12;
    const rect = input.getBoundingClientRect();
    if (rect.bottom > bottom) scrollVertical(input, rect.bottom - bottom);
    else if (rect.top < top) scrollVertical(input, rect.top - top);
  }

  function updateFocus() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const input = document.activeElement, where = context(input);
      const editing = where && (input instanceof HTMLInputElement || input instanceof HTMLSelectElement);
      if (focusedPanel && (!editing || focusedPanel !== where.panel)) {
        focusedPanel.classList.remove('tool-field-editing');
        focusedPanel.style.removeProperty('--tool-keyboard-gap');
        focusedPanel = null;
      }
      if (!editing) return;
      focusedPanel = where.panel;
      focusedPanel.classList.add('tool-field-editing');
      const viewport = window.visualViewport;
      const gap = viewport && Math.abs(viewport.scale - 1) < .05 ? Math.max(0, innerHeight - viewport.height - viewport.offsetTop) : 0;
      focusedPanel.style.setProperty('--tool-keyboard-gap', gap > 120 ? `${gap}px` : '0px');
      reveal(input);
    });
  }
  document.addEventListener('focusin', updateFocus);
  document.addEventListener('focusout', updateFocus);
  window.visualViewport?.addEventListener('resize', updateFocus);
  window.visualViewport?.addEventListener('scroll', updateFocus);

  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.key !== 'Enter' || e.isComposing || e.ctrlKey || e.altKey || e.metaKey) return;
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || ['checkbox','radio','range','button','submit'].includes(input.type)) return;
    const where = context(input); if (!where) return;
    const {panel, table} = where, list = fields(table), index = list.indexOf(input);
    if (index < 0) return;
    e.preventDefault();
    if (e.repeat) return;
    if (!input.checkValidity()) { input.reportValidity(); return; }
    const next = list[index + (e.shiftKey ? -1 : 1)], key = next && identity(next);
    const tableIndex = [...panel.querySelectorAll('table')].indexOf(table);
    // Blur commits the browser's change once. Only synthesize it if no native change fired.
    let changed = false;
    const observed = () => { changed = true; };
    input.addEventListener('change', observed);
    input.blur();
    input.removeEventListener('change', observed);
    if (!changed && input.isConnected) input.dispatchEvent(new Event('change', {bubbles: true}));
    requestAnimationFrame(() => {
      if (!panel.isConnected || !next) return;
      const current = panel.querySelectorAll('table')[tableIndex]; if (!current) return;
      const candidates = fields(current).filter(field => identity(field) === key);
      const target = next.isConnected && current.contains(next) ? next : candidates.length === 1 ? candidates[0] : null;
      if (target) {
        target.focus({preventScroll: true});
        reveal(target);
        if (target instanceof HTMLInputElement) { try { target.select(); } catch { /* browser-specific input type */ } }
      }
    });
  });
})();
