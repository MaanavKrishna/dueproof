/* Dueproof website: the header, the hero sequence, the proof demo. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Header: a hairline once the page scrolls; a menu on small screens.
  const head = document.querySelector('.site-head');
  if (head) {
    const onScroll = () => head.classList.toggle('is-scrolled', scrollY > 8);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    const menu = head.querySelector('.menu-btn');
    menu?.addEventListener('click', () => {
      const open = head.classList.toggle('is-open');
      menu.setAttribute('aria-expanded', String(open));
    });
  }

  // Hero: the notice is scanned, its deadline marked, the stamp lands, the
  // register fills. Plays once when it comes into view; Replay runs it again.
  const stage = document.querySelector('.stage');
  if (stage && !reduce) {
    const play = () => {
      stage.classList.remove('is-playing');
      void stage.offsetWidth;                 // restart every animation from the top
      stage.classList.add('is-playing');
    };
    const seen = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { play(); seen.disconnect(); }
    }, { threshold: .35 });
    seen.observe(stage);
    stage.querySelector('.replay')?.addEventListener('click', play);
  } else {
    stage?.querySelector('.replay')?.remove();
  }

  // Proof demo: choose a finding, see the passage it came from.
  const demo = document.querySelector('.demo');
  if (demo) {
    const items = [...demo.querySelectorAll('.demo-item')];
    const caption = demo.querySelector('.demo-caption');
    const choose = item => {
      items.forEach(i => i.setAttribute('aria-pressed', String(i === item)));
      demo.querySelectorAll('[data-proof]').forEach(span =>
        span.classList.toggle('is-on', span.dataset.proof === item.dataset.target));
      caption.textContent = item.dataset.caption || '';
    };
    items.forEach(item => item.addEventListener('click', () => choose(item)));
    if (items[0]) choose(items[0]);
  }

  const year = document.querySelector('[data-year]');
  if (year) year.textContent = new Date().getFullYear();
})();
