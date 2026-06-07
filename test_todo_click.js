import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  // Set viewport
  await page.setViewport({ width: 1280, height: 800 });
  
  // Login as member
  await page.goto('http://localhost:3001');
  // Wait for login form
  await page.waitForSelector('input[type="email"]');
  await page.type('input[type="email"]', 'member@longchau.com');
  await page.type('input[type="password"]', '123456');
  await page.click('button[type="submit"]');
  
  // Wait for dashboard to load
  await page.waitForSelector('.page-title');
  
  // Go to todo page
  await page.goto('http://localhost:3001/todo');
  await page.waitForSelector('.page-title');
  
  // Wait for items to load
  await new Promise(r => setTimeout(r, 1000));
  
  // Find the "Xem chi tiết" button
  const eyeBtn = await page.$('button[title="Xem chi tiết"]');
  if (eyeBtn) {
    console.log("Found Xem chi tiết button, clicking...");
    
    // Setup console listener to catch any React errors
    page.on('console', msg => {
      if (msg.type() === 'error') console.log('BROWSER ERROR:', msg.text());
    });
    
    await eyeBtn.click();
    await new Promise(r => setTimeout(r, 1000));
    
    // Check if modal exists
    const modal = await page.$('.modal');
    if (modal) {
      console.log("Modal opened successfully.");
    } else {
      console.log("Modal did NOT open.");
    }
  } else {
    console.log("No Xem chi tiết button found. Maybe no assigned tasks?");
    // Let's create one first as manager, then assign to member
  }
  
  await browser.close();
})();
