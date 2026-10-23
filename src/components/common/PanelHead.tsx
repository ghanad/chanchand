import React from "react";

interface PanelHeadProps {
  title: string;
  meta?: string;
  action?: React.ReactNode;
}

export function PanelHead({ title, meta, action }: PanelHeadProps) {
  return (
    <div className="panel-head">
      <div className="panel-head-titles">
        <h3>{title}</h3>
        {meta ? <span>{meta}</span> : null}
      </div>
      {action ? <div className="panel-head-action">{action}</div> : null}
    </div>
  );
}
