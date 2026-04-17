// Re-export stub — canonical source lives in the eliza submodule.
// Tests inside eliza/packages/app-core/test/** resolve ../../../../../test/helpers/*
// to this parent-repo path, so we forward all exports transparently.
export * from "../../eliza/packages/app-core/test/helpers/conditional-tests.ts";
