# Repository Guidelines

## Project Structure & Module Organization
This repository is organized by workflow stage rather than as an installable package. Run commands from the repo root so relative paths resolve correctly.

- `0_dataset/`: data cleaning, simulated-user generation, personality inference, and raw CSV/NPY assets.
- `1_code/`: first-pass embedding, clustering, matching, and recommendation experiments.
- `2_code/`: current fusion training, evaluation, visualization, saved embeddings, and TensorBoard runs.
- `3_frontend/`: Streamlit and Gradio demos plus lightweight UI state in `intervention_state.json`.
- `all-MiniLM-L6-v2/`: checked-in local sentence-transformer model files.

## Build, Test, and Development Commands
There is no central build system or package manifest in this snapshot; use script entry points directly.

- `python 0_dataset/personality.py`: infer Big Five probabilities from `RedditMH/reddit_simulated_user_level.csv`.
- `python 0_dataset/embedding.py`: build user text embeddings and save `RedditMH/user_embeddings.npy`.
- `python 2_code/fusion_v2.py --epochs 500 --batch_size 512`: train the residual fusion model and write `.npy` outputs into `2_code/`.
- `python 2_code/eval.py`: compute retrieval metrics and export `simuser_top5_fused.csv`.
- `streamlit run 3_frontend/app_streamlit.py`: launch the main dashboard.
- `python 3_frontend/app_gradio.py`: launch the Gradio demo on `127.0.0.1:7860`.

## Coding Style & Naming Conventions
Use Python with 4-space indentation, snake_case for functions/files, and UPPER_SNAKE_CASE for module constants such as `INPUT_CSV` or `MODEL_ID`. Prefer small, script-friendly helpers over deep abstractions. Keep comments short and only where preprocessing, alignment, or calibration logic is non-obvious. Preserve the existing `sim_user_id` sort-and-align pattern before joining CSVs or saving embeddings.

## Testing Guidelines
There is no dedicated `tests/` suite yet. Validate changes with the closest runnable script:

- data or embedding changes: `python 1_code/embedding_check.py`
- retrieval changes: `python 2_code/eval.py`
- visualization changes: `python 2_code/visualize.py` or `python 2_code/visualize_coverage.py`

Treat printed shapes, dtype checks, and alignment assertions as required sanity checks.

## Commit & Pull Request Guidelines
This checkout does not include `.git` history, so follow the repository’s documented Lore-style convention instead of inferring from prior commits. Use a why-first subject line, then add trailers when useful: `Constraint:`, `Rejected:`, `Confidence:`, `Scope-risk:`, `Tested:`, and `Not-tested:`. PRs should state which stage folders changed, which commands were run, what artifacts were regenerated (`.npy`, `.csv`, plots, TensorBoard logs), and include screenshots for `3_frontend/` UI changes.

## Data & Asset Hygiene
Avoid committing scratch files or local UI state changes unless they are intentional fixtures. Large generated outputs should stay in their owning stage directory, not the repo root.
