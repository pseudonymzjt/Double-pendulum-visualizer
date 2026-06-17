const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://localhost:8080/index.html');
  await page.waitForTimeout(500);

  // Pause the sim
  await page.click('#btn-play');
  await page.waitForTimeout(200);

  // Check that the drag HUD state variables exist
  const hasHud = await page.evaluate(() => {
    return typeof dragHudOpacity !== 'undefined' &&
           typeof dragHudPivot !== 'undefined' &&
           typeof dragHudRadius !== 'undefined' &&
           typeof drawDragHUD === 'function';
  });
  console.log('HUD variables exist:', hasHud);

  // Find bob positions
  const hitPos = await page.evaluate(() => {
    const p = pendulums[0];
    if (!p || p.particles.length < 2) return null;
    return { x: p.particles[1].x, y: p.particles[1].y };
  });
  console.log('Bob 1 position:', hitPos);

  if (hitPos) {
    // Move to first bob
    await page.mouse.move(hitPos.x, hitPos.y);
    await page.waitForTimeout(100);

    // Mousedown starts drag
    await page.mouse.down();
    await page.waitForTimeout(100);

    // Check opacity after drag start
    const opAfterDrag = await page.evaluate(() => dragHudOpacity);
    console.log('Opacity after drag start:', opAfterDrag);

    // Move the mouse to drag
    await page.mouse.move(hitPos.x + 30, hitPos.y + 30, { steps: 5 });
    await page.waitForTimeout(300);

    // Check opacity during drag (should be fading in)
    const opDuringDrag = await page.evaluate(() => dragHudOpacity);
    console.log('Opacity during drag (should be ~0.15-0.3):', opDuringDrag);

    // Check HUD data
    const hudData = await page.evaluate(() => ({
      pivot: { x: dragHudPivot.x, y: dragHudPivot.y },
      radius: dragHudRadius,
    }));
    console.log('HUD pivot:', hudData.pivot, 'radius:', hudData.radius);

    // Take screenshot
    await page.screenshot({ path: 'hud-drag.png' });
    console.log('Screenshot saved: hud-drag.png');

    // Release mouse
    await page.mouse.up();
    await page.waitForTimeout(50);

    // Check opacity after release (should be fading quickly)
    const opAfterRelease = await page.evaluate(() => dragHudOpacity);
    console.log('Opacity after release:', opAfterRelease);

    // Wait for fade-out
    await page.waitForTimeout(300);
    const opFaded = await page.evaluate(() => dragHudOpacity);
    console.log('Opacity after fade-out (should be 0):', opFaded);
  }

  await browser.close();
  console.log('Test complete');
})();
