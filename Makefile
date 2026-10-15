PY := .venv/bin/python
SCRIPTS := $(sort $(wildcard models/s[0-9]_*.py)) models/capstone_allocation_memo.py

.PHONY: check py

# Acceptance checker: JS models vs Python twins, finite-difference duals, null cases, simulation batches.
check:
	node tests/check.mjs

# Run every Python twin and print its human-readable summary.
py:
	@for f in $(SCRIPTS); do echo "── $$f"; $(PY) $$f || exit 1; done

# Serve locally (no caching) and smoke-test every route in headless Chrome.
.PHONY: serve smoke
serve:
	python3 tools/serve.py

smoke:
	bash tools/smoke.sh
