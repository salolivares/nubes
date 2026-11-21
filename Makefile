.PHONY: setup check format clean-dev-data lint typecheck dev package

setup:
	pnpm install --frozen-lockfile

# Same steps and order as .github/workflows/ci.yml. Make stops on the first failure.
check:
	pnpm typecheck
	pnpm lint
	pnpm test
	pnpm format:check

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
