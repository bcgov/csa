SHELL := /bin/bash
.NONESHELL:

BACKEND_DIR := backend
FRONTEND_DIR := frontend
NVM := source $$HOME/.nvm/nvm.sh && nvm use

.PHONY: help colima db env seed backend frontend dev stop reset-db

help:
	@echo "CSA local development (Colima + npm)"
	@echo ""
	@echo "  make colima     Start Colima"
	@echo "  make db         Start Postgres, run migrations, and seed"
	@echo "  make env        Copy .env.example -> .env (if missing)"
	@echo "  make seed       Seed the database (clears and re-seeds dev data)"
	@echo "  make backend    Start NestJS API on http://localhost:3000"
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

db: colima env
	docker compose up -d database
	docker compose run --rm migrations
	$(MAKE) seed

seed: env
	cd $(BACKEND_DIR) && $(NVM) && npx prisma generate && npx prisma db seed

backend: env
	cd $(BACKEND_DIR) && $(NVM) && npm run start:dev

frontend: env
	cd $(FRONTEND_DIR) && $(NVM) && npm run dev

dev: db
	$(MAKE) -j2 backend frontend

stop:
	docker compose down

reset-db: stop
	docker compose down -v
	$(MAKE) db
