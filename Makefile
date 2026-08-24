SHELL := /bin/bash
.NONESHELL:

BACKEND_DIR := backend
FRONTEND_DIR := frontend
FIXTURES_SRC := $(BACKEND_DIR)/src/sync/mock-data
STORAGE_DIR := .local/storage
NVM := source $$HOME/.nvm/nvm.sh && nvm use $(CURDIR)

.PHONY: help colima db env fixtures seed install data-fetch run-eligibility generate-cra-response generate-cra-wkl poll-cra-response backend restart-backend stop-backend frontend dev stop reset-db

BACKEND_PORT ?= 3000
BACKEND_WATCH ?= 1

help:
	@echo "CSA local development (Colima + npm)"
	@echo ""
	@echo "  make colima     Start Colima"
	@echo "  make db         Start Postgres, run migrations, seed (staging + contacts + fixtures)"
	@echo "  make env        Copy .env.example -> .env (if missing)"
	@echo "  make install    npm install in backend and frontend"
	@echo "  make fixtures   Copy current mock-data ICM/MIS files to .local/storage (optional)"
	@echo "  make seed       Seed the database (clears and re-seeds dev data)"
	@echo "  make data-fetch Run Data Fetch job (ICM/MIS ingest from .local/storage)"
	@echo "  make run-eligibility  Run Eligibility job (after data-fetch for new contacts)"
	@echo "  make generate-cra-response  Build mock CRA RSP (RESPONSE_OUTCOME=accepted|rejected|recycled|mixed|list)"
	@echo "  make generate-cra-wkl       Build mock CRA WKL (WKL_OUTCOME=approved|refused|mixed|list)"
	@echo "  make poll-cra-response      Process inbound CRA response files (after generate-cra-response)"
	@echo "  make backend          Start NestJS API on http://localhost:$(BACKEND_PORT) (watch; BACKEND_WATCH=0 to disable)"
	@echo "  make restart-backend  Stop any process on port $(BACKEND_PORT), then start backend (BACKEND_WATCH=0 to disable watch)"
	@echo "  make stop-backend     Stop the process listening on port $(BACKEND_PORT)"
	@echo "  make frontend   Start Vite UI on http://localhost:5173"
	@echo "  make dev        db + backend + frontend (parallel)"
	@echo "  make stop       Stop Docker services"
	@echo "  make reset-db   Reset database volume, migrate, and seed"

colima:
	colima start

env:
	@test -f $(BACKEND_DIR)/.env || cp $(BACKEND_DIR)/.env.example $(BACKEND_DIR)/.env
	@test -f $(FRONTEND_DIR)/.env || cp $(FRONTEND_DIR)/.env.example $(FRONTEND_DIR)/.env
	@echo "Environment files ready."

install: env
	cd $(BACKEND_DIR) && $(NVM) && npm install
	cd $(FRONTEND_DIR) && $(NVM) && npm install

fixtures:
	@mkdir -p $(STORAGE_DIR)/mis $(STORAGE_DIR)/icm $(STORAGE_DIR)/cra-mock/inbound $(STORAGE_DIR)/cra-mock/outbound
	@cp $(FIXTURES_SRC)/mis/*.csv $(STORAGE_DIR)/mis/
	@cp $(FIXTURES_SRC)/icm/*.json $(STORAGE_DIR)/icm/
	@echo "Fixture files copied to $(STORAGE_DIR)/"

db: colima env
	docker compose up -d database
	docker compose run --rm migrations
	$(MAKE) seed

seed: env
	cd $(BACKEND_DIR) && $(NVM) && npx prisma generate && npx prisma db seed

data-fetch: env fixtures
	cd $(BACKEND_DIR) && $(NVM) && npm run build && DEPLOY_ENV=local npm run job:data-ingestion

run-eligibility: env
	cd $(BACKEND_DIR) && $(NVM) && npm run build && DEPLOY_ENV=local npm run job:run-eligibility

generate-cra-response: env
	cd $(BACKEND_DIR) && $(NVM) && npm run local:generate-cra-response $(OUTBOUND_FILE) $(RESPONSE_OUTCOME)

generate-cra-wkl: env
	cd $(BACKEND_DIR) && $(NVM) && npm run local:generate-cra-wkl $(OUTBOUND_FILE) $(WKL_OUTCOME)

poll-cra-response: env
	cd $(BACKEND_DIR) && $(NVM) && npm run build && DEPLOY_ENV=local npm run job:cra-response-poll

backend: env fixtures
	cd $(BACKEND_DIR) && $(NVM) && \
	if [ "$(BACKEND_WATCH)" = "0" ]; then \
		npm run start; \
	else \
		ulimit -n 10240 2>/dev/null || true; \
		npm run start:dev; \
	fi

stop-backend:
	@pids=$$(lsof -ti :$(BACKEND_PORT) 2>/dev/null || true); \
	if [ -n "$$pids" ]; then \
		echo "Stopping backend on port $(BACKEND_PORT) (pids: $$pids)..."; \
		kill $$pids 2>/dev/null || true; \
		sleep 1; \
		pids=$$(lsof -ti :$(BACKEND_PORT) 2>/dev/null || true); \
		if [ -n "$$pids" ]; then kill -9 $$pids 2>/dev/null || true; fi; \
	else \
		echo "No process listening on port $(BACKEND_PORT)."; \
	fi

restart-backend: stop-backend
	$(MAKE) backend

frontend: env
	cd $(FRONTEND_DIR) && $(NVM) && npm run dev

dev: db
	$(MAKE) -j2 backend frontend

stop:
	docker compose down

reset-db: stop
	docker compose down -v
	$(MAKE) db
