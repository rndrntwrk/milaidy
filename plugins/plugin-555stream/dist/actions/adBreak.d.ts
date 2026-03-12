/**
 * Ad Break Actions
 *
 * Actions for AI agent to control ad breaks (squeeze-back overlays)
 */
import type { Action } from '../types/index.js';
/**
 * STREAM555_AD_BREAK_TRIGGER - Trigger an ad break
 */
export declare const adBreakTriggerAction: Action;
/**
 * STREAM555_AD_BREAK_DISMISS - End the current ad break early
 */
export declare const adBreakDismissAction: Action;
/**
 * STREAM555_AD_BREAK_SCHEDULE - Schedule an ad break for a specific time
 */
export declare const adBreakScheduleAction: Action;
/**
 * STREAM555_AD_LIST - List available ads
 */
export declare const adListAction: Action;
declare const _default: {
    adBreakTriggerAction: Action;
    adBreakDismissAction: Action;
    adBreakScheduleAction: Action;
    adListAction: Action;
};
export default _default;
//# sourceMappingURL=adBreak.d.ts.map