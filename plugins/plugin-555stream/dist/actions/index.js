/**
 * Action exports
 */
// Session Management
export { healthcheckAction } from './healthcheck.js';
export { bootstrapAction } from './bootstrap.js';
// Stream Control
export { streamStartAction } from './streamStart.js';
export { streamAppStartAction } from './streamAppStart.js';
export { streamAppListAction } from './streamAppList.js';
export { streamStopAction } from './streamStop.js';
export { streamFallbackAction } from './streamFallback.js';
export { streamStatusAction } from './streamStatus.js';
export { adBreakTriggerAction, adBreakDismissAction, adBreakScheduleAction, adListAction } from './adBreak.js';
export { alertCreateAction } from './alertCreate.js';
export { alertControlAction } from './alertControl.js';
export { sceneTransitionAction } from './sceneTransition.js';
export { templateListAction } from './templateList.js';
export { templateApplyAction } from './templateApply.js';
export { overlaySuggestAction } from './overlaySuggest.js';
export { chatReadAction } from './chatRead.js';
export { chatSendAction } from './chatSend.js';
export { chatStartAction } from './chatStart.js';
export { chatStopAction } from './chatStop.js';
// State Management
export { statePatchAction } from './statePatch.js';
export { layoutSetAction } from './layoutSet.js';
export { sceneSetActiveAction } from './sceneSetActive.js';
// Graphics
export { graphicsCreateAction } from './graphicsCreate.js';
export { graphicsUpdateAction } from './graphicsUpdate.js';
export { graphicsDeleteAction } from './graphicsDelete.js';
export { graphicsToggleAction } from './graphicsToggle.js';
// Sources
export { sourceCreateAction } from './sourceCreate.js';
export { sourceUpdateAction } from './sourceUpdate.js';
export { sourceDeleteAction } from './sourceDelete.js';
// Guests
export { guestInviteAction } from './guestInvite.js';
export { guestRemoveAction } from './guestRemove.js';
// Media
export { uploadImageAction } from './uploadImage.js';
export { uploadVideoAction } from './uploadVideo.js';
export { videoAddUrlAction } from './videoAddUrl.js';
export { videoDeleteAction } from './videoDelete.js';
// Platforms
export { platformConfigAction } from './platformConfig.js';
export { platformToggleAction } from './platformToggle.js';
// Radio
export { radioConfigAction } from './radioConfig.js';
export { radioControlAction } from './radioControl.js';
export { legacyCompatibilityActions } from './legacyCompat.js';
// All actions for plugin registration
import { healthcheckAction } from './healthcheck.js';
import { bootstrapAction } from './bootstrap.js';
import { streamStartAction } from './streamStart.js';
import { streamAppStartAction } from './streamAppStart.js';
import { streamAppListAction } from './streamAppList.js';
import { streamStopAction } from './streamStop.js';
import { streamFallbackAction } from './streamFallback.js';
import { streamStatusAction } from './streamStatus.js';
import { adBreakTriggerAction, adBreakDismissAction, adBreakScheduleAction, adListAction } from './adBreak.js';
import { alertCreateAction } from './alertCreate.js';
import { alertControlAction } from './alertControl.js';
import { sceneTransitionAction } from './sceneTransition.js';
import { templateListAction } from './templateList.js';
import { templateApplyAction } from './templateApply.js';
import { overlaySuggestAction } from './overlaySuggest.js';
import { chatReadAction } from './chatRead.js';
import { chatSendAction } from './chatSend.js';
import { chatStartAction } from './chatStart.js';
import { chatStopAction } from './chatStop.js';
import { statePatchAction } from './statePatch.js';
import { layoutSetAction } from './layoutSet.js';
import { sceneSetActiveAction } from './sceneSetActive.js';
import { graphicsCreateAction } from './graphicsCreate.js';
import { graphicsUpdateAction } from './graphicsUpdate.js';
import { graphicsDeleteAction } from './graphicsDelete.js';
import { graphicsToggleAction } from './graphicsToggle.js';
import { sourceCreateAction } from './sourceCreate.js';
import { sourceUpdateAction } from './sourceUpdate.js';
import { sourceDeleteAction } from './sourceDelete.js';
import { guestInviteAction } from './guestInvite.js';
import { guestRemoveAction } from './guestRemove.js';
import { uploadImageAction } from './uploadImage.js';
import { uploadVideoAction } from './uploadVideo.js';
import { videoAddUrlAction } from './videoAddUrl.js';
import { videoDeleteAction } from './videoDelete.js';
import { platformConfigAction } from './platformConfig.js';
import { platformToggleAction } from './platformToggle.js';
import { radioConfigAction } from './radioConfig.js';
import { radioControlAction } from './radioControl.js';
import { legacyCompatibilityActions } from './legacyCompat.js';
export const allActions = [
    // Session Management
    healthcheckAction,
    bootstrapAction,
    // Stream Control
    streamStartAction,
    streamAppStartAction,
    streamAppListAction,
    streamStopAction,
    streamFallbackAction,
    streamStatusAction,
    adBreakTriggerAction,
    adBreakDismissAction,
    adBreakScheduleAction,
    adListAction,
    alertCreateAction,
    alertControlAction,
    sceneTransitionAction,
    templateListAction,
    templateApplyAction,
    overlaySuggestAction,
    chatReadAction,
    chatSendAction,
    chatStartAction,
    chatStopAction,
    // State Management
    statePatchAction,
    layoutSetAction,
    sceneSetActiveAction,
    // Graphics
    graphicsCreateAction,
    graphicsUpdateAction,
    graphicsDeleteAction,
    graphicsToggleAction,
    // Sources
    sourceCreateAction,
    sourceUpdateAction,
    sourceDeleteAction,
    // Guests
    guestInviteAction,
    guestRemoveAction,
    // Media
    uploadImageAction,
    uploadVideoAction,
    videoAddUrlAction,
    videoDeleteAction,
    // Platforms
    platformConfigAction,
    platformToggleAction,
    // Radio
    radioConfigAction,
    radioControlAction,
    ...legacyCompatibilityActions,
];
//# sourceMappingURL=index.js.map