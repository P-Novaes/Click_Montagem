process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const { mock } = require('node:test');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const env = require('../src/config/env');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const { createApp } = require('../src/app');
const { User } = require('../src/models');
const OAuthAttempt = require('../src/models/OAuthAttempt');
const { mockGoogleProvider } = require('./helpers/googleProvider');

async function main() {
    env.googleClientId = 'browser-test-client';
    env.googleClientSecret = 'browser-test-secret';
    env.googleCallbackUrl = 'http://localhost:3000/api/auth/google/callback';
    await connectDatabase();
    await Promise.all([User.init(), OAuthAttempt.init()]);
    const app = createApp();
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const executablePath = process.env.BROWSER_PATH || [
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
    ].find(file => fs.existsSync(file));
    let browser;
    try {
        browser = await chromium.launch({ executablePath, headless: true });
        const issue = mockGoogleProvider(mock);
        const artifacts = path.resolve('.test-artifacts');
        fs.mkdirSync(artifacts, { recursive: true });
        for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
            const context = await browser.newContext({ viewport });
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.goto(`${origin}/pages/login.html`);
            await page.waitForFunction(() => !document.getElementById('googleContinue').disabled);
            await page.screenshot({ path: path.join(artifacts, `login-${viewport.width}.png`), fullPage: true });
            assert.equal(await page.locator('#formLogin').isVisible(), true);
            await page.locator('[data-tab="cadastro"]').click();
            assert.equal(await page.locator('#googleContinue').isVisible(), true);
            await page.screenshot({ path: path.join(artifacts, `cadastro-${viewport.width}.png`), fullPage: true });
            await page.route('https://accounts.google.com/**', async route => {
                const state = new URL(route.request().url()).searchParams.get('state');
                const code = await issue(state, { sub: `browser-${viewport.width}`, email: `browser-${viewport.width}@example.test` });
                await route.fulfill({ status: 302, headers: { location: `${origin}/api/auth/google/callback?state=${state}&code=${code}` }, body: '' });
            });
            await page.locator('#googleContinue').click();
            await page.waitForURL('**/pages/login.html?google=complete');
            await page.locator('#formGoogleCadastro').waitFor({ state: 'visible' });
            assert.equal(await page.locator('[name="googleRole"]:checked').count(), 0);
            assert.equal(await page.locator('#formLogin').isVisible(), false);
            assert.equal(await page.locator('.login-tabs').isVisible(), false);
            // Server protection also works when a user types a private page URL directly.
            await page.goto(`${origin}/pages/painel-cliente.html`);
            await page.locator('#formGoogleCadastro').waitFor({ state: 'visible' });
            const tipo = viewport.width === 390 ? 'montador' : 'cliente';
            await page.locator(`label:has([name="googleRole"][value="${tipo}"])`).click();
            await page.locator('#googleTelefone').fill('11999999999');
            await page.locator('#googleTermos').check();
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.screenshot({ path: path.join(artifacts, `onboarding-${viewport.width}.png`), fullPage: true });
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
            await page.locator('#formGoogleCadastro [type="submit"]').click();
            await page.waitForURL(`**/pages/painel-${tipo}.html`);
            const me = await (await context.request.get(`${origin}/api/auth/me`)).json();
            assert.equal(me.usuario.tipo, tipo);
            assert.equal(me.cadastroPendente, false);
            assert.equal(await page.evaluate(() => localStorage.getItem('cm_userId')), null);
            await Promise.all([
                page.waitForResponse(response => response.url().endsWith('/api/auth/logout') && response.request().method() === 'POST'),
                page.goto(`${origin}/pages/login.html?logout=1`),
            ]);
            const loggedOut = await (await context.request.get(`${origin}/api/auth/me`)).json();
            assert.equal(loggedOut.autenticado, false);
            assert.deepEqual(errors, []);
            await context.close();
            console.log(`OK: ${viewport.width}px — login/cadastro, Google simulado, escolha ${tipo}, proteção de páginas, sessão e logout.`);
        }
        const page = await browser.newPage();
        env.googleClientSecret = '';
        await page.goto(`${origin}/pages/login.html?google_error=cancelled`);
        await page.waitForFunction(() => document.getElementById('googleAvailability').textContent.includes('indisponível'));
        assert.equal(await page.locator('#googleContinue').isDisabled(), true);
        assert.match(await page.locator('#feedbackText').textContent(), /cancelada/);
        // Traditional signup remains usable while Google is unavailable.
        await page.locator('[data-tab="cadastro"]').click();
        await page.locator('#cadNome').fill('Cadastro Tradicional');
        await page.locator('#cadEmail').fill('browser-local@example.test');
        await page.locator('#cadTelefone').fill('11999999999');
        await page.locator('#cadSenha').fill('Password123');
        await page.locator('#cadConfirmarSenha').fill('Password123');
        await page.locator('#cadTermos').check();
        await page.locator('#formCadastro .btn-submit').click();
        await page.waitForURL('**/pages/painel-cliente.html');
        console.log('OK: Google indisponível, mensagem de cancelamento e cadastro tradicional no navegador.');
    } finally {
        if (browser) await browser.close();
        mock.restoreAll();
        await new Promise(resolve => server.close(resolve));
        await disconnectDatabase();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
