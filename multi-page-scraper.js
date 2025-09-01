const BayanneScraper = require('./scraper');
const ScotlandsPeopleSearcher = require('./scotlandspeople-search');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

class MultiPageGenealogyScraper {
  constructor() {
    this.bayanneScraper = new BayanneScraper();
    this.spSearcher = new ScotlandsPeopleSearcher();
    this.allResults = [];
    this.masterCsvFile = './genealogy_results.csv';
    this.csvHeaderWritten = false;
    console.log(`� Results will be saved to: ${this.masterCsvFile}`);
  }

  async run(startPage = 1, endPage = 5) {
    try {
      console.log('🔍 MULTI-PAGE GENEALOGY SCRAPER');
      console.log('==================================\n');
      
      // Step 1: Initialize Scotland's People ONCE and login
      console.log('📋 Step 1: Setting up Scotland\'s People session...');
      await this.spSearcher.init();
      await this.spSearcher.waitForManualLogin();
      console.log('✅ Scotland\'s People session established\n');
      
      // Step 2: Process multiple Bayanne pages
      for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
        console.log(`📖 Processing Bayanne Page ${pageNum}/${endPage}`);
        console.log('=' .repeat(50));
        
        // Get men with middle names from this page
        const bayanneResults = await this.scrapeBayannePage(pageNum);
        
        if (bayanneResults.length === 0) {
          console.log(`❌ No men with middle names found on page ${pageNum}`);
          continue;
        }
        
        console.log(`✅ Found ${bayanneResults.length} men with middle names on page ${pageNum}`);
        
        // Search Scotland's People for this page's results
        console.log(`🔍 Searching Scotland's People for page ${pageNum} results...`);
        const spResults = await this.spSearcher.searchMultiplePeople(bayanneResults);
        
        // Combine and store results
        const pageResults = this.combineResults(bayanneResults, spResults, pageNum);
        this.allResults = this.allResults.concat(pageResults);
        
        console.log(`✅ Completed page ${pageNum} - Total records so far: ${this.allResults.length}\n`);
        
        // Append results to master CSV file
        await this.appendToMasterCSV(pageResults);
        
        // Longer break between pages
        if (pageNum < endPage) {
          console.log(`⏳ Waiting 5 seconds before next page...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
      
      // Step 3: Final summary
      console.log('📋 Step 3: Processing complete');
      await this.printSummary();
      
      console.log('\n🎉 Multi-page scraping completed successfully!');
      console.log(`📄 All results saved to: ${this.masterCsvFile}`);
      
    } catch (error) {
      console.error('❌ Error during multi-page scraping:', error);
      throw error;
    } finally {
      // Clean up - close browsers
      if (this.bayanneScraper.browser) {
        await this.bayanneScraper.browser.close();
      }
      if (this.spSearcher.browser) {
        await this.spSearcher.close();
      }
    }
  }

  async scrapeBayannePage(pageNum) {
    // Calculate offset for pagination (50 results per page)
    const offset = (pageNum - 1) * 50;
    
    // Update the Bayanne URL with correct offset
    const pageUrl = `https://www.bayanne.info/Shetland/search.php?mylastname=&lnqualify=exists&mybirthplace=SHI%2C+SCT&bpqualify=contains&mybirthyear=1900&byqualify=lt&mydeathplace=&dpqualify=dnexist&mydeathyear=&dyqualify=dnexist&mygender=M&gequalify=equals&tree=ID1&mybool=AND&nr=50&showspouse=&showdeath=&offset=${offset}&tree=ID1&tngpage=${pageNum}`;
    
    // Create a headless Bayanne scraper instance
    const headlessBayanneScraper = new BayanneScraper();
    headlessBayanneScraper.baseUrl = pageUrl;
    
    try {
      // Override the init method to make it headless
      await headlessBayanneScraper.initHeadless();
      await headlessBayanneScraper.loadPage();
      const results = await headlessBayanneScraper.extractMenWithMiddleNames();
      await headlessBayanneScraper.browser.close();
      
      return results;
    } catch (error) {
      console.error(`❌ Error scraping Bayanne page ${pageNum}:`, error.message);
      if (headlessBayanneScraper.browser) {
        await headlessBayanneScraper.browser.close();
      }
      return [];
    }
  }

  combineResults(bayanneResults, spResults, pageNum) {
    return bayanneResults.map(bayannePerson => {
      const spResult = spResults.find(sp => sp.person.id === bayannePerson.id);
      
      return {
        page: pageNum,
        bayanne_fullName: bayannePerson.fullName,
        bayanne_surname: bayannePerson.surname,
        bayanne_givenNames: bayannePerson.givenNames,
        bayanne_firstName: bayannePerson.firstNames[0] || '',
        bayanne_middleNames: bayannePerson.firstNames.slice(1).join(' '),
        bayanne_middleNameCount: bayannePerson.middleNameCount,
        bayanne_id: bayannePerson.id,
        bayanne_birthInfo: bayannePerson.birthInfo,
        bayanne_birthPlace: bayannePerson.birthPlace,
        
        sp_searchUrl: spResult ? spResult.searchUrl : '',
        sp_resultCount: spResult ? spResult.resultCount : 0,
        sp_location: spResult ? spResult.spLocation : '',
        sp_deathYear: spResult ? spResult.spDeathYear : '',
        sp_matchReason: spResult ? spResult.matchReason : '',
        sp_error: spResult ? spResult.error : ''
      };
    });
  }

  async appendToMasterCSV(newResults) {
    if (newResults.length === 0) {
      console.log('⚠️ No new results to append to CSV');
      return;
    }

    const fs = require('fs');
    
    try {
      // Write header if this is the first write
      if (!this.csvHeaderWritten) {
        const headers = 'Page,Bayanne Full Name,Surname,Given Names,First Name,Middle Names,Middle Name Count,Birth Info,Birth Place,Bayanne ID,SP Results Count,SP Death Location,SP Death Year,SP Match Reason,SP Search URL,SP Error\n';
        fs.writeFileSync(this.masterCsvFile, headers);
        this.csvHeaderWritten = true;
        console.log(`📝 Created master CSV file: ${this.masterCsvFile}`);
      }
      
      // Append new results
      const csvData = newResults.map(r => 
        `${r.page},"${(r.bayanne_fullName || '').replace(/"/g, '""')}","${(r.bayanne_surname || '').replace(/"/g, '""')}","${(r.bayanne_givenNames || '').replace(/"/g, '""')}","${(r.bayanne_firstName || '').replace(/"/g, '""')}","${(r.bayanne_middleNames || '').replace(/"/g, '""')}",${r.bayanne_middleNameCount || 0},"${(r.bayanne_birthInfo || '').replace(/"/g, '""')}","${(r.bayanne_birthPlace || '').replace(/"/g, '""')}","${(r.bayanne_id || '').replace(/"/g, '""')}",${r.sp_resultCount || 0},"${(r.sp_location || '').replace(/"/g, '""')}","${(r.sp_deathYear || '').replace(/"/g, '""')}","${(r.sp_matchReason || '').replace(/"/g, '""')}","${(r.sp_searchUrl || '').replace(/"/g, '""')}","${(r.sp_error || '').replace(/"/g, '""')}"`
      ).join('\n') + '\n';
      
      fs.appendFileSync(this.masterCsvFile, csvData);
      console.log(`✅ Appended ${newResults.length} records to ${this.masterCsvFile}`);
      
    } catch (error) {
      console.error(`❌ Error appending to master CSV: ${error.message}`);
      throw error;
    }
  }

  async printSummary() {
    // Create summary
    const summary = {
      totalPages: Math.max(...this.allResults.map(r => r.page)),
      totalBayanneRecords: this.allResults.length,
      totalSPSearches: this.allResults.length,
      spRecordsWithMatches: this.allResults.filter(r => r.sp_resultCount > 0).length,
      spRecordsWithErrors: this.allResults.filter(r => r.sp_error).length,
      averageMatchesPerPerson: this.allResults.reduce((sum, r) => sum + r.sp_resultCount, 0) / this.allResults.length,
      pageBreakdown: {}
    };
    
    // Add per-page breakdown
    for (let i = 1; i <= summary.totalPages; i++) {
      const pageResults = this.allResults.filter(r => r.page === i);
      summary.pageBreakdown[`page_${i}`] = pageResults.length;
    }
    
    console.log('\n📊 FINAL SUMMARY:');
    console.log(`   • Pages processed: ${summary.totalPages}`);
    console.log(`   • Total Bayanne records: ${summary.totalBayanneRecords}`);
    console.log(`   • Total Scotland's People searches: ${summary.totalSPSearches}`);
    console.log(`   • Records with SP matches: ${summary.spRecordsWithMatches}`);
    console.log(`   • Records with SP errors: ${summary.spRecordsWithErrors}`);
    console.log(`   • Average matches per person: ${summary.averageMatchesPerPerson.toFixed(2)}`);
    console.log(`   • Per-page breakdown:`, summary.pageBreakdown);
  }
}

// Run the multi-page scraper
async function main() {
  const startPage = process.argv[2] ? parseInt(process.argv[2]) : 1;
  const endPage = process.argv[3] ? parseInt(process.argv[3]) : 5;
  
  console.log(`🚀 Starting multi-page scraper: Pages ${startPage} to ${endPage}`);
  
  const scraper = new MultiPageGenealogyScraper();
  try {
    await scraper.run(startPage, endPage);
  } catch (error) {
    console.error('Multi-page scraping failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = MultiPageGenealogyScraper;
