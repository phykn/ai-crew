// 환경 진단 결과를 한 줄 배너로 보여 준다. 점검마다 초록·빨강 닷을 두고, 마우스를
// 올리면 그 점검이 실제로 확인한 내용을 보여 준다.

import type { DiagnosticCheck, DiagnosticsReport } from "../../server/diagnostics/run";
import { Icon } from "../common/ui";

const shortLabels: Record<DiagnosticCheck["id"], string> = {
  git: "Git",
  codex: "Codex",
  "local-model": "모델",
  mcp: "MCP",
};

type DiagnosticsBannerProps = {
  report: DiagnosticsReport;
  running: boolean;
  rerun: () => void;
  close: () => void;
};

export function DiagnosticsBanner({
  report,
  running,
  rerun,
  close,
}: DiagnosticsBannerProps) {
  const failed = report.checks.filter(({ ok }) => !ok).length;
  return (
    <section className="diagnostics" aria-label="환경 진단 결과">
      <span className={"diagnostics-state " + (failed ? "warn" : "ok")}>
        {failed ? "확인 필요 " + failed + "건" : "환경 정상"}
      </span>
      <ul className="diagnostics-checks">
        {report.checks.map((check, index) => (
          <li
            key={check.id + ":" + index}
            className={check.ok ? "ok" : "bad"}
            title={check.label + " · " + check.detail}
          >
            <i aria-hidden="true" />
            {shortLabels[check.id] ?? check.label}
            <span className="visually-hidden">
              {check.ok ? " 정상" : " 실패: " + check.detail}
            </span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="icon-button"
        aria-label="진단 다시 실행"
        title="진단 다시 실행"
        disabled={running}
        onClick={rerun}
      >
        <Icon name="refresh" />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="진단 결과 닫기"
        title="닫기"
        onClick={close}
      >
        <Icon name="close" />
      </button>
    </section>
  );
}
