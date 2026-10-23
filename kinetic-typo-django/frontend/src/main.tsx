import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { StudioShell } from "@/components/editor/studio-shell";

function App() {
  return (
    <>
      <header className="border-b border-zinc-800 px-4 py-3 md:px-6">
        <h1 className="text-base font-semibold text-zinc-100">Kinetic Typo Studio</h1>
        <p className="text-xs text-zinc-500">
          음원과 가사로 타이포그라피 영상 만들기. 모든 파일은 이 브라우저 안에서만 처리됩니다.
        </p>
      </header>
      <StudioShell />
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
