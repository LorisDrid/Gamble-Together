import { useId } from "react";

/**
 * House rules printed on the felt in art-deco lettering, curved like the rail
 * of a casino table. Passed to `TableStage` as its `inscription`.
 */
export function FeltInscription({ main, sub }: { main: string; sub?: string }) {
  const id = useId();
  return (
    <svg className="felt-inscription" viewBox="0 0 600 150" aria-hidden>
      <path id={`${id}-main`} d="M20 20 Q300 140 580 20" fill="none" />
      {sub && <path id={`${id}-sub`} d="M70 72 Q300 178 530 72" fill="none" />}
      <text className="felt-inscription-main">
        <textPath href={`#${id}-main`} startOffset="50%" textAnchor="middle">{main}</textPath>
      </text>
      {sub && (
        <text className="felt-inscription-sub">
          <textPath href={`#${id}-sub`} startOffset="50%" textAnchor="middle">{sub}</textPath>
        </text>
      )}
    </svg>
  );
}
