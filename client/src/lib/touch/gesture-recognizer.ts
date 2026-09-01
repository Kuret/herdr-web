export interface TouchPoint {
    readonly x: number;
    readonly y: number;
}

export interface TouchGestureHandlers {
    readonly onScroll: (deltaY: number, point: TouchPoint) => void;
    readonly onLongPress: (point: TouchPoint) => void;
}

// arbitrates the two single-finger gestures the terminal supports: a drag scrolls, and a
// stationary hold is the touch equivalent of a right click. Kept free of DOM types so the
// thresholds and the scroll-vs-press decision stay unit-testable.
export class TouchGestureRecognizer {
    private static readonly LONG_PRESS_MS = 500;

    private static readonly MOVE_SLOP_PX = 10;

    private origin: TouchPoint | null = null;

    private last: TouchPoint | null = null;

    private timer: ReturnType<typeof setTimeout> | null = null;

    private pressed = false;

    constructor(private readonly handlers: TouchGestureHandlers) {}

    // true while the browser's own contextmenu for this gesture should be swallowed
    get didLongPress(): boolean {
        return this.pressed;
    }

    start(point: TouchPoint): void {
        this.origin = point;
        this.last = point;
        this.pressed = false;
        this.timer = setTimeout(() => {
            this.timer = null;
            this.pressed = true;
            this.handlers.onLongPress(point);
        }, TouchGestureRecognizer.LONG_PRESS_MS);
    }

    // returns whether the move was consumed as a terminal gesture and should not also
    // drive the browser's native panning
    move(point: TouchPoint): boolean {
        if (this.origin === null || this.last === null) {
            return false;
        }
        if (this.movedBeyondSlop(point)) {
            this.disarmLongPress();
        }
        const deltaY = this.last.y - point.y;
        this.last = point;
        if (this.pressed) {
            return true;
        }
        this.handlers.onScroll(deltaY, point);
        return true;
    }

    end(): void {
        this.disarmLongPress();
        this.origin = null;
        this.last = null;
    }

    private movedBeyondSlop(point: TouchPoint): boolean {
        if (this.origin === null) {
            return false;
        }
        const dx = point.x - this.origin.x;
        const dy = point.y - this.origin.y;
        return Math.hypot(dx, dy) > TouchGestureRecognizer.MOVE_SLOP_PX;
    }

    private disarmLongPress(): void {
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
}
