import { useEffect, useRef, useState, type RefObject } from "react";

const REDUCED = "(prefers-reduced-motion: reduce)";

/** True when the phone asks for less motion. Nothing on the website then moves on its own. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof matchMedia === "function" && matchMedia(REDUCED).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const query = matchMedia(REDUCED);
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** True while the element is on screen. With once, it stays true after the first sighting. */
export function useInView<T extends Element>({ once = false, margin = "0px 0px -12% 0px" }: { once?: boolean; margin?: string } = {}): [RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver !== "function") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { rootMargin: margin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [once, margin]);
  return [ref, inView];
}

/** For a section whose children rise in once it scrolls into view. Spread the result on the section. */
export function useReveal<T extends Element>() {
  const [ref, shown] = useInView<T>({ once: true });
  return { ref, "data-shown": shown ? "" : undefined };
}

/** True once the page has scrolled past the top, so the header can grow a backdrop. */
export function useScrolled(offset = 8): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > offset);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [offset]);
  return scrolled;
}
