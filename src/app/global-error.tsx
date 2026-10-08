"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

// Last-resort boundary: it replaces the root layout, so it carries its own
// <html> and <body> and cannot rely on the site's header, footer or styles.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (posthog.__loaded) posthog.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "1.5rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          color: "#18181b",
          background: "#f0fdf4",
        }}
      >
        <meta name="robots" content="noindex, nofollow" />
        <h1 style={{ margin: 0, fontSize: "1.875rem" }}>Something went wrong</h1>
        <p style={{ margin: 0, maxWidth: "32rem", color: "#52525b" }}>
          This page failed to load. Please try again, or head back to the homepage.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "0.625rem 1.5rem",
              border: 0,
              borderRadius: "0.375rem",
              background: "#16a34a",
              color: "#fff",
              fontSize: "1rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {/* A full page load on purpose: the app shell is what just failed. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            style={{
              padding: "0.625rem 1.5rem",
              borderRadius: "0.375rem",
              border: "1px solid #16a34a",
              color: "#15803d",
              textDecoration: "none",
            }}
          >
            Return home
          </a>
        </div>
      </body>
    </html>
  );
}
