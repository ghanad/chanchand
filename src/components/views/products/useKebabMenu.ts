import React, { useState, useEffect, useRef } from "react";

interface UseKebabMenuProps {
  isAdmin: boolean;
  showToast: (msg: string) => void;
}

export function useKebabMenu({ isAdmin, showToast }: UseKebabMenuProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeKebabKey, setActiveKebabKey] = useState<string | null>(null);
  const kebabTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Close kebab menu on outside click or Esc
  useEffect(() => {
    if (!activeKebabKey) return;
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".kebab-container")) {
        setActiveKebabKey(null);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        const lastKey = activeKebabKey;
        setActiveKebabKey(null);
        if (lastKey && kebabTriggerRefs.current[lastKey]) {
          kebabTriggerRefs.current[lastKey]?.focus();
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeKebabKey]);

  async function copyToClipboard(url: string, key: string, isPublic?: boolean) {
    if (isPublic && !isAdmin) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKey(key);
      showToast("آدرس اینترنتی با موفقیت کپی شد.");
      setTimeout(() => {
        setCopiedKey((curr) => (curr === key ? null : curr));
      }, 2000);
    } catch {
      showToast("خطا در کپی آدرس اینترنتی");
    }
  }

  return {
    copiedKey,
    activeKebabKey,
    setActiveKebabKey,
    kebabTriggerRefs,
    copyToClipboard,
  };
}
