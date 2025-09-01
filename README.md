# Bayanne Genealogy Scraper

A Node.js script using Puppeteer to scrape the Bayanne genealogy database and cross-reference with Scotland's People death records to find men with middle names from Shetland records.

## Features

- **Bayanne Scraping**: Extracts men with middle names from Shetland genealogy records
- **Scotland's People Integration**: Automatically searches for death records
- **Manual Login Support**: Handles Scotland's People authentication securely
- **Intelligent Name Processing**: Handles complex names with multiple middle names
- **Respectful Scraping**: Includes delays and rate limiting
- **Multiple Output Formats**: JSON and CSV files for easy analysis
- **Integrated Workflow**: Combines both data sources into unified reports

## Extracted Information

- Full name and name components (surname, first name, middle names)
- Number of middle names
- Bayanne database ID and birth information
- Scotland's People search results and potential death records
- Birth/death years and locations
- Search URLs for manual verification

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### Basic Bayanne Scraping Only
```bash
npm start
```

### Integrated Bayanne + Scotland's People
```bash
npm run integrated
```

**Note**: The integrated mode will:
1. First scrape Bayanne for men with middle names
2. Open a browser window for you to manually log into Scotland's People
3. Wait for you to press Enter after logging in
4. Automatically search Scotland's People for each person
5. Generate combined results

## Example Output

The script will identify entries like:
- ✅ ABERNETHY, James Henry (has middle name) → Search SP for death records
- ✅ ABERNETHY, Andrew John (has middle name) → Search SP for death records  
- ❌ ABERNETHY, Adam (no middle name) → Skip

## Files Generated

- `results.json` / `results.csv` - Bayanne-only results
- `integrated-results.json` / `integrated-results.csv` - Combined Bayanne + Scotland's People data
- `integrated-summary.json` - Summary statistics

## Configuration

- **Bayanne**: Targets males born in Shetland, Scotland before 1900
- **Scotland's People**: Searches statutory death records using name + birth year
- **Rate Limiting**: 2-3 second delays between Scotland's People searches
- **Browser Mode**: Visible browser windows for transparency and manual login

## Security & Ethics

- **Manual Login**: You control your Scotland's People credentials
- **Respectful Scraping**: Includes appropriate delays
- **Transparent Process**: Visible browser windows
- **No Stored Credentials**: Never saves passwords or session data

## Next Steps

- Add pagination support to process all 20,000+ Bayanne records
- Implement fuzzy name matching for better cross-referencing
- Add birth record searches in addition to death records
- Export to additional formats (Excel, etc.)
# bayanne_sp
