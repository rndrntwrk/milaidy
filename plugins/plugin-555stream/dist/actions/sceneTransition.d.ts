/**
 * STREAM555_SCENE_TRANSITION Action
 *
 * Trigger a scene transition with optional transition effect.
 * Does not require approval.
 */
import type { Action } from '../types/index.js';
export interface TransitionConfig {
    type: 'cut' | 'fade' | 'slide' | 'wipe' | 'zoom' | 'blur' | 'stinger';
    duration?: number;
    direction?: 'left' | 'right' | 'up' | 'down';
    easing?: string;
    stingerUrl?: string;
}
export declare const sceneTransitionAction: Action;
export default sceneTransitionAction;
//# sourceMappingURL=sceneTransition.d.ts.map