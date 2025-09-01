const puppeteer = require('puppeteer');

class ScotlandsPeopleSearcher {
  constructor() {
    this.browser = null;
    this.page = null;
    this.isLoggedIn = false;
  }

  async init() {
    console.log('Starting browser for Scotland\'s People search...');
    this.browser = await puppeteer.launch({
      headless: false, // Keep visible for manual login
      defaultViewport: null,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    this.page = await this.browser.newPage();
    await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
  }

  async waitForManualLogin() {
    console.log('\n🔐 Please log in to Scotland\'s People manually in the browser window...');
    console.log('📋 I\'ll wait for you to complete the login process.');
    console.log('✅ Once logged in, press Enter in this terminal to continue...');
    
    // Navigate to Scotland's People login page
    await this.page.goto('https://www.scotlandspeople.gov.uk/user/login', { 
      waitUntil: 'networkidle2' 
    });
    
    // Wait for user input to continue
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    return new Promise((resolve) => {
      rl.question('Press Enter after logging in manually: ', () => {
        rl.close();
        this.isLoggedIn = true;
        console.log('✅ Continuing with automated searches...\n');
        resolve();
      });
    });
  }

  async searchPerson(person) {
    if (!this.isLoggedIn) {
      throw new Error('Must be logged in before searching');
    }

    console.log(`🔍 Searching for: ${person.fullName}`);
    
    // Parse the name parts
    const [surname, givenNames] = person.fullName.split(',').map(s => s.trim());
    const namesParts = givenNames.split(' ').filter(part => part.length > 0);
    const firstName = namesParts[0] || '';
    const middleName = namesParts[1] || ''; // Take first middle name only
    
    // Extract birth year from birth info
    const birthYearMatch = person.birthInfo.match(/\b(\d{4})\b/);
    const birthYear = birthYearMatch ? birthYearMatch[1] : '';
    
    // Build search URL with parameters (like your extension does)
    const params = new URLSearchParams();
    
    // Combine first name and first middle name (as per your extension logic)
    let forenames = firstName;
    if (middleName) {
      forenames = `${firstName} ${middleName}`;
    }
    
    params.append('forename', forenames);
    params.append('surname', surname);
    
    if (birthYear) {
      params.append('birth_year', birthYear);
    }
    
    const searchUrl = `https://www.scotlandspeople.gov.uk/search-records/statutory-records/stat_deaths?${params.toString()}`;
    
    try {
      // Navigate to the search URL (this should auto-fill the form)
      await this.page.goto(searchUrl, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
      
      // Wait a bit for the form to load and auto-fill
      await new Promise(resolve => setTimeout(resolve, 500)); // Reduced from 1000
      
      // Check if we're already on results page (auto-submit worked)
      const currentUrl = this.page.url();
      
      if (!currentUrl.includes('/record-results/')) {
        // Auto-submit didn't work, try manual form filling and submit
        console.log('   🔧 Auto-submit failed, trying manual form submission...');
        
        try {
          // Fill the form manually
          await this.page.waitForSelector('#edit-search-params-nrs-forename', { timeout: 3000 });
          await this.page.type('#edit-search-params-nrs-forename', forenames);
          
          await this.page.waitForSelector('#edit-search-params-nrs-surname', { timeout: 3000 });
          await this.page.type('#edit-search-params-nrs-surname', surname);
          
          if (birthYear) {
            await this.page.waitForSelector('#edit-search-params-nrs-dob', { timeout: 3000 });
            await this.page.type('#edit-search-params-nrs-dob', birthYear);
          }
          
          // Click search button
          await this.page.waitForSelector('#edit-actions-submit', { timeout: 3000 });
          await this.page.click('#edit-actions-submit');
          
          // Wait for search results
          await this.page.waitForNavigation({ waitUntil: 'networkidle2' });
          
        } catch (formError) {
          console.log(`   ❌ Manual form submission also failed: ${formError.message}`);
          throw formError;
        }
      } else {
        console.log('   ✅ Auto-submit worked, already on results page');
      }
      
      // Parse the results
      const results = await this.parseSearchResults();
      console.log(`   📋 Found ${results.length} parsed results`);
      
      // Find the best match (handles multiple results)
      const bestMatch = this.findBestMatch(results, person);
      console.log(`   🎯 Best match determined: ${bestMatch.location} | ${bestMatch.deathYear}`);
      
      // Add delay to be respectful to the server
      await new Promise(resolve => setTimeout(resolve, 500)); // Reduced from 1000
      
      console.log(`   ✅ Completed search for ${person.fullName}`);
      
      return {
        person: person,
        searchUrl: searchUrl,
        allResults: results,
        resultCount: results.length,
        bestMatch: bestMatch,
        spLocation: bestMatch.location,
        spDeathYear: bestMatch.deathYear,
        matchReason: bestMatch.matchReason
      };
      
    } catch (error) {
      console.error(`❌ Error searching for ${person.fullName}:`, error.message);
      console.log(`   🔄 Continuing to next person despite error...`);
      
      return {
        person: person,
        searchUrl: searchUrl,
        allResults: [],
        resultCount: 0,
        bestMatch: { location: '', deathYear: '', matchReason: 'Error' },
        spLocation: '',
        spDeathYear: '',
        matchReason: 'Error',
        error: error.message
      };
    }
  }

  async parseSearchResults() {
    // Check if we're on a search results page
    const currentUrl = this.page.url();
    console.log(`   🔍 Current URL: ${currentUrl}`);
    
    // Check for "no results" message first
    const noResultsFound = await this.page.evaluate(() => {
      const bodyText = document.body.textContent.toLowerCase();
      return bodyText.includes('no results found') || 
             bodyText.includes('0 results') || 
             bodyText.includes('your search returned no results');
    });
    
    if (noResultsFound) {
      console.log('   📭 No results message detected');
      return [];
    }
    
    if (!currentUrl.includes('/record-results/')) {
      console.log('   📭 Not on results page, assuming no results');
      return [];
    }

    // Parse the actual table data
    const results = await this.page.evaluate(() => {
      try {
        const rows = document.querySelectorAll('tbody tr');
        console.log(`Found ${rows.length} table rows`);
        
        const parsedResults = [];
        
        for (let row of rows) {
          try {
            // Extract data from table cells based on your HTML structure
            const cells = row.querySelectorAll('td');
            if (cells.length < 8) continue; // Skip incomplete rows
            
            const surname = cells[0].querySelector('.cell-notes')?.textContent?.trim() || '';
            const forename = cells[1].querySelector('.cell-notes')?.textContent?.trim() || '';
            const ageAtDeath = cells[2].querySelector('.cell-notes')?.textContent?.trim() || '';
            const mothersMaidenName = cells[3].querySelector('.cell-notes')?.textContent?.trim() || '';
            const gender = cells[4].querySelector('.cell-notes')?.textContent?.trim() || '';
            const year = cells[5].querySelector('.cell-notes')?.textContent?.trim() || '';
            const ref = cells[6].textContent?.trim() || '';
            const rdName = cells[7].querySelector('.cell-notes')?.textContent?.trim() || '';
            
            if (surname && forename && year) {
              parsedResults.push({
                name: `${forename} ${surname}`,
                surname: surname,
                forename: forename,
                deathYear: year,
                location: rdName,
                mothersMaidenName: mothersMaidenName,
                ageAtDeath: ageAtDeath,
                gender: gender,
                reference: ref
              });
            }
          } catch (rowError) {
            console.log('Error parsing row:', rowError);
          }
        }
        
        console.log(`Parsed ${parsedResults.length} results from table`);
        return parsedResults;
      } catch (error) {
        console.log('Error in page evaluation:', error);
        return [];
      }
    });

    console.log(`   📊 Parsed ${results.length} result entries`);
    return results;
  }

  // Helper method to find best match using mother's maiden name
  findBestMatch(results, person) {
    if (results.length === 0) {
      return {
        location: '',
        deathYear: '',
        matchReason: 'No results'
      };
    }
    
    if (results.length === 1) {
      return {
        location: results[0].location,
        deathYear: results[0].deathYear,
        matchReason: 'Single result'
      };
    }
    
    // Multiple results - try to match by mother's maiden name
    // Extract potential mother's maiden name from birth place or other context
    // This is a basic implementation - you might want to enhance this logic
    const birthPlace = person.birthPlace || '';
    
    // Look for a match with mother's maiden name
    for (const result of results) {
      if (result.mothersMaidenName && birthPlace.includes(result.mothersMaidenName)) {
        return {
          location: result.location,
          deathYear: result.deathYear,
          matchReason: `Mother's maiden name match: ${result.mothersMaidenName}`
        };
      }
    }
    
    // No mother's maiden name match found
    return {
      location: 'Multiple',
      deathYear: 'Multiple',
      matchReason: `Multiple results (${results.length}), no maiden name match`
    };
  }

  async searchMultiplePeople(people, maxResults = 10) {
    const results = [];
    const total = Math.min(people.length, maxResults);
    
    console.log(`\n🚀 Starting Scotland's People searches for ${total} people...\n`);
    
    for (let i = 0; i < total; i++) {
      const person = people[i];
      console.log(`📝 [${i + 1}/${total}] Processing: ${person.fullName}`);
      
      try {
        const searchResult = await this.searchPerson(person);
        results.push(searchResult);
        
        // Show results for this person
        if (searchResult.resultCount > 0) {
          console.log(`   ✅ Found ${searchResult.resultCount} potential matches:`);
          if (searchResult.allResults.length > 0) {
            searchResult.allResults.forEach((result, idx) => {
              console.log(`      ${idx + 1}. ${result.name} - ${result.deathYear} - ${result.location}`);
            });
          }
          console.log(`   🎯 Best match: ${searchResult.spLocation} | ${searchResult.spDeathYear} (${searchResult.matchReason})`);
        } else {
          console.log(`   ❌ No matches found`);
        }
        
      } catch (error) {
        console.error(`   💥 Failed to search for ${person.fullName}: ${error.message}`);
        // Add a placeholder result for this failed search
        results.push({
          person: person,
          searchUrl: '',
          allResults: [],
          resultCount: 0,
          spLocation: '',
          spDeathYear: '',
          matchReason: 'Search failed',
          error: error.message
        });
      }
      
      console.log(`   ✅ Completed ${person.fullName}\n`);
      
      // Longer delay between searches to be respectful
      if (i < total - 1) {
        console.log(`   ⏳ Waiting 1 second before next search...`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Reduced from 2000
      }
    }
    
    return results;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('Browser closed');
    }
  }
}

module.exports = ScotlandsPeopleSearcher;
