export type ArmedModifier = 'ctrl' | 'alt';

// mobile keyboards can't hold a modifier while typing another key, so the
// quick-keys bar arms one for the *next* keystroke instead. ctrl+letter maps
// to its control code (the same byte a real terminal sends); alt is sent as
// the universal "ESC prefix" convention every shell/readline understands.
export function applyModifier(modifier: ArmedModifier, char: string): string {
    if (modifier === 'alt') {
        return `\x1b${char}`;
    }
    const code = char.toUpperCase().charCodeAt(0);
    if (code >= 65 && code <= 90) {
        return String.fromCharCode(code - 64);
    }
    return char;
}
