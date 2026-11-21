.PHONY: setup check format clean-dev-data lint typecheck dev package

# Bare `make` keeps running lint, as it did before these targets were added.
.DEFAULT_GOAL := lint

setup:
	pnpm install --frozen-lockfile

# Runs typecheck, lint, test and format:check in CI order (see package.json).
# Stops on the first failure.
check:
	pnpm check

format:
	pnpm format

# Removes the per-worktree dev data folder. -f keeps this quiet when it's missing.
clean-dev-data:
	rm -rf ./.dev-data

lint:
	pnpm lint

typecheck:
	pnpm typecheck

dev:
	pnpm start

package:
	pnpm package
	find out -name '*.app' -maxdepth 2 -exec rm -rf /Applications/{} \; -exec cp -R {} /Applications/ \;
