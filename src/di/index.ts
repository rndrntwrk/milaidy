/**
 * Dependency Injection Module — service container and tokens.
 *
 * @module di
 */

export {
  ContainerBuilder,
  createMilaidyContainer,
  createToken,
  getContainer,
  resetContainer,
  // Container
  ServiceContainer,
  type ServiceFactory,
  type ServiceScope,
  type ServiceToken,
  setContainer,
  // Tokens
  TOKENS,
} from "./container.js";
