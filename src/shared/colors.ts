/**
 * Minimal ANSI color helpers so the reporter doesn't need a chalk/picocolors
 * dependency. Colors are skipped when stdout isn't a TTY or NO_COLOR is set.
 */
const ESC = String.fromCharCode(27);

const enabled =
  typeof process !== "undefined" &&
  !!process.stdout &&
  process.stdout.isTTY === true &&
  !process.env.NO_COLOR;

function wrap(code: number): (text: string) => string {
  return (text: string) => (enabled ? ESC + "[" + code + "m" + text + ESC + "[0m" : text);
}

export const colors = {
  bold: wrap(1),
  dim: wrap(2),
  red: wrap(31),
  green: wrap(32),
  yellow: wrap(33),
  blue: wrap(34),
  magenta: wrap(35),
  cyan: wrap(36),
  gray: wrap(90),
};
