/* A six-second, user-started film study. Local stills, no saved user data. */
(() => {
  'use strict';
  const study = document.querySelector('[data-cut-study]');
  if (!study || study.dataset.cutReady === 'true') return;

  const image = study.querySelector('[data-cut-image]');
  const title = study.querySelector('[data-cut-title]');
  const titleInput = study.querySelector('[data-cut-title-input]');
  const scrub = study.querySelector('[data-cut-scrub]');
  const time = study.querySelector('[data-cut-time]');
  const play = study.querySelector('[data-cut-play]');
  const reverse = study.querySelector('[data-cut-reverse]');
  const strip = study.querySelector('[data-cut-strip]');
  const status = study.querySelector('[data-cut-status]');
  const position = study.querySelector('[data-cut-position]');
  const scenes = {
    coast: { name: 'The coast', src: '/assets/images/creative/coast-1280.jpg', alt: 'A winding coastline above the Pacific at golden hour' },
    petals: { name: 'The detail', src: '/assets/images/creative/petals-960.jpg', alt: 'Sculptural red poppy petals in close-up' },
    world: { name: 'Elsewhere', src: '/assets/images/creative/world-1280.jpg', alt: 'A sunlit stone archway on a fantastical island' }
  };
  if (![image, title, titleInput, scrub, time, play, reverse, strip, status].every(Boolean) ||
      typeof window.requestAnimationFrame !== 'function' || typeof window.cancelAnimationFrame !== 'function') return;

  const buttons = [...strip.querySelectorAll('[data-cut-shot]')];
  if (buttons.length !== 3 || new Set(buttons.map(button => button.dataset.cutShot)).size !== 3 ||
      buttons.some(button => !Object.prototype.hasOwnProperty.call(scenes, button.dataset.cutShot) ||
        !button.querySelector('[data-cut-number]') || !button.querySelector('[data-cut-name]'))) return;

  const shots = new Map(buttons.map(button => [button.dataset.cutShot, button]));
  const duration = 6, shotLength = 2, framesPerSecond = 24;
  let order = ['coast', 'petals', 'world'];
  let elapsed = 0, playing = false, frameHandle = null, lastTimestamp = null, run = 0;
  const pad = value => String(value).padStart(2, '0');
  const timecode = seconds => {
    const frames = Math.floor(seconds * framesPerSecond + 0.000001);
    return `${pad(Math.floor(frames / (framesPerSecond * 60)))}:${pad(Math.floor(frames / framesPerSecond) % 60)}:${pad(frames % framesPerSecond)}`;
  };
  const render = () => {
    const index = Math.min(order.length - 1, Math.floor(elapsed / shotLength));
    const key = order[index], scene = scenes[key];
    if (study.dataset.cutCurrent !== key) {
      image.src = scene.src;
      image.alt = scene.alt;
      study.dataset.cutCurrent = key;
    }
    scrub.value = String(elapsed);
    scrub.setAttribute('aria-valuetext', `${timecode(elapsed)}, shot ${index + 1} of 3: ${scene.name}`);
    time.textContent = timecode(elapsed);
    if (position) position.textContent = `${pad(index + 1)} / ${scene.name.toUpperCase()}`;
    order.forEach(key => shots.get(key).setAttribute('aria-pressed', String(key === order[index])));
    study.style.setProperty('--cut-progress', `${elapsed / duration * 100}%`);
    study.dataset.cutComplete = String(elapsed >= duration);
  };
  const renderPlayback = () => {
    const label = playing ? 'Pause your cut' : elapsed >= duration ? 'Play again' : 'Play your cut';
    play.textContent = label;
    play.setAttribute('aria-label', label);
    study.dataset.cutPlaying = String(playing);
  };
  const stop = () => {
    playing = false;
    run++;
    if (frameHandle !== null) window.cancelAnimationFrame(frameHandle);
    frameHandle = null;
    lastTimestamp = null;
    renderPlayback();
  };
  const arrange = () => {
    order.forEach((key, index) => {
      const button = shots.get(key);
      button.querySelector('[data-cut-number]').textContent = pad(index + 1);
      button.querySelector('[data-cut-name]').textContent = scenes[key].name;
      button.setAttribute('aria-label', `${pad(index + 1)} ${scenes[key].name}: jump to this shot`);
      strip.appendChild(button);
    });
  };
  const updateTitle = () => {
    const value = titleInput.value.slice(0, 40);
    if (titleInput.value !== value) titleInput.value = value;
    title.textContent = value.trim() ? value : 'Somewhere new.';
  };
  const tick = (timestamp, activeRun) => {
    if (!playing || activeRun !== run) return;
    frameHandle = null;
    if (document.hidden) { stop(); return; }
    if (lastTimestamp !== null) elapsed = Math.min(duration, elapsed + Math.max(0, timestamp - lastTimestamp) / 1000);
    lastTimestamp = timestamp;
    render();
    if (elapsed >= duration) {
      stop();
      status.textContent = 'Your cut is complete. Play again, or try the other order.';
      return;
    }
    frameHandle = window.requestAnimationFrame(next => tick(next, activeRun));
  };

  play.addEventListener('click', () => {
    if (playing) {
      stop();
      status.textContent = `Paused at ${timecode(elapsed)}.`;
      return;
    }
    if (document.hidden) return;
    if (elapsed >= duration) { elapsed = 0; render(); }
    playing = true;
    lastTimestamp = null;
    const activeRun = ++run;
    renderPlayback();
    status.textContent = `Your six-second sequence: ${order.map(key => scenes[key].name).join(', ')}.`;
    frameHandle = window.requestAnimationFrame(timestamp => tick(timestamp, activeRun));
  });
  scrub.addEventListener('input', () => {
    stop();
    const next = Number(scrub.value);
    elapsed = Number.isFinite(next) ? Math.max(0, Math.min(duration, next)) : 0;
    render();
    renderPlayback();
    const message = 'Scrub to find a moment, or play your cut.';
    if (status.textContent !== message) status.textContent = message;
  });
  buttons.forEach(button => button.addEventListener('click', () => {
    stop();
    const key = button.dataset.cutShot;
    elapsed = order.indexOf(key) * shotLength;
    render();
    renderPlayback();
    status.textContent = `Shot ${order.indexOf(key) + 1}: ${scenes[key].name}.`;
  }));
  reverse.addEventListener('click', () => {
    stop();
    order.reverse();
    elapsed = 0;
    arrange();
    render();
    renderPlayback();
    status.textContent = `Order reversed: ${order.map(key => scenes[key].name).join(', ')}. Ready to play.`;
  });
  titleInput.addEventListener('input', updateTitle);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  window.addEventListener('pagehide', stop);

  titleInput.maxLength = 40;
  scrub.min = '0';
  scrub.max = String(duration);
  scrub.step = '0.01';
  // A time display must not become an implicit live region when authored as output.
  time.setAttribute('aria-live', 'off');
  arrange();
  updateTitle();
  render();
  renderPlayback();
  [titleInput, scrub, play, reverse, ...buttons].forEach(control => { control.disabled = false; });
  study.dataset.cutReady = 'true';
})();
