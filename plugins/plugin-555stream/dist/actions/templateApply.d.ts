/**
 * STREAM555_TEMPLATE_APPLY Action
 *
 * Apply a template to create a new overlay graphic.
 * Does not require approval.
 */
import type { Action } from '../types/index.js';
export interface Template {
    id: string;
    name: string;
    category: string;
    type: string;
    description?: string;
    thumbnail?: string;
}
export declare const templateApplyAction: Action;
export default templateApplyAction;
//# sourceMappingURL=templateApply.d.ts.map