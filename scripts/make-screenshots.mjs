import { chromium } from '@playwright/test';
import fs from 'node:fs';

const DOCS = 'docs';
fs.mkdirSync(DOCS, { recursive: true });

const DEMO = {
  name: '临渊',
  notes: '雾港的守夜人，话少，习惯先观察。',
  prompt:
    '你是临渊，雾港灯塔的守夜人。说话简短、克制，先观察再开口；只在必要时解释，从不主动提起自己的过去。',
  greeting: '*海雾漫上石阶，灯塔的光扫过甲板。*「这边走，别出声。今晚的雾不太对劲。」',
};

async function dismissToasts(page) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const buttons = page.locator('.toast-close');
    const count = await buttons.count();
    if (count === 0) return;
    for (let i = count - 1; i >= 0; i--) {
      await buttons
        .nth(i)
        .click({ timeout: 800 })
        .catch(() => undefined);
    }
    await page.waitForTimeout(300);
  }
  // Toasts auto-expire after 3.6 s; waiting is the last resort.
  await page
    .waitForFunction(() => document.querySelectorAll('.toast').length === 0, null, {
      timeout: 5000,
    })
    .catch(() => undefined);
}

/** Screenshot with a clean toast stack so nothing covers the UI. */
async function shot(page, name) {
  await dismissToasts(page);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${DOCS}/${name}` });
}

async function setTheme(page, label) {
  await page.locator('.chat-head button[title="设置"]').click();
  await page.locator('.theme-choice', { hasText: label }).click();
  await page.getByRole('button', { name: '保存设置' }).click();
  await page.waitForTimeout(900);
  await dismissToasts(page);
  await page.waitForTimeout(400);
  await dismissToasts(page);
}

async function openCardsDrawer(page, mobile) {
  if (!mobile) return;
  await page.locator('.chat-head .mobile-only').last().click();
  await page.waitForTimeout(400);
}

async function buildDemo(page, { mobile = false, withBooks = true } = {}) {
  await page.goto('http://127.0.0.1:4173/');
  await page.locator('.brand-title').waitFor({ timeout: 20000 });

  if (mobile) await page.getByRole('button', { name: '或者手写一张' }).click();
  else await page.locator('.rail-head-actions').getByRole('button', { name: '新建' }).click();

  await page.locator('#card-name').fill(DEMO.name);
  await page.locator('#card-notes').fill(DEMO.notes);
  await page.locator('#card-prompt').fill(DEMO.prompt);
  await page.locator('#card-greeting').fill(DEMO.greeting);
  await page.getByRole('button', { name: '创建角色卡' }).click();
  await page.waitForTimeout(700);

  // Local mock endpoint, so the demo chat shows a real reply. A non-default
  // provider keeps the screenshots focused on the app instead of one vendor.
  await page.locator('.chat-actions button[title="设置"]').click();
  await page.locator('#provider').selectOption('qwen');
  await page.locator('#api-key').fill('sk-demo');
  await page.locator('#base-url').fill('http://127.0.0.1:8787/v1');
  await page.getByRole('button', { name: '保存设置' }).click();
  await page.waitForTimeout(300);
  await page.getByLabel('输入消息').fill('带我去灯塔看看。');
  await page.getByLabel('发送').click();
  await page.waitForTimeout(2600);

  if (withBooks) {
    await openCardsDrawer(page, mobile);
    await page.locator('.card-menu-btn').first().click();
    await page.locator('.card-menu').getByRole('button', { name: '新建世界书' }).click();
    await page.locator('#wb-name').fill('雾港设定集');
    await page.locator('#wb-entry-0-comment').fill('灯塔');
    await page.locator('#wb-entry-0-keys').fill('灯塔，潮汐，雾');
    await page
      .locator('#wb-entry-0-content')
      .fill('雾港的灯塔每夜点亮，守夜人负责添油；雾太浓时，钟声会提前响起。');
    await page.getByRole('button', { name: '添加词条' }).click();
    await page.locator('.wb-edit-toggle').nth(1).click();
    await page.locator('#wb-entry-1-comment').fill('渡口');
    await page.locator('#wb-entry-1-keys').fill('渡口，船，潮水');
    await page.locator('#wb-entry-1-content').fill('渡口只在退潮时开放，老船夫收铜币，不收纸币。');
    await page.getByRole('button', { name: '创建世界书' }).click();
    await page.waitForTimeout(700);
    await page.keyboard.press('Escape');
  }
  await dismissToasts(page);
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });

// Desktop (dark)
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await desktop.newPage();
await buildDemo(page);
await setTheme(page, '深色');
await shot(page, 'desktop.png');

// Card editor
await page.locator('.card-menu-btn').first().click();
await page.locator('.card-menu').getByRole('button', { name: '编辑角色卡' }).click();
await page.waitForTimeout(400);
await shot(page, 'card-editor.png');
await page.getByRole('button', { name: '取消' }).click();

// World book viewer + editor
await page.locator('.card-menu-btn').first().click();
await page.locator('.card-menu').getByRole('button', { name: '查看世界书' }).click();
await page.waitForTimeout(300);
await shot(page, 'worldbook.png');
await page.locator('.wb-edit-btn').first().click();
await page.waitForTimeout(400);
await shot(page, 'worldbook-editor.png');
await page.getByRole('button', { name: '取消' }).click();
await page.keyboard.press('Escape');

// Desktop (light)
await setTheme(page, '亮色');
await shot(page, 'desktop-light.png');

// Start screen: every card, each with the delete affordance.
await setTheme(page, '深色');
await page.locator('.composer-hint .link-btn').click();
await page.locator('.modal-foot').getByRole('button', { name: '删除' }).click();
await page.waitForTimeout(600);

for (const [name, greeting] of [
  ['雾岚', '*风从桅杆上滑下来。*「船要开了，你要不要上来？」'],
  ['白汀', '「你终于来了。炉子上还有一壶茶。」'],
]) {
  await page.locator('.rail-head-actions').getByRole('button', { name: '新建' }).click();
  await page.locator('#card-name').fill(name);
  await page.locator('#card-greeting').fill(greeting);
  await page.getByRole('button', { name: '创建角色卡' }).click();
  await page.waitForTimeout(400);
  await page.locator('.composer-hint .link-btn').click();
  await page.locator('.modal-foot').getByRole('button', { name: '删除' }).click();
  await page.waitForTimeout(400);
}

await page.waitForTimeout(4200);
await dismissToasts(page);
await page.locator('.welcome-card').first().hover();
await page.waitForTimeout(400);
await shot(page, 'welcome.png');

// Settings → backup section
await page.locator('.brand .icon-btn').click();
await page.waitForTimeout(400);
await page.locator('.backup-actions').scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
await shot(page, 'backup.png');
await page.keyboard.press('Escape');
await desktop.close();

// Mobile (dark)
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
const mpage = await mobile.newPage();
await buildDemo(mpage, { mobile: true, withBooks: false });
await setTheme(mpage, '深色');
await shot(mpage, 'mobile.png');
await mpage.locator('.chat-head .mobile-only').first().click();
await mpage.waitForTimeout(600);
await shot(mpage, 'mobile-chats.png');
await mobile.close();

await browser.close();
console.log('screenshots written');
