// Scroll Showcase: bike image that moves as you scroll
(() => {
  const section = document.querySelector('[data-scroll-showcase]');
  if (!section) return;

  const bikeImage = document.querySelector('[data-bike-image]');
  const features = document.querySelectorAll('[data-feature]');
  const specItems = document.querySelectorAll('.spec-item');
  const cta = document.querySelector('.showcase-cta');

  // Scroll progress calculation
  function getScrollProgress() {
    const rect = section.getBoundingClientRect();
    const sectionHeight = section.offsetHeight;
    const viewportHeight = window.innerHeight;
    const scrollableHeight = sectionHeight - viewportHeight;

    if (scrollableHeight <= 0) return 0;

    const scrolled = -rect.top;
    return Math.max(0, Math.min(1, scrolled / scrollableHeight));
  }

  // Update visuals based on scroll
  function updateOnScroll() {
    const progress = getScrollProgress();

    // Bike image stays static - no rotation or movement
    // Only features reveal as you scroll

    // Reveal features at specific scroll positions
    features.forEach((feature, index) => {
      const triggerStart = (index + 1) * 0.2 - 0.1;
      const triggerEnd = (index + 1) * 0.2 + 0.1;

      if (progress >= triggerStart && progress <= triggerEnd) {
        feature.classList.add('active');
      } else {
        feature.classList.remove('active');
      }
    });

    // Reveal specs dashboard near the end
    if (progress > 0.7) {
      specItems.forEach((item, index) => {
        setTimeout(() => {
          item.classList.add('active');
        }, index * 100);
      });
    } else {
      specItems.forEach(item => item.classList.remove('active'));
    }

    // Reveal CTA at the very end
    if (progress > 0.85) {
      cta.classList.add('active');
    } else {
      cta.classList.remove('active');
    }
  }

  // Scroll event listener with throttling
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        updateOnScroll();
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });

  // Initial update
  updateOnScroll();

  // Handle resize
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      updateOnScroll();
    }, 100);
  });
})();
