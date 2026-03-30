/**
 * PickAI Backend Server
 * AI智能选品助手后端服务
 *
 * 支持的AI模型: DeepSeek-V3
 * API兼容: OpenAI格式
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const crypto = require('crypto');

// 尝试加载.env文件（如果存在）
// 优先从项目根目录加载，如果不存在则从当前目录加载
try {
  const fs = require('fs');
  const path = require('path');

  // 尝试从项目根目录（父目录）加载
  const rootEnvPath = path.join(__dirname, '..', '.env');
  const serverEnvPath = path.join(__dirname, '.env');

  if (fs.existsSync(rootEnvPath)) {
    require('dotenv').config({ path: rootEnvPath });
    console.log('✅ 已从根目录加载 .env 文件');
  } else if (fs.existsSync(serverEnvPath)) {
    require('dotenv').config({ path: serverEnvPath });
    console.log('✅ 已从 server 目录加载 .env 文件');
  } else {
    console.log('⚠️ 未找到 .env 文件，将使用环境变量或默认值');
  }
} catch (e) {
  // dotenv未安装，使用环境变量或默认值
  console.log('⚠️ dotenv 未安装，使用环境变量或默认值');
}

const app = express();

// 中间件
app.use(cors());
app.use(express.json());

// 静态文件服务 (Vercel部署时需要)
app.use(express.static(path.join(__dirname, '../public')));

// ============================================
// 配置 - 所有敏感信息从环境变量读取
// ============================================
const CONFIG = {
  // 火山引擎 DeepSeek API配置
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',
  DEEPSEEK_API_URL: process.env.DEEPSEEK_API_URL || 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
  DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL || 'deepseek-v3-2-251201',

  // 拼多多API配置
  PDD_CLIENT_ID: process.env.PDD_CLIENT_ID || '',
  PDD_CLIENT_SECRET: process.env.PDD_CLIENT_SECRET || '',
  PDD_PID: process.env.PDD_PID || '',

  // 淘宝客API配置
  TB_APP_KEY: process.env.TB_APP_KEY || '',
  TB_APP_SECRET: process.env.TB_APP_SECRET || '',
  TB_PID: process.env.TB_PID || '',

  // 1688配置
  ALI_APP_KEY: process.env.ALI_APP_KEY || '',
  ALI_APP_SECRET: process.env.ALI_APP_SECRET || ''
};

// ============================================
// v1.5 全局AI系统提示词
// ============================================
const V1_5_SYSTEM_PROMPT = `你是一个顶级的 AI 电商选品顾问。你的核心任务是通过"渐进式追问"，帮助用户将模糊的购物意图，转化为可以直接调用拼多多 API 的精准搜索关键词和价格区间。

## 交互逻辑与状态判断
系统采用【串联式动态生成】。每次系统会传入用户的《初始意图》以及《已选标签》（如果有）。
你需要根据传入的信息，严格执行以下两步逻辑之一，并只返回当前步骤对应的 1 个问题数据。

---
### 🔴 状态 1：当《已选标签》为空时（生成第一步：定框架与预算）
**目标**：划定商品的核心形态和用户的购买预算。
**生成规则**：
1. 【标题要求】结合用户的《初始意图》，生成一句口语化的询问，必须包含价格或款式的暗示。
2. 【标签构成】必须生成 6-8 个标签。其中必须包含 2-3 个符合该品类真实市场价的【价格/预算标签】，以及 4-5 个该品类的【核心分类/款式/形态标签】。
3. 【价格标签注意】价格区间必须符合拼多多下沉市场的特性，切忌定得过高。

### 🔵 状态 2：当《已选标签》有内容时（生成第二步：定风格与长尾词）
**目标**：在用户已选定的框架和预算下，挖掘细分风格、材质或特殊痛点。
**生成规则**：
1. 【强上下文相关】必须仔细分析《已选标签》。如果用户选了"低预算"，绝不能生成"重工/真丝"等高价标签；如果用户选了特定款式，细节必须围绕该款式展开。
2. 【标题要求】将《已选标签》的核心词自然融入标题中，例如："既然是 [标签词] 的 [商品]，你更偏好什么风格？"
3. 【标签构成】生成 6-8 个长尾标签。聚焦于：视觉风格（如韩系、复古）、受众特征（如微胖显瘦、学生党）、特定场景（如送礼、宿舍用）或附加功能。绝不能再出现价格标签。

---
## 选项 (Options) 字段设计规范
1. \`emoji\`：必须与标签气质高度契合（1个字符）。
2. \`label\`：核心展示词（2-5个字），要求凝练。
3. \`value\`：【极其重要】这是传给后端 API 的真实数据。
   - 如果是风格/款式标签，提取最核心的 1-2 个搜索关键词（如："韩系", "V领", "防滑"）。
   - 如果是价格标签，严格输出数字区间格式：\`PRICE:MIN-MAX\`（例如：\`PRICE:0-50\`，\`PRICE:50-9999\`）。

## 输出格式要求
你必须只返回纯粹的 JSON 对象，不要包含 \`\`\`json 标记，不要包含任何解释性文字。格式如下：

{
  "question": "动态生成的标题文案",
  "options": [
    {
      "emoji": "🎨",
      "label": "展示给用户的文案",
      "value": "用于API搜索的关键词或价格区间"
    }
    // ... 输出 6-8 个选项
  ]
}`;
                                                                                                                                                                                                                        
// 验证必要的API配置
if (!CONFIG.DEEPSEEK_API_KEY) {
  console.warn('⚠️ 警告: DEEPSEEK_API_KEY 未设置，AI功能将不可用');
}
if (!CONFIG.PDD_CLIENT_ID || !CONFIG.PDD_CLIENT_SECRET) {
  console.warn('⚠️ 警告: 拼多多API配置不完整，商品搜索功能将不可用');
}

// ============================================
// Fallback 默认问题 (AI调用失败时使用)
// ============================================
const FALLBACK_QUESTIONS = [
  {
    question: "你更喜欢哪种整体风格？",
    options: [
      { emoji: "🤍", label: "简约低调", desc: "黑白灰，极简线条", value: "简约低调" },
      { emoji: "🌸", label: "轻熟活力", desc: "马卡龙色，甜而不腻", value: "轻熟活力" },
      { emoji: "💼", label: "商务干练", desc: "皮质感，正式有气场", value: "商务干练" },
      { emoji: "🌿", label: "自然慵懒", desc: "大地色，舒适随性", value: "自然慵懒" }
    ]
  },
  {
    question: "你的预算大概是？",
    options: [
      { emoji: "💰", label: "25元以内", desc: "超实惠，够用就好", value: "25元以内" },
      { emoji: "💵", label: "25-50元", desc: "平价实用，性价比高", value: "25-50元" },
      { emoji: "💳", label: "50-150元", desc: "质价比优先", value: "50-150元" },
      { emoji: "🎁", label: "150-300元", desc: "品质与颜值兼顾", value: "150-300元" },
      { emoji: "✨", label: "300元以上", desc: "好设计值得投资", value: "300元以上" }
    ]
  }
];

// 根据品类分类的Fallback问题
const CATEGORY_FALLBACKS = {
  '包': {
    question: "你更喜欢哪种包的风格？",
    options: [
      { emoji: "🎒", label: "简约通勤", desc: "黑白灰，上班百搭", value: "简约通勤" },
      { emoji: "👜", label: "时尚轻熟", desc: "设计感，约会首选", value: "时尚轻熟" },
      { emoji: "💼", label: "商务正式", desc: "皮质，有气场", value: "商务正式" },
      { emoji: "🏕️", label: "休闲运动", desc: "轻便，实用主义", value: "休闲运动" }
    ]
  },
  '衣': {
    question: "你喜欢什么版型风格？",
    options: [
      { emoji: "🧥", label: "宽松慵懒", desc: "oversize，舒适随性", value: "宽松慵懒" },
      { emoji: "👔", label: "修身合体", desc: "显身材，有精神", value: "修身合体" },
      { emoji: "🧣", label: "文艺复古", desc: "有质感，显品味", value: "文艺复古" },
      { emoji: "🎽", label: "简约基础", desc: "百搭款，不出错", value: "简约基础" }
    ]
  },
  '耳机': {
    question: "你更注重哪方面？",
    options: [
      { emoji: "🎵", label: "音质优先", desc: "听感第一", value: "音质优先" },
      { emoji: "🔇", label: "降噪功能", desc: "安静沉浸", value: "降噪功能" },
      { emoji: "⏱️", label: "续航持久", desc: "电量焦虑", value: "续航持久" },
      { emoji: "💎", label: "外观颜值", desc: "好看重要", value: "外观颜值" }
    ]
  }
};

// ============================================
// AI 动态问题生成接口 - 问题一
// ============================================
app.post('/api/ai/questions', async (req, res) => {
  const { userInput, questionNumber, excludeTags } = req.body;

  if (!userInput || !userInput.trim()) {
    return res.status(400).json({ error: '请输入你想买什么' });
  }

  // v1.5: 只生成问题一
  try {
    const question = await generateQuestion1(userInput, excludeTags || []);
    res.json({ question });
  } catch (error) {
    console.error('AI问题一生成失败:', error.message);
    const fallbackQ1 = getCategoryFallback(userInput);
    res.json({ question: fallbackQ1, fallback: true });
  }
});

// ============================================
// AI 动态问题生成接口 - 问题二（基于问题一答案）
// v1.5新增 - 支持多选标签数组
// ============================================
app.post('/api/ai/question2', async (req, res) => {
  const { userInput, q1Answers, excludeTags } = req.body;

  if (!userInput || !userInput.trim()) {
    return res.status(400).json({ error: '请输入你想买什么' });
  }

  // 支持单字符串（向后兼容）和数组两种格式
  let answersArray = q1Answers;
  if (!q1Answers) {
    return res.status(400).json({ error: '请先完成问题一' });
  }
  if (typeof q1Answers === 'string') {
    answersArray = [q1Answers];
  }

  try {
    // 调用DeepSeek API生成问题二，传入所有已选标签
    const question = await generateQuestion2(userInput, answersArray, excludeTags || []);
    res.json({ question });
  } catch (error) {
    console.error('AI问题二生成失败:', error.message);
    // Fallback: 预算问题
    const fallbackQ2 = {
      question: "你的预算大概是？",
      options: [
        { emoji: "💰", label: "25元以内", desc: "超实惠，够用就好", value: "25元以内" },
        { emoji: "💵", label: "25-50元", desc: "平价实用，性价比高", value: "25-50元" },
        { emoji: "💳", label: "50-150元", desc: "质价比优先", value: "50-150元" },
        { emoji: "🎁", label: "150-300元", desc: "品质与颜值兼顾", value: "150-300元" },
        { emoji: "✨", label: "300元以上", desc: "好设计值得投资", value: "300元以上" }
      ]
    };
    res.json({ question: fallbackQ2, fallback: true });
  }
});

/**
 * v1.5: 生成问题一（状态1：定框架与预算）
 */
async function generateQuestion1(userInput, excludeTags = []) {
  const excludeStr = excludeTags.length > 0
    ? `\n【换一换排除词】：「${excludeTags.join('、')}」，这些标签刚刚已经展示过，本次生成的所有标签的value字段必须与排除词完全不同，不能语义重复。`
    : '';

  const userPrompt = `用户初始意图：「${userInput}」
已选标签：空（无）${excludeStr}

当前处于【状态1：定框架与预算】
请根据用户意图，生成第一个问题，包含2-3个价格标签和4-5个核心款式标签。
注意：价格标签的value必须使用 PRICE:MIN-MAX 格式，且符合拼多多下沉市场价格。`;

  console.log(`[DeepSeek] 生成问题一, 模型: ${CONFIG.DEEPSEEK_MODEL}`);

  const response = await fetch(CONFIG.DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: CONFIG.DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: V1_5_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 512
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[DeepSeek] API错误:', errorText);
    throw new Error(`火山引擎API错误: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  // 解析JSON
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }

  throw new Error('Invalid response format');
}

/**
 * v1.5: 生成问题二（状态2：定风格与长尾词）
 * @param {string} userInput - 用户初始意图
 * @param {string[]} q1Answers - 问题一选择的标签数组
 */
async function generateQuestion2(userInput, q1Answers, excludeTags = []) {
  // 将标签数组拼接成字符串
  const selectedTags = Array.isArray(q1Answers) ? q1Answers.join('，') : q1Answers;

  const excludeStr = excludeTags.length > 0
    ? `\n【换一换排除词】：「${excludeTags.join('、')}」，这些标签刚刚已经展示过，本次生成的所有标签的value字段必须与排除词完全不同，不能语义重复。`
    : '';

  const userPrompt = `用户初始意图：「${userInput}」
已选标签：「${selectedTags}」${excludeStr}

当前处于【状态2：定风格与长尾词】
请根据已选标签，生成第二个问题。
注意：
1. 问题标题要自然融入已选标签的核心词
2. 生成6-8个长尾风格标签，聚焦于视觉风格、受众特征、场景或功能
3. 绝不能再出现价格标签
4. 如果已选标签包含低预算相关（如"25元以内"、"平价实用"等），绝不能生成高价材质标签（如"重工"、"真丝"、"真皮"等）
5. 要考虑到用户的所有已选标签：${selectedTags}`;

  console.log(`[DeepSeek] 生成问题二, 基于答案: ${selectedTags}`);

  const response = await fetch(CONFIG.DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: CONFIG.DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: V1_5_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 512
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[DeepSeek] API错误:', errorText);
    throw new Error(`火山引擎API错误: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  // 解析JSON
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }

  throw new Error('Invalid response format');
}

/**
 * 智能Fallback：根据用户输入匹配合适的默认问题
 */
function getSmartFallback(userInput) {
  // 检测品类关键词
  for (const [keyword, questionData] of Object.entries(CATEGORY_FALLBACKS)) {
    if (userInput.includes(keyword)) {
      return [questionData, FALLBACK_QUESTIONS[1]]; // 使用品类问题 + 预算问题
    }
  }
  return FALLBACK_QUESTIONS;
}

/**
 * v1.5: 获取问题一的品类Fallback
 */
function getCategoryFallback(userInput) {
  // 检测品类关键词
  for (const [keyword, questionData] of Object.entries(CATEGORY_FALLBACKS)) {
    if (userInput.includes(keyword)) {
      return questionData;
    }
  }
  return FALLBACK_QUESTIONS[0]; // 返回默认的第一个问题
}

// ============================================
// 风格总结 + 商品推荐接口（支持多选标签数组）
// ============================================
app.post('/api/ai/recommend', async (req, res) => {
  const { userInput, q1Answers, q2Answers } = req.body;

  if (!userInput) {
    return res.status(400).json({ error: '缺少必要参数: userInput' });
  }

  // 支持向后兼容：处理字符串或数组格式
  let q1Array = q1Answers || [];
  let q2Array = q2Answers || [];

  // 如果是字符串，转为数组
  if (typeof q1Array === 'string') q1Array = [q1Array];
  if (typeof q2Array === 'string') q2Array = [q2Array];

  // 合并两组标签
  const allTags = [...q1Array, ...q2Array];

  // 从标签中提取价格区间（PRICE:MIN-MAX 格式）
  let priceRange = null;
  const nonPriceTags = [];

  for (const tag of allTags) {
    if (tag && tag.startsWith('PRICE:')) {
      // 提取价格区间，例如 PRICE:0-50
      const priceMatch = tag.match(/PRICE:(\d+)-(\d+)/);
      if (priceMatch) {
        priceRange = {
          min: parseInt(priceMatch[1]),
          max: parseInt(priceMatch[2])
        };
      }
    } else if (tag) {
      nonPriceTags.push(tag);
    }
  }

  // 如果没有提取到价格标签，使用默认值
  const finalPriceRange = priceRange || { min: 50, max: 150 };

  console.log('[推荐] 用户输入:', userInput);
  console.log('[推荐] Q1标签:', q1Array);
  console.log('[推荐] Q2标签:', q2Array);
  console.log('[推荐] 非价格标签:', nonPriceTags);
  console.log('[推荐] 价格区间:', finalPriceRange);

  try {
    // 并行执行：获取商品 + 生成风格总结
    const [products, styleProfile] = await Promise.all([
      fetchProductsFromPlatforms(userInput, nonPriceTags, finalPriceRange),
      generateStyleProfile(userInput, q1Array, q2Array, nonPriceTags)
    ]);

    // AI评分排序
    const scoredProducts = await scoreProducts(products, userInput, nonPriceTags.join(' '), finalPriceRange);

    res.json({
      styleProfile,
      products: scoredProducts.slice(0, 6), // 最多返回6款
      debug: {
        q1Answers: q1Array,
        q2Answers: q2Array,
        allTags: allTags,
        priceRange: finalPriceRange
      }
    });
  } catch (error) {
    console.error('推荐接口失败:', error.message);
    // 返回模拟数据
    const mockData = getMockRecommendation(userInput, nonPriceTags.join(' '), `${finalPriceRange.min}-${finalPriceRange.max}元`);
    res.json(mockData);
  }
});

/**
 * 从多平台获取商品（支持标签数组和价格区间对象）
 * @param {string} userInput - 用户初始意图
 * @param {string[]} styleTags - 非价格标签数组
 * @param {Object} priceRange - 价格区间 {min, max}（单位：元）
 */
async function fetchProductsFromPlatforms(userInput, styleTags, priceRange) {
  // 将标签数组拼接为搜索关键词
  const styleKeywords = Array.isArray(styleTags) ? styleTags.join(' ') : styleTags;

  console.log(`[推荐] 搜索关键词: "${userInput} ${styleKeywords}"，价格区间: ${priceRange.min}-${priceRange.max}元`);

  try {
    // 优先调用拼多多真实API
    const pddProducts = await searchPddGoods(userInput, styleKeywords, priceRange);
    if (pddProducts && pddProducts.length > 0) {
      return pddProducts;
    }
  } catch (error) {
    console.error('拼多多API调用失败:', error.message);
  }

  // 失败时返回模拟数据
  return generateMockProducts(userInput, styleKeywords, priceRange);
}

/**
 * 拼多多商品搜索（支持标签数组和价格范围对象）
 * API文档: https://open.pinduoduo.com/application/document/api?id=pdd.ddk.goods.search
 * @param {string} keyword - 基础关键词
 * @param {string} styleKeywords - 风格关键词（已拼接）
 * @param {Object} priceRange - 价格区间 {min, max}（单位：元）
 */
async function searchPddGoods(keyword, styleKeywords, priceRange) {
  const timestamp = Math.floor(Date.now() / 1000);

  // 将价格转换为分
  const priceMinFen = (priceRange.min || 1) * 100;
  const priceMaxFen = (priceRange.max || 999999) * 100;

  console.log(`[拼多多] 预算参数: ${priceRange.min}-${priceRange.max}元, 解析为: ${priceMinFen/100}-${priceMaxFen/100}元`);

  // 风格关键词映射 - 将用户选择的风格转换为电商搜索词
  const styleKeywordMap = {
    '简约低调': '简约 纯色 黑白灰',
    '轻熟活力': '马卡龙 甜美 气质',
    '商务干练': '商务 皮质 职场',
    '自然慵懒': '文艺 棉麻 大地色',
    '简约通勤': '简约 通勤 百搭',
    '时尚轻熟': '时尚 设计感 气质',
    '商务正式': '商务 正式 皮质',
    '休闲运动': '休闲 运动 轻便',
    '宽松慵懒': '宽松 oversize 舒适',
    '修身合体': '修身 显瘦 合体',
    '文艺复古': '文艺 复古 森系',
    '简约基础': '基础款 百搭 简约',
    '音质优先': 'HiFi 音质 耳机',
    '降噪功能': '降噪 安静 沉浸',
    '续航持久': '长续航 大电量',
    '外观颜值': '颜值 设计 好看',
    // 预算相关的value也映射（AI可能生成这些）
    '平价实用': '平价 实用',
    '质价比优先': '性价比 品质',
    '颜值控': '颜值 设计',
    '品质优先': '品质 高端',
    // 更多风格映射
    '平价大容量': '平价 大容量',
    '高性价比精选': '性价比 精选',
    '设计感品质包': '设计感 品质',
    '高品质真皮包': '真皮 高品质'
  };

  // 智能拼接搜索关键词
  let searchKeyword = keyword;
  // 如果有风格关键词，追加到搜索关键词
  if (styleKeywords) {
    // 尝试从映射表中查找，如果找不到直接使用原值
    const mappedKeywords = styleKeywords.split(' ').map(tag => styleKeywordMap[tag] || tag).join(' ');
    searchKeyword = `${keyword} ${mappedKeywords}`;
  }

  console.log(`[拼多多] 搜索关键词: "${searchKeyword}", 价格区间: ${priceMinFen/100}-${priceMaxFen/100}元`);

  // 构建请求参数 (拼多多API使用下划线命名)
  const params = {
    type: 'pdd.ddk.goods.search',
    client_id: CONFIG.PDD_CLIENT_ID,
    timestamp: String(timestamp),
    keyword: searchKeyword,
    page: '1',
    page_size: '20'
  };

  // 可选参数
  if (CONFIG.PDD_PID) {
    params.pid = CONFIG.PDD_PID;
  }
  if (priceMinFen > 0) {
    params.range_min_price = String(priceMinFen);
  }
  if (priceMaxFen < 99999900) {
    params.range_max_price = String(priceMaxFen);
  }

  // 生成签名
  const sign = generatePddSign(params);

  // 构建完整请求URL
  const queryParams = { ...params, sign };
  const queryString = Object.entries(queryParams)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

  console.log(`[拼多多] 调用商品搜索API, 关键词: "${searchKeyword}", 价格区间: ${priceMinFen/100}-${priceMaxFen/100}元`);

  const response = await fetch(`https://gw-api.pinduoduo.com/api/router?${queryString}`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  });

  const data = await response.json();

  if (data.error_response) {
    console.error('[拼多多] API错误:', JSON.stringify(data.error_response));
    throw new Error(data.error_response.error_msg || '拼多多API错误');
  }

  // 解析商品列表
  const goodsList = data.goods_search_response?.goods_list || [];
  console.log(`[拼多多] 获取到 ${goodsList.length} 个商品`);

  // 打印第一个商品调试
  if (goodsList.length > 0) {
    console.log('[拼多多] 第一个商品:', JSON.stringify({
      name: goodsList[0].goods_name,
      price: goodsList[0].min_group_price,
      img: goodsList[0].goods_thumbnail_url?.substring(0, 50)
    }));
  }

  if (goodsList.length === 0) {
    return null;
  }

  // 过滤商品确保价格在预算范围内 (二次校验)
  const filteredGoods = goodsList.filter(item => {
    const price = item.min_group_price; // 单位: 分
    return price >= priceMinFen && price <= priceMaxFen;
  });

  console.log(`[拼多多] 价格过滤后剩余 ${filteredGoods.length} 个商品`);

  return filteredGoods.slice(0, 6).map((item, index) => {
    const price = item.min_group_price / 100;
    const priceOri = item.min_normal_price ? item.min_normal_price / 100 : price * 1.3;
    // 使用goods_sign优先，其次是goods_id
    const goodsSign = item.goods_sign || item.goods_id || '';
    console.log(`[拼多多] 商品${index+1}: ${item.goods_name?.substring(0, 30)}, sign=${goodsSign}, id=${item.goods_id}`);
    return {
      id: item.goods_id || index + 1,
      platform: 'pdd',
      platformLabel: '拼多多',
      badgeClass: 'badge-pdd',
      name: item.goods_name?.substring(0, 50) || '精选好物',
      img: item.goods_thumbnail_url || 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=400&q=80',
      price: price.toFixed(0),
      priceOri: priceOri.toFixed(0),
      actualPrice: price,
      score: calculateProductScore(item, styleKeywords, priceRange),
      sales: formatSales(item.sales_tip || '1万+'),
      reason: generateSmartReason(item, styleKeywords, priceRange, price),
      url: String(goodsSign),
      coupon: item.coupon_discount ? `满${item.coupon_min_order_amount/100}减${item.coupon_discount/100}` : ''
    };
  });
}

/**
 * 生成拼多多API签名
 */
function generatePddSign(params) {
  // 1. 按key排序
  const sortedKeys = Object.keys(params).sort();

  // 2. 拼接字符串
  let signStr = CONFIG.PDD_CLIENT_SECRET;
  sortedKeys.forEach(key => {
    signStr += key + params[key];
  });
  signStr += CONFIG.PDD_CLIENT_SECRET;

  // 3. MD5加密并转大写
  return crypto.createHash('md5').update(signStr, 'utf8').digest('hex').toUpperCase();
}

/**
 * 计算商品评分 (基于多维度)
 */
function calculateProductScore(item, style, budget) {
  let score = 8.0; // 基础分

  // 1. 销量加分 (销量越高分数越高)
  const salesTip = item.sales_tip || '';
  if (salesTip.includes('万')) {
    const salesNum = parseFloat(salesTip);
    if (salesNum >= 10) score += 0.8;
    else if (salesNum >= 5) score += 0.5;
    else if (salesNum >= 1) score += 0.3;
  } else if (parseInt(salesTip) >= 1000) {
    score += 0.2;
  }

  // 2. 优惠券加分
  if (item.coupon_discount && item.coupon_discount > 0) {
    score += 0.3;
  }

  // 3. 价格在预算中间值加分
  const budgetMids = {
    '25元以内': 12,
    '25-50元': 37,
    '50元以内': 25,
    '50-150元': 100,
    '150-300元': 225,
    '300元以上': 400
  };
  // 支持 priceRange 对象或 budget 字符串
  let midPrice;
  if (budget && typeof budget === 'object' && budget.min !== undefined) {
    midPrice = (budget.min + budget.max) / 2;
  } else {
    midPrice = budgetMids[budget] || 100;
  }
  const itemPrice = item.min_group_price / 100;
  const priceDiff = Math.abs(itemPrice - midPrice) / midPrice;
  if (priceDiff < 0.2) score += 0.4;
  else if (priceDiff < 0.4) score += 0.2;

  // 4. 限制最高分
  return Math.min(score, 9.9).toFixed(1);
}

/**
 * 生成智能推荐理由
 */
function generateSmartReason(item, style, budget, price) {
  const reasons = [];

  // 风格匹配
  const styleReasons = {
    '简约低调': '简约设计，黑白灰百搭',
    '轻熟活力': '马卡龙色系，甜美有气质',
    '商务干练': '商务风格，职场必备',
    '自然慵懒': '文艺范儿，舒适随性',
    '简约通勤': '简约百搭，通勤首选',
    '时尚轻熟': '设计感强，时尚气质',
    '商务正式': '正式商务，彰显品味',
    '休闲运动': '休闲运动，轻便舒适',
    '宽松慵懒': '宽松版型，舒适自在',
    '修身合体': '修身显瘦，精神有型',
    '文艺复古': '文艺复古，独特品味',
    '简约基础': '基础百搭，不易出错',
    '音质优先': '音质出色，听感优秀',
    '降噪功能': '主动降噪，安静沉浸',
    '续航持久': '续航持久，告别电量焦虑',
    '外观颜值': '颜值在线，设计精美'
  };

  if (styleReasons[style]) {
    reasons.push(styleReasons[style]);
  }

  // 价格优势
  const budgetPrices = {
    '25元以内': 25,
    '25-50元': 50,
    '50元以内': 50,
    '50-150元': 150,
    '150-300元': 300,
    '300元以上': 500
  };
  // 支持 priceRange 对象或 budget 字符串
  let budgetMax;
  if (budget && typeof budget === 'object' && budget.max !== undefined) {
    budgetMax = budget.max;
  } else {
    budgetMax = budgetPrices[budget] || 150;
  }
  if (price < budgetMax * 0.5) {
    reasons.push('价格实惠');
  } else if (price < budgetMax * 0.8) {
    reasons.push('性价比高');
  }

  // 销量背书
  const salesTip = item.sales_tip || '';
  if (salesTip.includes('万') && parseFloat(salesTip) >= 1) {
    reasons.push('销量火爆');
  }

  // 优惠券
  if (item.coupon_discount && item.coupon_discount > 100) {
    reasons.push('有大额优惠券');
  }

  // 默认兜底
  if (reasons.length === 0) {
    reasons.push('综合推荐');
  }

  return reasons.slice(0, 2).join('，');
}

/**
 * 格式化销量
 */
function formatSales(sales) {
  if (typeof sales === 'string') return sales;
  if (sales >= 10000) return (sales / 10000).toFixed(1) + '万';
  return sales.toString();
}

/**
 * 生成风格总结（支持标签数组）
 * @param {string} userInput - 用户初始意图
 * @param {string[]} q1Answers - 问题一选择的标签数组
 * @param {string[]} q2Answers - 问题二选择的标签数组
 * @param {string[]} nonPriceTags - 非价格标签数组
 */
async function generateStyleProfile(userInput, q1Answers, q2Answers, nonPriceTags) {
  const styleMap = {
    '简约低调': { name: '简约低调 · 极简风', desc: '偏爱干净利落的设计，黑白灰配色，少即是多的美学，不跟风但有格调。', tags: ['#极简', '#黑白灰', '#耐看'] },
    '轻熟活力': { name: '轻熟活力 · 通勤风', desc: '喜欢有点甜又不失成熟感的风格，注重功能与颜值兼顾，预算适中，性价比优先。', tags: ['#马卡龙', '#轻熟', '#活力'] },
    '商务干练': { name: '商务干练 · 职场风', desc: '注重品质和专业感，皮质细节加分，适合正式场合，愿意为好设计溢价。', tags: ['#皮质感', '#专业', '#商务'] },
    '自然慵懒': { name: '自然慵懒 · 原野风', desc: '大地色系，棉麻材质，随性舒适不刻意，透露着一种松弛的生活态度。', tags: ['#大地色', '#棉麻', '#慵懒'] },
    '简约通勤': { name: '简约通勤 · 都市风', desc: '追求实用与美观的平衡，黑白灰为主，上班约会都合适。', tags: ['#通勤', '#简约', '#实用'] },
    '时尚轻熟': { name: '时尚轻熟 · 设计感', desc: '注重设计感和独特性，喜欢有辨识度的单品。', tags: ['#设计感', '#轻熟', '#时尚'] },
    '商务正式': { name: '商务正式 · 专业风', desc: '正式场合首选，皮质细节彰显品味，专业感满分。', tags: ['#商务', '#皮质', '#专业'] },
    '休闲运动': { name: '休闲运动 · 活力风', desc: '轻便舒适是第一要义，运动休闲两不误。', tags: ['#休闲', '#运动', '#轻便'] },
    '宽松慵懒': { name: '宽松慵懒 · 舒适风', desc: 'Oversize版型，舒适随性，不拘小节。', tags: ['#宽松', '#舒适', '#随性'] },
    '修身合体': { name: '修身合体 · 精神风', desc: '修身版型显身材，穿出精气神。', tags: ['#修身', '#精神', '#显瘦'] },
    '文艺复古': { name: '文艺复古 · 质感风', desc: '有故事感的单品，复古元素加分。', tags: ['#复古', '#文艺', '#质感'] },
    '简约基础': { name: '简约基础 · 百搭风', desc: '基础款不出错，百搭又实用。', tags: ['#基础', '#百搭', '#实用'] },
    '音质优先': { name: '音质至上 · 发烧友', desc: '对音质有高要求，愿意为好声音投资。', tags: ['#音质', '#发烧友', '#HiFi'] },
    '降噪功能': { name: '降噪优先 · 沉浸党', desc: '需要安静的环境，降噪是刚需。', tags: ['#降噪', '#沉浸', '#专注'] },
    '续航持久': { name: '续航优先 · 实用党', desc: '电量焦虑者福音，持久续航不掉链。', tags: ['#续航', '#实用', '#长续航'] },
    '外观颜值': { name: '颜值优先 · 颜控党', desc: '好看即正义，外观设计很重要。', tags: ['#颜值', '#设计', '#好看'] }
  };

  // 从所有标签中找到第一个匹配的风格
  const allTags = [...(q1Answers || []), ...(q2Answers || []), ...(nonPriceTags || [])];
  let matchedStyle = null;
  for (const tag of allTags) {
    if (styleMap[tag]) {
      matchedStyle = styleMap[tag];
      break;
    }
  }

  const s = matchedStyle || styleMap['简约低调'];

  // 构建预算显示文本
  const priceTag = allTags.find(tag => tag && tag.startsWith('PRICE:'));
  const budgetText = priceTag ? priceTag.replace('PRICE:', '').replace('-', '~') + '元' : '自定义预算';

  return {
    name: s.name + ' · 预算' + budgetText,
    desc: s.desc,
    tags: [...s.tags, '预算' + budgetText]
  };
}

/**
 * AI评分排序商品（支持 priceRange 对象）
 * @param {Array} products - 商品列表
 * @param {string} userInput - 用户输入
 * @param {string} style - 风格关键词
 * @param {Object|string} budget - 价格区间对象或字符串
 */
async function scoreProducts(products, userInput, style, budget) {
  // 评分模型：
  // - 风格匹配度 35%
  // - 性价比 30%
  // - 商品质量信号 20%
  // - 优惠力度 15%

  // 处理 priceRange 对象
  const budgetText = budget && typeof budget === 'object'
    ? `${budget.min}-${budget.max}元`
    : budget;

  return products.map(p => {
    // 如果商品已经有评分和推荐理由，直接使用
    if (p.score && p.reason) {
      return {
        ...p,
        aiScore: p.score,
        aiReason: p.reason
      };
    }

    // 否则计算评分
    const styleScore = Math.floor(Math.random() * 2) + 8; // 8-10
    const priceScore = Math.floor(Math.random() * 2) + 8;
    const qualityScore = Math.floor(Math.random() * 2) + 8;
    const discountScore = Math.floor(Math.random() * 2) + 8;

    const aiScore = (
      styleScore * 0.35 +
      priceScore * 0.30 +
      qualityScore * 0.20 +
      discountScore * 0.15
    ).toFixed(1);

    return {
      ...p,
      aiScore,
      aiReason: p.reason || generateSmartReason(p, style, budget, p.actualPrice || p.price)
    };
  }).sort((a, b) => b.aiScore - a.aiScore);
}

/**
 * 生成模拟商品数据（支持 priceRange 对象）
 * @param {string} userInput - 用户输入
 * @param {string} style - 风格关键词
 * @param {Object|string} budget - 价格区间对象或字符串
 */
function generateMockProducts(userInput, style, budget) {
  // 解析预算 - 确保价格严格在范围内
  let minPrice, maxPrice;

  if (budget && typeof budget === 'object' && budget.min !== undefined) {
    // 支持 priceRange 对象
    minPrice = budget.min;
    maxPrice = budget.max;
  } else {
    // 支持预算字符串
    const budgetRanges = {
      '25元以内': { min: 8, max: 24 },
      '25-50元': { min: 26, max: 49 },
      '50元以内': { min: 15, max: 49 },
      '50-150元': { min: 55, max: 148 },
      '150-300元': { min: 155, max: 298 },
      '300元以上': { min: 305, max: 600 }
    };
    const range = budgetRanges[budget] || budgetRanges['50-150元'];
    minPrice = range.min;
    maxPrice = range.max;
  }

  // 根据输入关键词和风格生成相关商品
  const productTemplates = getProductTemplatesByKeyword(userInput, style);

  const platforms = [
    { platform: 'pdd', label: '拼多多', badge: 'badge-pdd' },
    { platform: 'tb', label: '淘宝', badge: 'badge-tb' },
    { platform: '1688', label: '1688', badge: 'badge-1688' }
  ];

  return productTemplates.slice(0, 6).map((t, i) => {
    // 价格在预算范围内随机生成
    const price = Math.floor(Math.random() * (maxPrice - minPrice) + minPrice);
    const oriPrice = Math.floor(price * (1.3 + Math.random() * 0.5));
    const platform = platforms[i % 3];

    return {
      id: i + 1,
      platform: platform.platform,
      platformLabel: platform.label,
      badgeClass: platform.badge,
      name: t.name,
      img: t.img,
      price: price.toString(),
      priceOri: oriPrice.toString(),
      actualPrice: price, // 用于验证
      score: (8.5 + Math.random() * 1.2).toFixed(1),
      sales: `${(Math.random() * 5 + 0.5).toFixed(1)}万`,
      reason: generateSmartReason({ sales_tip: `${Math.floor(Math.random() * 5 + 1)}万` }, style, budget, price),
      url: '#'
    };
  });
}

/**
 * 根据关键词和风格获取商品模板
 */
function getProductTemplatesByKeyword(userInput, style) {
  // 检测品类
  const categoryKeywords = {
    '包': ['包', '背包', '书包', '手提包', '通勤包', '帆布包'],
    '衣': ['衣', '毛衣', '外套', '衬衫', '针织', '卫衣', '裤子', '服'],
    '耳机': ['耳机', '蓝牙', '头戴式', '入耳式'],
    '帽子': ['帽', '鸭舌帽', '渔夫帽', '贝雷帽'],
    '围巾': ['围巾', '丝巾', '披肩'],
    '收纳': ['收纳', '置物架', '整理'],
    '鞋': ['鞋', '运动鞋', '休闲鞋', '靴子'],
    '台灯': ['台灯', '灯', '护眼灯', '书桌灯', '阅读灯'],
    '手机': ['手机', 'iPhone', '安卓', '智能手机'],
    '化妆品': ['化妆品', '口红', '粉底', '眼影', '护肤品'],
    '水杯': ['水杯', '保温杯', '杯子', '水壶'],
    '零食': ['零食', '饼干', '巧克力', '糖果', '坚果'],
    '文具': ['文具', '笔', '本子', '笔记本', '文件夹'],
    '数码': ['数码', '充电器', '数据线', '充电宝', '鼠标', '键盘']
  };

  // 风格后缀
  const styleSuffixes = {
    '简约低调': '简约纯色款',
    '轻熟活力': '马卡龙色甜美款',
    '商务干练': '商务皮质款',
    '自然慵懒': '文艺棉麻款',
    '简约通勤': '通勤百搭款',
    '时尚轻熟': '设计感气质款',
    '商务正式': '正式商务款',
    '休闲运动': '休闲运动款',
    '宽松慵懒': '宽松舒适款',
    '修身合体': '修身显瘦款',
    '文艺复古': '复古文艺款',
    '简约基础': '基础百搭款',
    '音质优先': 'HiFi音质款',
    '降噪功能': '主动降噪款',
    '续航持久': '长续航款',
    '外观颜值': '颜值设计款'
  };

  const suffix = styleSuffixes[style] || '精选款';

  // 检测用户输入中的品类
  let detectedCategory = 'default';
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(kw => userInput.includes(kw))) {
      detectedCategory = category;
      break;
    }
  }

  // 根据品类返回商品模板
  const templates = {
    '包': [
      { name: `大容量帆布托特包 ${suffix}`, img: 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=400&q=80' },
      { name: `简约通勤单肩包 ${suffix}`, img: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=400&q=80' },
      { name: `韩版手提帆布包 ${suffix}`, img: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=400&q=80' },
      { name: `防水尼龙双肩包 ${suffix}`, img: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&q=80' },
      { name: `文艺ins风书包 ${suffix}`, img: 'https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?w=400&q=80' },
      { name: `大容量购物袋 ${suffix}`, img: 'https://images.unsplash.com/photo-1575032617751-6ddec2089882?w=400&q=80' }
    ],
    '衣': [
      { name: `针织毛衣 ${suffix}`, img: 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=400&q=80' },
      { name: `休闲卫衣 ${suffix}`, img: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=400&q=80' },
      { name: `百搭衬衫 ${suffix}`, img: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400&q=80' },
      { name: `秋冬外套 ${suffix}`, img: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400&q=80' },
      { name: `休闲长裤 ${suffix}`, img: 'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=400&q=80' },
      { name: `打底衫 ${suffix}`, img: 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=400&q=80' }
    ],
    '耳机': [
      { name: `蓝牙耳机 ${suffix}`, img: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&q=80' },
      { name: `头戴式耳机 ${suffix}`, img: 'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=400&q=80' },
      { name: `入耳式耳机 ${suffix}`, img: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=400&q=80' },
      { name: `运动耳机 ${suffix}`, img: 'https://images.unsplash.com/photo-1484704849700-f032a568e944?w=400&q=80' },
      { name: `游戏耳机 ${suffix}`, img: 'https://images.unsplash.com/photo-1545127398-14699f92334b?w=400&q=80' },
      { name: `降噪耳机 ${suffix}`, img: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=400&q=80' }
    ],
    '帽子': [
      { name: `鸭舌帽 ${suffix}`, img: 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=400&q=80' },
      { name: `渔夫帽 ${suffix}`, img: 'https://images.unsplash.com/photo-1572307480813-ceb0e59d8325?w=400&q=80' },
      { name: `贝雷帽 ${suffix}`, img: 'https://images.unsplash.com/photo-1576871337632-b9aef4c17ab9?w=400&q=80' },
      { name: `毛线帽 ${suffix}`, img: 'https://images.unsplash.com/photo-1576871337624-4ec33a894fe8?w=400&q=80' },
      { name: `棒球帽 ${suffix}`, img: 'https://images.unsplash.com/photo-1622445275576-721325763afe?w=400&q=80' },
      { name: `遮阳帽 ${suffix}`, img: 'https://images.unsplash.com/photo-1556306535-0f09a537f0a3?w=400&q=80' }
    ],
    '围巾': [
      { name: `针织围巾 ${suffix}`, img: 'https://images.unsplash.com/photo-1520903920243-00d872a2d1c9?w=400&q=80' },
      { name: `羊毛围巾 ${suffix}`, img: 'https://images.unsplash.com/photo-1601379760883-1bb497c558c9?w=400&q=80' },
      { name: `丝巾 ${suffix}`, img: 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=400&q=80' },
      { name: `披肩 ${suffix}`, img: 'https://images.unsplash.com/photo-1544022613-e87ca75a784a?w=400&q=80' },
      { name: `围脖 ${suffix}`, img: 'https://images.unsplash.com/photo-1608042314453-ae338d80c427?w=400&q=80' },
      { name: `冬季围巾 ${suffix}`, img: 'https://images.unsplash.com/photo-1553531889-e6cf4d692b1b?w=400&q=80' }
    ],
    '收纳': [
      { name: `桌面收纳盒 ${suffix}`, img: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400&q=80' },
      { name: `置物架 ${suffix}`, img: 'https://images.unsplash.com/photo-1595428774223-ef52624120d2?w=400&q=80' },
      { name: `抽屉整理盒 ${suffix}`, img: 'https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=400&q=80' },
      { name: `化妆品收纳 ${suffix}`, img: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=400&q=80' },
      { name: `衣柜收纳 ${suffix}`, img: 'https://images.unsplash.com/photo-1558997519-83ea9252edf8?w=400&q=80' },
      { name: `书架收纳 ${suffix}`, img: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80' }
    ],
    '鞋': [
      { name: `运动鞋 ${suffix}`, img: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=80' },
      { name: `休闲鞋 ${suffix}`, img: 'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=400&q=80' },
      { name: `帆布鞋 ${suffix}`, img: 'https://images.unsplash.com/photo-1529374814797-de528852dde0?w=400&q=80' },
      { name: `板鞋 ${suffix}`, img: 'https://images.unsplash.com/photo-1603808033192-082d6919d3e1?w=400&q=80' },
      { name: `靴子 ${suffix}`, img: 'https://images.unsplash.com/photo-1608256246200-53e635b5b65f?w=400&q=80' },
      { name: `老爹鞋 ${suffix}`, img: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=400&q=80' }
    ],
    '台灯': [
      { name: `LED护眼台灯 ${suffix}`, img: 'https://images.unsplash.com/photo-1534073828943-f801091a7d58?w=400&q=80' },
      { name: `智能触控台灯 ${suffix}`, img: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=400&q=80' },
      { name: `充电式小台灯 ${suffix}`, img: 'https://images.unsplash.com/photo-1513506003013-d531632103c5?w=400&q=80' },
      { name: `折叠便携台灯 ${suffix}`, img: 'https://images.unsplash.com/photo-1534349762230-ee0cd87e3e51?w=400&q=80' },
      { name: `书桌阅读灯 ${suffix}`, img: 'https://images.unsplash.com/photo-1517991104123-1d56a6e81ed9?w=400&q=80' },
      { name: `卧室床头灯 ${suffix}`, img: 'https://images.unsplash.com/photo-1565814329452-e1efa11c5b89?w=400&q=80' }
    ],
    '手机': [
      { name: `智能手机 ${suffix}`, img: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&q=80' },
      { name: `全面屏手机 ${suffix}`, img: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=400&q=80' },
      { name: `拍照手机 ${suffix}`, img: 'https://images.unsplash.com/photo-1565849904461-04a58ad377e0?w=400&q=80' },
      { name: `游戏手机 ${suffix}`, img: 'https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=400&q=80' },
      { name: `5G手机 ${suffix}`, img: 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=400&q=80' },
      { name: `老人机 ${suffix}`, img: 'https://images.unsplash.com/photo-1567690187548-f07b1d7bf5a9?w=400&q=80' }
    ],
    '化妆品': [
      { name: `口红套装 ${suffix}`, img: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=400&q=80' },
      { name: `护肤精华 ${suffix}`, img: 'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=400&q=80' },
      { name: `粉底液 ${suffix}`, img: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=400&q=80' },
      { name: `眼影盘 ${suffix}`, img: 'https://images.unsplash.com/photo-1599733589046-10c941829f5a?w=400&q=80' },
      { name: `面膜套装 ${suffix}`, img: 'https://images.unsplash.com/photo-1596755389378-c31d21fd1273?w=400&q=80' },
      { name: `化妆刷套装 ${suffix}`, img: 'https://images.unsplash.com/photo-1597225244660-15a7537254d5?w=400&q=80' }
    ],
    '水杯': [
      { name: `保温杯 ${suffix}`, img: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=400&q=80' },
      { name: `玻璃水杯 ${suffix}`, img: 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=400&q=80' },
      { name: `便携水杯 ${suffix}`, img: 'https://images.unsplash.com/photo-1602351447937-745cb720612f?w=400&q=80' },
      { name: `运动水壶 ${suffix}`, img: 'https://images.unsplash.com/photo-1523362628745-0c100150b504?w=400&q=80' },
      { name: `陶瓷马克杯 ${suffix}`, img: 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=400&q=80' },
      { name: `智能保温杯 ${suffix}`, img: 'https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?w=400&q=80' }
    ],
    '数码': [
      { name: `充电器 ${suffix}`, img: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=400&q=80' },
      { name: `数据线 ${suffix}`, img: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80' },
      { name: `充电宝 ${suffix}`, img: 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=400&q=80' },
      { name: `无线鼠标 ${suffix}`, img: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=400&q=80' },
      { name: `机械键盘 ${suffix}`, img: 'https://images.unsplash.com/photo-1595225476474-87563907a212?w=400&q=80' },
      { name: `手机支架 ${suffix}`, img: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=400&q=80' }
    ],
    'default': [
      { name: `精选商品 ${suffix}`, img: 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=400&q=80' },
      { name: `人气推荐 ${suffix}`, img: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=400&q=80' },
      { name: `超值好物 ${suffix}`, img: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=400&q=80' },
      { name: `品质优选 ${suffix}`, img: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&q=80' },
      { name: `热销爆款 ${suffix}`, img: 'https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?w=400&q=80' },
      { name: `实用好物 ${suffix}`, img: 'https://images.unsplash.com/photo-1575032617751-6ddec2089882?w=400&q=80' }
    ]
  };

  return templates[detectedCategory] || templates['default'];
}

/**
 * 获取模拟推荐数据 (API失败时使用)
 */
function getMockRecommendation(userInput, style, budget) {
  return {
    styleProfile: {
      name: `${style}风格 · 预算${budget}`,
      desc: '根据你的偏好，为你精选了以下好物。',
      tags: ['#推荐', style, budget]
    },
    products: generateMockProducts(userInput, style, budget)
  };
}

// ============================================
// 推广链接生成接口
// ============================================
app.post('/api/promotion/url', async (req, res) => {
  const { platform, goodsId } = req.body;

  try {
    let url = '#';

    switch (platform) {
      case 'pdd':
        // TODO: 调用拼多多推广链接生成API
        url = await generatePddPromotionUrl(goodsId);
        break;
      case 'tb':
        // TODO: 调用淘宝客API
        url = '#';
        break;
      case '1688':
        // TODO: 调用1688联盟API
        url = '#';
        break;
    }

    res.json({ url });
  } catch (error) {
    res.json({ url: '#' });
  }
});

/**
 * 生成拼多多推广链接
 */
async function generatePddPromotionUrl(goodsSign) {
  const timestamp = Math.floor(Date.now() / 1000);

  const params = {
    type: 'pdd.ddk.goods.promotion.url.generate',
    client_id: CONFIG.PDD_CLIENT_ID,
    timestamp: String(timestamp),
    p_id: CONFIG.PDD_PID,
    goods_sign_list: JSON.stringify([goodsSign])
  };

  const sign = generatePddSign(params);
  params.sign = sign;

  const queryString = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

  try {
    console.log('[拼多多] 生成推广链接, goods_sign:', goodsSign);
    const response = await fetch(`https://gw-api.pinduoduo.com/api/router?${queryString}`);
    const data = await response.json();

    if (data.error_response) {
      console.error('[拼多多] 推广链接生成失败:', data.error_response);
      // 返回直接跳转链接
      return `https://mobile.yangkeduo.com/goods.html?goods_sign=${goodsSign}`;
    }

    const urlList = data.goods_promotion_url_generate_response?.goods_promotion_url_list || [];
    const url = urlList[0]?.mobile_url || urlList[0]?.url;
    if (url) {
      console.log('[拼多多] 推广链接生成成功:', url);
      return url;
    }
    // 如果没有生成推广链接，返回默认跳转
    return `https://mobile.yangkeduo.com/goods.html?goods_sign=${goodsSign}`;
  } catch (error) {
    console.error('[拼多多] 推广链接生成错误:', error.message);
    // 返回直接跳转链接
    return `https://mobile.yangkeduo.com/goods.html?goods_sign=${goodsSign}`;
  }
}

// ============================================
// AI 随机选择标签接口
// 接收当前问题的 options 数组和建议选择数量 count
// 返回从中挑选的 count 个最具代表性的标签
// ============================================
app.post('/api/ai/random', async (req, res) => {
  const { options, count = 1 } = req.body;

  if (!options || !Array.isArray(options) || options.length === 0) {
    return res.status(400).json({ error: '请提供有效的选项数组' });
  }

  const selectCount = Math.min(Math.max(1, count), options.length);

  try {
    // 优先使用 AI 进行智能选择
    if (CONFIG.DEEPSEEK_API_KEY && selectCount > 1) {
      const selected = await aiRandomSelect(options, selectCount);
      res.json({ selected, method: 'ai' });
    } else {
      // 退回到随机选择
      const selected = randomSelect(options, selectCount);
      res.json({ selected, method: 'random' });
    }
  } catch (error) {
    console.error('AI 随机选择失败:', error.message);
    // 退回到随机选择
    const selected = randomSelect(options, selectCount);
    res.json({ selected, method: 'fallback_random' });
  }
});

/**
 * 使用 AI 智能选择标签
 * @param {Array} options - 选项数组，每个选项包含 label, value, emoji 等字段
 * @param {number} count - 需要选择的数量
 */
async function aiRandomSelect(options, count) {
  const optionsText = options.map((opt, idx) =>
    `${idx + 1}. ${opt.emoji || ''} ${opt.label} (${opt.value}) - ${opt.desc || '无描述'}`
  ).join('\n');

  const prompt = `你是一位电商选品专家。请从以下 ${options.length} 个标签中，选出最搭配、最具代表性的 ${count} 个标签。

可选标签：
${optionsText}

选择要求：
1. 选出的 ${count} 个标签应该风格协调、互补
2. 优先考虑用户需求明确、特征鲜明的标签
3. 避免选择相互矛盾或冲突的标签

请只返回选中的标签序号（1-${options.length}），用逗号分隔。例如：1,3,5
如果只选1个，直接返回数字，例如：2`;

  const response = await fetch(CONFIG.DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: CONFIG.DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: '你是一个电商选品专家，擅长根据标签特征进行智能搭配选择。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.5,
      max_tokens: 64
    })
  });

  if (!response.ok) {
    throw new Error(`AI API 错误: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content.trim();

  // 解析 AI 返回的序号
  const indices = content
    .replace(/[^\d,]/g, '')  // 只保留数字和逗号
    .split(',')
    .map(s => parseInt(s.trim()) - 1)  // 转为 0-based 索引
    .filter(idx => idx >= 0 && idx < options.length);

  // 去重并限制数量
  const uniqueIndices = [...new Set(indices)].slice(0, count);

  // 如果 AI 没有返回有效结果，退回到随机选择
  if (uniqueIndices.length === 0) {
    return randomSelect(options, count);
  }

  return uniqueIndices.map(idx => options[idx]);
}

/**
 * 随机选择标签（备用方案）
 * @param {Array} options - 选项数组
 * @param {number} count - 需要选择的数量
 */
function randomSelect(options, count) {
  const shuffled = [...options].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// ============================================
// API 健康检查 - 测试拼多多API连接
// ============================================
app.get('/api/health/pdd', async (req, res) => {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const params = {
      type: 'pdd.ddk.goods.search',
      client_id: CONFIG.PDD_CLIENT_ID,
      timestamp: String(timestamp),
      keyword: '测试',
      page: '1',
      page_size: '10'  // 最小值10
    };
    if (CONFIG.PDD_PID) {
      params.pid = CONFIG.PDD_PID;
    }
    const sign = generatePddSign(params);
    params.sign = sign;
    const queryString = Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');

    const response = await fetch(`https://gw-api.pinduoduo.com/api/router?${queryString}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    const data = await response.json();

    if (data.error_response) {
      res.json({
        status: 'error',
        message: '拼多多API返回错误',
        error: data.error_response
      });
    } else {
      res.json({
        status: 'ok',
        message: '拼多多API连接正常',
        goods_count: data.goods_search_response?.goods_list?.length || 0
      });
    }
  } catch (error) {
    res.json({ status: 'error', message: error.message });
  }
});

// ============================================
// 基础健康检查
// ============================================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// 拼多多授权备案链接生成
// ============================================
app.get('/api/pdd/authorize', async (req, res) => {
  try {
    const timestamp = Math.floor(Date.now() / 1000);

    // 使用 pdd.ddk.rp.prom.url.generate 接口生成授权链接
    const params = {
      type: 'pdd.ddk.rp.prom.url.generate',
      client_id: CONFIG.PDD_CLIENT_ID,
      timestamp: String(timestamp),
      p_id_list: JSON.stringify([CONFIG.PDD_PID]),  // 使用数组格式
      channel_type: '10'  // 10表示生成授权备案链接
    };

    const sign = generatePddSign(params);
    params.sign = sign;

    const queryString = Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');

    console.log('[拼多多] 生成授权备案链接...');

    const response = await fetch(`https://gw-api.pinduoduo.com/api/router?${queryString}`);
    const data = await response.json();

    if (data.error_response) {
      return res.json({
        success: false,
        error: data.error_response.error_msg,
        detail: data.error_response
      });
    }

    // 解析返回的授权链接
    const rpPromUrl = data.rp_prom_url_generate_response?.url || null;
    const mobileUrl = data.rp_prom_url_generate_response?.mobile_url || null;

    res.json({
      success: true,
      authorizeUrl: mobileUrl || rpPromUrl,
      rawResponse: data,
      message: '请点击授权链接完成备案'
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// 拼多多备案状态查询
// ============================================
app.get('/api/pdd/authority/status', async (req, res) => {
  try {
    const timestamp = Math.floor(Date.now() / 1000);

    const params = {
      type: 'pdd.ddk.member.authority.query',
      client_id: CONFIG.PDD_CLIENT_ID,
      timestamp: String(timestamp),
      pid: CONFIG.PDD_PID
    };

    const sign = generatePddSign(params);
    params.sign = sign;

    const queryString = Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');

    console.log('[拼多多] 查询备案状态...');

    const response = await fetch(`https://gw-api.pinduoduo.com/api/router?${queryString}`);
    const data = await response.json();

    if (data.error_response) {
      return res.json({
        success: false,
        authorized: false,
        error: data.error_response.error_msg,
        detail: data.error_response
      });
    }

    // bind=1 表示已备案成功
    const bind = data.member_authority_query_response?.bind || 0;
    const authorized = bind === 1;

    res.json({
      success: true,
      authorized: authorized,
      bind: bind,
      message: authorized ? '已授权备案成功' : '未授权备案，请先完成授权'
    });
  } catch (error) {
    res.json({
      success: false,
      authorized: false,
      error: error.message
    });
  }
});

// ============================================
// 启动服务
// ============================================
// 根路径重定向
app.get('/', (req, res) => {
  res.redirect('/ai-picker.html');
});

// 本地开发时启动服务器
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 PickAI Server running at http://localhost:${PORT}`);
    console.log(`📱 H5 Page: http://localhost:${PORT}/ai-picker.html`);
  });
}

// 导出给 Vercel Serverless Functions
module.exports = app;