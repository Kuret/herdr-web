import { describe, expect, it } from 'vitest';
import { ApcSplitter } from './apc-splitter';

const ST = '\x1b\\';

describe('ApcSplitter', () => {
    it('passes plain text straight through', () => {
        expect(new ApcSplitter().feed('hello')).toEqual([{ kind: 'text', text: 'hello' }]);
    });

    it('splits a complete sequence out of surrounding text', () => {
        const parts = new ApcSplitter().feed(`before\x1b_Ga=t,m=1;QUJD${ST}after`);
        expect(parts).toEqual([
            { kind: 'text', text: 'before' },
            { kind: 'apc', control: 'a=t,m=1', payload: 'QUJD' },
            { kind: 'text', text: 'after' },
        ]);
    });

    it('reassembles a sequence split across two feeds', () => {
        const splitter = new ApcSplitter();
        expect(splitter.feed('x\x1b_Ga=t,m=1;QU')).toEqual([{ kind: 'text', text: 'x' }]);
        expect(splitter.feed(`JD${ST}y`)).toEqual([
            { kind: 'apc', control: 'a=t,m=1', payload: 'QUJD' },
            { kind: 'text', text: 'y' },
        ]);
    });

    it('holds back an introducer split across feeds instead of leaking it as text', () => {
        const splitter = new ApcSplitter();
        expect(splitter.feed('x\x1b_')).toEqual([{ kind: 'text', text: 'x' }]);
        expect(splitter.feed(`Ga=d,i=7;${ST}`)).toEqual([{ kind: 'apc', control: 'a=d,i=7', payload: '' }]);
    });

    it('holds back a terminator split across feeds', () => {
        const splitter = new ApcSplitter();
        expect(splitter.feed('\x1b_Ga=p,i=7;\x1b')).toEqual([]);
        expect(splitter.feed('\\rest')).toEqual([
            { kind: 'apc', control: 'a=p,i=7', payload: '' },
            { kind: 'text', text: 'rest' },
        ]);
    });

    it('emits back-to-back sequences in stream order', () => {
        const parts = new ApcSplitter().feed(`\x1b_Gm=1;AA${ST}\x1b_Gm=0;BB${ST}`);
        expect(parts).toEqual([
            { kind: 'apc', control: 'm=1', payload: 'AA' },
            { kind: 'apc', control: 'm=0', payload: 'BB' },
        ]);
    });

    it('treats a control string with no payload separator as an empty payload', () => {
        expect(new ApcSplitter().feed(`\x1b_Ga=d${ST}`)).toEqual([
            { kind: 'apc', control: 'a=d', payload: '' },
        ]);
    });

    it('leaves non-kitty escape sequences in the text stream', () => {
        expect(new ApcSplitter().feed('\x1b[31mred\x1b[0m')).toEqual([
            { kind: 'text', text: '\x1b[31mred\x1b[0m' },
        ]);
    });

    it('drops half-parsed state on reset', () => {
        const splitter = new ApcSplitter();
        splitter.feed('\x1b_Ga=t;AA');
        splitter.reset();
        expect(splitter.feed('plain')).toEqual([{ kind: 'text', text: 'plain' }]);
    });
});
