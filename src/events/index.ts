/**
 * Events Module — typed event-driven architecture.
 *
 * @module events
 */

export {
  type AgentState,
  type EventEnvelope,
  type EventHandler,
  type EventName,
  emit,
  getEventBus,
  // Event types
  type MilaidyEvents,
  on,
  resetEventBus,
  // Event bus
  TypedEventBus,
  type TypedEventBusOptions,
} from "./event-bus.js";
