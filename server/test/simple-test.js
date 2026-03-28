/**
 * PickAI 简单功能测试
 * 直接测试HTML/JS文件
 */

const fs = require('fs');
const path = require('path');

console.log('\n========================================');
console.log('  PickAI 功能验证测试');
console.log('========================================\n');

const htmlPath = path.join(__dirname, '../../public/ai-picker.html');
const serverPath = path.join(__dirname, '../server.js');
const packagePath = path.join(__dirname, '../package.json');

const tests = [];

// 测试1: HTML文件存在
tests.push({
  name: 'HTML文件存在',
  run: () => {
    if (!fs.existsSync(htmlPath)) throw new Error('HTML文件不存在');
    return 'HTML文件存在';
  }
});

// 测试2: HTML结构完整性
tests.push({
  name: 'HTML结构完整性',
  run: () => {
    const html = fs.readFileSync(htmlPath, 'utf-8');

    const requiredElements = [
      { selector: '.nav', desc: '导航栏' },
      { selector: '#page1', desc: '输入页面' },
      { selector: '#page2', desc: '问题页面' },
      { selector: '#page3', desc: '结果页面' },
      { selector: '#mainInput', desc: '输入框' },
      { selector: '#charCount', desc: '字数统计' },
      { selector: '.tag-chip', desc: '快捷标签' },
      { selector: '#nextBtn', desc: '下一步按钮' },
      { selector: '#questionsLoading', desc: '骨架屏Loading' },
      { selector: '#questionsContainer', desc: '问题容器' },
      { selector: '.option-card', desc: '选项卡片' },
      { selector: '#searchBtn', desc: '搜索按钮' },
      { selector: '#loadingScreen', desc: '加载页面' },
      { selector: '#styleCard', desc: '风格卡片' },
      { selector: '.pt-tab', desc: '平台筛选Tab' },
      { selector: '#productsGrid', desc: '商品网格' },
      { selector: '#overlay', desc: '弹层' },
      { selector: '#modalBuyBtn', desc: '购买按钮' }
    ];

    const missing = [];
    for (const el of requiredElements) {
      if (!html.includes(el.selector.replace('#', '').replace('.', ''))) {
        missing.push(el.desc);
      }
    }

    if (missing.length > 0) {
      throw new Error(`缺少元素: ${missing.join(', ')}`);
    }

    return `所有${requiredElements.length}个核心元素存在`;
  }
});

// 测试3: CSS样式完整性
tests.push({
  name: 'CSS样式完整性',
  run: () => {
    const html = fs.readFileSync(htmlPath, 'utf-8');

    const requiredStyles = [
      ':root', '--ink', '--paper', '--accent', '.page', '.active',
      '.skeleton-option', 'shimmer', '.loading-screen', '.modal'
    ];

    const missing = requiredStyles.filter(s => !html.includes(s));
    if (missing.length > 0) {
      throw new Error(`缺少样式: ${missing.join(', ')}`);
    }

    return 'CSS样式完整';
  }
});

// 测试4: JavaScript功能函数
tests.push({
  name: 'JavaScript功能函数',
  run: () => {
    const html = fs.readFileSync(htmlPath, 'utf-8');

    const requiredFunctions = [
      'fillInput', 'updateCharCount', 'showError', 'hideError',
      'updateDots', 'showPage', 'goToPage2', 'getLocalFallback',
      'renderQuestions', 'selectOption', 'checkEnableSearch',
      'startSearch', 'buildResultPage', 'renderProducts',
      'filterPlatform', 'openModal', 'closeModal', 'getLocalMockData'
    ];

    const missing = requiredFunctions.filter(fn => !html.includes(`function ${fn}`) && !html.includes(`${fn} =`));
    if (missing.length > 0) {
      throw new Error(`缺少函数: ${missing.join(', ')}`);
    }

    return `所有${requiredFunctions.length}个核心函数存在`;
  }
});

// 测试5: 动态问题生成逻辑
tests.push({
  name: '动态问题生成逻辑',
  run: () => {
    const html = fs.readFileSync(htmlPath, 'utf-8');

    if (!html.includes('getLocalFallback')) throw new Error('缺少本地fallback函数');
    if (!html.includes('categoryQuestions')) throw new Error('缺少品类问题配置');
    if (!html.includes('包') && !html.includes('耳机') && !html.includes('衣')) {
      throw new Error('缺少品类关键词检测');
    }

    return '动态问题生成逻辑完整';
  }
});

// 测试6: 状态管理
tests.push({
  name: '状态管理',
  run: () => {
    const html = fs.readFileSync(htmlPath, 'utf-8');

    if (!html.includes("state = {")) throw new Error('缺少状态对象');
    if (!html.includes('state.input')) throw new Error('缺少input状态');
    if (!html.includes('state.questions')) throw new Error('缺少questions状态');
    if (!html.includes('state.q1Answer')) throw new Error('缺少q1Answer状态');
    if (!html.includes('state.q2Answer')) throw new Error('缺少q2Answer状态');
    if (!html.includes('state.products')) throw new Error('缺少products状态');

    return '状态管理完整';
  }
});

// 测试7: API接口调用
tests.push({
  name: 'API接口调用',
  run: () => {
    const html = fs.readFileSync(htmlPath, 'utf-8');

    if (!html.includes('/api/ai/questions')) throw new Error('缺少问题生成API调用');
    if (!html.includes('/api/ai/recommend')) throw new Error('缺少推荐API调用');

    return 'API接口调用配置正确';
  }
});

// 测试8: 响应式布局
tests.push({
  name: '响应式布局',
  run: () => {
    const html = fs.readFileSync(htmlPath, 'utf-8');

    if (!html.includes('@media (min-width: 768px)')) throw new Error('缺少桌面端媒体查询');
    if (!html.includes('viewport-fit=cover')) throw new Error('缺少安全区适配');
    if (!html.includes('safe-area-inset-bottom')) throw new Error('缺少底部安全区适配');

    return '响应式布局配置正确';
  }
});

// 测试9: 服务器文件存在
tests.push({
  name: '服务器文件',
  run: () => {
    if (!fs.existsSync(serverPath)) throw new Error('服务器文件不存在');

    const server = fs.readFileSync(serverPath, 'utf-8');

    if (!server.includes('/api/ai/questions')) throw new Error('服务器缺少问题接口');
    if (!server.includes('/api/ai/recommend')) throw new Error('服务器缺少推荐接口');
    if (!server.includes('FALLBACK_QUESTIONS')) throw new Error('服务器缺少fallback问题');

    return '服务器文件完整';
  }
});

// 测试10: 模拟数据完整性
tests.push({
  name: '模拟数据完整性',
  run: () => {
    const html = fs.readFileSync(htmlPath, 'utf-8');

    // 检查模拟商品数据
    if (!html.includes("platform: 'pdd'")) throw new Error('缺少拼多多数据');
    if (!html.includes("platform: 'tb'")) throw new Error('缺少淘宝数据');
    if (!html.includes("platform: '1688'")) throw new Error('缺少1688数据');

    return '模拟数据完整，包含三个平台';
  }
});

// 运行测试
const results = { passed: [], failed: [] };

for (const test of tests) {
  try {
    console.log(`\n▶ ${test.name}...`);
    const result = test.run();
    results.passed.push({ name: test.name, result });
    console.log(`  ✅ 通过: ${result}`);
  } catch (error) {
    results.failed.push({ name: test.name, error: error.message });
    console.log(`  ❌ 失败: ${error.message}`);
  }
}

// 输出结果
console.log('\n========================================');
console.log('  测试结果汇总');
console.log('========================================');
console.log(`\n✅ 通过: ${results.passed.length}`);
console.log(`❌ 失败: ${results.failed.length}`);
console.log(`📊 总计: ${tests.length}`);
console.log(`⏱️  时间: ${new Date().toLocaleString()}`);

if (results.failed.length > 0) {
  console.log('\n失败的测试:');
  results.failed.forEach(f => {
    console.log(`  - ${f.name}: ${f.error}`);
  });
}

// 生成测试报告
const reportPath = path.join(__dirname, 'test-report.json');
fs.writeFileSync(reportPath, JSON.stringify({
  startTime: new Date().toISOString(),
  results,
  summary: {
    total: tests.length,
    passed: results.passed.length,
    failed: results.failed.length
  }
}, null, 2));

console.log(`\n📄 测试报告已保存: ${reportPath}`);

// 返回状态码
process.exit(results.failed.length > 0 ? 1 : 0);