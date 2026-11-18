import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

const FIXTURES = path.join(process.cwd(), 'tests', 'fixtures');
const SHOTS = path.join(process.cwd(), 'test-results', 'screenshots');
const CARD = path.join(FIXTURES, 'card.json');
const PNG = path.join(FIXTURES, 'card.png');
const WORLD = path.join(FIXTURES, 'worldbook.json');
const LAST_REQUEST = path.join(process.cwd(), 'tests', '.mock-last-request.json');

test.beforeAll(() => {
  fs.mkdirSync(SHOTS, { recursive: true });
});

async function dismissToasts(page: Page) {
  const buttons = page.locator('.toast-close');
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    await buttons
      .nth(i)
      .click({ timeout: 1000 })
      .catch(() => undefined);
  }
}

async function importCard(page: Page, file = CARD) {
  await page.goto('/');
  await expect(page.locator('.brand-title')).toBeVisible();
  await page.locator('#card-file-input').setInputFiles(file);
  await expect(page.locator('.chat-name-row h2')).toHaveText('测试角色·阿绫', { timeout: 20_000 });
  await expect(page.locator('.bubble-assistant').first()).toContainText('今晚的钟');
}

/** Opens the custom model picker, searches and confirms a model id. */
async function chooseModel(page: Page, model: string) {
  await page.locator('#model').click();
  const search = page.locator('.dropdown-search input');
  await expect(search).toBeVisible();
  await search.fill(model);
  await search.press('Enter');
  await expect(page.locator('#model')).toContainText(model);
}

/** Picks a provider in the custom dropdown; the native <select> is gone. */
async function chooseProvider(page: Page, label: string) {
  await page.locator('#provider').click();
  const panel = page.locator('.dropdown-panel');
  await expect(panel).toBeVisible();
  await page.locator('.dropdown-option', { hasText: label }).first().click();
  await expect(panel).toHaveCount(0);
}

async function configureApi(page: Page, baseUrl = 'http://127.0.0.1:8787/v1') {
  await dismissToasts(page);
  await page.locator('.chat-actions button[title="设置"]').click();
  await expect(page.locator('#api-key')).toBeVisible();
  await page.fill('#api-key', 'sk-test-key');
  await page.fill('#base-url', baseUrl);
  await chooseModel(page, 'deepseek-flash');
  await page.getByRole('button', { name: '保存设置' }).click();
  await expect(page.locator('.settings-scroll')).toHaveCount(0);
}

async function setContextLimit(page: Page, limit: number) {
  await dismissToasts(page);
  await page.locator('.chat-actions button[title="设置"]').click();
  await expect(page.locator('#context-limit')).toBeVisible();
  await page.fill('#context-limit', String(limit));
  await page.getByRole('button', { name: '保存设置' }).click();
  await expect(page.locator('.settings-scroll')).toHaveCount(0);
}

async function sendAndWait(page: Page, text: string) {
  const input = page.getByLabel('输入消息');
  await input.fill(text);
  await page.getByLabel('发送').click();
  await expect(page.locator('.markdown').last()).toContainText('跟紧我', { timeout: 25_000 });
}

/** Sends `[long]` turns; the mock answers with a ~1.5k-character reply. */
async function sendLongTurn(page: Page, label: string) {
  await page.getByLabel('输入消息').fill(`[long] ${label}`);
  await page.getByLabel('发送').click();
  await expect(page.locator('.markdown').last()).toContainText('第 12 段', { timeout: 40_000 });
  await expect(page.getByLabel('发送')).toBeVisible({ timeout: 40_000 });
}

/** Real touch drag through CDP, so React's touch handlers run in the browser. */
async function swipe(page: Page, from: [number, number], to: [number, number]) {
  const cdp = await page.context().newCDPSession(page);
  const point = ([x, y]: [number, number]) => [{ x, y, radiusX: 2, radiusY: 2, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(from) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(to) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test.describe('desktop', () => {
  test('keeps the API key while testing the connection and after saving', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.brand-title')).toBeVisible();
    await page.locator('.brand .icon-btn[aria-label="设置"]').click();
    await page.fill('#api-key', 'sk-test-key-123');
    await page.fill('#base-url', 'http://127.0.0.1:8787/v1');
    await chooseModel(page, 'deepseek-flash');
    await page.getByRole('button', { name: '测试连接' }).click();
    await expect(page.locator('.test-result')).toContainText('连接成功');
    await expect(page.locator('#api-key')).toHaveValue('sk-test-key-123');
    await page.keyboard.press('Escape');
    await page.locator('.brand .icon-btn[aria-label="设置"]').click();
    await expect(page.locator('#api-key')).toHaveValue('sk-test-key-123');
    await page.getByRole('button', { name: '保存设置' }).click();
    await page.locator('.brand .icon-btn[aria-label="设置"]').click();
    await expect(page.locator('#api-key')).toHaveValue('sk-test-key-123');
  });

  test('switches model providers and remembers a key for each', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.brand-title')).toBeVisible();
    await page.locator('.brand .icon-btn[aria-label="设置"]').click();

    await chooseProvider(page, '通义千问');
    await expect(page.locator('#base-url')).toHaveValue(
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
    );
    await expect(page.locator('#model')).toContainText('qwen4-max');
    await page.locator('#api-key').fill('sk-qwen');
    await page.locator('#base-url').click(); // blur the key so it is remembered

    await chooseProvider(page, 'DeepSeek');
    await expect(page.locator('#base-url')).toHaveValue('https://api.deepseek.com');
    await expect(page.locator('#model')).toContainText('deepseek-flash');
    await expect(page.locator('#api-key')).toHaveValue('');
    await page.locator('#api-key').fill('sk-deepseek');
    await page.locator('#base-url').click();

    await chooseProvider(page, '通义千问');
    await expect(page.locator('#api-key')).toHaveValue('sk-qwen');
    await chooseProvider(page, 'DeepSeek');
    await expect(page.locator('#api-key')).toHaveValue('sk-deepseek');

    await chooseProvider(page, '自定义');
    await expect(page.locator('#provider')).toContainText('自定义');
    await expect(page.locator('#base-url')).toHaveValue('https://api.deepseek.com');

    await page.getByRole('button', { name: '保存设置' }).click();
  });

  test('picks a model from the custom dropdown and fetches the live list', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.brand-title')).toBeVisible();
    await page.locator('.brand .icon-btn[aria-label="设置"]').click();
    await expect(page.locator('#api-key')).toBeVisible();
    await page.fill('#api-key', 'sk-test-key');
    await page.fill('#base-url', 'http://127.0.0.1:8787/v1');

    // The panel is our own, so it can be styled and survive inside the modal.
    await page.locator('#model').click();
    await expect(page.locator('.dropdown-panel')).toBeVisible();
    await page.locator('.dropdown-search input').fill('v4-pro');
    await expect(page.locator('.dropdown-option:not(.custom)')).toHaveCount(1);
    await page.locator('.dropdown-option:not(.custom)').first().click();
    await expect(page.locator('.dropdown-panel')).toHaveCount(0);
    await expect(page.locator('#model')).toContainText('deepseek-v4-pro');

    // 获取最新模型 hits GET {baseUrl}/models (the mock answers with two ids).
    await page.getByRole('button', { name: '获取最新模型' }).click();
    await expect(page.locator('.settings-section').first()).toContainText('已获取 2 个模型');
    await page.locator('#model').click();
    await expect(page.locator('.dropdown-option:not(.custom)')).toHaveCount(2);
    await page.keyboard.press('Escape');
    await expect(page.locator('.dropdown-panel')).toHaveCount(0);
  });

  test('imports a card, auto-mounts its world book, chats and persists', async ({ page }) => {
    await importCard(page);
    await configureApi(page);
    await sendAndWait(page, '带我去钟楼，我想看看那把钥匙。');

    const loreBadge = page.locator('.lore-badge').last();
    await expect(loreBadge).toContainText('世界书 3');
    await loreBadge.click();
    await expect(page.getByRole('heading', { name: '本轮触发的世界书' })).toBeVisible();
    await expect(page.locator('.lore-list')).toContainText('黄铜钥匙');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: '本轮触发的世界书' })).toHaveCount(0);

    const request = JSON.parse(fs.readFileSync(LAST_REQUEST, 'utf8'));
    const system = request.messages[0].content as string;
    expect(system).toContain('海边的旧城');
    expect(system).toContain('钟楼地下有一间上锁的档案室');
    expect(system).toContain('阿绫');
    expect(system).not.toContain('{{char}}');
    expect(request.messages.at(-1)).toMatchObject({
      role: 'user',
      content: '带我去钟楼，我想看看那把钥匙。',
    });
    const depth = request.messages.find((m: { content: string }) => m.content.includes('黄铜钥匙'));
    expect(depth).toBeTruthy();
    expect(request.stream).toBe(true);

    await dismissToasts(page);
    await page.reload();
    await expect(page.locator('.chat-name-row h2')).toHaveText('测试角色·阿绫', {
      timeout: 20_000,
    });
    await expect(page.locator('.markdown').last()).toContainText('跟紧我');
    await page.screenshot({ path: path.join(SHOTS, 'desktop-chat.png') });
  });

  test('switches opening variants, edits history and regenerates as a new swipe', async ({
    page,
  }) => {
    await importCard(page);

    // 1) first_mes + alternate_greetings become swipe variants
    const greetingRow = page.locator('.msg-assistant').first();
    await expect(greetingRow.locator('.swipe-count')).toHaveText('1/2');
    await greetingRow.getByLabel('下一版').click();
    await expect(greetingRow.locator('.swipe-count')).toHaveText('2/2');
    await expect(greetingRow.locator('.bubble-assistant')).toContainText('进来躲雨吧');
    await greetingRow.getByLabel('上一版').click();
    await expect(greetingRow.locator('.bubble-assistant')).toContainText('今晚的钟');

    // 2) edit the greeting; the edit sticks and is marked
    await greetingRow.locator('.meta-btn[title="编辑这条消息"]').click();
    const editor = greetingRow.getByLabel('编辑消息');
    await expect(editor).toBeVisible();
    await editor.fill('【已编辑的开场】今晚的钟比往常慢了一拍。');
    await greetingRow.getByRole('button', { name: '保存' }).click();
    await expect(greetingRow.locator('.bubble-assistant')).toContainText('已编辑的开场');
    await expect(greetingRow.locator('.tag', { hasText: '已编辑' })).toBeVisible();

    // 3) edit a user message, then check the edited text is what the model receives
    await configureApi(page);
    await sendAndWait(page, '带我去钟楼。');
    const userRow = page.locator('.msg-user').last();
    await userRow.locator('.meta-btn[title="编辑这条消息"]').click();
    await userRow.getByLabel('编辑消息').fill('我想去钟楼看那把黄铜钥匙。');
    await userRow.getByRole('button', { name: '保存' }).click();
    await expect(userRow.locator('.bubble-user')).toContainText('黄铜钥匙');

    // 4) regenerate creates a second variant instead of destroying the first
    await expect(page.getByLabel('发送')).toBeVisible({ timeout: 20_000 });
    const assistantRow = page.locator('.msg-assistant').last();
    const before = await assistantRow.locator('.markdown').innerText();
    await assistantRow.locator('.meta-btn[title^="重新生成"]').click();
    await expect(assistantRow.locator('.swipe-count')).toHaveText('2/2', { timeout: 30_000 });
    await assistantRow.getByLabel('上一版').click();
    await expect(assistantRow.locator('.markdown')).toHaveText(before);
    await assistantRow.getByLabel('下一版').click();
    await expect(assistantRow.locator('.markdown')).toContainText('跟紧我');

    // 5) the edited history is really sent to the model
    await expect(page.getByLabel('发送')).toBeVisible({ timeout: 30_000 });
    await page.getByLabel('输入消息').fill('再讲讲钥匙。');
    await page.getByLabel('发送').click();
    await expect(page.locator('.markdown').last()).toContainText('跟紧我', { timeout: 25_000 });
    const request = JSON.parse(fs.readFileSync(LAST_REQUEST, 'utf8'));
    const contents = request.messages.map((m: { content: string }) => m.content);
    expect(contents).toContain('我想去钟楼看那把黄铜钥匙。');
    expect(contents).toContain('【已编辑的开场】今晚的钟比往常慢了一拍。');
    expect(contents).not.toContain('带我去钟楼。');

    await page.screenshot({ path: path.join(SHOTS, 'desktop-swipes.png') });
  });

  test('highlights quoted dialogue and shows a user avatar only after upload', async ({ page }) => {
    await importCard(page);
    await dismissToasts(page);
    await configureApi(page);

    await sendAndWait(page, '「我来了。」');
    // SillyTavern's quote rule: the marks and the text between them are coloured.
    await expect(page.locator('.bubble-assistant').last().locator('.quote')).toHaveText(
      '「跟紧我，别踩湿的那几级。」',
    );
    await expect(page.locator('.bubble-user').last().locator('.quote')).toHaveText('「我来了。」');
    // No avatar is uploaded yet, so user bubbles stay avatar-less as before.
    await expect(page.locator('.msg-user .avatar')).toHaveCount(0);

    await dismissToasts(page);
    await page.locator('.chat-actions button[title="设置"]').click();
    await page.locator('#user-avatar-input').setInputFiles(PNG);
    await expect(page.locator('.user-avatar-picker img')).toBeVisible();
    await page.getByRole('button', { name: '保存设置' }).click();
    await expect(page.locator('.msg-user .avatar').last()).toBeVisible();

    await page.screenshot({ path: path.join(SHOTS, 'desktop-quotes-avatar.png') });
  });

  test('creates and edits a card and a world book by hand, and keeps the theme', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('.brand-title')).toBeVisible();

    await page.locator('.rail-head-actions').getByRole('button', { name: '新建' }).click();
    await page.locator('#card-name').fill('临渊');
    await page.locator('#card-notes').fill('雾港的守夜人');
    await page.locator('#card-prompt').fill('你是临渊，雾港的守夜人。');
    await page.locator('#card-greeting').fill('「跟紧我，别出声。」');
    await page.getByRole('button', { name: '创建角色卡' }).click();
    await expect(page.locator('.chat-name-row h2')).toHaveText('临渊');
    await expect(page.locator('.bubble-assistant').first()).toContainText('跟紧我');
    await expect(page.locator('.character-card')).toContainText('雾港的守夜人');

    // Editing the card keeps the chats and updates the list note.
    await page.locator('.card-menu-btn').first().click();
    await page.locator('.card-menu').getByRole('menuitem', { name: '编辑角色卡' }).click();
    await page.locator('#card-notes').fill('雾港守夜人（已改）');
    await page.locator('#card-greeting').fill('「今天轮到你守夜。」');
    await page.getByRole('button', { name: '保存修改' }).click();
    await expect(page.locator('.character-card')).toContainText('已改');
    await expect(page.locator('.bubble-assistant').first()).toContainText('跟紧我');

    // Create a world book and attach it to the card.
    await page.locator('.card-menu-btn').first().click();
    await page.locator('.card-menu').getByRole('menuitem', { name: '新建世界书' }).click();
    await page.locator('#wb-name').fill('雾港设定集');
    await page.locator('#wb-entry-0-keys').fill('灯塔');
    await page.locator('#wb-entry-0-content').fill('灯塔每夜点亮，守夜人负责添油。');
    await page.getByRole('button', { name: '创建世界书' }).click();
    await expect(page.locator('.character-card')).toContainText('世界书 1');

    // Edit it from the viewer.
    await page.locator('.card-menu-btn').first().click();
    await page.locator('.card-menu').getByRole('menuitem', { name: '查看世界书' }).click();
    await expect(page.locator('.wb-modal')).toContainText('雾港设定集');
    await page.locator('.wb-modal').getByRole('button', { name: '编辑' }).first().click();
    await page.locator('#wb-entry-0-comment').fill('灯塔（修订）');
    await page.getByRole('button', { name: '保存修改' }).click();
    await expect(page.locator('.wb-modal')).toContainText('灯塔（修订）');
    await page.keyboard.press('Escape');

    // Theme switch and persistence.
    await page.locator('.chat-head button[title="设置"]').click();
    await page.locator('.theme-choice', { hasText: '亮色' }).click();
    await page.getByRole('button', { name: '保存设置' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('.character-card')).toContainText('临渊');
  });

  test('shows the card-name validation above the modal instead of behind it', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.brand-title')).toBeVisible();
    await page.locator('.rail-head-actions').getByRole('button', { name: '新建' }).click();
    await expect(page.locator('#card-name')).toBeVisible();

    await page.getByRole('button', { name: '创建角色卡' }).click();
    const banner = page.locator('.form-error');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('请填写角色名');
    await expect(page.locator('#card-name')).toBeFocused();

    // The banner must actually be the topmost element at its own centre: the
    // regression was that the modal backdrop painted over the toast.
    const onTop = await page.evaluate(() => {
      const el = document.querySelector('.form-error');
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return Boolean(hit && el.contains(hit));
    });
    expect(onTop).toBe(true);
    await page.screenshot({ path: path.join(SHOTS, 'desktop-card-validation.png') });

    // Filling the name clears the banner and the card is created.
    await page.locator('#card-name').fill('临渊');
    await page.locator('#card-prompt').fill('你是临渊，雾港的守夜人。');
    await page.getByRole('button', { name: '创建角色卡' }).click();
    await expect(page.locator('.chat-name-row h2')).toHaveText('临渊');
  });

  test('gives each chat its own title, context window and background', async ({ page }) => {
    await importCard(page);
    await page.getByLabel('对话设置').click();
    await expect(page.locator('#chat-title')).toBeVisible();
    await page.locator('#chat-title').fill('雨夜钟楼');
    await page.locator('#chat-limit').fill('262144');
    await page.locator('.chat-settings-modal input[type="file"]').setInputFiles(PNG);
    await expect(page.locator('.chat-bg-picker img')).toBeVisible();
    await page.getByRole('button', { name: '保存' }).click();

    await expect(page.locator('.chat-name-row h2')).toHaveText('测试角色·阿绫');
    await expect(page.locator('.chat-list-panel')).toContainText('雨夜钟楼');
    await expect(page.locator('.chat-name-title')).toHaveText('雨夜钟楼');
    const bg = page.locator('.chat-bg');
    await expect(bg).toBeVisible();
    const backgroundImage = await bg.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(backgroundImage).toContain('data:image');

    // The chat's own window drives the usage meter.
    await expect(page.locator('.ctx-chip')).toHaveAttribute('title', /256K/);

    // Night mode adds a veil, light mode does not.
    const veil = async (theme: 'dark' | 'light') =>
      page.evaluate((next) => {
        document.documentElement.dataset.theme = next;
        const el = document.querySelector('.chat-bg');
        if (!el) return '';
        const style = getComputedStyle(el, '::after');
        return `${style.content}|${style.backgroundColor}`;
      }, theme);
    expect(await veil('dark')).toMatch(/rgba?\([^)]*0\.\d/);
    expect(await veil('light')).toContain('none');
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
    });
    await page.screenshot({ path: path.join(SHOTS, 'desktop-chat-background.png') });

    // Everything survives a reload.
    await page.reload();
    await expect(page.locator('.chat-name-row h2')).toHaveText('测试角色·阿绫');
    await expect(page.locator('.chat-name-title')).toHaveText('雨夜钟楼');
    await expect(page.locator('.chat-bg')).toBeVisible();
  });

  test('silently checks for updates on launch and shows the notes behind a red dot', async ({
    page,
  }) => {
    await page.route('https://github.com/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          version: '9.9.9',
          notes: '## 9.9.9\n\n- 这是测试用的更新说明',
          publishedAt: '2026-11-17T00:00:00.000Z',
          windows: { file: 'LiteTavern-9.9.9-win-x64.exe', size: 1024, sha256: 'a'.repeat(64) },
        }),
      }),
    );

    await page.goto('/');
    await expect(page.locator('.brand-title')).toBeVisible();
    await expect(page.locator('.update-dot').first()).toBeVisible({ timeout: 30_000 });

    await page.locator('.brand .icon-btn[aria-label="设置"]').click();
    await expect(page.locator('.update-card')).toContainText('9.9.9');
    await expect(page.locator('.update-notes')).toContainText('这是测试用的更新说明');
    await page.screenshot({ path: path.join(SHOTS, 'desktop-update-dot.png') });
    await expect(page.locator('.update-dot')).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(page.locator('.update-dot')).toHaveCount(0);
  });

  test('opens the card menu above the cards and closes on an outside click', async ({ page }) => {
    await importCard(page);

    const menuButton = page.locator('.card-menu-btn').first();
    await menuButton.click();
    const menu = page.locator('.card-menu');
    await expect(menu).toBeVisible();

    // The regression: the menu lived inside the card, so the next card painted
    // over it and clicks landed on that card instead of the menu item.
    const onTop = await page.evaluate(() => {
      const el = document.querySelector('.card-menu');
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return Boolean(hit && el.contains(hit));
    });
    expect(onTop).toBe(true);

    // Clicking somewhere else closes it.
    await page.mouse.click(720, 140);
    await expect(menu).toHaveCount(0);

    // And a menu item really runs, instead of hitting the card underneath.
    await menuButton.click();
    await menu.getByRole('menuitem', { name: '编辑角色卡' }).click();
    await expect(page.locator('#card-name')).toBeVisible();
    await expect(page.locator('#card-name')).toHaveValue('测试角色·阿绫');
  });

  test('collapses both desktop side panels and restores them', async ({ page }) => {
    await importCard(page);
    const left = page.locator('.chat-list-panel');
    const right = page.locator('.character-panel');
    await expect(left).toBeVisible();
    await expect(right).toBeVisible();

    await left.locator('.collapse-btn').click();
    await expect(left).toBeHidden();
    await expect(page.locator('.panel-handle.left')).toBeVisible();
    await page.locator('.panel-handle.left').click();
    await expect(left).toBeVisible();
    await expect(page.locator('.panel-handle.left')).toHaveCount(0);

    await right.locator('.collapse-btn').click();
    await expect(right).toBeHidden();
    await expect(page.locator('.panel-handle.right')).toBeVisible();

    // The choice survives a reload.
    await page.reload();
    await expect(right).toBeHidden();
    await page.locator('.panel-handle.right').click();
    await expect(right).toBeVisible();
  });

  test('can use the character picture as the chat background', async ({ page }) => {
    // A JSON card carries no picture, so the option stays disabled.
    await importCard(page);
    await page.getByLabel('对话设置').click();
    const toggle = page.locator('.bg-card-switch input');
    await expect(toggle).toBeDisabled();
    await expect(page.locator('.bg-card-switch')).toHaveClass(/is-disabled/);
    await expect(page.locator('.chat-settings-modal')).toContainText('这张卡没有图片');
    await page.getByRole('button', { name: '取消' }).click();

    // A PNG card has one, so it can be the background too.
    await page.goto('/');
    await page.locator('#card-file-input').setInputFiles(PNG);
    await expect(page.locator('.bubble-assistant').first()).toBeVisible({ timeout: 20_000 });
    await page.getByLabel('对话设置').click();
    await expect(toggle).toBeEnabled();
    // The real checkbox is visually hidden behind the switch track; click the label.
    await page.locator('.bg-card-switch').click();
    await expect(toggle).toBeChecked();
    await page.getByRole('button', { name: '保存' }).click();

    const bg = page.locator('.chat-bg');
    await expect(bg).toBeVisible();
    const backgroundImage = await bg.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(backgroundImage).toContain('data:image');
    await page.reload();
    await expect(page.locator('.chat-bg')).toBeVisible();
  });

  test('edits every world book entry instead of squashing the rows', async ({ page }) => {
    await importCard(page);

    await page.locator('.card-menu-btn').first().click();
    await page.locator('.card-menu').getByRole('menuitem', { name: '新建世界书' }).click();
    await page.locator('#wb-name').fill('词条压力测试');
    await page.locator('#wb-entry-0-keys').fill('钟楼');
    await page.locator('#wb-entry-0-content').fill('钟楼每夜点亮。');
    await page.getByRole('button', { name: '创建世界书' }).click();
    await page.waitForTimeout(500);

    await page.locator('.card-menu-btn').first().click();
    await page.locator('.card-menu').getByRole('menuitem', { name: '查看世界书' }).click();
    await page
      .locator('.wb-book', { hasText: '词条压力测试' })
      .getByRole('button', { name: '编辑' })
      .click();
    await expect(page.locator('#wb-name')).toHaveValue('词条压力测试');
    await expect(page.locator('.wb-edit-entry')).toHaveCount(1);

    // Enough rows to overflow the list's max-height: they used to be flex
    // items, so they shrank to a few pixels and visibly overlapped.
    for (let i = 0; i < 16; i++) await page.locator('.wb-add-entry').click();
    await expect(page.locator('.wb-edit-entry')).toHaveCount(17);
    const rows = await page.locator('.wb-edit-entry').evaluateAll((els) =>
      els.map((el) => {
        const rect = el.getBoundingClientRect();
        return { top: rect.top, height: rect.height };
      }),
    );
    for (const row of rows) expect(row.height).toBeGreaterThan(30);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].top).toBeGreaterThanOrEqual(rows[i - 1].top + rows[i - 1].height - 1);
    }

    // Every entry's details are editable, not just the order field.
    await page.locator('.wb-edit-toggle').nth(3).click();
    await expect(page.locator('#wb-entry-3-content')).toBeVisible();
    await page.locator('#wb-entry-3-keys').fill('地下室');
    await page.locator('#wb-entry-3-content').fill('地下室锁着旧档案。');
    await page.getByRole('button', { name: '保存修改' }).click();

    // The viewer now lists the new key, so the edit really reached the store.
    await expect(page.locator('.wb-modal')).toContainText('地下室');
  });

  test('shows every card on the start screen and deletes one after a second confirmation', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('.brand-title')).toBeVisible();
    await page.locator('#card-file-input').setInputFiles(CARD);
    await expect(page.locator('.chat-name-row h2')).toHaveText('测试角色·阿绫', {
      timeout: 20_000,
    });

    // A second, hand-written card so the overview has two entries.
    await page.locator('.rail-head-actions').getByRole('button', { name: '新建' }).click();
    await page.locator('#card-name').fill('临渊');
    await page.locator('#card-greeting').fill('「跟紧我。」');
    await page.getByRole('button', { name: '创建角色卡' }).click();
    await expect(page.locator('.chat-name-row h2')).toHaveText('临渊');

    // Deleting both conversations brings the start screen back.
    for (let i = 0; i < 2; i++) {
      await page.locator('.composer-hint .link-btn').click();
      await page.locator('.modal-foot').getByRole('button', { name: '删除' }).click();
      await expect(page.locator('.toast').last()).toContainText('对话已删除');
    }

    await expect(page.locator('.welcome-card')).toHaveCount(2);
    await expect(page.locator('.welcome-card-name')).toHaveText(['临渊', '测试角色·阿绫']);
    await page.screenshot({ path: path.join(SHOTS, 'desktop-welcome.png') });

    // First click only asks; cancelling keeps the card.
    const card = page.locator('.welcome-card', { hasText: '临渊' });
    await card.hover();
    await card.locator('.welcome-card-del').click();
    await expect(page.getByRole('heading', { name: '删除这张角色卡？' })).toBeVisible();
    await page.getByRole('button', { name: '取消' }).click();
    await expect(page.locator('.welcome-card')).toHaveCount(2);

    // Second click + confirm really deletes it.
    await card.hover();
    await card.locator('.welcome-card-del').click();
    await page.locator('.modal-foot').getByRole('button', { name: '删除' }).click();
    await expect(page.locator('.welcome-card')).toHaveCount(1);
    await expect(page.locator('.welcome-card-name')).toHaveText(['测试角色·阿绫']);
  });

  test('paginates the start screen and card rail, with import/create as peers', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('.brand-title')).toBeVisible();

    // Empty start screen: both entry points are real, equal-sized buttons.
    const peers = page.locator('.welcome-actions .btn');
    await expect(peers).toHaveCount(2);
    const sizes = await peers.evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }),
    );
    expect(sizes[0].height).toBe(sizes[1].height);
    expect(Math.abs(sizes[0].width - sizes[1].width)).toBeLessThanOrEqual(1);

    // Seed ten cards without chats, so the start screen stays visible.
    await page.locator('.brand .icon-btn[aria-label="设置"]').click();
    const backup = {
      format: 'lite-tavern-backup',
      version: 1,
      exportedAt: Date.now(),
      characters: Array.from({ length: 10 }, (_, i) => ({
        id: `pager-card-${i}`,
        name: `分页卡 ${i + 1}`,
        createdAt: 1_700_000_000_000 + i,
        updatedAt: 1_700_000_000_000 + i,
      })),
      worldBooks: [],
      chats: [],
    };
    await page
      .locator('.settings-modal input[type="file"][accept=".json,application/json"]')
      .setInputFiles({
        name: 'pager-backup.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(backup)),
      });
    await page.getByRole('button', { name: '导入', exact: true }).click();
    await expect(page.locator('.toast').last()).toContainText('已导入 10 张角色卡');
    await page.keyboard.press('Escape');

    // Start screen: 9 cards per page.
    await expect(page.locator('.welcome-card')).toHaveCount(9);
    await expect(page.locator('.welcome-pager .pager-info')).toHaveText('1 / 2');
    await page.locator('.welcome-pager').getByRole('button', { name: '下一页' }).click();
    await expect(page.locator('.welcome-card')).toHaveCount(1);
    await expect(page.locator('.welcome-pager .pager-info')).toHaveText('2 / 2');
    await expect(
      page.locator('.welcome-pager').getByRole('button', { name: '下一页' }),
    ).toBeDisabled();

    // Card rail: 8 cards per page, independent from the start-screen page.
    await expect(page.locator('.character-panel .character-card')).toHaveCount(8);
    await expect(page.locator('.rail-pager .pager-info')).toHaveText('1 / 2');
    await page.locator('.rail-pager').getByRole('button', { name: '下一页' }).click();
    await expect(page.locator('.character-panel .character-card')).toHaveCount(2);
    await expect(page.locator('.rail-pager .pager-info')).toHaveText('2 / 2');

    // Import and manual create stay paired on the populated start screen.
    await expect(
      page.locator('.welcome-actions-row').getByRole('button', { name: '再导入一张' }),
    ).toBeVisible();
    await expect(
      page.locator('.welcome-actions-row').getByRole('button', { name: '新建一张' }),
    ).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS, 'desktop-pagination.png') });
  });

  test('exports a timestamped backup and restores cards and chats after they are deleted', async ({
    page,
  }) => {
    await importCard(page);
    await configureApi(page);
    await sendAndWait(page, '带我去钟楼。');

    // --- export -------------------------------------------------------
    await dismissToasts(page);
    await page.locator('.chat-actions button[title="设置"]').click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出备份' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(
      /^LiteTavern-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/,
    );
    const backupPath = path.join(process.cwd(), 'test-results', 'backup-e2e.json');
    await download.saveAs(backupPath);
    await page.keyboard.press('Escape');

    const payload = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    expect(payload.format).toBe('lite-tavern-backup');
    expect(payload.version).toBe(1);
    expect(payload.characters).toHaveLength(1);
    expect(payload.worldBooks.length).toBeGreaterThan(0);
    expect(payload.chats).toHaveLength(1);
    expect(payload.settings).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain('sk-test-key');

    // --- wipe: chat first, then the card ------------------------------
    await page.locator('.composer-hint .link-btn').click();
    await page.locator('.modal-foot').getByRole('button', { name: '删除' }).click();
    await expect(page.locator('.welcome-card')).toHaveCount(1);
    await page.locator('.welcome-card').first().hover();
    await page.locator('.welcome-card-del').first().click();
    await page.locator('.modal-foot').getByRole('button', { name: '删除' }).click();
    await expect(page.locator('.welcome-card')).toHaveCount(0);
    await expect(page.locator('.character-card')).toHaveCount(0);

    // --- import -------------------------------------------------------
    await page.locator('.brand .icon-btn[aria-label="设置"]').click();
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '导入备份…' }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles(backupPath);
    await expect(page.getByRole('heading', { name: '导入这个备份？' })).toBeVisible();
    await expect(page.locator('.backup-summary')).toContainText('1 张角色卡');
    await page.locator('.modal-foot').getByRole('button', { name: '导入' }).click();
    await expect(page.locator('.toast').last()).toContainText('已导入');
    await page.keyboard.press('Escape');

    await expect(page.locator('.welcome-card')).toHaveCount(1);
    await expect(page.locator('.character-card')).toHaveCount(1);
    await page.locator('.welcome-card').first().click();
    await expect(page.locator('.chat-name-row h2')).toHaveText('测试角色·阿绫');
    await expect(page.locator('.markdown').last()).toContainText('跟紧我');
    await expect(page.locator('.msg-user').last()).toContainText('带我去钟楼。');

    // Importing the same file again is a no-op rather than a duplicate.
    await page.locator('.brand .icon-btn[aria-label="设置"]').click();
    const secondChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '导入备份…' }).click();
    const secondChooser = await secondChooserPromise;
    await secondChooser.setFiles(backupPath);
    await page.locator('.modal-foot').getByRole('button', { name: '导入' }).click();
    await expect(page.locator('.toast').last()).toContainText('没有新增内容');
    await page.keyboard.press('Escape');
    await expect(page.locator('.character-card')).toHaveCount(1);
  });

  test('recovers the library from the automatic snapshot when the store is emptied', async ({
    page,
  }) => {
    await importCard(page);
    await configureApi(page);
    await sendAndWait(page, '带我去钟楼。');
    await page.waitForTimeout(1500);

    const persisted = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('keyval-store');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const value = await new Promise<unknown>((resolve) => {
        const tx = db.transaction('keyval', 'readonly');
        const get = tx.objectStore('keyval').get('lite-tavern-store-v1');
        get.onsuccess = () => resolve(get.result);
        get.onerror = () => resolve(null);
      });
      return typeof value === 'string' ? value : null;
    });
    expect(persisted).toContain('测试角色·阿绫');

    // Pretend the database was damaged: the unattended snapshot survives while
    // the main value and the crash copy are gone.
    await page.evaluate(async (json) => {
      localStorage.setItem('lite-tavern-autosave-v1', json as string);
      localStorage.removeItem('lite-tavern-backup-v1');
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('keyval-store');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve) => {
        const tx = db.transaction('keyval', 'readwrite');
        tx.objectStore('keyval').delete('lite-tavern-store-v1');
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }, persisted);

    await page.reload();
    await expect(page.locator('.toast').last()).toContainText('已从自动快照恢复', {
      timeout: 20_000,
    });
    await expect(page.locator('.character-card')).toHaveCount(1);
    // The restored session keeps the active conversation open.
    await expect(page.locator('.chat-name-row h2')).toHaveText('测试角色·阿绫');
    await expect(page.locator('.msg-user').last()).toContainText('带我去钟楼。');
    await expect(page.locator('.markdown').last()).toContainText('跟紧我');
  });

  test('auto-compacts the context once the prompt reaches 80% of the limit', async ({ page }) => {
    await importCard(page);
    await configureApi(page);
    await setContextLimit(page, 8000);

    // 1500-token replies: by the seventh turn the prompt crosses 80% of 8000.
    for (let i = 1; i <= 6; i++) {
      await sendLongTurn(page, `第 ${i} 轮，继续讲钟楼。`);
    }
    await expect(page.locator('.ctx-chip')).not.toHaveClass(/has-memory/);
    await sendLongTurn(page, '第 7 轮，继续讲钟楼。');

    await expect(page.locator('.ctx-chip')).toHaveClass(/has-memory/);
    const request = JSON.parse(fs.readFileSync(LAST_REQUEST, 'utf8'));
    const contents = request.messages.map((m: { content: string }) => m.content);
    expect(contents.some((text: string) => text.includes('<story_memory>'))).toBe(true);
    expect(contents.some((text: string) => text.includes('【已发生的事件】'))).toBe(true);
    expect(contents).not.toContain('[long] 第 1 轮，继续讲钟楼。');

    // The dialog explains what is remembered and how much was covered.
    await page.locator('.ctx-chip').click();
    await expect(page.getByRole('heading', { name: '上下文与记忆' })).toBeVisible();
    await expect(page.locator('.ctx-memory')).toContainText('已压缩');
    await expect(page.locator('.ctx-memory-body')).toContainText('【已发生的事件】');
    await page.screenshot({ path: path.join(SHOTS, 'desktop-context.png') });
  });

  test('one-click compaction recovers from a context-length error', async ({ page }) => {
    await importCard(page);
    await configureApi(page);
    await setContextLimit(page, 8000);
    await sendAndWait(page, '带我去钟楼。');
    await sendAndWait(page, '那扇门后面是什么？');

    await page.request.get('http://127.0.0.1:8787/arm-context-error');
    await page.getByLabel('输入消息').fill('再往前走走。');
    await page.getByLabel('发送').click();

    const errorCard = page.locator('.message-error').last();
    await expect(errorCard).toContainText('上下文超出上限', { timeout: 20_000 });
    await expect(errorCard).toContainText('65,536');
    await page.screenshot({ path: path.join(SHOTS, 'desktop-context-error.png') });

    await errorCard.getByRole('button', { name: '一键压缩上下文并继续对话' }).click();
    await expect(page.locator('.message-error')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator('.markdown').last()).toContainText('跟紧我', { timeout: 30_000 });
    await expect(page.locator('.ctx-chip')).toHaveClass(/has-memory/);

    const request = JSON.parse(fs.readFileSync(LAST_REQUEST, 'utf8'));
    expect(
      request.messages.some((m: { content: string }) => m.content.includes('<story_memory>')),
    ).toBe(true);

    // The provider's reported window is adopted for future automatic triggers.
    await page.locator('.chat-actions button[title="设置"]').click();
    await expect(page.locator('#context-limit')).toHaveValue('65536');
    await page.keyboard.press('Escape');
  });

  test('imports a PNG card and attaches a standalone world book that can be edited', async ({
    page,
  }) => {
    await importCard(page, PNG);
    await dismissToasts(page);

    const card = page.locator('.character-card').first();
    await card.hover();
    await page.locator('.card-menu-btn').first().click();
    await page.locator('.card-menu').getByRole('menuitem', { name: '查看世界书' }).click();
    await expect(page.getByRole('heading', { name: /测试角色·阿绫 · 世界书/ })).toBeVisible();
    await expect(page.locator('.wb-modal')).toContainText('钟楼与档案室');
    await expect(page.locator('.wb-modal')).toContainText('黄铜钥匙');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOTS, 'desktop-worldbook.png') });
    await page.locator('.modal-foot').getByRole('button', { name: '关闭' }).click();

    await dismissToasts(page);
    await card.hover();
    await page.locator('.card-menu-btn').first().click();
    const chooserPromise = page.waitForEvent('filechooser');
    await page.locator('.card-menu').getByRole('menuitem', { name: '导入 / 替换世界书' }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles(WORLD);
    await expect(page.locator('.toast')).toContainText('已挂载');
    await expect(page.locator('.character-card').first()).toContainText('世界书 5');

    await dismissToasts(page);
    await card.hover();
    await page.locator('.card-menu-btn').first().click();
    await page.locator('.card-menu').getByRole('menuitem', { name: '查看世界书' }).click();
    await expect(page.locator('.wb-modal')).toContainText('海雾');
    await expect(page.locator('.wb-modal')).toContainText('手动导入');
    await expect(
      page.locator('.wb-modal').getByRole('button', { name: '编辑' }).first(),
    ).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS, 'desktop-worldbook.png') });
  });
});

test.describe('mobile', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });

  test('welcome import button opens the picker inside the tap gesture', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.brand-title')).toBeVisible();
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '导入角色卡' }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles(CARD);
    await expect(page.locator('.chat-name-row h2')).toHaveText('测试角色·阿绫', {
      timeout: 20_000,
    });
  });

  test('responsive drawers and chat on phone viewport', async ({ page }) => {
    await importCard(page);
    await dismissToasts(page);
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(SHOTS, 'mobile-chat.png') });

    await page.locator('.chat-head .mobile-only[aria-label="对话列表"]').click();
    await expect(page.locator('.app')).toHaveClass(/show-left/);
    await page.waitForTimeout(350);
    await expect(page.locator('.chat-list-panel')).toBeInViewport();
    await page.screenshot({ path: path.join(SHOTS, 'mobile-chats.png') });
    await page.locator('.drawer-backdrop').click({ position: { x: 370, y: 400 } });

    await page.locator('.chat-head .mobile-only[title="角色卡"]').click();
    await expect(page.locator('.app')).toHaveClass(/show-right/);
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(SHOTS, 'mobile-cards.png') });
    await page.locator('.character-card').first().click();
    await expect(page.locator('.app')).not.toHaveClass(/show-right/);

    await configureApi(page);
    await sendAndWait(page, '钟楼里有什么？');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: path.join(SHOTS, 'mobile-chat-reply.png') });
  });

  test('editing a message hides the composer so nothing covers the editor', async ({ page }) => {
    await importCard(page);
    await dismissToasts(page);
    await configureApi(page);
    await sendAndWait(page, '钟楼里有什么？');

    const assistantRow = page.locator('.msg-assistant').last();
    await assistantRow.locator('.meta-btn[title="编辑这条消息"]').click();
    await expect(assistantRow.getByLabel('编辑消息')).toBeVisible();
    await expect(page.locator('.chat-view')).toHaveClass(/is-editing-message/);
    await expect(page.locator('.composer-wrap')).toBeHidden();

    await assistantRow.getByRole('button', { name: '取消' }).click();
    await expect(page.locator('.composer-wrap')).toBeVisible();
    await expect(page.locator('.chat-view')).not.toHaveClass(/is-editing-message/);
  });

  test('opens and closes both drawers with horizontal swipes', async ({ page }) => {
    await importCard(page);
    await dismissToasts(page);
    const app = page.locator('.app');

    // Chat: swipe right-to-left opens the card rail.
    await swipe(page, [340, 600], [60, 600]);
    await expect(app).toHaveClass(/show-right/);
    await page.waitForTimeout(350);
    // Card rail: swipe left-to-right closes it.
    await swipe(page, [80, 120], [340, 120]);
    await expect(app).not.toHaveClass(/show-right/);
    await page.waitForTimeout(350);

    // Chat: swipe left-to-right opens the chat list.
    await swipe(page, [60, 600], [340, 600]);
    await expect(app).toHaveClass(/show-left/);
    await page.waitForTimeout(350);
    // Chat list: swipe right-to-left closes it.
    await swipe(page, [340, 400], [100, 400]);
    await expect(app).not.toHaveClass(/show-left/);
  });
});
