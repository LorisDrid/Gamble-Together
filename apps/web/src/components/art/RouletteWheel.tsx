"use client";

import { useLayoutEffect, useRef } from "react";
import { WHEEL_ORDER, numberColor } from "@gamble/shared";

/** How long the wheel and the ball run before the ball settles. */
export const SPIN_MS = 4500;

const STEP = 360 / WHEEL_ORDER.length;
const POCKET_COLORS = { red: "#8c1426", black: "#1a1412", green: "#1f4d3a" } as const;
/** Pocket 0 is centred at the top; pocket i sits at i × STEP clockwise. */
const POCKETS = `conic-gradient(from ${-STEP / 2}deg, ${WHEEL_ORDER.map(
  (n, i) => `${POCKET_COLORS[numberColor(n)]} ${i * STEP}deg ${(i + 1) * STEP}deg`,
).join(", ")})`;
const FRETS = `repeating-conic-gradient(from ${-STEP / 2}deg, rgba(201, 165, 90, 0.9) 0deg 0.8deg, transparent 0.8deg ${STEP}deg)`;

/** Ball distance from the wheel's top edge, in % of its size: on the rim while it runs, then in a pocket. */
const BALL_RIM = 4;
const BALL_POCKET = 17;

const rotate = (deg: number) => `rotate(${deg}deg)`;

interface RouletteWheelProps {
  /** The pocket the ball rests in (null: no ball on the wheel). */
  number: number | null;
  /** Run the spin that lands the ball on `number`. */
  spinning: boolean;
  onSpinEnd?: () => void;
}

/**
 * Art-deco European wheel: lacquered bowl, 37 pockets in their real order,
 * gold frets and turret, ivory ball. A spin turns the wheel one way and the
 * ball the other, then drops the ball into the winning pocket.
 */
export function RouletteWheel({ number, spinning, onSpinEnd }: RouletteWheelProps) {
  const rotor = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const ball = useRef<HTMLSpanElement>(null);
  /** Resting angles, kept across spins so each one starts where the last ended. */
  const angles = useRef({ rotor: 0, ball: 0 });
  const onEnd = useRef(onSpinEnd);
  onEnd.current = onSpinEnd;

  useLayoutEffect(() => {
    const r = rotor.current;
    const t = track.current;
    const b = ball.current;
    if (!r || !t || !b) return;
    const pocket = number === null ? -1 : WHEEL_ORDER.indexOf(number);
    const place = (rotorAngle: number, ballAngle: number) => {
      r.style.transform = rotate(rotorAngle);
      t.style.transform = rotate(ballAngle);
      b.style.top = `${BALL_POCKET}%`;
      b.style.opacity = pocket < 0 ? "0" : "1";
    };

    if (!spinning || pocket < 0) {
      const ballAngle = angles.current.rotor + Math.max(0, pocket) * STEP;
      angles.current.ball = ballAngle;
      place(angles.current.rotor, ballAngle);
      return;
    }

    // The wheel turns clockwise 2-3 times; the ball runs at least 4 turns the
    // other way and ends over the winning pocket of the wheel's final position.
    const from = angles.current;
    const toRotor = from.rotor + 720 + Math.random() * 360;
    let toBall = toRotor + pocket * STEP;
    toBall -= Math.ceil((toBall - (from.ball - 1440)) / 360) * 360;
    angles.current = { rotor: toRotor, ball: toBall };
    place(toRotor, toBall);

    const animations = [
      r.animate([{ transform: rotate(from.rotor) }, { transform: rotate(toRotor) }], {
        duration: SPIN_MS,
        easing: "cubic-bezier(0.2, 0.6, 0.3, 1)",
      }),
      t.animate([{ transform: rotate(from.ball) }, { transform: rotate(toBall) }], {
        duration: SPIN_MS,
        easing: "cubic-bezier(0.12, 0.55, 0.25, 1)",
      }),
      b.animate(
        [
          { top: `${BALL_RIM}%`, opacity: 1, offset: 0 },
          { top: `${BALL_RIM}%`, offset: 0.62 },
          { top: `${BALL_POCKET + 3}%`, offset: 0.82 },
          { top: `${BALL_POCKET - 1}%`, offset: 0.9 },
          { top: `${BALL_POCKET}%`, offset: 1 },
        ],
        { duration: SPIN_MS },
      ),
    ];
    animations[0]!.finished.then(() => onEnd.current?.(), () => {});
    return () => animations.forEach((animation) => animation.cancel());
  }, [number, spinning]);

  return (
    <div className="roulette-wheel-art" aria-hidden>
      <div className="rw-bowl" />
      <div ref={rotor} className="rw-rotor">
        <div className="rw-pockets" style={{ background: POCKETS }} />
        <div className="rw-pockets" style={{ background: FRETS }} />
        {WHEEL_ORDER.map((n, i) => (
          <span key={n} className="rw-label" style={{ transform: rotate(i * STEP) }}>
            <span>{n}</span>
          </span>
        ))}
        <div className="rw-cone" />
        <svg className="rw-turret" viewBox="0 0 70 70">
          <circle cx="35" cy="35" r="11" fill="#c9a55a" />
          <g stroke="#c9a55a" strokeWidth="4" strokeLinecap="round">
            <line x1="35" y1="6" x2="35" y2="64" />
            <line x1="6" y1="35" x2="64" y2="35" />
          </g>
          <circle cx="35" cy="35" r="5" fill="#e2c587" />
        </svg>
      </div>
      <div ref={track} className="rw-track">
        <span ref={ball} className="rw-ball" />
      </div>
    </div>
  );
}
