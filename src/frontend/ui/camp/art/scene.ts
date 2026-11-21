// The camp art the rest of the app draws: one painted clearing, the crew sprite
// strips, the low log bench and the flicker frames of the fire. Every file is cut
// to the background's own pixel grid, so a crew member and the ground share one
// pixel size at any window size.

import benchUrl from "./bench.webp?url";
import campBgUrl from "./camp-bg.webp?url";
import crew0 from "./crew-0.webp?url";
import crew1 from "./crew-1.webp?url";
import crew2 from "./crew-2.webp?url";
import crew3 from "./crew-3.webp?url";
import crew4 from "./crew-4.webp?url";
import crew5 from "./crew-5.webp?url";
import crew6 from "./crew-6.webp?url";
import crew7 from "./crew-7.webp?url";
import crew8 from "./crew-8.webp?url";
import fireUrl from "./fire.webp?url";
import portrait0 from "./portrait-0.webp?url";
import portrait1 from "./portrait-1.webp?url";
import portrait2 from "./portrait-2.webp?url";
import portrait3 from "./portrait-3.webp?url";
import portrait4 from "./portrait-4.webp?url";
import portrait5 from "./portrait-5.webp?url";
import portrait6 from "./portrait-6.webp?url";
import portrait7 from "./portrait-7.webp?url";
import portrait8 from "./portrait-8.webp?url";

/** The painted clearing in its native pixels; percent camp coordinates map onto it. */
export const campBackground = { url: campBgUrl, width: 1040, height: 1003 };

/** One crew frame: 140 wide, 108 tall, feet on the bottom edge. */
export const crewArt = {
  cellWidth: 140,
  cellHeight: 108,
  height: 108,
  sheets: [crew0, crew1, crew2, crew3, crew4, crew5, crew6, crew7, crew8],
};

/** Head-and-shoulders cuts for name plates and the chat status row. */
export const crewPortraits = [
  portrait0, portrait1, portrait2, portrait3, portrait4,
  portrait5, portrait6, portrait7, portrait8,
];

export const benchArt = { url: benchUrl, width: 172, height: 60 };
export const fireArt = { url: fireUrl, cellWidth: 118, cellHeight: 118, frames: 4 };

export type CrewPose = "stand" | "walkA" | "walkB" | "sit" | "work";

/** Column of each pose inside a strip. */
export const crewColumns: Record<CrewPose, number> = {
  stand: 0,
  walkA: 1,
  walkB: 2,
  sit: 3,
  work: 4,
};

export const crewAnimations = {
  stand: ["stand"],
  walk: ["walkA", "walkB"],
  sit: ["sit"],
  work: ["work"],
  watch: ["stand"],
  handoff: ["stand"],
} as const satisfies Record<string, readonly CrewPose[]>;

export type ObjectKind = "campfire" | "bench";
