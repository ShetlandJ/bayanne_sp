const BayanneScraper = require('./scraper');
const ScotlandsPeopleSearcher = require('./scotlandspeople-search');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

class IntegratedGenealogyScraper {
  constructor() {
    this.bayanneScraper = new BayanneScraper();
    this.spSearcher = new ScotlandsPeopleSearcher();
  }

  async run() {
    try {
      console.log('🔍 INTEGRATED GENEALOGY SCRAPER');
      console.log('================================\n');
      
      // Step 1: Get men with middle names from Bayanne
      console.log('📋 Step 1: Extracting men with middle names from Bayanne...');
      const bayanneResults = await this.bayanneScraper.run();
      
      if (bayanneResults.length === 0) {
        console.log('❌ No men with middle names found. Exiting.');
        return;
      }
      
      console.log(`✅ Found ${bayanneResults.length} men with middle names from Bayanne\n`);
      
      // Step 2: Initialize Scotland's People searcher and wait for manual login
      console.log('📋 Step 2: Setting up Scotland\'s People search...');
      await this.spSearcher.init();
      await this.spSearcher.waitForManualLogin();
      
      // Step 3: Search Scotland's People for death records
      console.log('📋 Step 3: Searching Scotland\'s People for death records...');
      const spResults = await this.spSearcher.searchMultiplePeople(bayanneResults); // Search all people found
      
      // Step 4: Combine and save results
      console.log('📋 Step 4: Combining results and saving to files...');
      await this.saveIntegratedResults(bayanneResults, spResults);
      
      console.log('\n🎉 Integrated scraping completed successfully!');
      
    } catch (error) {
      console.error('❌ Error during integrated scraping:', error);
      throw error;
    } finally {
      // Clean up
      if (this.bayanneScraper.browser) {
        await this.bayanneScraper.browser.close();
      }
      if (this.spSearcher.browser) {
        await this.spSearcher.close();
      }
    }
  }

  async saveIntegratedResults(bayanneResults, spResults) {
    const fs = require('fs');
    
    // Create integrated data structure
    const integratedData = bayanneResults.map(bayannePerson => {
      // Find corresponding Scotland's People results
      const spResult = spResults.find(sp => sp.person.id === bayannePerson.id);
      
      return {
        // Bayanne data
        bayanne_fullName: bayannePerson.fullName,
        bayanne_surname: bayannePerson.surname,
        bayanne_givenNames: bayannePerson.givenNames,
        bayanne_firstName: bayannePerson.firstNames[0] || '',
        bayanne_middleNames: bayannePerson.firstNames.slice(1).join(' '),
        bayanne_middleNameCount: bayannePerson.middleNameCount,
        bayanne_id: bayannePerson.id,
        bayanne_birthInfo: bayannePerson.birthInfo,
        bayanne_birthPlace: bayannePerson.birthPlace,
        
        // Scotland's People data
        sp_searchUrl: spResult ? spResult.searchUrl : '',
        sp_resultCount: spResult ? spResult.resultCount : 0,
        sp_location: spResult ? spResult.spLocation : '',
        sp_deathYear: spResult ? spResult.spDeathYear : '',
        sp_matchReason: spResult ? spResult.matchReason : '',
        sp_error: spResult ? spResult.error : '',
        sp_allMatches: spResult ? JSON.stringify(spResult.allResults) : '[]'
      };
    });
    
    // Save to JSON
    fs.writeFileSync('./integrated-results.json', JSON.stringify(integratedData, null, 2));
    console.log('✅ Integrated results saved to integrated-results.json');
    
    // Save to CSV
    const csvWriter = createCsvWriter({
      path: './integrated-results.csv',
      header: [
        { id: 'bayanne_fullName', title: 'Bayanne Full Name' },
        { id: 'bayanne_surname', title: 'Surname' },
        { id: 'bayanne_givenNames', title: 'Given Names' },
        { id: 'bayanne_firstName', title: 'First Name' },
        { id: 'bayanne_middleNames', title: 'Middle Names' },
        { id: 'bayanne_middleNameCount', title: 'Middle Name Count' },
        { id: 'bayanne_birthInfo', title: 'Birth Info' },
        { id: 'bayanne_birthPlace', title: 'Birth Place' },
        { id: 'bayanne_id', title: 'Bayanne ID' },
        { id: 'sp_resultCount', title: 'SP Results Count' },
        { id: 'sp_location', title: 'SP Death Location' },
        { id: 'sp_deathYear', title: 'SP Death Year' },
        { id: 'sp_matchReason', title: 'SP Match Reason' },
        { id: 'sp_searchUrl', title: 'SP Search URL' },
        { id: 'sp_error', title: 'SP Error' }
      ]
    });
    
    await csvWriter.writeRecords(integratedData);
    console.log('✅ Integrated results saved to integrated-results.csv');
    
    // Create summary
    const summary = {
      totalBayanneRecords: bayanneResults.length,
      totalSPSearches: spResults.length,
      spRecordsWithMatches: spResults.filter(r => r.resultCount > 0).length,
      spRecordsWithErrors: spResults.filter(r => r.error).length,
      averageMatchesPerPerson: spResults.reduce((sum, r) => sum + r.resultCount, 0) / spResults.length
    };
    
    fs.writeFileSync('./integrated-summary.json', JSON.stringify(summary, null, 2));
    console.log('✅ Summary saved to integrated-summary.json');
    
    console.log('\n📊 SUMMARY:');
    console.log(`   • Bayanne records processed: ${summary.totalBayanneRecords}`);
    console.log(`   • Scotland's People searches: ${summary.totalSPSearches}`);
    console.log(`   • Records with SP matches: ${summary.spRecordsWithMatches}`);
    console.log(`   • Records with SP errors: ${summary.spRecordsWithErrors}`);
    console.log(`   • Average matches per person: ${summary.averageMatchesPerPerson.toFixed(1)}`);
  }
}

// Run the integrated scraper
async function main() {
  const scraper = new IntegratedGenealogyScraper();
  try {
    await scraper.run();
  } catch (error) {
    console.error('Integrated scraping failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = IntegratedGenealogyScraper;
