import React from "react";

interface PanelHeadProps {
  title: string;
  meta?: string;
}

export function PanelHead({ title, meta }: PanelHeadProps) {
  return (
    <div className="panel-head">
      <h3>{title}</h3>
      {meta ? <span>{meta}</span> : null}
    </div>
  );
}
