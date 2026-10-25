"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { PlayingCard, displayCardId, displayCardLabel, type DisplayCard } from "./PlayingCard";

/** Shared fan and preview. Selection is separate from the game's commit action. */
export function CardHand({ cards, selected = [], onToggle, selectable = false, testId }: {
  cards: readonly DisplayCard[]; selected?: readonly number[];
  onToggle?: (index: number) => void; selectable?: boolean; testId?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const [width, setWidth] = useState(300);
  const [preview, setPreview] = useState<{ index: number; pinned: boolean } | null>(null);
  const signature = cards.map(displayCardId).join(",");
  useEffect(() => { setPreview(null); }, [signature]);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setWidth(entry.contentRect.width); });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!preview?.pinned) return;
    closeButton.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setPreview(null); trigger.current?.focus(); }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [preview?.pinned]);
  const spacing = Math.min(cards.length <= 3 ? 78 : 28, Math.max(0, width - 82) / Math.max(1, cards.length - 1));
  const card = preview ? cards[preview.index] : undefined;
  const portal = host.current?.closest(".integrated-table");
  const occurrences = new Map<string, number>();
  function close() { setPreview(null); trigger.current?.focus(); }
  return <div className="card-hand" ref={host} aria-label="Ta main">
    {cards.map((value, index) => {
      const identity = displayCardId(value);
      const occurrence = occurrences.get(identity) ?? 0;
      occurrences.set(identity, occurrence + 1);
      const offset = index - (cards.length - 1) / 2;
      const style = {
        "--fan-x": `${offset * spacing}px`,
        "--fan-y": `${Math.min(16, Math.abs(offset) ** 1.5 * 0.5)}px`,
        "--fan-angle": `${Math.max(-16, Math.min(16, offset * 2))}deg`,
        "--fan-order": index + 1,
      } as CSSProperties;
      return <button key={`${identity}-${occurrence}`} type="button" style={style}
        className={`fan-card${selected.includes(index) ? " selected" : ""}`}
        aria-label={`${displayCardLabel(value)}, voir la carte`} aria-pressed={selected.includes(index)} data-testid={testId}
        onPointerEnter={(e) => { if (e.pointerType === "mouse" && !preview?.pinned) setPreview({ index, pinned: false }); }}
        onPointerLeave={() => setPreview((current) => current?.pinned ? current : null)}
        onFocus={() => { if (!preview?.pinned) setPreview({ index, pinned: false }); }}
        onBlur={() => setPreview((current) => current?.pinned ? current : null)}
        onClick={(e) => {
          trigger.current = e.currentTarget;
          if (window.matchMedia("(hover: hover) and (pointer: fine)").matches && selectable && onToggle) onToggle(index);
          else setPreview({ index, pinned: true });
        }}>
        <PlayingCard card={value} index={index} special={"special" in value && Boolean(value.special)} />
      </button>;
    })}
    {card && portal && createPortal(
      <div className={`card-preview${preview?.pinned ? " pinned" : ""}`} role={preview?.pinned ? "dialog" : undefined} aria-label="Aperçu de la carte">
        {preview?.pinned && <button ref={closeButton} type="button" className="preview-close" aria-label="Fermer l’aperçu" onClick={close}>×</button>}
        <PlayingCard card={card} />
        {preview?.pinned && <div className="preview-navigation">
          <button type="button" aria-label="Carte précédente" disabled={preview.index === 0}
            onClick={() => setPreview({ index: preview.index - 1, pinned: true })}>‹</button>
          <span aria-live="polite">{preview.index + 1} / {cards.length}</span>
          <button type="button" aria-label="Carte suivante" disabled={preview.index === cards.length - 1}
            onClick={() => setPreview({ index: preview.index + 1, pinned: true })}>›</button>
        </div>}
        {preview?.pinned && selectable && onToggle && <button type="button" onClick={() => { onToggle(preview.index); close(); }}>
          {selected.includes(preview.index) ? "Désélectionner" : "Sélectionner"}
        </button>}
      </div>, portal,
    )}
  </div>;
}
