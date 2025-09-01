const puppeteer = require('puppeteer');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

class BayanneScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.baseUrl = 'https://www.bayanne.info/Shetland/search.php?mylastname=&lnqualify=exists&mybirthplace=SHI%2C+SCT&bpqualify=contains&mybirthyear=1900&byqualify=lt&mydeathplace=&dpqualify=dnexist&mydeathyear=&dyqualify=dnexist&mygender=M&gequalify=equals&tree=ID1&mybool=AND&nr=50&showspouse=&showdeath=&offset=0&tree=ID1&tngpage=1';
  }

  async init() {
    console.log('Starting Puppeteer browser...');
    this.browser = await puppeteer.launch({
      headless: false, // Set to true for production
      defaultViewport: null,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    this.page = await this.browser.newPage();
    await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
  }

  async initHeadless() {
    console.log('Starting headless Puppeteer browser for Bayanne...');
    this.browser = await puppeteer.launch({
      headless: true, // Headless mode for background scraping
      defaultViewport: null,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    this.page = await this.browser.newPage();
    await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
  }

  async loadPage() {
    console.log('Loading genealogy search page...');
    await this.page.goto(this.baseUrl, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    console.log('Page loaded successfully');
  }

  async extractMenWithMiddleNames() {
    console.log('Extracting men with middle names...');
    
    const results = await this.page.evaluate(() => {
      const rows = document.querySelectorAll('table tr');
      const menWithMiddleNames = [];
      
      rows.forEach((row, index) => {
        // Skip header rows and non-data rows
        const cells = row.querySelectorAll('td');
        if (cells.length < 4) return;
        
        // The name is typically in the second cell (index 1)
        const nameCell = cells[1];
        if (!nameCell) return;
        
        const nameText = nameCell.textContent.trim();
        
        // Skip if this doesn't look like a name entry
        if (!nameText || !nameText.includes(',')) return;
        
        // Parse the name: "SURNAME, FirstName MiddleName(s)"
        const [surname, givenNames] = nameText.split(',').map(s => s.trim());
        
        if (!givenNames) return;
        
        // Check if there are middle names (more than one word after the comma)
        const namesParts = givenNames.split(' ').filter(part => part.length > 0);
        
        if (namesParts.length > 1) {
          // Extract additional details from other cells
          const idCell = cells[2] ? cells[2].textContent.trim() : '';
          const birthCell = cells[3] ? cells[3].textContent.trim() : '';
          const birthPlaceCell = cells[4] ? cells[4].textContent.trim() : '';
          
          menWithMiddleNames.push({
            fullName: nameText,
            surname: surname,
            givenNames: givenNames,
            firstNames: namesParts,
            middleNameCount: namesParts.length - 1,
            id: idCell,
            birthInfo: birthCell,
            birthPlace: birthPlaceCell,
            rowIndex: index
          });
        }
      });
      
      return menWithMiddleNames;
    });

    return results;
  }

  async run() {
    try {
      await this.init();
      await this.loadPage();
      
      const menWithMiddleNames = await this.extractMenWithMiddleNames();
      
      console.log(`\nFound ${menWithMiddleNames.length} men with middle names:\n`);
      
      menWithMiddleNames.forEach((person, index) => {
        console.log(`${index + 1}. ${person.fullName}`);
        console.log(`   Given Names: ${person.givenNames}`);
        console.log(`   Middle Names Count: ${person.middleNameCount}`);
        console.log(`   ID: ${person.id}`);
        console.log(`   Birth: ${person.birthInfo}`);
        console.log(`   Birth Place: ${person.birthPlace}`);
        console.log('   ---');
      });
      
      // Save results to JSON file
      const fs = require('fs');
      fs.writeFileSync('./results.json', JSON.stringify(menWithMiddleNames, null, 2));
      console.log(`\nResults saved to results.json`);
      
      // Save results to CSV file
      await this.saveToCSV(menWithMiddleNames);
      
      return menWithMiddleNames;
      
    } catch (error) {
      console.error('Error during scraping:', error);
      throw error;
    } finally {
      if (this.browser) {
        await this.browser.close();
        console.log('Browser closed');
      }
    }
  }

  async saveToCSV(data) {
    console.log('Writing results to CSV...');
    
    const csvWriter = createCsvWriter({
      path: './results.csv',
      header: [
        { id: 'fullName', title: 'Full Name' },
        { id: 'surname', title: 'Surname' },
        { id: 'givenNames', title: 'Given Names' },
        { id: 'firstName', title: 'First Name' },
        { id: 'middleNames', title: 'Middle Names' },
        { id: 'middleNameCount', title: 'Middle Name Count' },
        { id: 'id', title: 'Database ID' },
        { id: 'birthInfo', title: 'Birth Information' },
        { id: 'birthPlace', title: 'Birth Place' },
        { id: 'rowIndex', title: 'Row Index' }
      ]
    });

    // Transform the data to separate first name from middle names
    const csvData = data.map(person => ({
      ...person,
      firstName: person.firstNames[0] || '',
      middleNames: person.firstNames.slice(1).join(' ')
    }));

    try {
      await csvWriter.writeRecords(csvData);
      console.log('Results successfully written to results.csv');
    } catch (error) {
      console.error('Error writing CSV file:', error);
      throw error;
    }
  }
}

// Run the scraper
async function main() {
  const scraper = new BayanneScraper();
  try {
    const results = await scraper.run();
    console.log(`\nScraping completed successfully. Found ${results.length} men with middle names.`);
  } catch (error) {
    console.error('Scraping failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = BayanneScraper;
