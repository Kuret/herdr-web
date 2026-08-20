'use strict';

// ANSI/VT escape-sequence handling: strip sequences or render SGR styling as HTML.
// Pure functions, zero dependencies.

const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const HTML_ESCAPE_PATTERN = /[&<>"']/g;

// CSI (ESC[ params intermediates final), OSC (ESC] ... BEL or ESC\), or a single Fe escape.
const ANSI_SEQUENCE_SOURCE =
  '\\x1b(?:\\[[0-9;:?]*[ -\\/]*[@-~]|\\][^\\x07\\x1b]*(?:\\x07|\\x1b\\\\)?|[@-Z\\\\-_])';

const SGR_SEQUENCE_PATTERN = /^\x1b\[[0-9;]*m$/;

const MIN_COLOR_CHANNEL = 0;
const MAX_COLOR_CHANNEL = 255;
const BASE_PALETTE_SIZE = 16;
const CUBE_FIRST_INDEX = 16;
const CUBE_LAST_INDEX = 231;
const CUBE_SIDE = 6;
const CUBE_LEVELS = [0, 95, 135, 175, 215, 255];
const GRAYSCALE_FIRST_INDEX = 232;
const GRAYSCALE_BASE = 8;
const GRAYSCALE_STEP = 10;

const BASE_PALETTE = [
  [0, 0, 0],
  [128, 0, 0],
  [0, 128, 0],
  [128, 128, 0],
  [0, 0, 128],
  [128, 0, 128],
  [0, 128, 128],
  [192, 192, 192],
  [128, 128, 128],
  [255, 0, 0],
  [0, 255, 0],
  [255, 255, 0],
  [0, 0, 255],
  [255, 0, 255],
  [0, 255, 255],
  [255, 255, 255],
];

function escapeHtml(text) {
  if (text === null || text === undefined) {
    return '';
  }
  return String(text).replace(HTML_ESCAPE_PATTERN, (character) => HTML_ESCAPE_MAP[character]);
}

function stripAnsi(text) {
  if (text === null || text === undefined) {
    return '';
  }
  return String(text).replace(new RegExp(ANSI_SEQUENCE_SOURCE, 'g'), '');
}

function xterm256ToRgb(paletteIndex) {
  const index = clampChannel(paletteIndex);
  if (index < BASE_PALETTE_SIZE) {
    return BASE_PALETTE[index].slice();
  }
  if (index <= CUBE_LAST_INDEX) {
    const cubeOffset = index - CUBE_FIRST_INDEX;
    const red = CUBE_LEVELS[Math.floor(cubeOffset / (CUBE_SIDE * CUBE_SIDE))];
    const green = CUBE_LEVELS[Math.floor(cubeOffset / CUBE_SIDE) % CUBE_SIDE];
    const blue = CUBE_LEVELS[cubeOffset % CUBE_SIDE];
    return [red, green, blue];
  }
  const gray = GRAYSCALE_BASE + (index - GRAYSCALE_FIRST_INDEX) * GRAYSCALE_STEP;
  return [gray, gray, gray];
}

function clampChannel(value) {
  const numeric = Number.isFinite(value) ? Math.trunc(value) : MIN_COLOR_CHANNEL;
  return Math.min(MAX_COLOR_CHANNEL, Math.max(MIN_COLOR_CHANNEL, numeric));
}

function createDefaultStyle() {
  return {
    bold: false,
    dim: false,
    italic: false,
    underline: false,
    inverse: false,
    // Colors are null (default) or { classIndex: 0..15 } or { rgb: [r, g, b] }.
    foreground: null,
    background: null,
  };
}

function isDefaultStyle(style) {
  return (
    !style.bold &&
    !style.dim &&
    !style.italic &&
    !style.underline &&
    !style.inverse &&
    style.foreground === null &&
    style.background === null
  );
}

function parseSgrParams(paramText) {
  if (paramText === '') {
    return [0];
  }
  return paramText.split(';').map((param) => (param === '' ? 0 : parseInt(param, 10)));
}

// Applies one SGR code (possibly an extended-color group) and returns how many params it consumed.
function applyOneSgrCode(style, codes, index) {
  const code = codes[index];
  if (code === 0) {
    Object.assign(style, createDefaultStyle());
    return 1;
  }
  if (code === 1) {
    style.bold = true;
    return 1;
  }
  if (code === 2) {
    style.dim = true;
    return 1;
  }
  if (code === 3) {
    style.italic = true;
    return 1;
  }
  if (code === 4) {
    style.underline = true;
    return 1;
  }
  if (code === 7) {
    style.inverse = true;
    return 1;
  }
  if (code === 22) {
    style.bold = false;
    style.dim = false;
    return 1;
  }
  if (code === 23) {
    style.italic = false;
    return 1;
  }
  if (code === 24) {
    style.underline = false;
    return 1;
  }
  if (code === 27) {
    style.inverse = false;
    return 1;
  }
  if (code >= 30 && code <= 37) {
    style.foreground = { classIndex: code - 30 };
    return 1;
  }
  if (code >= 90 && code <= 97) {
    style.foreground = { classIndex: code - 90 + 8 };
    return 1;
  }
  if (code === 39) {
    style.foreground = null;
    return 1;
  }
  if (code >= 40 && code <= 47) {
    style.background = { classIndex: code - 40 };
    return 1;
  }
  if (code >= 100 && code <= 107) {
    style.background = { classIndex: code - 100 + 8 };
    return 1;
  }
  if (code === 49) {
    style.background = null;
    return 1;
  }
  if (code === 38 || code === 48) {
    return applyExtendedColor(style, codes, index, code === 38 ? 'foreground' : 'background');
  }
  return 1;
}

function applyExtendedColor(style, codes, index, target) {
  const mode = codes[index + 1];
  if (mode === 5) {
    style[target] = { rgb: xterm256ToRgb(codes[index + 2]) };
    return 3;
  }
  if (mode === 2) {
    style[target] = {
      rgb: [
        clampChannel(codes[index + 2]),
        clampChannel(codes[index + 3]),
        clampChannel(codes[index + 4]),
      ],
    };
    return 5;
  }
  // Malformed extended color: skip the introducer and the unknown mode.
  return 2;
}

function applySgrCodes(style, codes) {
  let index = 0;
  while (index < codes.length) {
    index += applyOneSgrCode(style, codes, index);
  }
}

function renderColor(color, cssProperty, classPrefix, classes, inlineStyles) {
  if (color === null) {
    return;
  }
  if (color.classIndex !== undefined) {
    classes.push(`${classPrefix}-${color.classIndex}`);
    return;
  }
  inlineStyles.push(`${cssProperty}:rgb(${color.rgb.join(',')})`);
}

function renderSpanOpenTag(style) {
  const classes = [];
  const inlineStyles = [];
  const foreground = style.inverse ? style.background : style.foreground;
  const background = style.inverse ? style.foreground : style.background;
  renderColor(foreground, 'color', 'af', classes, inlineStyles);
  renderColor(background, 'background-color', 'ab', classes, inlineStyles);
  if (style.bold) {
    inlineStyles.push('font-weight:bold');
  }
  if (style.dim) {
    inlineStyles.push('opacity:0.6');
  }
  if (style.italic) {
    inlineStyles.push('font-style:italic');
  }
  if (style.underline) {
    inlineStyles.push('text-decoration:underline');
  }
  const classAttribute = classes.length > 0 ? ` class="${classes.join(' ')}"` : '';
  const styleAttribute = inlineStyles.length > 0 ? ` style="${inlineStyles.join(';')}"` : '';
  return `<span${classAttribute}${styleAttribute}>`;
}

function ansiToHtml(text) {
  if (text === null || text === undefined) {
    return '';
  }
  const input = String(text);
  const style = createDefaultStyle();
  const output = [];
  let openSpanTag = null;

  const emitText = (chunk) => {
    if (chunk === '') {
      return;
    }
    const spanTag = isDefaultStyle(style) ? null : renderSpanOpenTag(style);
    if (spanTag !== openSpanTag) {
      if (openSpanTag !== null) {
        output.push('</span>');
      }
      if (spanTag !== null) {
        output.push(spanTag);
      }
      openSpanTag = spanTag;
    }
    output.push(escapeHtml(chunk));
  };

  const sequencePattern = new RegExp(ANSI_SEQUENCE_SOURCE, 'g');
  let lastIndex = 0;
  let match;
  while ((match = sequencePattern.exec(input)) !== null) {
    emitText(input.slice(lastIndex, match.index));
    lastIndex = sequencePattern.lastIndex;
    if (SGR_SEQUENCE_PATTERN.test(match[0])) {
      applySgrCodes(style, parseSgrParams(match[0].slice(2, -1)));
    }
  }
  emitText(input.slice(lastIndex));
  if (openSpanTag !== null) {
    output.push('</span>');
  }
  return output.join('');
}

module.exports = { escapeHtml, stripAnsi, ansiToHtml, xterm256ToRgb };
