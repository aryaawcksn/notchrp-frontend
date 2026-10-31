import './style.css';

// ---------------------------------------------------------------- scroll reveal
// Simple, dependency-free reveal-on-scroll for a premium landing feel.
const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      }
    }
  },
  { threshold: 0.12 },
);

// Any element with [data-reveal] fades/slides in. Hooked after first paint.
const armor = () => {
  document.querySelectorAll('[data-reveal]').forEach((el) => observer.observe(el));
};

document.addEventListener('DOMContentLoaded', armor);

// Re-run for late-loaded nodes safety (No-op if already observed).
armor();