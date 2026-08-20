'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { escapeHtml, stripAnsi, ansiToHtml, xterm256ToRgb } = require('../lib/ansi');

const ESC = '\x1b';
const BEL = '\x07';

function countOccurrences(haystack, needle) {
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

describe('escapeHtml', () => {
  test('escapes all five HTML-significant characters', () => {
    assert.equal(escapeHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
  });

  test('leaves plain text untouched', () => {
    assert.equal(escapeHtml('hello world 123'), 'hello world 123');
  });

  test('returns empty string for null and undefined', () => {
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
  });

  test('coerces non-string input to string before escaping', () => {
    assert.equal(escapeHtml(42), '42');
  });
});

describe('stripAnsi', () => {
  test('removes CSI SGR sequences', () => {
    assert.equal(stripAnsi(`${ESC}[31mred${ESC}[0m`), 'red');
  });

  test('removes non-SGR CSI sequences (cursor movement, erase)', () => {
    assert.equal(stripAnsi(`${ESC}[2Jclear${ESC}[10;20H`), 'clear');
  });

  test('removes OSC sequences terminated by BEL', () => {
    assert.equal(stripAnsi(`${ESC}]0;window title${BEL}text`), 'text');
  });

  test('removes OSC sequences terminated by ST (ESC backslash)', () => {
    assert.equal(stripAnsi(`${ESC}]2;title${ESC}\\text`), 'text');
  });

  test('removes single-character Fe escapes', () => {
    assert.equal(stripAnsi(`${ESC}Mtext${ESC}D`), 'text');
  });

  test('returns empty string for null and undefined', () => {
    assert.equal(stripAnsi(null), '');
    assert.equal(stripAnsi(undefined), '');
  });

  test('leaves text without escapes untouched', () => {
    assert.equal(stripAnsi('plain text'), 'plain text');
  });
});

describe('xterm256ToRgb', () => {
  test('maps base palette indices 0-15 from the fixed table', () => {
    assert.deepEqual(xterm256ToRgb(0), [0, 0, 0]);
    assert.deepEqual(xterm256ToRgb(1), [128, 0, 0]);
    assert.deepEqual(xterm256ToRgb(7), [192, 192, 192]);
    assert.deepEqual(xterm256ToRgb(15), [255, 255, 255]);
  });

  test('maps 6x6x6 color-cube indices 16-231', () => {
    assert.deepEqual(xterm256ToRgb(16), [0, 0, 0]);
    assert.deepEqual(xterm256ToRgb(231), [255, 255, 255]);
    // 196 = 16 + 5*36 + 0*6 + 0 -> pure red at the top cube level.
    assert.deepEqual(xterm256ToRgb(196), [255, 0, 0]);
    // 21 = 16 + 0*36 + 0*6 + 5 -> pure blue.
    assert.deepEqual(xterm256ToRgb(21), [0, 0, 255]);
    // 110 = 16 + 2*36 + 3*6 + 4 -> [135, 175, 215].
    assert.deepEqual(xterm256ToRgb(110), [135, 175, 215]);
  });

  test('maps grayscale ramp indices 232-255 as 8 + step*10', () => {
    assert.deepEqual(xterm256ToRgb(232), [8, 8, 8]);
    assert.deepEqual(xterm256ToRgb(243), [118, 118, 118]);
    assert.deepEqual(xterm256ToRgb(255), [238, 238, 238]);
  });

  test('clamps out-of-range and non-finite indices', () => {
    assert.deepEqual(xterm256ToRgb(-5), [0, 0, 0]);
    assert.deepEqual(xterm256ToRgb(300), [238, 238, 238]);
    assert.deepEqual(xterm256ToRgb(NaN), [0, 0, 0]);
    assert.deepEqual(xterm256ToRgb(undefined), [0, 0, 0]);
  });

  test('returns a copy of base palette entries, not the shared array', () => {
    const first = xterm256ToRgb(1);
    first[0] = 999;
    assert.deepEqual(xterm256ToRgb(1), [128, 0, 0]);
  });
});

describe('ansiToHtml', () => {
  test('escapes literal HTML in pane text', () => {
    assert.equal(ansiToHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  test('escapes HTML inside styled spans too', () => {
    assert.equal(
      ansiToHtml(`${ESC}[31m<b>${ESC}[0m`),
      '<span class="af-1">&lt;b&gt;</span>'
    );
  });

  test('renders standard foreground colors 30-37 as af-0..af-7 classes', () => {
    assert.equal(ansiToHtml(`${ESC}[30mx`), '<span class="af-0">x</span>');
    assert.equal(ansiToHtml(`${ESC}[37mx`), '<span class="af-7">x</span>');
  });

  test('renders bright foreground colors 90-97 as af-8..af-15 classes', () => {
    assert.equal(ansiToHtml(`${ESC}[90mx`), '<span class="af-8">x</span>');
    assert.equal(ansiToHtml(`${ESC}[97mx`), '<span class="af-15">x</span>');
  });

  test('renders standard background colors 40-47 as ab-0..ab-7 classes', () => {
    assert.equal(ansiToHtml(`${ESC}[40mx`), '<span class="ab-0">x</span>');
    assert.equal(ansiToHtml(`${ESC}[47mx`), '<span class="ab-7">x</span>');
  });

  test('renders bright background colors 100-107 as ab-8..ab-15 classes', () => {
    assert.equal(ansiToHtml(`${ESC}[100mx`), '<span class="ab-8">x</span>');
    assert.equal(ansiToHtml(`${ESC}[107mx`), '<span class="ab-15">x</span>');
  });

  test('renders bold, dim, italic and underline as inline styles', () => {
    assert.equal(ansiToHtml(`${ESC}[1mx`), '<span style="font-weight:bold">x</span>');
    assert.equal(ansiToHtml(`${ESC}[2mx`), '<span style="opacity:0.6">x</span>');
    assert.equal(ansiToHtml(`${ESC}[3mx`), '<span style="font-style:italic">x</span>');
    assert.equal(ansiToHtml(`${ESC}[4mx`), '<span style="text-decoration:underline">x</span>');
  });

  test('reset (0) closes the open span and returns to plain text', () => {
    assert.equal(ansiToHtml(`${ESC}[31mred${ESC}[0mplain`), '<span class="af-1">red</span>plain');
  });

  test('empty SGR params are treated as reset', () => {
    assert.equal(ansiToHtml(`${ESC}[31mred${ESC}[mplain`), '<span class="af-1">red</span>plain');
  });

  test('attribute resets 22/23/24/27 clear only their attribute', () => {
    assert.equal(
      ansiToHtml(`${ESC}[1;31mbold${ESC}[22mstill red`),
      '<span class="af-1" style="font-weight:bold">bold</span><span class="af-1">still red</span>'
    );
  });

  test('inverse swaps foreground and background colors', () => {
    assert.equal(
      ansiToHtml(`${ESC}[31;44;7mx`),
      '<span class="af-4 ab-1">x</span>'
    );
  });

  test('39 and 49 reset foreground and background independently', () => {
    assert.equal(
      ansiToHtml(`${ESC}[31;44mx${ESC}[39my`),
      '<span class="af-1 ab-4">x</span><span class="ab-4">y</span>'
    );
    assert.equal(
      ansiToHtml(`${ESC}[31;44mx${ESC}[49my`),
      '<span class="af-1 ab-4">x</span><span class="af-1">y</span>'
    );
  });

  test('renders 256-color foreground as an inline rgb style', () => {
    assert.equal(
      ansiToHtml(`${ESC}[38;5;196mx`),
      '<span style="color:rgb(255,0,0)">x</span>'
    );
  });

  test('renders 256-color background as an inline rgb style', () => {
    assert.equal(
      ansiToHtml(`${ESC}[48;5;232mx`),
      '<span style="background-color:rgb(8,8,8)">x</span>'
    );
  });

  test('renders truecolor foreground and background as inline rgb styles', () => {
    assert.equal(
      ansiToHtml(`${ESC}[38;2;10;20;30mx`),
      '<span style="color:rgb(10,20,30)">x</span>'
    );
    assert.equal(
      ansiToHtml(`${ESC}[48;2;250;251;252mx`),
      '<span style="background-color:rgb(250,251,252)">x</span>'
    );
  });

  test('clamps out-of-range truecolor channels', () => {
    assert.equal(
      ansiToHtml(`${ESC}[38;2;300;999;128mx`),
      '<span style="color:rgb(255,255,128)">x</span>'
    );
  });

  test('malformed extended color introducer is ignored without throwing', () => {
    assert.equal(ansiToHtml(`${ESC}[38;9mx`), 'x');
  });

  test('unterminated and malformed sequences do not throw', () => {
    const inputs = [
      `${ESC}[31`,
      `${ESC}[`,
      `${ESC}]0;never terminated`,
      `${ESC}`,
      `${ESC}[;;;m`,
      `${ESC}[38;5m`,
      `${ESC}[38;2;300;-5;128m`,
      `text${ESC}[999mmore`,
    ];
    for (const input of inputs) {
      assert.doesNotThrow(() => ansiToHtml(input));
    }
  });

  test('non-SGR sequences are dropped without affecting styling', () => {
    assert.equal(ansiToHtml(`${ESC}[2Jhello${ESC}]0;title${BEL}world`), 'helloworld');
  });

  test('returns empty string for null and undefined', () => {
    assert.equal(ansiToHtml(null), '');
    assert.equal(ansiToHtml(undefined), '');
  });

  test('coalesces adjacent chunks with identical styling into one span', () => {
    assert.equal(
      ansiToHtml(`${ESC}[31ma${ESC}[31mb`),
      '<span class="af-1">ab</span>'
    );
  });

  test('always emits balanced span open/close tags', () => {
    const inputs = [
      `${ESC}[31mno reset at end`,
      `${ESC}[1;4;38;5;100mstyled${ESC}[0mplain${ESC}[44mbg`,
      `plain only`,
      `${ESC}[31m`,
      `${ESC}[31ma${ESC}[32mb${ESC}[33mc`,
      `${ESC}[7minverse${ESC}[27mnormal`,
    ];
    for (const input of inputs) {
      const html = ansiToHtml(input);
      assert.equal(
        countOccurrences(html, '<span'),
        countOccurrences(html, '</span>'),
        `unbalanced spans for input ${JSON.stringify(input)}: ${html}`
      );
    }
  });
});
