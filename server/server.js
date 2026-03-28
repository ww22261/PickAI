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
try {
  require('dotenv').config();
} catch (e) {
  // dotenv未安装，使用环境变量或默认值
}

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
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
// AI 动态问题生成接口
// ============================================
app.post('/api/ai/questions', async (req, res) => {
  const { userInput } = req.body;

  if (!userInput || !userInput.trim()) {
    return res.status(400).json({ error: '请输入你想买什么' });
  }

  try {
    // 调用DeepSeek API生成动态问题
    const questions = await generateDynamicQuestions(userInput);
    res.json({ questions });
  } catch (error) {
    console.error('AI问题生成失败:', error.message);
    // Fallback: 返回智能匹配的默认问题
    const fallbackQuestions = getSmartFallback(userInput);
    res.json({ questions: fallbackQuestions, fallback: true });
  }
});

/**
 * 调用火山引擎 DeepSeek API生成动态问题
 * 火山引擎API 兼容 OpenAI 格式
 * 文档: https://www.volcengine.com/docs/82379/1099475
 */
async function generateDynamicQuestions(userInput) {
  const systemPrompt = `你是一个顶级电商选品顾问，擅长通过最少的问题精准捕捉用户的购物风格与真实需求。

## 你的任务
用户已描述了想买的商品。你需要生成恰好 2 个问题，在最短路径内最大化获取用户的风格偏好信息，为后续商品筛选提供最强的决策依据。

## 核心设计原则

### 问题设计原则
1. 【品类强相关】每个问题必须与用户输入的具体商品强绑定，禁止出现通用问题
2. 【信息密度最大化】2个问题合在一起，要能推断出：使用场景、风格偏好、价格敏感度、功能优先级至少3个维度
3. 【问题互补不重叠】问题1和问题2挖掘的信息维度必须完全不同
4. 【问题顺序】问题1优先挖掘"风格/使用场景/人群定位"，问题2优先挖掘"价格区间/功能优先级/细节偏好"

### 选项设计原则
1. 【互斥且穷举】4个选项要能覆盖该品类80%以上的用户，每个选项之间有明显区分
2. 【选项暗含多维信息】每个选项背后隐含的不只是一个特征，而是一个用户画像簇
   - 例如选择"轻熟活力"暗示：马卡龙色系、中等价位、注重颜值、上班族或学生
   - 例如选择"商务干练"暗示：皮质感、较高价位、功能性强、职场人士
3. 【选项有层次感】4个选项要在某个维度上形成自然的梯度或对立关系，不能都差不多
4. 【emoji精准传达氛围】emoji要能一眼传达选项的核心气质，不能用通用emoji

## 动态生成策略（根据品类调整问题焦点）

- 服饰类（包、衣服、鞋）→ 问题1问风格气质，问题2问场合+价位组合
- 数码类（耳机、手机、电脑配件）→ 问题1问核心功能优先级，问题2问品牌偏好+价位
- 家居类（收纳、装饰、床品）→ 问题1问家居风格，问题2问材质偏好+价位
- 食品类 → 问题1问口味偏好，问题2问购买频率+包装规格
- 美妆类 → 问题1问肤质/效果需求，问题2问品牌取向+价位
- 其他品类 → 自行判断最关键的两个决策维度

## 输出格式（严格遵守）

返回纯JSON数组，不要有任何额外文字、代码块标记或解释：

[
  {
    "question": "问题文本（15字以内，口语化，带具体品类词）",
    "options": [
      {
        "emoji": "单个emoji",
        "label": "2-5字核心标签",
        "desc": "10-16字补充说明，点出该选项的核心特征",
        "value": "用于后端搜索的关键词，2-6个字，可直接用于电商搜索"
      }
    ]
  }
]

## 选项value的重要性
value 字段会直接用于拼多多/淘宝/1688的API搜索关键词拼接，必须是真实的电商搜索词：
- ✅ 正确："简约百搭"、"马卡龙色"、"商务皮质"、"性价比"
- ❌ 错误："选项A"、"风格1"、"moderate"

## 示例（仅供格式参考，实际问题必须根据用户输入生成）

用户输入："想买一个装书的包，能放水杯，上班背的那种"

[
  {
    "question": "你想要什么气质的通勤包？",
    "options": [
      {
        "emoji": "🤍",
        "label": "简约低调",
        "desc": "黑白灰纯色，百搭不挑衣服",
        "value": "简约百搭帆布包"
      },
      {
        "emoji": "🌸",
        "label": "轻熟甜美",
        "desc": "马卡龙色系，甜而不腻有活力",
        "value": "马卡龙色通勤包"
      },
      {
        "emoji": "💼",
        "label": "干练商务",
        "desc": "皮质感强，拎出去有职场气场",
        "value": "皮质商务托特包"
      },
      {
        "emoji": "🌿",
        "label": "文艺休闲",
        "desc": "棉麻大地色，随性不刻意",
        "value": "文艺帆布托特包"
      }
    ]
  },
  {
    "question": "包包预算和最在意的点？",
    "options": [
      {
        "emoji": "💰",
        "label": "25元以内",
        "desc": "超实惠，够用就好",
        "value": "25元以内"
      },
      {
        "emoji": "💵",
        "label": "25-50元",
        "desc": "平价实用，性价比高",
        "value": "25-50元"
      },
      {
        "emoji": "✨",
        "label": "50-150元",
        "desc": "质价比优先，颜值品质兼顾",
        "value": "50-150元"
      },
      {
        "emoji": "🎁",
        "label": "150-300元",
        "desc": "愿意为好设计多花一点",
        "value": "150-300元"
      },
      {
        "emoji": "👑",
        "label": "300元以上",
        "desc": "用料扎实耐用耐看",
        "value": "300元以上"
      }
    ]
  }
]`;

  const userPrompt = `用户想买「${userInput}」。请生成2个最关键的问题来了解他/她的风格和需求。

重要提醒：
1. 问题2必须是关于预算的问题
2. 预算问题的value必须是以下固定值之一："25元以内"、"25-50元"、"50-150元"、"150-300元"、"300元以上"
3. 问题1的value应该是电商搜索关键词（如"简约百搭"、"马卡龙色"等）`;

  console.log(`[DeepSeek] 调用火山引擎API, 模型: ${CONFIG.DEEPSEEK_MODEL}`);

  // 火山引擎 API (OpenAI兼容格式)
  const response = await fetch(CONFIG.DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: CONFIG.DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 1024
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[DeepSeek] API错误:', errorText);
    throw new Error(`火山引擎API错误: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  console.log('[DeepSeek] 响应成功, 内容长度:', content.length);

  // 解析JSON
  const jsonMatch = content.match(/\[[\s\S]*\]/);
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

// ============================================
// 风格总结 + 商品推荐接口
// ============================================
app.post('/api/ai/recommend', async (req, res) => {
  const { userInput, q1Answer, q2Answer } = req.body;

  if (!userInput || !q1Answer || !q2Answer) {
    return res.status(400).json({ error: '缺少必要参数' });
  }

  try {
    // 并行执行：获取商品 + 生成风格总结
    const [products, styleProfile] = await Promise.all([
      fetchProductsFromPlatforms(userInput, q1Answer, q2Answer),
      generateStyleProfile(userInput, q1Answer, q2Answer)
    ]);

    // AI评分排序
    const scoredProducts = await scoreProducts(products, userInput, q1Answer, q2Answer);

    res.json({
      styleProfile,
      products: scoredProducts.slice(0, 6) // 最多返回6款
    });
  } catch (error) {
    console.error('推荐接口失败:', error.message);
    // 返回模拟数据
    const mockData = getMockRecommendation(userInput, q1Answer, q2Answer);
    res.json(mockData);
  }
});

/**
 * 从多平台获取商品
 */
async function fetchProductsFromPlatforms(userInput, style, budget) {
  // 智能解析预算 - 检测是否为标准预算格式
  // 标准格式: "25元以内", "25-50元", "300元以上" 或纯数字 "25-50"
  const budgetPattern = /(\d+)\s*[-~到]\s*(\d+)\s*元?|(\d+)\s*元?(以内|以上)|^(\d+)[-~](\d+)$/;
  const isBudgetFormat = budgetPattern.test(budget);

  // 如果不是预算格式，把budget当作额外风格关键词，使用默认预算
  let actualBudget = budget;
  let extraStyle = '';
  if (!isBudgetFormat) {
    console.log(`[推荐] 检测到非预算格式: "${budget}"，将其作为风格关键词处理`);
    extraStyle = budget; // 把非预算值当作额外风格
    actualBudget = '50-150元'; // 默认预算
  }

  // 合并风格关键词
  const finalStyle = extraStyle ? `${style} ${extraStyle}` : style;

  try {
    // 优先调用拼多多真实API
    const pddProducts = await searchPddGoods(userInput, finalStyle, actualBudget);
    if (pddProducts && pddProducts.length > 0) {
      return pddProducts;
    }
  } catch (error) {
    console.error('拼多多API调用失败:', error.message);
  }

  // 失败时返回模拟数据
  return generateMockProducts(userInput, finalStyle, actualBudget);
}

/**
 * 拼多多商品搜索
 * API文档: https://open.pinduoduo.com/application/document/api?id=pdd.ddk.goods.search
 */
async function searchPddGoods(keyword, style, budget) {
  const timestamp = Math.floor(Date.now() / 1000);

  // 解析预算 (单位: 分) - 支持多种格式
  const priceRanges = {
    '25元以内': { min: 1, max: 2500 },
    '25-50元': { min: 2500, max: 5000 },
    '50元以内': { min: 1, max: 5000 },
    '50-150元': { min: 5000, max: 15000 },
    '150-300元': { min: 15000, max: 30000 },
    '300元以上': { min: 30000, max: 999999 }
  };

  // 智能匹配预算（支持模糊匹配）
  let priceRange = priceRanges[budget];
  if (!priceRange) {
    // 尝试从budget字符串中提取数字
    const budgetMatch = budget.match(/(\d+)[-~]*(\d*)/);
    if (budgetMatch) {
      const minVal = parseInt(budgetMatch[1]) || 0;
      const maxVal = parseInt(budgetMatch[2]) || (minVal > 200 ? 999999 : minVal * 3);
      priceRange = { min: minVal * 100, max: maxVal * 100 };
    } else {
      priceRange = priceRanges['50-150元']; // 默认
    }
  }

  console.log(`[拼多多] 预算参数: "${budget}", 解析为: ${priceRange.min/100}-${priceRange.max/100}元`);

  // 风格关键词映射 - 将用户选择的风格转换为电商搜索词
  const styleKeywords = {
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
  // 风格词追加到搜索关键词
  if (styleKeywords[style]) {
    searchKeyword = `${keyword} ${styleKeywords[style]}`;
  } else if (style && style.length > 0) {
    // 如果style不在映射表中，也追加（可能是AI生成的新词）
    searchKeyword = `${keyword} ${style}`;
  }

  // 构建请求参数 (按文档要求的格式)
  const params = {
    type: 'pdd.ddk.goods.search',
    client_id: CONFIG.PDD_CLIENT_ID,
    timestamp: String(timestamp),
    keyword: searchKeyword,
    page: '1',
    page_size: '20', // 多获取一些商品，后面过滤
    pid: CONFIG.PDD_PID,
    // 价格区间过滤 (单位: 分)
    min_normal_price: String(priceRange.min),
    max_normal_price: String(priceRange.max),
    // 排序方式: 0-综合排序, 1-按销量排序, 2-按价格升序, 3-按价格降序, 4-按佣金比例, 6-按券后价升序
    sort_type: '0',
    // 只返回有优惠券的商品
    with_coupon: 'true'
  };

  // 生成签名
  const sign = generatePddSign(params);

  // 构建完整请求URL
  const queryParams = { ...params, sign };
  const queryString = Object.entries(queryParams)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

  console.log(`[拼多多] 调用商品搜索API, 关键词: "${searchKeyword}", 价格区间: ${priceRange.min/100}-${priceRange.max/100}元`);

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

  if (goodsList.length === 0) {
    return null;
  }

  // 过滤商品确保价格在预算范围内 (二次校验)
  const filteredGoods = goodsList.filter(item => {
    const price = item.min_group_price; // 单位: 分
    return price >= priceRange.min && price <= priceRange.max;
  });

  console.log(`[拼多多] 价格过滤后剩余 ${filteredGoods.length} 个商品`);

  return filteredGoods.slice(0, 6).map((item, index) => {
    const price = item.min_group_price / 100; // 转换为元
    const priceOri = item.min_normal_price ? item.min_normal_price / 100 : price * 1.3;
    return {
      id: item.goods_id || index + 1,
      platform: 'pdd',
      platformLabel: '拼多多',
      badgeClass: 'badge-pdd',
      name: item.goods_name?.substring(0, 50) || '精选好物',
      img: item.goods_thumbnail_url || 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=400&q=80',
      price: price.toFixed(0),
      priceOri: priceOri.toFixed(0),
      actualPrice: price, // 保存实际价格用于验证
      score: calculateProductScore(item, style, budget),
      sales: formatSales(item.sales_tip || '1万+'),
      reason: generateSmartReason(item, style, budget, price),
      url: item.goods_sign || '#',
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
  const midPrice = budgetMids[budget] || 100;
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
  const budgetMax = budgetPrices[budget] || 150;
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
 * 生成风格总结
 */
async function generateStyleProfile(userInput, style, budget) {
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

  const s = styleMap[style] || styleMap['简约低调'];
  return {
    name: s.name + ' · 预算' + budget,
    desc: s.desc,
    tags: [...s.tags, '预算' + budget]
  };
}

/**
 * AI评分排序商品
 */
async function scoreProducts(products, userInput, style, budget) {
  // 评分模型：
  // - 风格匹配度 35%
  // - 性价比 30%
  // - 商品质量信号 20%
  // - 优惠力度 15%

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
 * 生成模拟商品数据 (根据用户选择智能生成)
 */
function generateMockProducts(userInput, style, budget) {
  // 解析预算 - 确保价格严格在范围内
  const budgetRanges = {
    '25元以内': { min: 8, max: 24 },
    '25-50元': { min: 26, max: 49 },
    '50元以内': { min: 15, max: 49 },
    '50-150元': { min: 55, max: 148 },
    '150-300元': { min: 155, max: 298 },
    '300元以上': { min: 305, max: 600 }
  };
  const range = budgetRanges[budget] || budgetRanges['50-150元'];
  const minPrice = range.min;
  const maxPrice = range.max;

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
    '衣': ['衣', '毛衣', '外套', '衬衫', '针织', '卫衣', '裤子'],
    '耳机': ['耳机', '蓝牙', '头戴式', '入耳式'],
    '帽子': ['帽', '鸭舌帽', '渔夫帽', '贝雷帽'],
    '围巾': ['围巾', '丝巾', '披肩'],
    '收纳': ['收纳', '置物架', '整理'],
    '鞋': ['鞋', '运动鞋', '休闲鞋', '靴子']
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
    p_id: CONFIG.PDD_PID,  // 注意：API要求是p_id，不是pid
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
    const url = urlList[0]?.mobile_url || urlList[0]?.url || `https://mobile.yangkeduo.com/goods.html?goods_sign=${goodsSign}`;
    console.log('[拼多多] 推广链接生成成功:', url);
    return url;
  } catch (error) {
    console.error('[拼多多] 推广链接生成错误:', error.message);
    // 返回直接跳转链接
    return `https://mobile.yangkeduo.com/goods.html?goods_sign=${goodsSign}`;
  }
}

// ============================================
// 健康检查
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