const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  white: '\x1b[37m',
};

const useColor = !process.env.NO_COLOR;

function paint(color, text) {
  return useColor ? `${color}${text}${ANSI.reset}` : String(text);
}

function stamp() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function line(color, tag, msg) {
  const time = paint(ANSI.gray, stamp());
  const label = paint(color, tag);
  console.log(`${time} ${label} ${msg}`);
}

function formatError(err) {
  if (!err) return '';
  if (err instanceof Error) {
    return err.stack ? `\n${paint(ANSI.gray, err.stack)}` : `\n${err.message}`;
  }
  return `\n${paint(ANSI.gray, String(err))}`;
}

export const logger = {
  banner(title) {
    const bar = '═'.repeat(Math.max(12, String(title).length + 4));
    console.log('');
    console.log(paint(ANSI.magenta, bar));
    console.log(paint(ANSI.bold + ANSI.magenta, `  ${title}`));
    console.log(paint(ANSI.magenta, bar));
    console.log('');
  },

  step(msg) {
    line(ANSI.cyan, '▸', msg);
  },

  info(msg) {
    line(ANSI.blue, 'ℹ', msg);
  },

  success(msg) {
    line(ANSI.green, '✔', msg);
  },

  warn(msg) {
    line(ANSI.yellow, '⚠', msg);
  },

  error(msg, err) {
    line(ANSI.red, '✖', `${msg}${formatError(err)}`);
  },

  debug(msg) {
    if (!process.env.DEBUG) return;
    line(ANSI.gray, '·', msg);
  },
};
