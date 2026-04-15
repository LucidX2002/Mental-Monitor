# Mental Monitor

A GitHub-ready mental health monitoring demo with a separated frontend and backend. The app focuses on four core flows: overview metrics, risk screening, user profiles, and similar-user recommendations.

## What This Repository Contains

```text
backend/   Python API, data loading, recommendation logic, case-state persistence
frontend/  Static HTML/CSS/JS client that consumes the backend API
data/      Clean data mount points used by the app at runtime
scripts/   Local helper scripts for bootstrapping data and starting dev servers
tests/     Regression tests for parsing, merge logic, and recommendation behavior
legacy/    Local-only archived experiments, models, and artifacts (gitignored)
```

The repository is code-first. Large datasets, trained models, and old experiment outputs are intentionally kept out of version control.

## Requirements

- Python 3.11+
- `pip`
- Optional: an existing local copy of the legacy dataset/artifacts if you want to use `scripts/bootstrap_data.py`

## Installation

1. Clone the repository:

```bash
git clone <your-repo-url>
cd mental-monitor
```

2. Create and activate a virtual environment:

```bash
python -m venv .venv
source .venv/bin/activate
```

3. Install dependencies:

```bash
pip install -r requirements.txt
```

## Data Setup

The backend looks for these runtime files first:

- `data/personality.csv`
- `data/behavior.csv`
- `data/posts.csv`
- `data/embeddings/fused_embeddings.npy`

You have two ways to provide them:

### Option 1: Mount clean app data directly

Copy your prepared files into the `data/` directory using the exact names above.

### Option 2: Reuse local legacy assets

If this machine already has the archived local experiment files under `legacy/`, create links into `data/`:

```bash
python scripts/bootstrap_data.py
```

You can also override every path with environment variables:

- `MENTAL_PERSONALITY_CSV`
- `MENTAL_BEHAVIOR_CSV`
- `MENTAL_POSTS_CSV`
- `MENTAL_EMBEDDINGS_NPY`
- `MENTAL_STATE_JSON`

## Run Locally

Start the backend:

```bash
python -m backend --host 127.0.0.1 --port 8000
```

Start the frontend:

```bash
python -m http.server 4173 -d frontend
```

Open:

```text
http://127.0.0.1:4173
```

The frontend defaults to the backend on the same host at port `8000`. To point the UI at another API host:

```text
http://127.0.0.1:4173/?apiBase=http://127.0.0.1:9000
```

For local development, you can also launch both servers together:

```bash
python scripts/dev.py
```

## API Endpoints

- `GET /api/health`
- `GET /api/summary`
- `GET /api/scatter`
- `GET /api/users`
- `GET /api/users/{id}`
- `GET /api/users/{id}/recommendations`
- `POST /api/users/{id}/case-state`

## Test

Run the regression suite:

```bash
python -m unittest discover -s tests -v
```

## Publish To GitHub

If you are creating a new GitHub repository for this project, the usual flow is:

1. Initialize git locally:

```bash
git init -b main
git add .
git commit -m "Publish a clean frontend/backend split for mental monitor

Constraint: Repository excludes large datasets and local-only artifacts
Confidence: high
Scope-risk: moderate
Tested: python -m unittest discover -s tests -v
Not-tested: Browser screenshot validation on remote hosts"
```

2. Create an empty GitHub repository on github.com.

Recommended:

- Name: `mental-monitor`
- Visibility: `private` first, switch to `public` only after checking data/privacy constraints

3. Connect and push:

```bash
git remote add origin git@github.com:<your-user>/mental-monitor.git
git push -u origin main
```

If you prefer HTTPS:

```bash
git remote add origin https://github.com/<your-user>/mental-monitor.git
git push -u origin main
```

## Notes

- `legacy/` is intentionally local-only and ignored by git.
- `data/` is treated as a runtime mount point, not a dataset warehouse.
- The current frontend is framework-free on purpose: it keeps the deployment surface small and easy to review.
