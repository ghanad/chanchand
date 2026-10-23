import React from "react";

export function Toast({ message }: { message: string }) {
  return (
    <div className={`toast ${message ? "visible" : ""}`} role="status" aria-live="polite">
      {message}
    </div>
  );
}
