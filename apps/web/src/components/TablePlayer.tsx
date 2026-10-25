import type { ReactNode } from "react";

export function PlayerBadge({ nickname, detail, marker, children }: {
  nickname: string; detail?: ReactNode; marker?: ReactNode; children?: ReactNode;
}) {
  return <div className="table-player-badge">
    <span className="seat-ava" aria-hidden>{nickname.trim().slice(0, 2).toUpperCase() || "?"}</span>
    <span className="player-info"><span className="player-name" title={nickname}>{nickname}</span>
      {detail && <span className="seat-meta">{detail}</span>}</span>
    {marker}{children}
  </div>;
}

export function PlayerZone({ nickname, detail, marker, children, result }: {
  nickname: string; detail?: ReactNode; marker?: ReactNode; children?: ReactNode; result?: ReactNode;
}) {
  return <div className="player-zone">{children}
    <PlayerBadge nickname={`${nickname} (toi)`} detail={detail} marker={marker} />{result}
  </div>;
}
