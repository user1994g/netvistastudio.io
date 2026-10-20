/* DOM-only progressive enhancement. No upload, account access or network calls. */
(() => {
  'use strict';
  const study = document.querySelector('[data-look-study]');
  if (!study) return;
  const frame = study.querySelector('.look-frame');
  const range = study.querySelector('#look-compare');
  const output = study.querySelector('#look-coverage');
  const caption = study.querySelector('#look-after-label');
  const buttons = [...study.querySelectorAll('[data-look-choice]')];
  const looks = {warm: 'Warm light', cool: 'Cool dusk', mono: 'Monochrome'};
  if (!frame || !range || !output || !caption || !buttons.length) return;
  function compare() {
    const position = Math.max(0, Math.min(100, Number(range.value) || 0));
    frame.style.setProperty('--nv-compare', `${position}%`);
    output.textContent = `${position}% original`;
    range.setAttribute('aria-valuetext', `${position}% original, ${100-position}% ${looks[study.dataset.look]}`);
  }
  buttons.forEach(button => button.addEventListener('click', () => {
    const look = button.dataset.lookChoice;
    if (!Object.hasOwn(looks, look)) return;
    study.dataset.look = look;
    caption.textContent = looks[look];
    buttons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    compare();
  }));
  range.addEventListener('input', compare);
  // The image and the native range are two inputs for the same comparison.
  // Cache geometry on press and listen for movement only during that drag.
  if (typeof frame.setPointerCapture === 'function') {
    frame.setAttribute('data-drag-ready', '');
    frame.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.isPrimary === false) return;
      const bounds = frame.getBoundingClientRect();
      if (!bounds.width) return;
      const update = pointer => {
        if (pointer.pointerId !== event.pointerId) return;
        range.value = String(Math.round(Math.max(0, Math.min(100, (pointer.clientX - bounds.left) / bounds.width * 100))));
        compare();
      };
      const finish = pointer => {
        if (pointer.pointerId !== event.pointerId) return;
        if (pointer.type === 'pointerup') update(pointer);
        frame.removeEventListener('pointermove', update);
        frame.removeEventListener('pointerup', finish);
        frame.removeEventListener('pointercancel', finish);
        frame.removeEventListener('lostpointercapture', finish);
        if (frame.hasPointerCapture?.(event.pointerId)) frame.releasePointerCapture(event.pointerId);
      };
      frame.setPointerCapture(event.pointerId);
      frame.addEventListener('pointermove', update);
      frame.addEventListener('pointerup', finish);
      frame.addEventListener('pointercancel', finish);
      frame.addEventListener('lostpointercapture', finish);
      update(event);
    });
  }
  study.querySelectorAll('fieldset[disabled]').forEach(field => { field.disabled = false; });
  compare();
})();
