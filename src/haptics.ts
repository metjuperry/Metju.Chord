/**
 * Haptic feedback for touch playing.
 *
 * Android (Chrome, Samsung Internet, Edge): the Vibration API, with a distinct short pulse
 * per action. iPhone: Safari has no Vibration API, so this toggles a hidden native switch
 * (`<input type="checkbox" switch>`), which iOS answers with a Taptic Engine tick. That only
 * works from inside a real tap and gives a single tick, so on iPhone you feel presses but
 * not every direction while sliding the stick. Everywhere else it does nothing.
 */

export type HapticKind =
    /** a pad goes down */
    | 'press'
    /** the stick moves into a new direction */
    | 'tick'
    /** the stick springs back to the centre */
    | 'release'
    /** a stick direction is locked or unlocked with a tap */
    | 'lock';

const PATTERNS: { [k in HapticKind]: number | number[] } = {
    press: 14,
    tick: 8,
    release: 5,
    lock: [10, 45, 14],
};

let enabled = true;
let iosSwitch: HTMLLabelElement | null = null;

export function setHapticsEnabled(on: boolean) {
    enabled = on;
}

const canVibrate = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

/** iPhone/iPad Safari (iPadOS reports itself as a Mac with touch). */
const isIOS = () =>
    typeof navigator !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/** Whether this device can give any haptic feedback from the web. */
export const hapticsSupported = () => canVibrate() || isIOS();

function iosTick() {
    if (!iosSwitch) {
        // A visually hidden native switch; clicking its label toggles it and iOS plays a tick
        const label = document.createElement('label');
        label.setAttribute('aria-hidden', 'true');
        label.style.cssText = 'position:fixed;left:-100px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.setAttribute('switch', '');
        input.tabIndex = -1;
        label.appendChild(input);
        document.body.appendChild(label);
        iosSwitch = label;
    }
    iosSwitch.click();
}

/** Play a haptic for a touch interaction. Call it from the touch's own event handler. */
export function haptic(kind: HapticKind) {
    if (!enabled) return;
    try {
        if (canVibrate()) {
            navigator.vibrate(PATTERNS[kind]);
        } else if (isIOS()) {
            iosTick();
        }
    } catch {
        // haptics are a nicety; never let them break playing
    }
}
