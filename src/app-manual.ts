// 앱 사용법 매뉴얼을 비서의 지침에 넣기 위해 읽는다. 대화를 시작할 때마다 파일을 다시
// 읽으므로, 매뉴얼을 고치면 앱을 다시 만들지 않아도 다음 대화부터 반영된다.
// 패키징한 앱에는 저장소 파일이 함께 들어가지 않으므로, 빌드할 때 넣은 본문을 마지막
// 후보로 쓴다.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import bundled from "../docs/APP_MANUAL.md?raw";

export const APP_MANUAL_PATH = join("docs", "APP_MANUAL.md");

/** 빌드 시점에 번들에 들어간 매뉴얼 본문. 패키징한 앱에서 쓰는 마지막 사본이다. */
export const bundledAppManual = String(bundled).trim();

/**
 * 후보 폴더를 차례로 보며 매뉴얼 본문을 찾는다. 없으면 null.
 * 읽는 함수와 폴더 목록을 바꿔 끼울 수 있어 시험에서 실제 파일 없이 확인한다.
 */
export function loadAppManual(
  roots: string[],
  read: (path: string) => string = (path) => readFileSync(path, "utf8"),
): string | null {
  for (const root of roots) {
    try {
      const text = read(join(root, APP_MANUAL_PATH)).trim();
      if (text) return text;
    } catch {
      // 다음 후보 폴더를 본다.
    }
  }
  return null;
}

/** 지금 있는 매뉴얼. 저장소 파일을 먼저 보고, 없으면 빌드에 넣은 본문을 쓴다. */
export function resolveAppManual(roots: string[]): string {
  return loadAppManual(roots) ?? bundledAppManual;
}
