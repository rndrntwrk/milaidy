/**
 * STREAM555_OVERLAY_SUGGEST Action
 *
 * AI-driven overlay suggestions based on stream context.
 * Analyzes current stream state and suggests appropriate overlays.
 * Does not require approval.
 */
import type { Action } from '../types/index.js';
export interface OverlaySuggestion {
    templateId: string;
    templateName: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
    category: string;
}
export declare const overlaySuggestAction: Action;
export default overlaySuggestAction;
//# sourceMappingURL=overlaySuggest.d.ts.map