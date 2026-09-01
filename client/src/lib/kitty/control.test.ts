import { describe, expect, it } from 'vitest';
import { parseKittyControl } from './control';

describe('parseKittyControl', () => {
    it('parses a transmit control string', () => {
        const control = parseKittyControl('a=t,t=d,f=32,s=232,v=592,i=820733,q=2,m=1');
        expect(control.action).toBe('t');
        expect(control.format).toBe(32);
        expect(control.pixelWidth).toBe(232);
        expect(control.pixelHeight).toBe(592);
        expect(control.imageId).toBe(820733);
        expect(control.moreChunks).toBe(true);
        expect(control.hasChunkFlag).toBe(true);
    });

    it('parses a placement control string', () => {
        const control = parseKittyControl('a=p,i=820733,p=616200,c=29,r=37,z=0,C=1,q=2,w=232,h=592');
        expect(control.action).toBe('p');
        expect(control.imageId).toBe(820733);
        expect(control.placementId).toBe(616200);
        expect(control.cols).toBe(29);
        expect(control.rows).toBe(37);
    });

    it('parses a delete control string', () => {
        const control = parseKittyControl('a=d,d=I,i=820733,q=2');
        expect(control.action).toBe('d');
        expect(control.imageId).toBe(820733);
    });

    it('marks a final chunk as having no more data', () => {
        const control = parseKittyControl('m=0');
        expect(control.action).toBe(null);
        expect(control.moreChunks).toBe(false);
        expect(control.hasChunkFlag).toBe(true);
    });

    it('reports no chunk flag for a control string without m', () => {
        expect(parseKittyControl('a=p,i=1').hasChunkFlag).toBe(false);
    });

    it('ignores unknown actions and malformed pairs', () => {
        const control = parseKittyControl('a=q,,=5,i=,junk');
        expect(control.action).toBe(null);
        expect(control.imageId).toBe(null);
    });
});
