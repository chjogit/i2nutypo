/* Lucian UX/UI Prompt #083 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#083 */
import type { CSSProperties } from "react";

/**
 * A progress bar for long work in the browser: while its length is unknown
 * (decoding, waiting for an engine) two segments slide along the track; once
 * a share is known, the same track fills in place. `value` null means
 * unknown, 0..1 a known share.
 */
export function ProgressTrack({
  value,
  label,
  done = false,
  className = "",
}: {
  value: number | null;
  label: string;
  done?: boolean;
  className?: string;
}) {
  const det = value !== null || done;
  const share = done ? 1 : Math.min(1, Math.max(0, value ?? 0));
  const classes = ["ux", "u083", det && "is-det", done && "is-done", className].filter(Boolean).join(" ");
  return (
    <div className={classes}>
      <div
        className="u083-trk"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={det ? Math.round(share * 100) : undefined}
        style={{ "--p": share } as CSSProperties}
      >
        <span className="u083-seg a" aria-hidden="true" />
        <span className="u083-seg b" aria-hidden="true" />
        <span className="u083-fill" aria-hidden="true" />
      </div>
    </div>
  );
}
