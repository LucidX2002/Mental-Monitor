# Mental Monitor

Mental Monitor 是一个前后端分离的心理健康监测演示项目，用于对社区用户的多模态特征进行聚合分析，并提供风险筛查、用户画像和相似用户推荐能力。

项目当前聚焦 4 个核心场景：

- 全局概览：展示社区整体风险分布和关键统计指标
- 风险筛查：根据人格特征阈值筛出高风险用户
- 用户画像：查看单个用户的人格、行为和帖子摘要
- 相似推荐：基于融合嵌入返回相似用户列表

## 架构

```text
frontend/  静态前端页面，负责展示和交互
backend/   Python API，负责数据读取、解析、筛查和推荐
data/      运行时数据挂载目录
tests/     回归测试
scripts/   本地开发辅助脚本
```

前端通过 HTTP 接口调用后端，不直接读取本地数据文件。

## 技术栈

- Frontend: HTML, CSS, Vanilla JavaScript
- Backend: Python 3.11, `http.server`, `pandas`, `numpy`, `scikit-learn`
- Testing: `unittest`

## 快速开始

### 1. 安装依赖

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. 准备数据

后端默认读取以下文件：

- `data/personality.csv`
- `data/behavior.csv`
- `data/posts.csv`
- `data/embeddings/fused_embeddings.npy`

如果本地已经保留旧实验数据，可以执行：

```bash
python scripts/bootstrap_data.py
```

该脚本会把本地归档数据链接到 `data/` 目录，方便当前应用直接读取。

也可以通过环境变量覆盖默认路径：

- `MENTAL_PERSONALITY_CSV`
- `MENTAL_BEHAVIOR_CSV`
- `MENTAL_POSTS_CSV`
- `MENTAL_EMBEDDINGS_NPY`
- `MENTAL_STATE_JSON`

### 3. 启动后端

```bash
python -m backend --host 127.0.0.1 --port 8000
```

### 4. 启动前端

```bash
python -m http.server 4173 -d frontend
```

访问：

```text
http://127.0.0.1:4173
```

如果后端不在同一地址，可以通过查询参数指定接口地址：

```text
http://127.0.0.1:4173/?apiBase=http://127.0.0.1:9000
```

### 5. 一键启动开发环境

```bash
python scripts/dev.py
```

## API

主要接口如下：

- `GET /api/health`
- `GET /api/summary`
- `GET /api/scatter`
- `GET /api/users`
- `GET /api/users/{id}`
- `GET /api/users/{id}/recommendations`
- `POST /api/users/{id}/case-state`

## 测试

运行回归测试：

```bash
python -m unittest discover -s tests -v
```

## 目录说明

- `backend/config.py`：运行路径配置
- `backend/repository.py`：数据加载与状态持久化
- `backend/service.py`：业务逻辑聚合层
- `backend/http.py`：HTTP API 入口
- `frontend/app.js`：前端数据拉取与交互逻辑

## 注意事项

- `data/` 是运行时数据目录，不建议作为大规模数据仓库存放原始文件
- `legacy/` 为本地归档内容，不属于当前应用主干
- 当前版本使用轻量静态前端，便于直接部署和快速演示
