// Vérification de l'interface dans un navigateur émulant un téléphone.
// Nécessite Playwright (non installé par le projet) : node scripts/ui-smoke.cjs http://localhost:8765 [dossier-captures]
const { chromium, devices } = require('playwright');

const url = process.argv[2] || 'http://localhost:8765';
const shots = process.argv[3];
const fail = (msg) => { console.error('ÉCHEC :', msg); process.exitCode = 1; };

async function scenario(browser, label, device, target) {
  const ctx = await browser.newContext(device);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = async (name) => { if (shots) await page.screenshot({ path: `${shots}/${label}-${name}.png` }); };
  const check = async (what) => {
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) fail(`${label} : défilement horizontal (${what})`);
    const wide = await page.evaluate(() => [...document.querySelectorAll('#panel-body *, #sheet-body *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest('.tabs')).length);
    if (wide) fail(`${label} : ${wide} élément(s) dépassent de l'écran (${what})`);
  };

  await page.goto(target);
  await page.waitForFunction(() => document.querySelector('#date').textContent !== '…', null, { timeout: 15000 });
  await shot('carte');
  for (let i = 0; i < 4; i++) await page.click('#speed');
  await page.click('#play');
  await page.waitForTimeout(4000);
  await page.click('#play');
  const date = await page.textContent('#date');
  if (/1800/.test(date)) fail(`${label} : la simulation n'avance pas (${date})`);

  // Toucher la carte jusqu'à sélectionner une nation.
  const vp = page.viewportSize();
  for (let i = 0; i < 40 && !(await page.isVisible('#sheet')); i++) {
    const x = vp.width * (0.15 + 0.7 * ((i * 0.37) % 1)); const y = vp.height * (0.25 + 0.4 * ((i * 0.61) % 1));
    if (device.hasTouch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
    await page.waitForTimeout(250);
  }
  if (!(await page.isVisible('#sheet'))) fail(`${label} : aucune nation sélectionnable sur la carte`);
  for (const tab of ['economie', 'armee', 'diplomatie', 'esprit', 'decisions', 'apercu']) {
    await page.click(`#sheet-tabs [data-id="${tab}"]`);
    await page.waitForTimeout(500);
    await check(`fiche ${tab}`);
    await shot(`fiche-${tab}`);
  }
  for (const p of ['nations', 'diplomatie', 'evenements']) { await page.click(`#nav [data-id="${p}"]`); await page.waitForTimeout(600); await check(p); await shot(p); }
  for (const p of ['economie', 'militaire', 'chronologie', 'dev', 'parametres']) {
    await page.click('#nav [data-id="plus"]'); await page.waitForTimeout(200);
    await page.click(`.menu [data-id="${p}"]`); await page.waitForTimeout(800);
    await check(p); await shot(p);
  }
  // Sauvegarde puis rechargement.
  await page.fill('[data-form="save"] input', 'essai auto');
  await page.click('[data-form="save"] button');
  await page.waitForSelector('#saves [data-act="load"]', { timeout: 8000 }).catch(() => fail(`${label} : la sauvegarde n'apparaît pas`));
  await page.click('#saves [data-act="load"]').catch(() => {});
  await page.waitForTimeout(800);
  await page.click('#nav [data-id="plus"]'); await page.click('.menu [data-id="parametres"]'); await page.waitForTimeout(500);
  await page.click('#saves [data-act="del-save"]').catch(() => {});

  // Mode administrateur : sélectionner une nation, provoquer un événement.
  await page.click('#nav [data-id="nations"]'); await page.waitForTimeout(400);
  await page.click('.ranking li'); await page.waitForTimeout(600);
  await page.click('#nav [data-id="plus"]'); await page.click('.menu [data-id="admin"]'); await page.waitForTimeout(300);
  await page.check('[data-act="admin-toggle"]'); await page.waitForTimeout(400);
  await check('admin'); await shot('admin');
  await page.click('[data-act="admin-event"][data-id="boom"]'); await page.waitForTimeout(500);
  await page.click('#nav [data-id="evenements"]'); await page.waitForTimeout(400);
  await page.click('[data-act="jfilter"][data-id="Admin"]'); await page.waitForTimeout(400);
  if (!(await page.textContent('#panel-body')).includes('[Admin]')) fail(`${label} : l'intervention administrateur n'est pas au journal`);
  await page.click('#nav [data-id="carte"]');
  for (const mode of ['relations', 'blocs', 'stability', 'tech', 'terrain', 'political']) { await page.click('[data-act="close-sheet"]').catch(() => {}); await page.click(`#modes [data-id="${mode}"]`); await page.waitForTimeout(300); await shot(`carte-${mode}`); }
  if (errors.length) fail(`${label} : erreurs console : ${errors.slice(0, 3).join(' | ')}`);
  console.log(`${label} : parcours terminé (${date})`);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  await scenario(browser, 'telephone-serveur', devices['Pixel 7'], url);
  await scenario(browser, 'telephone-autonome', devices['iPhone 13'], `${url}/?local`);
  await scenario(browser, 'paysage', devices['Pixel 7 landscape'], url);
  await scenario(browser, 'ordinateur', { viewport: { width: 1366, height: 800 } }, url);
  await browser.close();
  console.log(process.exitCode ? 'Des vérifications ont échoué.' : 'Toutes les vérifications passent.');
})();
