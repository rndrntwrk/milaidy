#!/usr/bin/env bash
set -euo pipefail

# Published-only CI jobs rewrite the workspace graph but still execute
# repo-local build scripts that import a small set of local Eliza packages.
# Install those as explicit file overrides plus the browser/UI packages the
# renderer build expects so follow-up bun installs stay deterministic.
bun add --no-save --dev --ignore-scripts \
  @elizaos/shared@file:./eliza/packages/shared \
  @elizaos/ui@file:./eliza/packages/ui \
  react react-dom vite \
  @types/react @types/react-dom \
  tailwindcss three clsx class-variance-authority tailwind-merge sonner \
  @radix-ui/react-checkbox @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-label \
  @radix-ui/react-popover @radix-ui/react-select @radix-ui/react-separator @radix-ui/react-slider \
  @radix-ui/react-slot @radix-ui/react-switch @radix-ui/react-tabs @radix-ui/react-tooltip \
  @capacitor/core @capacitor/haptics @capacitor/keyboard @capacitor/preferences \
  @xterm/xterm @xterm/addon-fit
