import type { NavTarget } from '@shared/navigation';
import { scrollToAnchor } from '../components/useAnchor';
import { tabPanelElementId } from './TabBar';

const FLASH_CLASS = 'gw-attention-flash';
// Content above a target may still be loading when a jump lands: a card opening, Mermaid diagrams drawing one by one.
// The landing waits until the target has held its place for a few frames, and aims again if it moves before the deadline.
const STABLE_FRAMES = 6;
const MAX_FOLLOW_FRAMES = 240;

export interface Landing {
  readonly top: number | undefined;
  readonly stableFrames: number;
  readonly aimedTop: number | undefined;
}

export interface LandingStep {
  readonly landing: Landing;
  readonly shouldScroll: boolean;
}

export const NEW_LANDING: Landing = { top: undefined, stableFrames: 0, aimedTop: undefined };

let activeJump = 0;

// Scrolls once the target's place in the document has settled, and again whenever it settles somewhere else.
export function nextLanding(landing: Landing, top: number): LandingStep {
  const stableFrames = top === landing.top ? landing.stableFrames + 1 : 0;
  const shouldScroll = stableFrames >= STABLE_FRAMES && top !== landing.aimedTop;
  return { landing: { top, stableFrames, aimedTop: shouldScroll ? top : landing.aimedTop }, shouldScroll };
}

// The anchor if the target names one, otherwise the top of the target tab's content.
function landingElement(target: NavTarget): HTMLElement | null {
  if (target.anchor !== undefined) {
    return document.getElementById(target.anchor);
  }
  const panel = document.getElementById(tabPanelElementId(target.tab));
  return panel?.firstElementChild instanceof HTMLElement ? panel.firstElementChild : null;
}

// Removing the class and forcing a reflow restarts the animation, so a repeated jump flashes again.
function restartFlash(element: HTMLElement): void {
  element.classList.remove(FLASH_CLASS);
  void element.offsetWidth;
  element.classList.add(FLASH_CLASS);
  element.addEventListener('animationend', () => element.classList.remove(FLASH_CLASS), { once: true });
}

function land(element: HTMLElement): void {
  scrollToAnchor(element);
  restartFlash(element);
}

function documentTop(element: HTMLElement): number {
  return element.getBoundingClientRect().top + window.scrollY;
}

function aimAt(element: HTMLElement, landing: Landing, isLastFrame: boolean): Landing {
  const step = nextLanding(landing, documentTop(element));
  if (step.shouldScroll || (isLastFrame && step.landing.aimedTop === undefined)) {
    land(element);
  }
  return step.landing;
}

// Every call is a fresh jump that supersedes the previous one, so a repeated click scrolls and flashes again even when
// the navigation itself did not change. A target that never holds still is landed on at the deadline anyway.
export function flashNavTarget(target: NavTarget): void {
  const jump = ++activeJump;
  let landing = NEW_LANDING;
  const follow = (frame: number): void => {
    if (jump !== activeJump) {
      return;
    }
    const element = landingElement(target);
    if (element !== null) {
      landing = aimAt(element, landing, frame === MAX_FOLLOW_FRAMES);
    }
    if (frame < MAX_FOLLOW_FRAMES) {
      requestAnimationFrame(() => follow(frame + 1));
    }
  };
  requestAnimationFrame(() => follow(0));
}
