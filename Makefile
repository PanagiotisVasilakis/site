SHELL := /usr/bin/env bash

ORCH := ./scripts/system-orchestrator.sh
PROFILE ?= production

.PHONY: bootstrap up up-dev down restart status logs logs-follow verify build migrate check strict-up systemd-install

bootstrap:
	$(ORCH) bootstrap --profile $(PROFILE)

up:
	$(ORCH) up --profile $(PROFILE)

up-dev:
	$(ORCH) up --profile development --skip-build

down:
	$(ORCH) down --profile $(PROFILE)

restart:
	$(ORCH) restart --profile $(PROFILE)

status:
	$(ORCH) status --profile $(PROFILE)

logs:
	$(ORCH) logs --profile $(PROFILE)

logs-follow:
	$(ORCH) logs --profile $(PROFILE) --follow

verify:
	$(ORCH) verify --profile $(PROFILE)

build:
	$(ORCH) build --profile $(PROFILE)

migrate:
	$(ORCH) migrate --profile $(PROFILE)

check:
	$(ORCH) check --profile $(PROFILE)

strict-up:
	$(ORCH) up --profile $(PROFILE) --strict

systemd-install:
	sudo ./scripts/install-systemd-services.sh --service-name qr-city-guide
