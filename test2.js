import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  await page.setViewport({ width: 1280, height: 800 });
  
  page.on('console', msg => {
    console.log('BROWSER CONSOLE:', msg.text());
  });
  
  console.log("Navigating to login...");
  await page.goto('http://localhost:3001');
  await page.waitForSelector('input[type="email"]');
  await page.type('input[type="email"]', 'mylyt@longchau.com');
  await page.type('input[type="password"]', 'Content@123');
  await page.click('button[type="submit"]');
  
  console.log("Waiting for dashboard...");
  await page.waitForSelector('.page-title');
  
  console.log("Navigating to todo...");
  await page.goto('http://localhost:3001/todo');
  await page.waitForSelector('.page-title');
  
  await new Promise(r => setTimeout(r, 1000));
  
  // Inject script to create a task as manager
  await page.evaluate(() => {
    const store = window.localStorage.getItem('app-storage');
    if (store) {
      let data = JSON.parse(store);
      data.state.todos = [
        {
          id: 'todo-test-1',
          title: 'Test Task for Member',
          ownerName: 'manntm3',
          assigneeName: 'mylyt',
          priority: 'high',
          completed: false,
          dueDate: '2026-05-20',
          createdAt: new Date().toISOString()
        }
      ];
      window.localStorage.setItem('app-storage', JSON.stringify(data));
    }
  });
  
  // Reload to see the task
  await page.reload();
  await page.waitForSelector('.page-title');
  await new Promise(r => setTimeout(r, 1000));
  
  const buttons = await page.$$('button[title="Xem chi tiết"]');
  console.log("Found Xem chi tiết buttons:", buttons.length);
  
  if (buttons.length > 0) {
    console.log("Clicking first Xem chi tiết button...");
    await buttons[0].click();
    await new Promise(r => setTimeout(r, 1000));
    
    const modal = await page.$('.modal');
    if (modal) {
      console.log("Modal opened successfully.");
    } else {
      console.log("Modal did NOT open.");
    }
  } else {
    console.log("No Xem chi tiết button found.");
  }
  
  await browser.close();
})();
