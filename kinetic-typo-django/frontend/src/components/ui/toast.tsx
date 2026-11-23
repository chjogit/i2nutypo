/* Lucian UX/UI Prompt #435 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#435 */
import { useEffect, useRef } from "react";

/**
 * One notification stack for the whole editor: results of work that may finish
 * while the person looks elsewhere (a project opened, a video made, lyrics
 * synced). A toast rises from the bottom right, draws its mark and a thin time
 * bar runs out. Up to three stack like cards; hovering or focusing fans them
 * out and stops the clocks; a sideways swipe, × or Escape closes one. An
 * action ("되돌리기") runs, then the same toast turns into its done text.
 *
 * The element's script is kept as imperative DOM inside <ToastHost/>, and
 * toast() reaches it through a module-level hook.
 */

export interface ToastOptions {
  /** "error" draws a red mark with "!" and stays longer. */
  tone?: "ok" | "error";
  /** Milliseconds before it closes by itself. */
  life?: number;
  action?: {
    label: string;
    /** Shown in place of the message once the action ran. */
    doneText: string;
    run: () => void;
  };
}

interface ToastRequest extends ToastOptions {
  text: string;
}

let show: ((req: ToastRequest) => void) | null = null;
/** Requests made before the host mounted (or between StrictMode remounts). */
const pending: ToastRequest[] = [];

export function toast(text: string, options: ToastOptions = {}): void {
  const req = { ...options, text };
  if (show) show(req);
  else pending.push(req);
}

const H = 56;
const GAP = 8;
const LIFE = 4500;
const ERROR_LIFE = 7000;
const MAX = 3;
const CLOSE_LABEL = "알림 닫기";

const OK_ICON = '<svg viewBox="0 0 24 24"><path d="m6 12.5 4 4 8-9"/></svg>';
const ERROR_ICON = '<svg viewBox="0 0 24 24"><path d="M12 6.5v7M12 17.5v.01"/></svg>';
const BACK_ICON =
  '<svg viewBox="0 0 24 24"><path d="M9 14 4.5 9.5 9 5"/><path d="M4.5 9.5h9a5.5 5.5 0 0 1 0 11H11"/></svg>';
const CLOSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

interface Toast {
  el: HTMLDivElement;
  gone?: boolean;
  undone?: boolean;
  tm?: ReturnType<typeof setTimeout>;
  t0: number;
  left: number;
  dx?: number;
  v?: number;
}

export function ToastHost() {
  const rootRef = useRef<HTMLDivElement>(null);
  const rgRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const rg = rgRef.current;
    if (!root || !rg) return;
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const toasts: Toast[] = [];
    let open = false;
    let paused = false;
    let leaveT: ReturnType<typeof setTimeout> | undefined;

    const liveToasts = () => toasts.filter((t) => !t.gone);

    // Every toast's place: collapsed they shrink back like a card pile, open they stand in a column
    function layout() {
      const live = liveToasts();
      const n = live.length;
      live.forEach((t, k) => {
        const i = n - 1 - k;
        const y = open ? -i * (H + GAP) : -i * 11;
        const s = open ? 1 : 1 - i * 0.055;
        t.el.style.setProperty("--y", `${y}px`);
        t.el.style.setProperty("--s", s.toFixed(3));
        t.el.style.setProperty("--o", i < MAX ? "1" : "0");
        t.el.style.zIndex = String(20 - i);
        t.el.classList.toggle("is-back", !open && i > 0);
      });
      rg!.style.height = `${open && n > 1 ? n * H + (n - 1) * GAP : H + 20}px`;
      rg!.classList.toggle("has-toasts", n > 0);
    }
    function timer(t: Toast) {
      clearTimeout(t.tm);
      t.t0 = Date.now();
      if (!paused) t.tm = setTimeout(() => dismiss(t), t.left);
    }
    function bar(t: Toast, ms: number) {
      const pb = t.el.querySelector(".u435-pb")!;
      pb.innerHTML = `<i style="animation-duration:${ms}ms"></i>`;
      t.left = ms;
      timer(t);
    }
    function make(req: ToastRequest, animate: boolean) {
      const error = req.tone === "error";
      const el = document.createElement("div");
      el.className = error ? "u435-t is-error" : "u435-t";
      el.setAttribute("role", error ? "alert" : "status");
      el.innerHTML =
        `<span class="u435-ic" aria-hidden="true"><span class="ok">${error ? ERROR_ICON : OK_ICON}</span><span class="bk">${BACK_ICON}</span></span>` +
        `<span class="u435-tx"><b></b><b aria-hidden="true"></b></span><button type="button" class="u435-un"></button><button type="button" class="u435-x">${CLOSE_ICON}</button><span class="u435-pb" aria-hidden="true"></span>`;
      const bs = el.querySelectorAll<HTMLElement>(".u435-tx b");
      const un = el.querySelector<HTMLButtonElement>(".u435-un")!;
      const x = el.querySelector<HTMLButtonElement>(".u435-x")!;
      bs[0].textContent = req.text;
      bs[0].title = req.text;
      bs[1].textContent = req.action?.doneText ?? "";
      if (req.action) un.textContent = req.action.label;
      else un.hidden = true;
      x.setAttribute("aria-label", CLOSE_LABEL);
      const t: Toast = { el, t0: Date.now(), left: 0 };
      x.addEventListener("click", () => dismiss(t));
      // The action: the same toast changes to its done text and closes a little later
      un.addEventListener("click", () => {
        if (t.undone || !req.action) return;
        t.undone = true;
        req.action.run();
        el.classList.add("is-undo");
        bs[0].setAttribute("aria-hidden", "true");
        bs[1].removeAttribute("aria-hidden");
        x.focus({ preventScroll: true });
        bar(t, 2000);
      });
      swipe(t);
      toasts.push(t);
      if (animate && !rm) {
        el.classList.add("is-in");
        el.style.setProperty("--y", "84px");
        el.style.setProperty("--s", ".9");
        el.style.setProperty("--o", "0");
        el.style.transition = "none";
        rg!.appendChild(el);
        void el.offsetWidth;
        el.style.transition = "";
      } else rg!.appendChild(el);
      bar(t, req.life ?? (error ? ERROR_LIFE : LIFE));
      const live = liveToasts();
      if (live.length > MAX) dismiss(live[0], 0, true);
      layout();
    }
    // Closing: a swiped toast flies off at the swipe's speed, otherwise it sinks and fades
    function dismiss(t: Toast, dir = 0, quiet = false) {
      if (t.gone) return;
      t.gone = true;
      clearTimeout(t.tm);
      const el = t.el;
      if (el.contains(document.activeElement)) {
        const other = liveToasts().pop();
        if (other) other.el.querySelector<HTMLElement>(".u435-x")!.focus({ preventScroll: true });
        else (document.activeElement as HTMLElement | null)?.blur();
      }
      el.style.pointerEvents = "none";
      const done = () => {
        el.remove();
        const i = toasts.indexOf(t);
        if (i >= 0) toasts.splice(i, 1);
      };
      layout();
      if (rm || !el.animate) {
        done();
        return;
      }
      const y = el.style.getPropertyValue("--y") || "0px";
      const s = Number(el.style.getPropertyValue("--s") || "1");
      if (dir) {
        const v = Math.max(1.2, Math.abs(t.v ?? 0));
        const dist = 380;
        const dur = Math.max(160, Math.min(320, dist / v));
        el.classList.add("is-drag");
        el.animate(
          [
            { transform: `translate3d(${t.dx ?? 0}px,${y},0) scale(${s})`, opacity: 1 },
            {
              transform: `translate3d(${dir * dist}px,${y},0) scale(${s}) rotate(${dir * 6}deg)`,
              opacity: 0,
            },
          ],
          { duration: dur, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" },
        ).onfinish = done;
      } else {
        el.animate(
          [
            { opacity: quiet ? 0 : 1 },
            { transform: `translate3d(0,calc(${y} + 14px),0) scale(${s * 0.94})`, opacity: 0 },
          ],
          { duration: 260, easing: "cubic-bezier(.4,0,.6,1)", fill: "forwards" },
        ).onfinish = done;
      }
    }
    // Swipe to close: the last moves' speed decides, a fast or far enough swipe throws it away
    function swipe(t: Toast) {
      const el = t.el;
      let on = false;
      let x0 = 0;
      let last: Array<[number, number]> = [];
      el.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || (e.target as Element).closest("button") || t.gone) return;
        on = true;
        x0 = e.clientX;
        t.dx = 0;
        t.v = 0;
        last = [[e.clientX, e.timeStamp]];
        el.classList.add("is-drag");
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* capture is only a nicety */
        }
      });
      el.addEventListener("pointermove", (e) => {
        if (!on) return;
        t.dx = e.clientX - x0;
        last.push([e.clientX, e.timeStamp]);
        if (last.length > 5) last.shift();
        el.style.setProperty("--x", `${t.dx.toFixed(1)}px`);
        el.style.opacity = String(Math.max(0.35, 1 - Math.abs(t.dx) / 320));
      });
      const end = () => {
        if (!on) return;
        on = false;
        const a = last[0];
        const b = last[last.length - 1];
        t.v = b && a && b[1] > a[1] ? (b[0] - a[0]) / (b[1] - a[1]) : 0;
        el.style.opacity = "";
        const dx = t.dx ?? 0;
        if (Math.abs(dx) > 80 || Math.abs(t.v) > 0.6) {
          dismiss(t, (Math.abs(t.v) > 0.6 ? t.v : dx) > 0 ? 1 : -1);
          return;
        }
        el.classList.remove("is-drag");
        el.style.setProperty("--x", "0px");
        t.dx = 0;
      };
      el.addEventListener("pointerup", end);
      el.addEventListener("pointercancel", end);
    }
    // Hover or focus fans the stack out and stops the clocks
    function setOpen(v: boolean) {
      if (open === v) return;
      open = v;
      paused = v;
      rg!.classList.toggle("is-paused", v);
      toasts.forEach((t) => {
        if (t.gone) return;
        if (v) {
          clearTimeout(t.tm);
          t.left = Math.max(500, t.left - (Date.now() - t.t0));
        } else timer(t);
      });
      layout();
    }
    const onEnter = () => {
      clearTimeout(leaveT);
      setOpen(true);
    };
    const onLeave = () => {
      clearTimeout(leaveT);
      leaveT = setTimeout(() => {
        if (!rg.contains(document.activeElement)) setOpen(false);
      }, 120);
    };
    const onFocusIn = () => setOpen(true);
    const onFocusOut = (e: FocusEvent) => {
      if (!rg.contains(e.relatedTarget as Node | null)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = (e.target as Element).closest(".u435-t");
      const t = toasts.find((x) => x.el === el);
      if (t && !t.gone) {
        e.preventDefault();
        e.stopPropagation();
        dismiss(t);
      }
    };
    rg.addEventListener("pointerenter", onEnter);
    rg.addEventListener("pointerleave", onLeave);
    rg.addEventListener("focusin", onFocusIn);
    rg.addEventListener("focusout", onFocusOut);
    rg.addEventListener("keydown", onKey);

    show = (req) => make(req, true);
    pending.splice(0).forEach((req) => make(req, false));
    layout();

    return () => {
      show = null;
      clearTimeout(leaveT);
      toasts.forEach((t) => clearTimeout(t.tm));
      toasts.length = 0;
      rg.replaceChildren();
      rg.classList.remove("has-toasts", "is-paused");
      rg.removeEventListener("pointerenter", onEnter);
      rg.removeEventListener("pointerleave", onLeave);
      rg.removeEventListener("focusin", onFocusIn);
      rg.removeEventListener("focusout", onFocusOut);
      rg.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div ref={rootRef} className="ux u435">
      <section ref={rgRef} className="u435-rg" aria-label="알림" />
    </div>
  );
}
