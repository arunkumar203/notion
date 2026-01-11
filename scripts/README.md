# Automation scripts (UI-driven)

This folder contains Python scripts to create notebooks/sections/topics/pages through the real web app UI (not by writing to the database directly) and to generate ordered `.cpp` files for each topic.

## Files
- `seed_hierarchy_via_ui.py` — Automates login and uses the Notebooks UI to create hierarchy and pages, then writes numbered `.cpp` files locally.
- `seed_from_problems_via_ui.py` — Reads the local `problems/` folder: creates one Topic per subfolder and one Page per `.cpp` in each subfolder, using the app UI.
- `hierarchy.sample.json` — Example input describing notebooks, sections, topics, and pages to create.
- `requirements.txt` — Python dependencies (Playwright + dotenv).

## Prerequisites
- Python 3.9+
- The app running locally at `http://localhost:3000`
- A test user account with email/password enabled
- A `.env` file at repo root or scripts folder with:
  - `BASE_URL=http://localhost:3000`
  - `LOGIN_EMAIL=you@example.com`
  - `LOGIN_PASSWORD=your-password`
  - optional: `HEADLESS=true` (default true)

## Install & run

```bash
# one-time setup
bash scripts/setup_python.sh

# activate venv for current shell
source .venv/bin/activate

# seed using the UI; write C++ files into the sibling `problems/` folder
python scripts/seed_hierarchy_via_ui.py --input scripts/hierarchy.sample.json --out problems --headed

# OR: create Topics from each folder inside `problems/` and Pages from each `.cpp`
python scripts/seed_from_problems_via_ui.py --problems-dir problems --notebook dsa --section problems --headed
```

Notes:
- The script relies on stable UI hooks; if the UI changes, update the selectors in the script.
- Pages are created in order and corresponding `NN-name.cpp` files are written in the `--out` folder (e.g., `problems/`) under `Notebook/Section/Topic/`.
