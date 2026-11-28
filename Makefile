.PHONY: setup check format clean-dev-data lint typecheck dev package install

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
	$(MAKE) install

# Replaces /Applications/Nubes.app with the last packaged build. The old bundle
# is deleted first, so files a newer build drops don't linger.
install:
	@set -e; \
	app=$$(ls -d out/*/Nubes.app 2>/dev/null | head -n 1); \
	[ -n "$$app" ] || { echo "No packaged app in out/. Run 'make package'." >&2; exit 1; }; \
	echo "Installing $$app -> /Applications/Nubes.app"; \
	rm -rf /Applications/Nubes.app; \
	cp -R "$$app" /Applications/Nubes.app
