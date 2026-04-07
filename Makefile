.PHONY: lint typecheck dev package

lint:
	pnpm lint

typecheck:
	pnpm typecheck

dev:
	pnpm start

package:
	pnpm package
	find out -name '*.app' -maxdepth 2 -exec rm -rf /Applications/{} \; -exec cp -R {} /Applications/ \;
