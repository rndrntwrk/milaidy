/**
 * STREAM555_TEMPLATE_LIST Action
 *
 * List available overlay templates, optionally filtered by category or type.
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
export declare const templateListAction: Action;
export default templateListAction;
//# sourceMappingURL=templateList.d.ts.map