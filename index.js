const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const { PdfParser } = require("./src/PdfParser");
const { CostcoReceiptParser } = require("./src/CostcoReceiptParser");
const { CsvWriter } = require("./src/CsvWriter");
const { NumberUtils } = require("./src/NumberUtils");

const AMOUNT = "amount";
const PDFS_DIRECTORY = "./costco-receipt-pdfs";
const OUTPUT_DIRECTORY = "./out";

const pdfParser = new PdfParser();

main();

// 1. Delete the `.out` directory and re-create it so that it's empty for each run.
// 2. Get all PDF file names in `./costco-receipt-pdfs`.
// 3. Parse each PDF.
// 4. Write all transactions to `.out/costco-receipts.csv`
// 5. If there's any errors encountered on the receipt (e.g., the total or items sold
//    aren't as expected), a line is printed to the console explaining what the mismatch
//    was and on which receipt.
function main() {
  createOutputDir();
  const pdfs = getReceiptPdfs();
  for (const pdf of pdfs) {
    parseReceiptPdf(pdf);
  }
}

function createOutputDir() {
  if (fs.existsSync(OUTPUT_DIRECTORY)) {
    fs.rmSync(OUTPUT_DIRECTORY, { recursive: true });
  }

  fs.mkdirSync(OUTPUT_DIRECTORY);
}

function getReceiptPdfs() {
  return fs.readdirSync(PDFS_DIRECTORY, { withFileTypes: true })
    .filter(file => file.isFile()) // exclude directories
    .filter(file => path.extname(file.name) === `.pdf`)
    .map(file => `${ PDFS_DIRECTORY }/${ file.name }`);
}

function parseReceiptPdf(pdf) {
  let transactions = [];
  let totalSpent = 0;

  pdfParser.parse(pdf).then(data => {
    const costcoReceiptParser = new CostcoReceiptParser();
    const updateTransactionsAndTotalSpent = (transaction) => {
      transactions.push(transaction);
      totalSpent += transaction[AMOUNT];
    }
    
    for (const line of data.text.split("\n")) {
      parseReceiptLine(line, costcoReceiptParser, updateTransactionsAndTotalSpent);
    }

    // Add the receipt date to each transaction
    transactions = transactions.map(obj => ({ ...obj, date: costcoReceiptParser.getDate() }));

    correctnessChecks(pdf, totalSpent, costcoReceiptParser);
    writeToCsv(transactions);

    // TODO: Calculate other stats (I calculated these through Google Sheets)
    // total spent, number of items bought, amount spent on tax, number of different costcos
    // shopped at (see `costcoReceiptParser.getStore())`), etc.
  });
}

function parseReceiptLine(line, costcoReceiptParser, updateFn) {
  if (line.length === 0) {
    return;
  }

  const transaction = costcoReceiptParser.parseLine(line);
  if (!transaction) {
    return;
  }

  if (costcoReceiptParser.isInMultilineMode()) {  
    // Once the multiline transaction has an amount, we're done with multiline mode.
    if (Object.keys(transaction).includes(AMOUNT)) {
      costcoReceiptParser.setMultilineMode(false);
      updateFn(transaction);
    }
  } else {
    updateFn(transaction);
  }
}

function correctnessChecks(pdf, totalSpent, costcoReceiptParser) {
  const totalSpentCheck = (pdf, totalSpentCalculated, totalSpentReceipt) => {
    const numberUtils = new NumberUtils();
    const calculated = numberUtils.roundToTenth(totalSpentCalculated);
    const receipt = numberUtils.roundToTenth(totalSpentReceipt);

    if (calculated === receipt) {
      return true;
    }

    console.log(chalk.red(`Total spent check failed for ${ pdf }. Calculated spend ($${ calculated }) doesn't equal total on receipt ($${ receipt }).`));
    console.log(`Double check the receipt to see if the numbers add up. Costco sometimes doesn't include discounts for items on the receipt.\nThere could also be an error in the script. If so, feel free to reach out to me.\n`);

    return false;
  }

  totalSpentCheck(pdf, totalSpent, costcoReceiptParser.getTotalSpent());
  costcoReceiptParser.itemsSoldCheck();
}

function writeToCsv(transactions) {
  const headers = [
    { id: "date", title: "Date" },
    { id: "itemIdentifier", title: "Item identifier" },
    { id: "itemName", title: "Item name" },
    { id: "amount", title: "Amount" },
  ];
  new CsvWriter({ outputDir: OUTPUT_DIRECTORY, headers: headers, append: true, logSuccess: false })
    .write("costco-receipts.csv", transactions);
}