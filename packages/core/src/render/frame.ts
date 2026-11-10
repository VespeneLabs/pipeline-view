/**
 * One pending "run on the next frame" callback. Remembers which scheduler it used, so cancelling never
 * calls clearTimeout with a requestAnimationFrame id. rAF ids and timer ids are separate counters, and
 * clearing the wrong one would cancel an unrelated host setTimeout/setInterval with the same number.
 */
export class FrameTask {
  private raf = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly win: () => Window | null | undefined,
    private readonly fn: () => void,
  ) {}

  get pending(): boolean {
    return this.raf !== 0 || this.timer !== undefined;
  }

  schedule(): void {
    if (this.pending) return;
    const w = this.win();
    if (w?.requestAnimationFrame) {
      this.raf = w.requestAnimationFrame(() => {
        this.raf = 0;
        this.fn();
      });
    } else {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.fn();
      }, 0);
    }
  }

  cancel(): void {
    if (this.raf) this.win()?.cancelAnimationFrame(this.raf);
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.raf = 0;
    this.timer = undefined;
  }
}
