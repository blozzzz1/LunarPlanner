import { Overlay } from "ol";
import classNames from "classnames";

export function updateOverlayClass(
  overlay: Overlay,
  options: {
    pending?: boolean;
    dragging?: boolean;
    type?: string;
  }
) {
  const el = overlay.getElement();
  if (!el) return;
  el.className = classNames("module-container", {
    pending: options.pending,
    dragging: options.dragging,
    [`type-${options.type}`]: !!options.type,
  });
}
