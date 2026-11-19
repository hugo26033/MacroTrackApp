"use client";

import { useEffect } from "react";

let openModalCount = 0;

/**
 * Closes a modal/sheet when pressing Escape and locks background body scroll
 * while at least one modal/sheet is open.
 */
export function useModalEffects(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;

    openModalCount += 1;
    const prevOverflow = document.body.style.overflow;
    if (openModalCount === 1) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      openModalCount = Math.max(0, openModalCount - 1);
      if (openModalCount === 0) {
        document.body.style.overflow = prevOverflow || "";
      }
    };
  }, [open]);
}
