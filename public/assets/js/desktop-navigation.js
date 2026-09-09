// Render compact-rail labels outside the scrolling navigation container.
(function () {
  var tooltip, active;
  function hide() {
    if (tooltip) tooltip.hidden = true;
    active = null;
  }
  function show(button) {
    if (!button || parseFloat(getComputedStyle(button).fontSize) !== 0) return;
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.className = 'desktop-nav-tooltip';
      tooltip.setAttribute('aria-hidden', 'true');
      document.body.appendChild(tooltip);
    }
    active = button;
    tooltip.textContent = button.dataset.foldLabel || button.textContent.trim();
    tooltip.hidden = false;
    var rect = button.getBoundingClientRect();
    var rail = button.closest('.tabs').getBoundingClientRect();
    tooltip.style.left = Math.max(4, Math.min(rail.right + 8, window.innerWidth - tooltip.offsetWidth - 4)) + 'px';
    tooltip.style.top = Math.max(4, Math.min(rect.top + (rect.height - tooltip.offsetHeight) / 2, window.innerHeight - tooltip.offsetHeight - 4)) + 'px';
  }
  document.addEventListener('mouseover', function (event) {
    var button = event.target.closest('.tabs .tb');
    if (button !== active) { hide(); show(button); }
  });
  document.addEventListener('focusin', function (event) { hide(); show(event.target.closest('.tabs .tb')); });
  document.addEventListener('focusout', hide);
  document.addEventListener('mouseout', function (event) {
    if (active && !active.contains(event.relatedTarget)) hide();
  });
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape') hide(); });
  document.addEventListener('click', hide);
  document.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
})();
