import { useState } from "react";
import { savedPart, useProjectStore } from "@/store/project-store";
import { Tip } from "@/components/ui/tip";

const FILE_KIND = "kinetic-typo-project";

/** Base name for the file: the cover title, else the song's file name. */
function fileBase(): string {
  const { style, audio } = useProjectStore.getState();
  const fromAudio = audio.kind === "upload" ? audio.fileName.replace(/\.[^.]+$/, "") : "";
  const name = (style.coverTitle || fromAudio || "kinetic-typo").trim();
  return name.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80) || "kinetic-typo";
}

/**
 * Saves the lyrics, times and every setting as a JSON file, and opens one
 * again, to move a project to another browser or keep versions. The song,
 * background and illustrations are not in the file and are picked again.
 */
export function ProjectFile() {
  const importProject = useProjectStore((s) => s.importProject);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const save = () => {
    const data = {
      kind: FILE_KIND,
      version: 1,
      savedAt: new Date().toISOString(),
      project: savedPart(useProjectStore.getState()),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileBase()}.ktproj.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage({ ok: true, text: "프로젝트 파일을 저장했습니다." });
  };

  const open = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as { kind?: unknown; project?: unknown };
      if (data.kind !== FILE_KIND || !data.project || typeof data.project !== "object")
        throw new Error("이 앱에서 저장한 프로젝트 파일이 아닙니다.");
      importProject(data.project);
      setMessage({ ok: true, text: `${file.name}을 불러왔습니다. 음원과 그림은 다시 골라 주세요.` });
    } catch (e) {
      setMessage({
        ok: false,
        text: e instanceof SyntaxError ? "JSON 파일을 읽지 못했습니다." : String((e as Error).message),
      });
    }
  };

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-zinc-200">프로젝트 파일</h3>
      <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
        설정 전체를 JSON으로 · 음원·그림 제외
        <Tip>
          가사, 싱크, 테마, 테마 구간과 모든 설정을 JSON 파일로 저장하고 다시 엽니다. 음원과 그림은 파일에
          들어가지 않습니다.
        </Tip>
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={save}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:border-indigo-500"
        >
          JSON으로 저장
        </button>
        <label className="cursor-pointer rounded-md border border-zinc-700 px-3 py-1.5 text-center text-xs text-zinc-200 hover:border-indigo-500">
          JSON 열기
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void open(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {message && (
        <p className={`text-xs ${message.ok ? "text-emerald-400" : "text-red-400"}`}>{message.text}</p>
      )}
    </div>
  );
}
