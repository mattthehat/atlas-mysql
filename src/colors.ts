/**
 * Minimal zero-dependency ANSI styling for console output.
 *
 * Replaces the previous `chalk` runtime dependency. Colour is enabled only when it
 * makes sense (a TTY, or an explicit `FORCE_COLOR`) and is disabled when `NO_COLOR`
 * is set (https://no-color.org) or output is not a terminal.
 */
const colorEnabled: boolean = (() => {
  if (process.env.NO_COLOR !== undefined) return false;
  if (process.env.FORCE_COLOR !== undefined) return process.env.FORCE_COLOR !== '0';
  return Boolean(process.stdout && process.stdout.isTTY);
})();

const wrap =
  (open: number, close: number) =>
  (text: string): string =>
    colorEnabled ? `\x1b[${open}m${text}\x1b[${close}m` : text;

/**
 * Colour helpers with a chalk-compatible call signature (`colors.red('text')`).
 */
export const colors = {
  gray: wrap(90, 39),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
};

/** Whether ANSI colour output is currently enabled. */
export const isColorEnabled = (): boolean => colorEnabled;
