import { taobotStreamActions } from './stream.js';
import { taobotArcadeActions } from './arcade.js';
import { taobotEmoteActions } from './emote.js';

export const allActions = [...taobotStreamActions, ...taobotArcadeActions, ...taobotEmoteActions];
export { taobotStreamActions } from './stream.js';
export { taobotArcadeActions } from './arcade.js';
export { taobotEmoteActions } from './emote.js';
