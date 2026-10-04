/* Small, local browsing controls. Auth and downloads remain in the shared editor script. */
(() => {
  const filters = [...document.querySelectorAll('[data-tool-filter]')];
  const cards = [...document.querySelectorAll('[data-tool]')];
  const search = document.querySelector('#tool-search');
  const results = document.querySelector('#tool-results');
  const empty = document.querySelector('#tool-empty');
  const rail = document.querySelector('#tool-rail');
  if (!search || !results || !empty || !rail) return;
  let category = 'all';
  const update = () => {
    const query = search.value.trim().toLocaleLowerCase();
    let count = 0;
    for (const card of cards) {
      const visible = (category === 'all' || card.dataset.tool === category)
        && `${card.dataset.search} ${card.textContent}`.toLocaleLowerCase().includes(query);
      card.hidden = !visible;
      if (visible) count += 1;
    }
    results.textContent = `${count} ${count === 1 ? 'tool' : 'tools'}${query ? (count === 1 ? ' matches your search' : ' match your search') : ''}`;
    empty.hidden = count > 0;
    rail.hidden = count === 0;
  };
  filters.forEach(button => button.addEventListener('click', () => {
    category = button.dataset.toolFilter;
    filters.forEach(filter => filter.setAttribute('aria-pressed', String(filter === button)));
    update();
  }));
  search.addEventListener('input', update);
  document.querySelector('#reset-tool-search')?.addEventListener('click', () => {
    category = 'all';
    search.value = '';
    filters.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.toolFilter === 'all')));
    update();
    search.focus();
  });
  // Closing the locked page must leave the video host instead of reopening its gate.
  document.querySelectorAll('[data-close-account-gate]').forEach(button => {
    button.addEventListener('click', event => {
      if (!document.body.classList.contains('editor-locked')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.assign('https://netvistastudio.com/');
    }, { capture: true });
  });
  document.querySelector('#account-gate-modal')?.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !document.body.classList.contains('editor-locked')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.assign('https://netvistastudio.com/');
  }, { capture: true });
  update();
})();
