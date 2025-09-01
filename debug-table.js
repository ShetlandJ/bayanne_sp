const puppeteer = require('puppeteer');

// Debug script to examine Scotland's People table structure
async function debugTableStructure() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  // Navigate to a sample search (you'll need to log in manually first)
  console.log('🔍 Please navigate to a Scotland\'s People search results page and press Enter...');
  
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  await new Promise((resolve) => {
    rl.question('Press Enter when on search results page: ', () => {
      rl.close();
      resolve();
    });
  });
  
  // Debug the table structure
  const tableInfo = await page.evaluate(() => {
    // Find all tables
    const tables = document.querySelectorAll('table');
    const tableData = [];
    
    tables.forEach((table, tableIndex) => {
      const rows = table.querySelectorAll('tr');
      const tableRows = [];
      
      rows.forEach((row, rowIndex) => {
        const cells = row.querySelectorAll('td, th');
        const cellData = [];
        
        cells.forEach((cell, cellIndex) => {
          cellData.push({
            index: cellIndex,
            text: cell.textContent.trim(),
            html: cell.innerHTML.trim()
          });
        });
        
        if (cellData.length > 0) {
          tableRows.push({
            rowIndex: rowIndex,
            cellCount: cellData.length,
            cells: cellData
          });
        }
      });
      
      if (tableRows.length > 0) {
        tableData.push({
          tableIndex: tableIndex,
          rowCount: tableRows.length,
          rows: tableRows.slice(0, 3) // First 3 rows for debugging
        });
      }
    });
    
    return tableData;
  });
  
  console.log('📊 Table Structure Analysis:');
  console.log(JSON.stringify(tableInfo, null, 2));
  
  await browser.close();
}

if (require.main === module) {
  debugTableStructure().catch(console.error);
}
