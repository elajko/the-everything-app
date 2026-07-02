SHELL := /bin/bash

BACKEND_DIR := backend
INSTALL_STAMP := $(BACKEND_DIR)/node_modules/.install-stamp
PRISMA_STAMP := $(BACKEND_DIR)/node_modules/.prisma-generate-stamp

.PHONY: help start stop restart status build install migrate seed logs

help:
	@echo "make start    - build (if needed) and run the backend + frontend, detached"
	@echo "make stop     - gracefully stop whatever 'make start' started"
	@echo "make restart  - stop then start"
	@echo "make status   - show whether the backend/frontend are running"
	@echo "make logs     - tail both server logs"
	@echo "make build    - install deps + generate the Prisma client (no run)"
	@echo "make migrate  - apply Prisma migrations (interactive)"
	@echo "make seed     - populate the database with seed data"

$(BACKEND_DIR)/.env:
	cp $(BACKEND_DIR)/.env.example $@

# Re-runs only when package.json/package-lock.json actually change.
$(INSTALL_STAMP): $(BACKEND_DIR)/package.json $(BACKEND_DIR)/package-lock.json | $(BACKEND_DIR)/.env
	cd $(BACKEND_DIR) && npm install
	@touch $@

# Re-runs only when the schema actually changes.
$(PRISMA_STAMP): backend/prisma/schema.prisma $(INSTALL_STAMP)
	cd $(BACKEND_DIR) && npx prisma generate
	@touch $@

install: $(INSTALL_STAMP)

build: $(PRISMA_STAMP)

start: build
	@bash scripts/start.sh

stop:
	@bash scripts/stop.sh

restart: stop start

status:
	@bash scripts/status.sh

logs:
	@tail -f .run/backend.log .run/frontend.log

migrate: install
	cd $(BACKEND_DIR) && npx prisma migrate dev

seed: install
	cd $(BACKEND_DIR) && npm run seed
