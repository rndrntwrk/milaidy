/**
 * Events Module — typed event-driven architecture.
 *
 * @module events
 */

export {
  // Event bus
  TypedEventBus,
  getEventBus,
  resetEventBus,
  emit,
  on,
  type TypedEventBusOptions,

  // Event types
  type MilaidyEvents,
  type EventName,
  type EventHandler,
  type EventEnvelope,
  type AgentState,
} from "./event-bus.js";
