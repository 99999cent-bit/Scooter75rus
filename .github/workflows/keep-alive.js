const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Создаем папку для скриншотов
if (!fs.existsSync('screenshots')) {
  fs.mkdirSync('screenshots');
}

async function keepSessionAlive(url, accountName) {
  console.log(`\n🔄 [${accountName}] Запуск браузера...`);
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080'
    ]
  });

  try {
    const page = await browser.newPage();
    
    // Реальный User-Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    //Viewport как у реального монитора
    await page.setViewport({ width: 1920, height: 1080 });
    
    console.log(`📡 [${accountName}] Переход по ссылке...`);
    
    // Переходим на страницу
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // Ждём прогрузки
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Скриншот
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotPath = `screenshots/${accountName.replace(/\s/g, '-')}-${timestamp}.png`;
    await page.screenshot({ 
      path: screenshotPath,
      fullPage: true    });
    console.log(`📸 [${accountName}] Скриншот сохранён: ${screenshotPath}`);
    
    // Проверяем страницу
    const pageTitle = await page.title();
    console.log(`✅ [${accountName}] Заголовок страницы: ${pageTitle}`);
    
    // Проверяем URL (не logout ли?)
    const currentUrl = page.url();
    if (currentUrl.includes('logout') || currentUrl.includes('Login')) {
      console.error(`❌ [${accountName}] ОШИБКА: Сессия истекла! Редирект на ${currentUrl}`);
      throw new Error('Session expired');
    }
    
    console.log(`✅ [${accountName}] Сессия успешно обновлена!`);
    console.log(`📍 [${accountName}] Текущий URL: ${currentUrl.substring(0, 100)}...`);
    
    return true;
    
  } catch (error) {
    console.error(`❌ [${accountName}] Ошибка: ${error.message}`);
    throw error;
  } finally {
    await browser.close();
  }
}

// Главная функция
async function main() {
  console.log('🚀 ========================================');
  console.log('🚀 Запуск поддержания сессий 18gps');
  console.log('🚀 ========================================\n');
  
  const urls = [
    { url: process.env.URL_1, name: 'Account-1-6084' },
    { url: process.env.URL_2, name: 'Account-2-a7d1' }
  ];
  
  let successCount = 0;
  let failCount = 0;
  
  for (const { url, name } of urls) {
    if (!url) {
      console.warn(`⚠️  [${name}] URL не указан, пропускаем...`);
      continue;
    }
    
    try {
      await keepSessionAlive(url, name);
      successCount++;    } catch (error) {
      console.error(`💥 [${name}] Не удалось: ${error.message}`);
      failCount++;
    }
    
    // Пауза между аккаунтами
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('\n========================================');
  console.log(`📊 ИТОГИ: Успешно ${successCount}, Ошибок ${failCount}`);
  console.log('========================================\n');
  
  if (successCount === 0) {
    console.error('❌ Все аккаунты не удалось обновить!');
    process.exit(1);
  }
  
  console.log('✅ Все сессии поддерживаются!');
}

main().catch(err => {
  console.error('💥 Критическая ошибка:', err);
  process.exit(1);
});