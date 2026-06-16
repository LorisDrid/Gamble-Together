/**
 * Per-game illustrations for the lobby cards, drawn in the strict
 * black / off-white / red palette (SVG → crisp at any size, light on the Pi).
 * Swappable later for real artwork — same `.game-art` slot.
 */

const NOIR = "var(--noir)";
const NOIR_3 = "var(--noir-3)";
const ROUGE = "var(--rouge)";
const BLANC = "var(--blanc-2)";
const LINE = "var(--card-line)";

export function BlackjackArt() {
  return (
    <svg viewBox="0 0 160 100" role="img" aria-label="Blackjack">
      {/* Back card — Ace of spades */}
      <g transform="rotate(-10 60 55)">
        <rect x="38" y="22" width="46" height="64" rx="6" fill={BLANC} stroke={LINE} />
        <text x="45" y="38" fontSize="13" fontWeight="700" fill={NOIR}>
          A
        </text>
        <text x="61" y="66" fontSize="30" textAnchor="middle" fill={NOIR}>
          ♠
        </text>
      </g>
      {/* Front card — red King */}
      <g transform="rotate(9 104 52)">
        <rect x="82" y="18" width="46" height="64" rx="6" fill={BLANC} stroke={LINE} />
        <text x="89" y="34" fontSize="13" fontWeight="700" fill={ROUGE}>
          K
        </text>
        <text x="105" y="62" fontSize="30" textAnchor="middle" fill={ROUGE}>
          ♥
        </text>
      </g>
    </svg>
  );
}

export function RouletteArt() {
  const pockets = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
    return {
      x: 80 + Math.cos(angle) * 34,
      y: 50 + Math.sin(angle) * 34,
      fill: i === 0 ? "#1e8e4a" : i % 2 === 1 ? ROUGE : NOIR_3,
    };
  });
  return (
    <svg viewBox="0 0 160 100" role="img" aria-label="Roulette">
      <circle cx="80" cy="50" r="42" fill={NOIR} stroke={LINE} strokeWidth="2" />
      {/* Spokes */}
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI;
        return (
          <line
            key={i}
            x1={80 - Math.cos(a) * 40}
            y1={50 - Math.sin(a) * 40}
            x2={80 + Math.cos(a) * 40}
            y2={50 + Math.sin(a) * 40}
            stroke={LINE}
            strokeWidth="1"
          />
        );
      })}
      {pockets.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="6" fill={p.fill} stroke={BLANC} strokeWidth="1" />
      ))}
      {/* Hub + ball */}
      <circle cx="80" cy="50" r="11" fill={BLANC} stroke={LINE} />
      <circle cx="80" cy="16" r="4" fill={BLANC} stroke={NOIR} />
    </svg>
  );
}

export function BaccaratArt() {
  return (
    <svg viewBox="0 0 160 100" role="img" aria-label="Baccarat">
      {/* Two facing hands — a natural 9 */}
      <g transform="rotate(-7 52 52)">
        <rect x="30" y="24" width="44" height="60" rx="6" fill={BLANC} stroke={LINE} />
        <text x="37" y="42" fontSize="14" fontWeight="700" fill={NOIR}>
          9
        </text>
        <text x="52" y="68" fontSize="26" textAnchor="middle" fill={NOIR}>
          ♣
        </text>
      </g>
      <g transform="rotate(7 108 52)">
        <rect x="86" y="24" width="44" height="60" rx="6" fill={BLANC} stroke={LINE} />
        <text x="93" y="42" fontSize="14" fontWeight="700" fill={ROUGE}>
          9
        </text>
        <text x="108" y="68" fontSize="26" textAnchor="middle" fill={ROUGE}>
          ♦
        </text>
      </g>
    </svg>
  );
}

export function PresidentArt() {
  return (
    <svg viewBox="0 0 160 100" role="img" aria-label="Président">
      {/* Crown */}
      <g>
        <path
          d="M52 40 L60 58 L80 30 L100 58 L108 40 L104 70 L56 70 Z"
          fill={ROUGE}
          stroke={BLANC}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <circle cx="52" cy="40" r="4" fill={BLANC} />
        <circle cx="80" cy="30" r="4" fill={BLANC} />
        <circle cx="108" cy="40" r="4" fill={BLANC} />
      </g>
      {/* A small fan of cards under the crown */}
      <g transform="rotate(-12 70 86)">
        <rect x="56" y="74" width="26" height="20" rx="3" fill={BLANC} stroke={LINE} />
        <text x="60" y="88" fontSize="10" fontWeight="700" fill={NOIR}>
          K
        </text>
      </g>
      <g transform="rotate(12 96 86)">
        <rect x="84" y="74" width="26" height="20" rx="3" fill={BLANC} stroke={LINE} />
        <text x="88" y="88" fontSize="10" fontWeight="700" fill={ROUGE}>
          2
        </text>
      </g>
    </svg>
  );
}

export function PokerArt() {
  return (
    <svg viewBox="0 0 160 100" role="img" aria-label="Poker">
      {/* Two hole cards (pocket aces) */}
      <g transform="rotate(-9 64 50)">
        <rect x="40" y="20" width="42" height="60" rx="6" fill={BLANC} stroke={LINE} />
        <text x="47" y="36" fontSize="12" fontWeight="700" fill={NOIR}>
          A
        </text>
        <text x="61" y="62" fontSize="26" textAnchor="middle" fill={NOIR}>
          ♠
        </text>
      </g>
      <g transform="rotate(7 86 48)">
        <rect x="66" y="18" width="42" height="60" rx="6" fill={BLANC} stroke={LINE} />
        <text x="73" y="34" fontSize="12" fontWeight="700" fill={ROUGE}>
          A
        </text>
        <text x="87" y="60" fontSize="26" textAnchor="middle" fill={ROUGE}>
          ♦
        </text>
      </g>
      {/* Chip stack */}
      <g>
        <ellipse cx="116" cy="74" rx="20" ry="8" fill={NOIR_3} stroke={BLANC} strokeWidth="1.5" />
        <ellipse cx="116" cy="68" rx="20" ry="8" fill={ROUGE} stroke={BLANC} strokeWidth="1.5" strokeDasharray="3 3" />
        <ellipse cx="116" cy="62" rx="20" ry="8" fill={BLANC} stroke={LINE} strokeWidth="1.5" />
        <text x="116" y="65" fontSize="9" fontWeight="700" textAnchor="middle" fill={ROUGE}>
          ♣
        </text>
      </g>
    </svg>
  );
}
