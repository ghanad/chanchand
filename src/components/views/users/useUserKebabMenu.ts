import { useState, useEffect, useCallback, useRef } from "react";
import { MenuCoords } from "./types";

export function useUserKebabMenu() {
  const [activeKebabKey, setActiveKebabKey] = useState<string | null>(null);
  const [menuCoords, setMenuCoords] = useState<MenuCoords | null>(null);
  const kebabTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const toggleKebab = useCallback(
    (userId: string) => {
      if (activeKebabKey === userId) {
        setActiveKebabKey(null);
        setMenuCoords(null);
      } else {
        const triggerEl = kebabTriggerRefs.current[userId];
        if (triggerEl) {
          const rect = triggerEl.getBoundingClientRect();
          const dropdownHeight = 140;
          const spaceBelow = window.innerHeight - rect.bottom;
          const openUpwards = spaceBelow < dropdownHeight && rect.top > dropdownHeight;
          const menuWidth = 150;
          let left = rect.left;
          if (left + menuWidth > window.innerWidth - 8) {
            left = Math.max(8, window.innerWidth - menuWidth - 8);
          }
          if (left < 8) {
            left = 8;
          }
          setMenuCoords({
            top: openUpwards ? undefined : rect.bottom + 4,
            bottom: openUpwards ? window.innerHeight - rect.top + 4 : undefined,
            left,
            openUpwards,
          });
        }
        setActiveKebabKey(userId);
      }
    },
    [activeKebabKey]
  );

  useEffect(() => {
    if (!activeKebabKey) return;
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".kebab-container") && !target?.closest(".kebab-menu-dropdown")) {
        setActiveKebabKey(null);
        setMenuCoords(null);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        const lastKey = activeKebabKey;
        setActiveKebabKey(null);
        setMenuCoords(null);
        if (lastKey && kebabTriggerRefs.current[lastKey]) {
          kebabTriggerRefs.current[lastKey]?.focus();
        }
      }
    }
    function handleScroll(event: Event) {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.(".kebab-menu-dropdown")) return;
      setActiveKebabKey(null);
      setMenuCoords(null);
    }
    function handleResize() {
      setActiveKebabKey(null);
      setMenuCoords(null);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [activeKebabKey]);

  return {
    activeKebabKey,
    setActiveKebabKey,
    menuCoords,
    setMenuCoords,
    kebabTriggerRefs,
    toggleKebab,
  };
}
