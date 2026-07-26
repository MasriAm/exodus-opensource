"use client";

/**
 * Root error UI for failures that escape the app tree.
 * Required for a reliable recovery path when the session shell itself breaks.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          fontFamily: "Georgia, 'Times New Roman', serif",
          background: "#EADBC3",
          color: "#241A15",
          display: "grid",
          placeItems: "center",
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <p
            style={{
              fontFamily: "Courier New, monospace",
              letterSpacing: "0.08em",
              fontSize: "0.75rem",
              textTransform: "uppercase",
            }}
          >
            Exodus
          </p>
          <h1 style={{ fontFamily: "Courier New, monospace", fontSize: "1.5rem" }}>
            This view hit a problem
          </h1>
          <p style={{ lineHeight: 1.6 }}>
            Your archive was not uploaded. Try again from this browser session.
          </p>
          <p style={{ fontSize: "0.85rem", opacity: 0.7 }}>
            {error.message || "Unknown interface error."}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              border: "2px solid #2B1B23",
              background: "#2B1B23",
              color: "#F4EDD9",
              padding: "0.6rem 1rem",
              fontFamily: "Courier New, monospace",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
