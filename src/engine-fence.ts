// 실행 펜스: 멈춘 실행이 뒤늦게 상태를 덮어쓰지 않게 하고, 같은 경로를 쓰는
// 실행이 겹치지 않게 하고, 실행 중에 온 갱신 요청을 마무리 뒤로 미룬다.

import { resolve, sep } from "node:path";

/**
 * 응답이나 업무의 세대를 기록한다. `stop`은 세대를 올려, 멈추기 전에 시작한
 * 스트림 청크와 완료 콜백이 지난 세대임을 알 수 있게 한다.
 */
export class StopFence {
  private generations = new Map<string, number>();

  /** 새 실행을 시작하고 그 세대를 돌려준다. */
  begin(id: string) {
    const generation = (this.generations.get(id) ?? 0) + 1;
    this.generations.set(id, generation);
    return generation;
  }

  /** 중단을 기록한다. 이전 세대는 모두 지난 세대가 된다. */
  stop(id: string) {
    return this.begin(id);
  }

  /** 이 세대가 아직 최신인지. false면 뒤늦게 도착한 결과이므로 버린다. */
  isStale(id: string, generation: number) {
    const current = this.generations.get(id);
    return current === undefined ? false : current !== generation;
  }

  /** 끝난 실행의 기록을 지운다. */
  forget(id: string) {
    this.generations.delete(id);
  }
}

/** 경로를 비교할 수 있는 형태로 바꾼다. 업무 예약 경로와 같은 규칙을 쓴다. */
export function normalizeDirectory(path: string) {
  return resolve(path).normalize("NFC").toLowerCase();
}

function overlaps(left: string, right: string) {
  return (
    left === right ||
    left.startsWith(right + sep) ||
    right.startsWith(left + sep)
  );
}

/**
 * 실행이 잡고 있는 폴더를 추적한다. 같은 폴더(또는 그 하위 폴더)를 쓰는 두 실행이
 * 겹치면 누가 먼저 잡았는지 알려 준다.
 */
export class DirectoryFence {
  private held = new Map<string, string[]>();

  hold(owner: string, directories: string[]) {
    this.held.set(owner, directories.map(normalizeDirectory));
  }

  release(owner: string) {
    this.held.delete(owner);
  }

  /** 이 경로들을 잡고 있는 다른 실행. 없으면 null. */
  conflict(directories: string[], except?: string) {
    const paths = directories.map(normalizeDirectory);
    for (const [owner, held] of this.held) {
      if (owner === except) continue;
      if (held.some((other) => paths.some((path) => overlaps(path, other))))
        return owner;
    }
    return null;
  }

  active() {
    return [...this.held.keys()];
  }
}

/**
 * 실행 중에 들어온 갱신 요청을 모아 둔다. 실행이 끝난 뒤 `take()`가 한 번만
 * true를 돌려주므로, 같은 갱신을 여러 번 실행하지 않는다.
 */
export class ReloadDefer {
  private active = 0;
  private pending = false;

  /** 실행 구간을 연다. 돌려받은 함수를 부르면 구간이 닫힌다. */
  enter() {
    this.active += 1;
    let closed = false;
    return () => {
      if (closed) return;
      closed = true;
      this.active = Math.max(0, this.active - 1);
    };
  }

  get busy() {
    return this.active > 0;
  }

  get waiting() {
    return this.pending;
  }

  /** 지금 할 수 있으면 false, 실행 중이라 미뤘으면 true. */
  request() {
    if (!this.active) return false;
    this.pending = true;
    return true;
  }

  /** 미뤄 둔 갱신이 있으면 꺼내 간다. */
  take() {
    if (!this.pending) return false;
    this.pending = false;
    return true;
  }
}
