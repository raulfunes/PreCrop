import { useState, useEffect, useCallback, useRef } from 'react';

interface AutoHideHeaderOptions {
  threshold?: number;
  tolerance?: number;
}

export function useAutoHideHeader({ threshold = 60, tolerance = 10 }: AutoHideHeaderOptions = {}) {
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(() => typeof window !== 'undefined' ? window.scrollY > 0 : false);
  
  const lastScrollY = useRef(0);
  const scrollRaf = useRef<number | null>(null);

  const handleScroll = useCallback(() => {
    if (scrollRaf.current !== null) return;

    scrollRaf.current = requestAnimationFrame(() => {
      const currentScrollY = window.scrollY;
      
      setScrolled(currentScrollY > 0);

      if (currentScrollY <= threshold) {
        setHidden(false);
      } else {
        const diff = currentScrollY - lastScrollY.current;
        if (Math.abs(diff) >= tolerance) {
          if (diff > 0) {
            // Scrolling down
            setHidden(true);
          } else {
            // Scrolling up
            setHidden(false);
          }
        }
      }

      // Update last scroll position if difference is larger than tolerance
      // This prevents micro-scrolls from slowly triggering the hide
      if (Math.abs(currentScrollY - lastScrollY.current) >= tolerance || currentScrollY <= threshold) {
        lastScrollY.current = currentScrollY;
      }
      
      scrollRaf.current = null;
    });
  }, [threshold, tolerance]);

  useEffect(() => {
    // Initial check (in case page loads scrolled)
    // Initial check
    lastScrollY.current = window.scrollY;
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollRaf.current !== null) {
        cancelAnimationFrame(scrollRaf.current);
      }
    };
  }, [handleScroll]);

  // Manejo de foco por teclado: si alguien enfoca algo en el header cuando está oculto
  const handleFocusIn = useCallback(() => {
    setHidden(false);
  }, []);

  return { hidden, scrolled, handleFocusIn };
}
