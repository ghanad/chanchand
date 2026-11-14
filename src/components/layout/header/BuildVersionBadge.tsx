"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  formatBuildInfoCopyText,
  getClientBuildInfo,
} from "../../../lib/build-info";
import { dateFormatter } from "../../../lib/formatters";

const COPIED_FEEDBACK_MS = 1600;

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path (plain-HTTP deployments, strict permissions).
  }

  try {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(field);
    return copied;
  } catch {
    return false;
  }
}

function formatBuildTime(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return dateFormatter.format(date);
}

function CopyIcon() {
  return (
    <svg
      className="user-dropdown-meta-copy"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="user-dropdown-meta-check"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function BuildVersionBadge() {
  const buildInfo = getClientBuildInfo();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number>(0);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const handleCopy = useCallback(async () => {
    if (!buildInfo) return;

    const success = await copyText(formatBuildInfoCopyText(buildInfo));
    if (!success) return;

    setCopied(true);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(
      () => setCopied(false),
      COPIED_FEEDBACK_MS
    );
  }, [buildInfo]);

  if (!buildInfo) return null;

  const buildTime = buildInfo.builtAt ? formatBuildTime(buildInfo.builtAt) : null;
  const description = buildTime
    ? `نسخهٔ نصب‌شده — ساخته‌شده در ${buildTime}`
    : "نسخهٔ نصب‌شده";

  return (
    <div className="user-dropdown-meta" role="group" aria-label="اطلاعات نسخهٔ نصب‌شده">
      <button
        type="button"
        role="menuitem"
        tabIndex={0}
        className="user-dropdown-meta-btn"
        onClick={handleCopy}
        title={`${description}. برای کپی کلیک کنید.`}
        aria-label={`${description}. کپی اطلاعات نسخه`}
      >
        <span
          className={`user-dropdown-meta-label ${copied ? "is-copied" : ""}`}
          aria-live="polite"
        >
          {copied ? "کپی شد" : "نسخه"}
        </span>
        <span className="user-dropdown-meta-value" dir="ltr">
          <bdi>v{buildInfo.version}</bdi>
          {buildInfo.commit ? (
            <>
              <span className="user-dropdown-meta-dot" aria-hidden="true">
                ·
              </span>
              <bdi className="user-dropdown-meta-commit">
                {buildInfo.commit}
              </bdi>
            </>
          ) : null}
        </span>
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
    </div>
  );
}
