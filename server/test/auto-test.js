/**
 * PickAI 自动化测试脚本
 * 使用 Playwright 进行端到端测试
 */

const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

// 测试配置
const TEST_PORT = 9999;
const TEST_URL = `http://localhost:${TEST_URL}/ai-picker.html`;

// 测试结果
const results = {
  passed: [],
  failed: [],
  startTime: new Date().toISOString()
};

// 简单的HTTP服务器
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let filePath = path.join(__dirname, 'public', req.url === '/' ? 'ai-picker.html' : req.url);
      const ext = path.extname(filePath);
      const contentTypes = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json'
      };

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not Found');
        } else {
          res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
          res.end(data);
        }
      });
    });

    server.listen(TEST_PORT, () => {
      console.log(`测试服务器启动: http://localhost:${TEST_PORT}`);
      resolve(server);
    });
  });
}

// 测试用例
const testCases = [
  {
    name: '页面加载测试',
    test: async (page) => {
      await page.goto(`http://localhost:${TEST_PORT}/ai-picker.html`);
      const title = await page.title();
      if (!title.includes('PickAI')) throw new Error('标题不正确');

      // 检查Logo
      const logo = await page.locator('.logo').textContent();
      if (!logo.includes('Pick')) throw new Error('Logo不正确');

      // 检查进度条
      const dots = await page.locator('.step-dot').count();
      if (dots !== 3) throw new Error('进度点数量不正确');

      return '页面加载成功，Logo和进度条正确';
    }
  },
  {
    name: 'Page 1 输入功能测试',
    test: async (page) => {
      await page.goto(`http://localhost:${TEST_PORT}/ai-picker.html`);

      // 测试字数统计
      const input = page.locator('#mainInput');
      await input.fill('测试输入内容');
      const charCount = await page.locator('#charCount').textContent();
      if (charCount !== '6') throw new Error('字数统计不正确');

      // 测试快捷标签
      await page.locator('.tag-chip').first().click();
      const inputValue = await input.inputValue();
      if (!inputValue.includes('通勤包')) throw new Error('快捷标签填充失败');

      // 测试空输入验证
      await input.fill('');
      await page.locator('#nextBtn').click();
      const errorVisible = await page.locator('#inputError').isVisible();
      if (!errorVisible) throw new Error('空输入验证未触发');

      return '输入功能正常，字数统计和验证正确';
    }
  },
  {
    name: 'Page 1 -> Page 2 跳转测试',
    test: async (page) => {
      await page.goto(`http://localhost:${TEST_PORT}/ai-picker.html`);

      // 输入内容
      await page.locator('#mainInput').fill('测试商品搜索');
      await page.locator('#nextBtn').click();

      // 等待页面跳转
      await page.waitForSelector('#page2.active', { timeout: 5000 });

      // 检查进度条更新
      const dot2 = await page.locator('#dot2').getAttribute('class');
      if (!dot2.includes('active')) throw new Error('进度条未更新');

      // 检查骨架屏
      const skeleton = await page.locator('#questionsLoading').isVisible();
      if (!skeleton) throw new Error('骨架屏未显示');

      return '页面跳转成功，进度条和骨架屏正常';
    }
  },
  {
    name: 'Page 2 动态问题渲染测试',
    test: async (page) => {
      await page.goto(`http://localhost:${TEST_PORT}/ai-picker.html`);

      // 输入内容并跳转
      await page.locator('#mainInput').fill('测试商品');
      await page.locator('#nextBtn').click();

      // 等待问题加载
      await page.waitForSelector('#questionsContainer[style*="block"]', { timeout: 10000 });

      // 检查问题数量
      const questions = await page.locator('.question-block').count();
      if (questions !== 2) throw new Error('问题数量不正确');

      // 检查选项卡片
      const options = await page.locator('.option-card').count();
      if (options !== 8) throw new Error('选项卡片数量不正确');

      return '动态问题渲染成功，问题和选项数量正确';
    }
  },
  {
    name: 'Page 2 选项选择测试',
    test: async (page) => {
      await page.goto(`http://localhost:${TEST_PORT}/ai-picker.html`);

      // 输入并跳转
      await page.locator('#mainInput').fill('测试商品');
      await page.locator('#nextBtn').click();
      await page.waitForSelector('#questionsContainer[style*="block"]', { timeout: 10000 });

      // 选择第一个问题的选项
      await page.locator('.option-card').first().click();
      const selected1 = await page.locator('.option-card.selected').first().isVisible();
      if (!selected1) throw new Error('选项1选择失败');

      // 选择第二个问题的选项
      await page.locator('.question-block').nth(1).locator('.option-card').first().click();

      // 检查按钮是否激活
      const btnEnabled = await page.locator('#searchBtn').isEnabled();
      if (!btnEnabled) throw new Error('搜索按钮未激活');

      return '选项选择功能正常，按钮激活正确';
    }
  },
  {
    name: 'Page 2 -> Page 3 完整流程测试',
    test: async (page) => {
      await page.goto(`http://localhost:${TEST_PORT}/ai-picker.html`);

      // Step 1: 输入
      await page.locator('#mainInput').fill('通勤包');
      await page.locator('#nextBtn').click();

      // Step 2: 等待问题并选择
      await page.waitForSelector('#questionsContainer[style*="block"]', { timeout: 10000 });
      await page.locator('.option-card').first().click();
      await page.locator('.question-block').nth(1).locator('.option-card').first().click();

      // Step 3: 开始搜索
      await page.locator('#searchBtn').click();

      // 等待Loading
      await page.waitForSelector('#loadingScreen.show', { timeout: 2000 });

      // 等待结果页
      await page.waitForSelector('#page3.active', { timeout: 10000 });

      // 检查风格卡片
      const styleName = await page.locator('#styleName').textContent();
      if (!styleName) throw new Error('风格名称未显示');

      // 检查商品列表
      const products = await page.locator('.prod-card').count();
      if (products === 0) throw new Error('商品列表为空');

      return '完整流程测试通过，商品推荐正常';
    }
  },
  {
    name: '商品详情弹层测试',
    test: async (page) => {
      await page.goto(`http://localhost:${TEST_PORT}/ai-picker.html`);

      // 完成流程到结果页
      await page.locator('#mainInput').fill('测试');
      await page.locator('#nextBtn').click();
      await page.waitForSelector('#questionsContainer[style*="block"]', { timeout: 10000 });
      await page.locator('.option-card').first().click();
      await page.locator('.question-block').nth(1).locator('.option-card').first().click();
      await page.locator('#searchBtn').click();
      await page.waitForSelector('#page3.active', { timeout: 10000 });

      // 点击商品卡片
      await page.locator('.prod-card').first().click();

      // 检查弹层
      const modal = await page.locator('#overlay.open').isVisible();
      if (!modal) throw new Error('弹层未打开');

      // 检查商品信息
      const name = await page.locator('#modalName').textContent();
      if (!name) throw new Error('商品名称未显示');

      // 关闭弹层
      await page.locator('.modal-drag').click();
      await page.waitForTimeout(500);
      const closed = await page.locator('#overlay.open').isVisible();
      if (closed) throw new Error('弹层未关闭');

      return '商品详情弹层功能正常';
    }
  },
  {
    name: '平台筛选功能测试',
    test: async (page) => {
      await page.goto(`http://localhost:${TEST_PORT}/ai-picker.html`);

      // 完成流程到结果页
      await page.locator('#mainInput').fill('测试');
      await page.locator('#nextBtn').click();
      await page.waitForSelector('#questionsContainer[style*="block"]', { timeout: 10000 });
      await page.locator('.option-card').first().click();
      await page.locator('.question-block').nth(1).locator('.option-card').first().click();
      await page.locator('#searchBtn').click();
      await page.waitForSelector('#page3.active', { timeout: 10000 });

      // 点击拼多多筛选
      await page.locator('.pt-tab').nth(1).click();
      await page.waitForTimeout(500);

      // 检查商品数量变化
      const count = await page.locator('#resultCount').textContent();
      if (count === '0') throw new Error('筛选后商品数量为0');

      // 返回全部
      await page.locator('.pt-tab').first().click();
      const allCount = await page.locator('#resultCount').textContent();
      if (allCount === '0') throw new Error('全部商品数量为0');

      return '平台筛选功能正常';
    }
  },
  {
    name: '响应式布局测试',
    test: async (page) => {
      // 测试移动端
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(`http://localhost:${TEST_PORT}/ai-picker.html`);

      const pageWidth = await page.evaluate(() => {
        return document.querySelector('.page-inner').offsetWidth;
      });

      if (pageWidth > 400) throw new Error('移动端布局宽度不正确');

      // 测试桌面端
      await page.setViewportSize({ width: 1200, height: 800 });

      const desktopWidth = await page.evaluate(() => {
        return document.querySelector('.page-inner').offsetWidth;
      });

      if (desktopWidth < 400) throw new Error('桌面端布局宽度不正确');

      return '响应式布局测试通过';
    }
  },
  {
    name: '返回按钮功能测试',
    test: async (page) => {
      await page.goto(`http://localhost:${TEST_PORT}/ai-picker.html`);

      // Step 1 -> Step 2
      await page.locator('#mainInput').fill('测试');
      await page.locator('#nextBtn').click();
      await page.waitForSelector('#page2.active', { timeout: 5000 });

      // 返回Step 1
      await page.locator('.btn-back').click();
      await page.waitForSelector('#page1.active', { timeout: 2000 });

      // 检查输入内容是否保留
      const inputVal = await page.locator('#mainInput').inputValue();
      if (inputVal !== '测试') throw new Error('输入内容未保留');

      return '返回按钮功能正常';
    }
  }
];

// 运行测试
async function runTests() {
  console.log('\n========================================');
  console.log('  PickAI 自动化测试');
  console.log('========================================\n');

  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  for (const testCase of testCases) {
    try {
      console.log(`\n▶ ${testCase.name}...`);
      const result = await testCase.test(page);
      results.passed.push({ name: testCase.name, result });
      console.log(`  ✅ 通过: ${result}`);
    } catch (error) {
      results.failed.push({ name: testCase.name, error: error.message });
      console.log(`  ❌ 失败: ${error.message}`);
    }
  }

  await browser.close();
  server.close();

  // 输出结果
  console.log('\n========================================');
  console.log('  测试结果汇总');
  console.log('========================================');
  console.log(`\n✅ 通过: ${results.passed.length}`);
  console.log(`❌ 失败: ${results.failed.length}`);
  console.log(`📊 总计: ${testCases.length}`);
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
    ...results,
    endTime: new Date().toISOString(),
    summary: {
      total: testCases.length,
      passed: results.passed.length,
      failed: results.failed.length
    }
  }, null, 2));

  console.log(`\n📄 测试报告已保存: ${reportPath}`);

  return results.failed.length === 0;
}

// 执行测试
runTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('测试执行错误:', err);
  process.exit(1);
});