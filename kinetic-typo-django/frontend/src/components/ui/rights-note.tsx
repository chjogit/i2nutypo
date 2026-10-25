import { Tip } from "./tip";

/** One line under an upload: only material the user has the rights to, with the licences page linked. */
export function RightsNote({ what = "음원·가사·그림" }: { what?: string }) {
  return (
    <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
      권리가 있는 {what}만 써 주세요
      <Tip>
        직접 만들었거나 사용 허락을 받은 소재만 올려 주세요. 만든 영상을 공개할 때는 음원·가사의 저작권을 확인하세요.
        올린 파일은 이 브라우저 안에서만 쓰이고 서버로 보내지지 않습니다.{" "}
        <a href="/licenses/" target="_blank" rel="noopener" className="text-indigo-300 underline">
          오픈소스·라이선스
        </a>
      </Tip>
    </p>
  );
}
