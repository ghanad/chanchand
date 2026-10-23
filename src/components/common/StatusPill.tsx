import React from "react";

export function StatusPill({ text, tone }: { text: string; tone: string }) {
  return <span className={`status-pill tone-${tone}`}>{text}</span>;
}
