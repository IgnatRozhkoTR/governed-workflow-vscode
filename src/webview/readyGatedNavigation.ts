import type { NavTarget } from '../shared/navigation';

// The webview subscribes to host events only when it reports ready, so a navigation requested earlier
// (the first-visit jump to a waiting gate, a reveal while the panel loads) is held and delivered then.
// Only the latest request matters: the user lands where the most recent request points.
// A reloaded webview reports ready again and drops whatever was posted while it reloaded, so it is
// sent back to the latest place: the last requested target or the tab the user picked after it.
export class ReadyGatedNavigation {
  private isReady = false;
  private pending: NavTarget | undefined;
  private latest: NavTarget | undefined;

  constructor(private readonly post: (nav: NavTarget) => void) {}

  request(nav: NavTarget): void {
    this.latest = nav;
    if (this.isReady) {
      this.post(nav);
    } else {
      this.pending = nav;
    }
  }

  recordShown(nav: NavTarget): void {
    this.latest = nav;
  }

  markReady(): void {
    const nav = this.isReady ? this.latest : this.pending;
    this.isReady = true;
    this.pending = undefined;
    if (nav !== undefined) {
      this.post(nav);
    }
  }
}
