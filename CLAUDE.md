# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Critical Rules

### NEVER Touch Upstream Repository
**NEVER push, publish, or make any changes to the upstream repository (plexguide/Huntarr.io).**
- Only work with adamflagg/huntarr fork
- All Docker image publishing goes to ghcr.io/adamflagg/huntarr
- All git operations target origin (adamflagg/huntarr), never upstream

## Project Overview

Huntarr is a media automation tool that searches for missing content and quality upgrades in *arr applications (Sonarr, Radarr, Lidarr, Readarr, Whisparr). It runs continuously, querying these applications in configurable cycles to find and download missing media while being gentle on indexers.

## Build & Run Commands

```bash
# Local development
python main.py                    # Runs on port 9705

# Docker development (recommended)
docker-compose down && docker-compose up -d --build
docker logs huntarr               # Check logs

# Access UI
http://localhost:9705
```

## Architecture

### Backend (Python/Flask)
- **Entry Point**: `main.py` - Starts Flask web server (Waitress in production) and background processing threads
- **Web Server**: `src/primary/web_server.py` - Flask app with routes and SSE streaming
- **Background Processing**: `src/primary/background.py` - Main hunting loop that cycles through enabled apps

### App Module Pattern
Each supported app follows the same structure in `src/primary/apps/{app}/`:
- `api.py` - API client wrapper for the *arr application
- `missing.py` - Logic for finding and searching missing content
- `upgrade.py` - Logic for finding content below quality cutoff

Base classes in `src/primary/apps/base/`:
- `api_client.py` - Base API client with retry logic and rate limiting
- `routes.py` - Base Flask blueprint for common endpoints
- `pagination.py` - Paginated API fetching
- `tag_manager.py` - Tag-based filtering

### Frontend (Vanilla JS)
- **Main UI Logic**: `frontend/static/js/new-main.js` - SPA with hash-based routing
- **Settings Forms**: `frontend/static/js/settings_forms.js` - Dynamic form generation for app settings
- **Templates**: `frontend/templates/` - Jinja2 templates, components in `components/` subdirectory

### Data Storage
SQLite database with automatic environment detection:
- **Docker**: `/config/huntarr.db`
- **Local**: `./data/huntarr.db`

Key database operations via `src/primary/utils/database.py`:
```python
from src.primary.utils.database import get_database
db = get_database()
db.get_setting('sonarr', 'api_key')
db.set_setting('sonarr', 'api_key', 'value')
```

### Configuration Paths
`src/primary/utils/config_paths.py` handles cross-platform path resolution:
- Docker: `/config/` base directory
- Local: `./data/` base directory

## Key Patterns

### URL Handling
Always use relative URLs for subpath deployment compatibility:
```javascript
// Correct
fetch('./api/endpoint')
window.location.href = './'

// Wrong - breaks under subpath like domain.com/huntarr/
fetch('/api/endpoint')
window.location.href = '/'
```

### Multi-Instance Support
Each app supports multiple instances. Settings stored with instance index:
```python
db.get_setting('sonarr', 'api_url')      # Instance 0
db.get_setting('sonarr', 'api_url_1')    # Instance 1
```

### Sidebar Navigation
Three-sidebar system in frontend:
1. Main Sidebar (`#sidebar`) - Home, Apps, Settings, Logs
2. Apps Sidebar (`#apps-sidebar`) - Individual app navigation
3. Settings Sidebar (`#settings-sidebar`) - Settings categories

Clicking "Apps" redirects to Sonarr by default (most common app).

### Environment Detection
```python
# Docker detected by /config directory existence
if os.path.exists('/config'):
    # Docker environment
else:
    # Local development
```

## Critical Rules from rules.md

1. **Never hardcode paths** - Use `os.path.join()` and environment detection
2. **Never use absolute URLs** in frontend - Always relative (`./api/` not `/api/`)
3. **Use DatabaseManager** - Never direct SQLite calls outside database.py
4. **Test both environments** - Docker and local development
5. **Rebuild for testing**: `docker-compose down && docker-compose up -d --build`

## API Structure

Routes registered in `src/primary/web_server.py`:
- `/api/settings/{app}` - GET/POST app settings
- `/api/{app}/status` - App connection status
- `/api/{app}/trigger` - Manual search trigger
- `/logs` - SSE endpoint for real-time logs
- `/api/backup/*` - Backup/restore operations

App-specific routes in `src/primary/apps/{app}_routes.py`.

## Logging

Database-backed logging system:
- `src/primary/utils/logger.py` - Main logger setup
- `src/primary/utils/clean_logger.py` - Frontend-consumable logs via SSE
- Logs stored in database, streamed to frontend via Server-Sent Events

## Debugging

### Database Access
```bash
# Access database in Docker
docker exec -it huntarr sqlite3 /config/huntarr.db
.tables                    # List all tables
.schema settings           # Show table schema
SELECT * FROM settings WHERE app_name='sonarr';
```

### Common Issues
- **Subpath deployment breaks**: Ensure all frontend URLs are relative (`./api/` not `/api/`)
- **Database errors**: Always use `get_database()` from `src/primary/utils/database.py`, never direct SQLite
- **Settings not persisting**: Check database exists: `docker exec huntarr ls -la /config/huntarr.db`
