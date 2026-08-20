const fs = require('fs');
const path = require('path');

// Read the HTML file
const htmlFile = path.join(__dirname, 'CONTROLLED_TEST_DOCUMENT.html');
const htmlContent = fs.readFileSync(htmlFile, 'utf8');

// Check if Puppeteer is available
try {
  const puppeteer = require('puppeteer');
  console.log('Puppeteer found, converting to PDF...');
  
  (async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    
    const pdfPath = path.join(__dirname, 'CONTROLLED_TEST_DOCUMENT.pdf');
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '40px', right: '40px', bottom: '40px', left: '40px' }
    });
    
    await browser.close();
    console.log('PDF created successfully:', pdfPath);
  })();
} catch (err) {
  console.log('Puppeteer not available, providing manual conversion instructions:');
  console.log('1. Open CONTROLLED_TEST_DOCUMENT.html in your browser');
  console.log('2. Press Ctrl+P to open Print dialog');
  console.log('3. Select "Save as PDF" or "Print to PDF"');
  console.log('4. Click Save');
}
