# PickAI · AI智能选品助手

AI驱动的智能选品工具，帮用户从拼多多等电商平台找到最符合需求的商品。

## 功能特点

- 🤖 **AI动态问题生成** - 根据用户需求智能生成针对性问题
- 🎯 **精准风格匹配** - 基于用户选择推荐符合风格的商品
- 💰 **预算智能过滤** - 严格按预算范围筛选商品
- 🛒 **真实商品链接** - 返回真实可购买的商品

## 技术栈

- **前端**: 原生 HTML/CSS/JavaScript
- **后端**: Node.js + Express
- **AI**: 火山引擎 DeepSeek-V3
- **电商API**: 拼多多多多进宝DDK

## 本地开发

```bash
# 安装依赖
cd server && npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入你的API密钥

# 启动服务
npm start
```

访问 http://localhost:3000/ai-picker.html

## Vercel部署

1. Fork 本仓库
2. 在 Vercel 导入项目
3. 在 Project Settings → Environment Variables 添加环境变量：
   - `DEEPSEEK_API_KEY`
   - `DEEPSEEK_API_URL`
   - `DEEPSEEK_MODEL`
   - `PDD_CLIENT_ID`
   - `PDD_CLIENT_SECRET`
   - `PDD_PID`
4. 部署

## 项目结构

```
├── public/              # 前端静态文件
│   └── ai-picker.html
├── server/              # 后端服务
│   ├── server.js
│   ├── package.json
│   └── .env.example
├── vercel.json          # Vercel配置
└── package.json
```

## License

MIT
