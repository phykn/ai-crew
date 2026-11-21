// 스타일 감시자의 입구. 파일이 바뀔 때마다(커밋이 아니라 저장 시점) 확인을 큐에 넣고,
// 연속으로 들어온 변경은 한 번으로 합쳐 넘긴다. 이번 범위에서는 운영체제 워처를 새로
// 띄우지 않는다. 파일을 바꾼 코드가 `noteChange`를 부르면 되는 지점만 만든다.

import { ReloadDefer } from "./engine-fence";

export type StyleChange = {
  projectId: string;
  sessionId: string | null;
  paths: string[];
};

export class StyleWatch {
  private pending = new Set<string>();
  private context: Omit<StyleChange, "paths"> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private defer = new ReloadDefer();
  private closed = false;

  constructor(
    private check: (change: StyleChange) => void,
    private debounceMs = 300,
  ) {}

  /** 파일 변경 알림. 저장이 이어져도 검사는 변경 묶음 한 번으로 돈다. */
  noteChange(change: StyleChange) {
    if (this.closed || !change.paths.length) return;
    this.context = {
      projectId: change.projectId,
      sessionId: change.sessionId,
    };
    for (const path of change.paths) this.pending.add(path);
    // 검사가 도는 중에 들어온 변경은 끝난 뒤 한 번 더 확인한다.
    if (this.defer.busy) {
      this.defer.request();
      return;
    }
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.debounceMs);
  }

  /** 모아 둔 변경을 한 번에 넘긴다. 검사 중에 들어온 변경은 끝난 뒤 다시 돈다. */
  flush() {
    if (this.closed || !this.pending.size || !this.context) return;
    const change: StyleChange = {
      ...this.context,
      paths: [...this.pending],
    };
    this.pending.clear();
    const done = this.defer.enter();
    try {
      this.check(change);
    } finally {
      done();
      if (this.defer.take()) this.flush();
    }
  }

  close() {
    this.closed = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.pending.clear();
  }
}
