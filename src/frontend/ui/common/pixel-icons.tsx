// 16x16 pixel icons for the toolbar and panel headers. Every icon is laid out on
// one 16px grid from the camp palette and wrapped in one dark outline, so they
// read as part of the camp art instead of a stock icon font.

import { PixelCanvas, toDataURL } from "pixlrt/core";

type Ink = keyof typeof inks;

const inks = {
  o: "#33241c",
  w: "#fff8e8",
  c: "#ecdcb6",
  s: "#cdb891",
  p: "#dcd2b8",
  y: "#c79c66",
  E: "#f8e4be",
  l: "#ffe6a0",
  f: "#ff8a3c",
  F: "#ffbe5c",
  C: "#fff0b4",
  e: "#6a9a4e",
  S: "#a9c7ec",
  U: "#82a3c9",
  L: "#d8b0d4",
  V: "#b08aae",
  W: "#f9eef8",
  m: "#c2cbd0",
  M: "#8f9aa2",
  n: "#6f7a80",
};

const SIZE = 16;

class Grid {
  readonly cells: (Ink | null)[][] = Array.from({ length: SIZE }, () =>
    Array<Ink | null>(SIZE).fill(null),
  );

  span(y: number, x0: number, x1: number, ink: Ink) {
    for (let x = x0; x <= x1; x += 1) this.cells[y][x] = ink;
    return this;
  }

  put(x: number, y: number, ink: Ink) {
    this.cells[y][x] = ink;
    return this;
  }

  rows(rows: [number, string][]) {
    for (const [y, row] of rows)
      [...row].forEach((token, x) => {
        if (token !== ".") this.cells[y][x] = token as Ink;
      });
    return this;
  }

  // Thin line art must not be wrapped, or a 1px stroke turns into solid ink.
  inked() {
    const out: (Ink | null)[][] = Array.from({ length: SIZE }, () =>
      Array<Ink | null>(SIZE).fill(null),
    );
    for (let y = 0; y < SIZE; y += 1)
      for (let x = 0; x < SIZE; x += 1) {
        if (!this.cells[y][x]) continue;
        for (const [ox, oy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
          out[ny][nx] = out[ny][nx] ?? "o";
        }
      }
    for (let y = 0; y < SIZE; y += 1)
      for (let x = 0; x < SIZE; x += 1)
        if (this.cells[y][x]) out[y][x] = this.cells[y][x];
    return out;
  }

  raw() {
    return this.cells;
  }
}

const chat = new Grid()
  .span(4, 4, 11, "w")
  .span(5, 3, 12, "w")
  .span(6, 3, 12, "w")
  .span(7, 3, 12, "w")
  .span(8, 3, 12, "s")
  .span(9, 4, 6, "w")
  .span(10, 4, 5, "w")
  .span(6, 6, 9, "p")
  .span(7, 6, 8, "p")
  .inked();

const log = new Grid()
  .rows([
    [2, "..ooooooooooo..."],
    [3, "..owwwwwwwwwo..."],
    [4, "..owssssssswo..."],
    [5, "..owwwwwwwwwo..."],
    [6, "..owssssssswo..."],
    [7, "..owwwwwwwwwo..."],
    [8, "..owsssssswwo..."],
    [9, "..owwwwwwwwwo..."],
    [10, "..owssssssswo..."],
    [11, "..owwwwwwwwwo..."],
    [12, "..ooooooooooo..."],
  ])
  .raw();

const book = new Grid();
for (let y = 3; y <= 11; y += 1) {
  book.put(2, y, "U").put(3, y, "U").put(4, y, "n");
  book.span(y, 5, 10, "S").span(y, 11, 12, "p");
}
book
  .span(4, 11, 12, "w")
  .span(5, 11, 12, "w")
  .put(7, 6, "W")
  .put(8, 6, "W")
  .put(7, 7, "W")
  .put(8, 7, "W");
const bookIcon = book.inked();

const gem = new Grid()
  .span(3, 5, 10, "W")
  .span(3, 9, 10, "L")
  .span(4, 4, 11, "W")
  .span(4, 8, 11, "L")
  .span(5, 3, 12, "W")
  .span(5, 6, 12, "L")
  .span(6, 2, 13, "L")
  .span(6, 3, 5, "W")
  .span(7, 2, 13, "L")
  .span(7, 11, 13, "V")
  .span(8, 3, 12, "L")
  .span(8, 10, 12, "V")
  .span(9, 4, 11, "L")
  .span(9, 9, 11, "V")
  .span(10, 5, 10, "L")
  .span(10, 8, 10, "V")
  .span(11, 6, 9, "L")
  .span(12, 7, 8, "V")
  .inked();

const flow = new Grid()
  .rows([
    [2, "...oo......oo..."],
    [3, "...ooo....ooo..."],
    [4, "....oo....oo...."],
    [5, ".....oo..oo....."],
    [6, ".....oo..oo....."],
    [7, "......oooo......"],
    [8, "......oooo......"],
    [9, ".......oo......."],
    [10, ".......oo......."],
    [11, ".......oo......."],
  ])
  .raw();

const bell = new Grid()
  .span(2, 7, 8, "M")
  .span(3, 7, 8, "l")
  .span(4, 6, 9, "l")
  .span(5, 6, 9, "l")
  .span(6, 5, 10, "l")
  .span(7, 5, 10, "l")
  .span(8, 4, 11, "l")
  .span(9, 4, 11, "l")
  .span(10, 4, 11, "l")
  .span(11, 2, 13, "M")
  .span(12, 7, 8, "M")
  .span(4, 6, 7, "E")
  .span(5, 6, 7, "E")
  .span(6, 5, 7, "E")
  .span(7, 5, 7, "E")
  .inked();

const pulse = new Grid();
for (let y = 3; y <= 13; y += 1) pulse.span(y, 4, 11, "w");
pulse
  .span(2, 6, 9, "M")
  .span(3, 6, 9, "M")
  .span(5, 5, 10, "p")
  .span(7, 5, 8, "p")
  .span(9, 5, 8, "p")
  .span(11, 5, 6, "e")
  .put(7, 12, "e")
  .put(7, 11, "e")
  .put(8, 11, "e")
  .put(8, 12, "e")
  .put(9, 10, "e")
  .put(9, 11, "e")
  .put(10, 9, "e")
  .put(10, 10, "e");
const pulseIcon = pulse.inked();

const fire = new Grid()
  .span(2, 8, 8, "f")
  .span(3, 7, 8, "f")
  .put(8, 3, "F")
  .span(4, 6, 8, "f")
  .put(7, 4, "F")
  .span(5, 5, 9, "f")
  .span(5, 6, 7, "F")
  .span(6, 4, 9, "f")
  .span(6, 5, 8, "F")
  .span(7, 3, 10, "f")
  .span(7, 4, 6, "C")
  .span(7, 7, 9, "F")
  .span(8, 3, 11, "f")
  .span(8, 4, 6, "C")
  .span(8, 7, 9, "F")
  .span(9, 2, 11, "f")
  .span(9, 3, 5, "C")
  .span(9, 6, 8, "F")
  .span(10, 2, 11, "f")
  .span(10, 4, 7, "F")
  .span(11, 2, 11, "f")
  .span(11, 3, 10, "F")
  .span(12, 3, 10, "f")
  .span(12, 4, 9, "F")
  .inked();

// An eight-tooth cog needs a radius rule; placed pixels turn to mush at 16px.
const menu = new Grid();
for (let y = 0; y < SIZE; y += 1)
  for (let x = 0; x < SIZE; x += 1) {
    const dx = x - 7.5;
    const dy = y - 7.5;
    const radius = Math.hypot(dx, dy);
    const tooth = Math.abs(Math.cos(Math.atan2(dy, dx) * 4)) > 0.55;
    if (radius <= 4.3) menu.put(x, y, "m");
    else if (radius <= 6.3 && tooth) menu.put(x, y, "M");
  }
for (let y = 6; y <= 9; y += 1)
  for (let x = 6; x <= 9; x += 1) menu.cells[y][x] = null;
const menuIcon = menu.inked();

const grids = {
  chat,
  log,
  book: bookIcon,
  gem,
  flow,
  bell,
  menu: menuIcon,
  fire,
  pulse: pulseIcon,
};

export type PixelIconName = keyof typeof grids;

function toUrl(cells: (Ink | null)[][]) {
  const canvas = new PixelCanvas(SIZE, SIZE);
  cells.forEach((row, y) =>
    row.forEach((ink, x) => {
      if (!ink) return;
      const hex = inks[ink].replace("#", "");
      canvas.setPixel(x, y, [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
        255,
      ]);
    }),
  );
  return toDataURL(canvas);
}

const urls = new Map<PixelIconName, string>();

function url(name: PixelIconName) {
  const cached = urls.get(name);
  if (cached) return cached;
  const built = toUrl(grids[name]);
  urls.set(name, built);
  return built;
}

// Sizes stay on whole multiples of 16 so no icon pixel lands on a half edge.
export function PixelIcon({
  name,
  size = 16,
}: {
  name: PixelIconName;
  size?: 16 | 32;
}) {
  return (
    <img
      className="pixel-icon"
      src={url(name)}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
