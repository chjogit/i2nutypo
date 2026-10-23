import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BeginnerShell } from "@/components/editor/beginner-shell";
import { StudioShell } from "@/components/editor/studio-shell";
import { MODE, MODE_LABEL, MODE_PATH, STUDIO_MODES } from "@/lib/mode/mode";

const MODE_HINT = {
  beginner: "순서대로 따라 하면 영상이 완성됩니다.",
  basic: "테마·요소와 모든 조정 기능, 영상·자막 저장을 쓸 수 있습니다.",
  pro: "모든 기능을 쓸 수 있습니다.",
} as const;

function App() {
  return (
    <>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-800 px-4 py-3 md:px-6">
        <a
          href="/"
          className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-indigo-500 hover:text-zinc-100"
        >
          ← 처음으로
        </a>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold text-zinc-100">
            Kinetic Typo Studio
            <span className="ml-2 rounded-full bg-indigo-600/20 px-2 py-0.5 align-middle text-xs font-semibold text-indigo-200">
              {MODE_LABEL[MODE]}
            </span>
          </h1>
          <p className="text-xs text-zinc-500">
            {MODE_HINT[MODE]} 모든 파일은 이 브라우저 안에서만 처리됩니다.
          </p>
        </div>
        <nav aria-label="단계 바꾸기" className="flex rounded-md border border-zinc-800 text-xs">
          {STUDIO_MODES.map((m) => (
            <a
              key={m}
              href={MODE_PATH[m]}
              aria-current={m === MODE ? "page" : undefined}
              className={`px-3 py-1 ${m === MODE ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-100"}`}
            >
              {MODE_LABEL[m]}
            </a>
          ))}
        </nav>
      </header>
      {MODE === "beginner" ? <BeginnerShell /> : <StudioShell />}
    </>
  );
}

const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
