/**
 * Dependency Injection Module — service container and tokens.
 *
 * @module di
 */

export {
  // Container
  ServiceContainer,
  ContainerBuilder,
  getContainer,
  setContainer,
  resetContainer,
  createMilaidyContainer,

  // Tokens
  TOKENS,
  createToken,
  type ServiceToken,
  type ServiceFactory,
  type ServiceScope,
} from "./container.js";
