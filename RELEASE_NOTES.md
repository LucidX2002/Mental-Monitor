# Release Bundle Notes

建议在 GitHub Release 中同时发布：

1. 源代码归档  
   直接使用 GitHub 自动生成的 source code 归档

2. 运行资源包  
   使用 `scripts/build_release_bundle.py` 生成的文件：

```text
mental-monitor-runtime-YYYYMMDD.zip
mental-monitor-runtime-YYYYMMDD.manifest.json
mental-monitor-runtime-YYYYMMDD.sha256
```

## 建议的 Release 标题

```text
Mental Monitor Runtime Bundle (YYYY-MM-DD)
```

## 建议的 Release 描述

```md
This release contains the minimal runtime bundle for Mental Monitor.

Included in the runtime zip:

- `models/all-MiniLM-L6-v2`
- `data/personality.csv`
- `data/behavior.csv`
- `data/posts.csv`
- `data/embeddings/fused_embeddings.npy`

How to use:

1. Download the source code archive or clone the repository
2. Download `mental-monitor-runtime-YYYYMMDD.zip`
3. Extract the runtime zip into the repository root
4. Install Python dependencies from `requirements.txt`
5. Run:

   - `python -m backend --host 127.0.0.1 --port 8000`
   - `python -m http.server 4173 -d frontend`
```
