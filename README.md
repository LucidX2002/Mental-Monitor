# Mental Monitor

基于网络数据的青少年心理画像与风险预警系统。

这个项目是一个前后端分离的演示系统，用于把网络文本、行为特征和融合表示整合到一个可交互的界面中，支持总体画像展示、风险预警、个体研判、趋势分析和单文本辅助判断。

## 当前页面

- `总览大屏`：用户画像分布图、风险分层、主导人格分布、社区板块分布
- `风险预警`：高风险筛查、名单表格、卡片视图、名单导出与打印
- `个体画像`：人格雷达图、风险解释、处置记录时间线、单用户趋势、相似用户对比、画像导出
- `趋势分析`：群体月度活跃趋势与高风险/稳定群体行为差异
- `文本研判`：输入一段文本，输出五维人格分布、风险辅助判断和相似用户参考

## 项目结构

```text
backend/   Python API、数据加载、状态持久化、推理与聚合逻辑
frontend/  静态前端页面与交互脚本
data/      运行时数据挂载目录
scripts/   本地开发与检查脚本
tests/     回归测试
legacy/    本地归档数据、旧实验代码和模型
```

## 环境要求

- Python `3.11.x`
- `pip`

当前 README 和依赖版本基于已验证环境：

- Python `3.11.12`
- NumPy `1.26.4`
- pandas `2.2.3`
- scikit-learn `1.8.0`
- sentence-transformers `5.3.0`
- torch `2.7.0`
- transformers `4.52.3`

## 安装依赖

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

如果你还想运行 `legacy/` 下的旧实验和旧演示，再额外安装：

```bash
pip install -r requirements-legacy.txt
```

## 数据准备

默认读取以下运行时文件：

- `data/personality.csv`
- `data/behavior.csv`
- `data/posts.csv`
- `data/embeddings/fused_embeddings.npy`

如果本地已经保留了 `legacy/` 下的归档数据，可以执行：

```bash
python scripts/bootstrap_data.py
```

该脚本会把本地归档数据链接到 `data/` 目录。

也可以通过环境变量覆盖路径：

- `MENTAL_PERSONALITY_CSV`
- `MENTAL_BEHAVIOR_CSV`
- `MENTAL_POSTS_CSV`
- `MENTAL_EMBEDDINGS_NPY`
- `MENTAL_STATE_JSON`
- `MENTAL_TEXT_MODEL_ID`
- `MENTAL_TEXT_MODEL_DIR`
- `MENTAL_LOCAL_TEXT_ENCODER`

## 启动方式

### 1. 启动后端

```bash
python -m backend --host 127.0.0.1 --port 8000
```

### 2. 启动前端静态服务

```bash
python -m http.server 4173 -d frontend
```

### 3. 打开页面

```text
http://127.0.0.1:4173/index.html
```

可访问的页面：

- `http://127.0.0.1:4173/index.html`
- `http://127.0.0.1:4173/alerts.html`
- `http://127.0.0.1:4173/profile.html`
- `http://127.0.0.1:4173/trends.html`
- `http://127.0.0.1:4173/inference.html`

如果后端不是本机 `8000`，可以通过 `apiBase` 指定：

```text
http://127.0.0.1:4173/index.html?apiBase=http://your-host:port
```

## 文本研判说明

文本研判优先尝试本地人格分类模型；如果未找到该模型，会自动回退到：

- 本地 `all-MiniLM-L6-v2`
- 本地融合嵌入
- 相似用户近邻协同推断

因此在离线环境下，文本研判仍可工作。

## 导出能力

- 风险预警页：
  - 导出预警名单 CSV
  - 打印预警报告，可在浏览器中另存为 PDF
- 个体画像页：
  - 打印用户画像报告，可在浏览器中另存为 PDF

## 测试与检查

运行后端回归测试：

```bash
python -m unittest discover -s tests -v
```

检查前端脚本语法：

```bash
for f in frontend/*.js; do node --check "$f" || exit 1; done
```

运行页面/API 冒烟检查：

```bash
python scripts/ui_smoke.py
```

## API 概览

- `GET /api/health`
- `GET /api/summary`
- `GET /api/dashboard`
- `GET /api/scatter`
- `GET /api/users`
- `GET /api/users/{id}`
- `GET /api/users/{id}/recommendations`
- `GET /api/users/{id}/timeline`
- `GET /api/trends`
- `POST /api/users/{id}/case-state`
- `POST /api/analyze-text`

## 常见问题

### 页面看起来像旧版本

浏览器可能缓存了旧的静态资源。可以：

- 强制刷新
  - Windows / Linux: `Ctrl + Shift + R`
  - macOS: `Cmd + Shift + R`
- 直接重新打开具体页面

### 文本研判提示模型加载失败

如果本地没有人格分类模型，系统会自动尝试本地近邻协同推断。  
如果两种模式都失败，请检查：

- `legacy/models/all-MiniLM-L6-v2` 是否存在
- `data/embeddings/fused_embeddings.npy` 是否存在

### 导出报告没有弹出

打印报告依赖浏览器允许弹窗。  
如果浏览器拦截弹窗，请允许当前站点弹窗后重试。

## 依赖说明

### 当前主系统依赖

`requirements.txt` 对应当前真实在运行的系统代码：

- `numpy`
- `pandas`
- `scikit-learn`
- `scipy`
- `sentence-transformers`
- `torch`
- `transformers`

这些版本已经按当前环境锁定，目的是减少“别人安装后版本漂移导致行为不同”的风险。

### legacy 附加依赖

`requirements-legacy.txt` 对应 `legacy/` 下归档代码中出现过、但当前主系统不直接需要的包，例如：

- `matplotlib`
- `plotly`
- `streamlit`
- `umap-learn`
- `networkx`
- `pyvis`
- `tqdm`

如果你只运行当前系统，不需要安装这些附加依赖。
