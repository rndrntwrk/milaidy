/**
 * STREAM555_ALERT_CREATE Action
 *
 * Create and queue a new alert (follow, subscribe, donation, raid, custom).
 * Does not require approval.
 */
import type { Action } from '../types/index.js';
export interface AlertConfig {
    eventType: 'follow' | 'subscribe' | 'donation' | 'raid' | 'bits' | 'custom';
    message: string;
    username?: string;
    amount?: string;
    image?: string;
    sound?: {
        src: string;
        volume: number;
    };
    duration?: number;
    priority?: number;
    variant?: 'popup' | 'banner' | 'corner' | 'fullscreen';
}
export interface Alert {
    id: string;
    eventType: string;
    message: string;
    username?: string;
    amount?: string;
    status: string;
    createdAt: string;
}
export declare const alertCreateAction: Action;
export default alertCreateAction;
//# sourceMappingURL=alertCreate.d.ts.map