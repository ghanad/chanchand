import React from "react";
import Link from "next/link";

interface BrandLogoProps {
  isAdmin: boolean;
  homeHref?: string;
  onClick?: () => void;
}

export function BrandLogo({ isAdmin, homeHref = "/products", onClick }: BrandLogoProps) {
  return (
    <Link
      href={homeHref}
      className="top-navbar-brand"
      title="چن چند - صفحه اصلی"
      onClick={onClick}
    >
      <span className="brand-logo-mark" aria-hidden="true">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
          <polyline points="16 7 22 7 22 13" />
        </svg>
      </span>
      <div className="brand-text">
        <span className="brand-title">چن چند</span>
        {isAdmin && <span className="brand-role-badge">مدیر</span>}
      </div>
    </Link>
  );
}
