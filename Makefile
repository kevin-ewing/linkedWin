.PHONY: zip tango help

PLAYLIST_ZIP = https://www.youtube.com/playlist?list=PLLE2dY85AtnfQA-RHK7qynggMLKDMHHJ3
PLAYLIST_TANGO = https://www.youtube.com/playlist?list=PLLE2dY85AtnfSpGLBlq9YQwxQQxLVi66w

# Persistent Chrome profile so login is remembered between sessions
CHROME_DATA_DIR = $(HOME)/.linkedwin-chrome
# Ephemeral Chrome profile for dev/testing (fresh every time)
CHROME_DEV_DIR = /tmp/linkedwin-chrome-dev
CHROME_BIN = /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

chrome: ## Launch Chrome with remote debugging (remembers login)
	$(CHROME_BIN) --remote-debugging-port=9222 --user-data-dir=$(CHROME_DATA_DIR) "https://www.linkedin.com/games"

chrome-dev: ## Launch Chrome with fresh profile (no saved state)
	@rm -rf $(CHROME_DEV_DIR)
	$(CHROME_BIN) --remote-debugging-port=9222 --user-data-dir=$(CHROME_DEV_DIR) "https://www.linkedin.com/games"

zip: ## Scrape LinkedIn Zip screenshots
	./scripts/screenshot_playlist.sh zip "$(PLAYLIST_ZIP)"

tango: ## Scrape LinkedIn Tango screenshots
	./scripts/screenshot_playlist.sh tango "$(PLAYLIST_TANGO)"


.PHONY: solve-tango solve-zip solve-patches solve-all test chrome chrome-dev

solve-tango: ## Solve LinkedIn Tango puzzle
	./scripts/solve-tango.sh

solve-zip: ## Solve LinkedIn Zip puzzle
	./scripts/solve-zip.sh

solve-patches: ## Solve LinkedIn Patches puzzle
	./scripts/solve-patches.sh

solve-all: ## Launch Chrome, solve all three games, return to games menu
	@echo "Starting Chrome with remote debugging..."
	@$(CHROME_BIN) --remote-debugging-port=9222 --user-data-dir=$(CHROME_DATA_DIR) "https://www.linkedin.com/games" &
	@echo "Waiting for Chrome to be ready..."
	@for i in $$(seq 1 30); do \
		curl -s http://localhost:9222/json/version > /dev/null 2>&1 && break; \
		sleep 1; \
	done
	@echo "Solving Tango..."
	./scripts/solve-tango.sh
	@echo "Solving Zip..."
	./scripts/solve-zip.sh
	@echo "Solving Patches..."
	./scripts/solve-patches.sh
	@echo "Navigating back to games menu..."
	@node -e "const{chromium}=require('playwright');(async()=>{const b=await chromium.connectOverCDP('http://localhost:9222');const p=b.contexts()[0].pages()[0];await p.goto('https://www.linkedin.com/games',{waitUntil:'domcontentloaded'});b.close();})()"
	@echo "Done! All games solved."

test: ## Run tests
	npm test
