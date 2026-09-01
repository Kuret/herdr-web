import type { KittyStreamPart } from './types';

// xterm.js does not parse APC (its own docs state APC/PM/SOS are unsupported), so kitty
// graphics sequences have to be lifted out of the byte stream before it reaches the terminal.
// WebSocket chunk boundaries fall anywhere, so this splitter is stateful: an incomplete
// introducer or terminator is held back until the next feed() completes it.
export class ApcSplitter {
    private static readonly INTRODUCER = '\x1b_G';

    private static readonly TERMINATOR = '\x1b\\';

    private buffer = '';

    private sequence = '';

    private insideSequence = false;

    feed(chunk: string): readonly KittyStreamPart[] {
        this.buffer += chunk;
        const parts: KittyStreamPart[] = [];
        for (;;) {
            const consumed = this.insideSequence ? this.consumeSequence(parts) : this.consumeText(parts);
            if (!consumed) {
                return parts;
            }
        }
    }

    reset(): void {
        this.buffer = '';
        this.sequence = '';
        this.insideSequence = false;
    }

    // returns true when a complete introducer was found and the splitter switched state
    private consumeText(parts: KittyStreamPart[]): boolean {
        const start = this.buffer.indexOf(ApcSplitter.INTRODUCER);
        if (start === -1) {
            const held = this.partialIntroducerLength();
            this.emitText(parts, this.buffer.slice(0, this.buffer.length - held));
            this.buffer = this.buffer.slice(this.buffer.length - held);
            return false;
        }
        this.emitText(parts, this.buffer.slice(0, start));
        this.buffer = this.buffer.slice(start + ApcSplitter.INTRODUCER.length);
        this.insideSequence = true;
        return true;
    }

    // returns true when a complete sequence was emitted and the splitter switched state
    private consumeSequence(parts: KittyStreamPart[]): boolean {
        const end = this.buffer.indexOf(ApcSplitter.TERMINATOR);
        if (end === -1) {
            const held = this.buffer.endsWith('\x1b') ? 1 : 0;
            this.sequence += this.buffer.slice(0, this.buffer.length - held);
            this.buffer = this.buffer.slice(this.buffer.length - held);
            return false;
        }
        this.sequence += this.buffer.slice(0, end);
        this.buffer = this.buffer.slice(end + ApcSplitter.TERMINATOR.length);
        this.insideSequence = false;
        const separator = this.sequence.indexOf(';');
        parts.push({
            kind: 'apc',
            control: separator === -1 ? this.sequence : this.sequence.slice(0, separator),
            payload: separator === -1 ? '' : this.sequence.slice(separator + 1),
        });
        this.sequence = '';
        return true;
    }

    private emitText(parts: KittyStreamPart[], text: string): void {
        if (text.length > 0) {
            parts.push({ kind: 'text', text });
        }
    }

    // how many trailing characters are a proper prefix of the introducer and must be held back
    private partialIntroducerLength(): number {
        for (let length = ApcSplitter.INTRODUCER.length - 1; length > 0; length -= 1) {
            if (this.buffer.endsWith(ApcSplitter.INTRODUCER.slice(0, length))) {
                return length;
            }
        }
        return 0;
    }
}
