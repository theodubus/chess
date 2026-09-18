import { useEffect } from "react";

export function useMoveKeys(
  active: boolean,
  selected: number,
  total: number,
  onSelect: (index: number) => void,
) {
  useEffect(() => {
    if (!active) return;
    const navigate = (event: KeyboardEvent) => {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.defaultPrevented ||
        document.querySelector("dialog[open]") ||
        (event.target instanceof Element &&
          event.target.closest(
            'input, textarea, select, [contenteditable="true"], [role="textbox"]',
          ))
      )
        return;
      const direction = ["ArrowLeft", "<"].includes(event.key)
        ? -1
        : ["ArrowRight", ">"].includes(event.key)
          ? 1
          : 0;
      if (!direction) return;
      event.preventDefault();
      onSelect(Math.max(0, Math.min(total, selected + direction)));
    };
    window.addEventListener("keydown", navigate);
    return () => window.removeEventListener("keydown", navigate);
  }, [active, selected, total, onSelect]);
}
