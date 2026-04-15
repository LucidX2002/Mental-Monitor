# Data Mount

把应用运行所需的最小数据放在这里，不要把大体积原始数据直接提交到仓库。

默认文件名：

- `data/personality.csv`
- `data/behavior.csv`
- `data/posts.csv`
- `data/embeddings/fused_embeddings.npy`

如果本地已经有 `legacy/` 下的旧实验数据，可以运行：

```bash
python scripts/bootstrap_data.py
```

它会把旧路径中的核心文件软链接到这里。
