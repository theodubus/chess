import { useEffect } from "react";

export function moveKeyDirection(
  event: Pick<KeyboardEvent, "key" | "code" | "shiftKey">,
) {
  if (
    event.key === "ArrowLeft" ||
    event.key === "<" ||
    event.code === "ArrowLeft"
  )
    return -1;
  if (
    event.key === "ArrowRight" ||
    event.key === ">" ||
    event.code === "ArrowRight"
  )
    return 1;
  // Certains hôtes transmettent le code physique de la touche ISO, sans son caractère.
  if (event.code === "IntlBackslash") return event.shiftKey ? 1 : -1;
  return 0;
}

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
            'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
          ))
      )
        return;
      const direction = moveKeyDirection(event);
      if (!direction) return;
      event.preventDefault();
      onSelect(Math.max(0, Math.min(total, selected + direction)));
    };
    window.addEventListener("keydown", navigate, true);
    return () => window.removeEventListener("keydown", navigate, true);
  }, [active, selected, total, onSelect]);
}
