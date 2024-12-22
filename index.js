const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const pdfParse = require("pdf-parse");
const { CostcoReceiptParser } = require("./src/CostcoReceiptParser");
const { CsvWriter } = require("./src/CsvWriter");
const { NumberUtils } = require("./src/NumberUtils");

// Comment out the line below to see debug logs
console.debug = function() {};

const PDFS_DIRECTORY = "./costco-receipt-pdfs";
const OUTPUT_DIRECTORY = "./out";

const numberUtils = new NumberUtils();

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

  for (const pdfName of getReceiptPdfFileNames()) {
    parseReceiptPdf(pdfName);
  }
}

function createOutputDir() {
  if (fs.existsSync(OUTPUT_DIRECTORY)) {
    fs.rmSync(OUTPUT_DIRECTORY, { recursive: true });
  }

  fs.mkdirSync(OUTPUT_DIRECTORY);
}

function getReceiptPdfFileNames() {
  return fs.readdirSync(PDFS_DIRECTORY, { withFileTypes: true })
    .filter(file => file.isFile()) // exclude directories
    .filter(file => path.extname(file.name) === ".pdf")
    .map(file => `${ PDFS_DIRECTORY }/${ file.name }`);
}

function parseReceiptPdf(pdfName) {
  let transactions = [];

  pdfParse(fs.readFileSync(pdfName)).then(data => {
    const costcoReceiptParser = new CostcoReceiptParser();

    for (const line of data.text.split("\n")) {
      const transaction = parseReceiptLine(line, costcoReceiptParser);
      if (transaction) {
        console.debug("transaction is ", JSON.stringify(transaction), "\n");
        transactions.push(transaction);
      }
    }

    // Add the receipt date to each transaction
    transactions = transactions.map(obj => (
      {
      ...obj,
      date: costcoReceiptParser.getDate(),
      isTaxable: obj.isTaxable ? "Y" : "N",
      cardLastFour: costcoReceiptParser.getCardLastFour()
    }));

    correctnessChecks(pdfName, costcoReceiptParser);

    // TODO: Calculate other stats (I calculated these through Google Sheets)
    // total spent, number of items bought, amount spent on tax, number of different costcos
    // shopped at (see `costcoReceiptParser.getStore())`), etc.
  }).finally(() => {
    writeToCsv(transactions);
  });
}

function parseReceiptLine(line, costcoReceiptParser) {
  if (line.length === 0) {
    return;
  }

  return costcoReceiptParser.parseLine(line);
}

function correctnessChecks(pdfName, costcoReceiptParser) {
  const calculatedTotal = numberUtils.numberToDollar(costcoReceiptParser.getTotalCalculated());
  const receiptTotal = numberUtils.numberToDollar(costcoReceiptParser.getTotal());
  const spentCheckPasses = calculatedTotal === receiptTotal;

  const numItemsSoldCalculated = costcoReceiptParser.getNumItemsSoldCalculated();
  const numItemsSoldReceipt = costcoReceiptParser.getNumItemsSoldReceipt();
  const itemsSoldCheckPasses = numItemsSoldCalculated === numItemsSoldReceipt;

  if (!spentCheckPasses || !itemsSoldCheckPasses) {
    console.log(chalk.red(`Check failed for ${ pdfName }.`));
  }

  if (!spentCheckPasses) {
    console.log(chalk.yellow(` Calculated spend (${ calculatedTotal }) doesn't equal total on receipt (${ receiptTotal }).`));
  }

  if (!itemsSoldCheckPasses) {
    console.log(chalk.yellow(` Calculated items sold (${ numItemsSoldCalculated }) does not equal items sold on receipt (${ numItemsSoldReceipt }).`));
  }

  if (!spentCheckPasses || !itemsSoldCheckPasses) {
    console.log(` Double check the receipt to see if the numbers add up. Costco sometimes doesn't include discounts for items on the receipt.\n There could also be an error in the script. If so, feel free to reach out to me.\n`);
  }
}

function writeToCsv(transactions) {
  const headers = [
    { id: "date", title: "Date" },
    { id: "itemIdentifier", title: "Item identifier" },
    { id: "itemName", title: "Item name" },
    { id: "amount", title: "Amount" },
    { id: "isTaxable", title: "Taxable" },
    { id: "cardLastFour", title: "Card used" },
  ];

  new CsvWriter({ outputDir: OUTPUT_DIRECTORY, headers: headers, append: true })
    .write("costco-receipts.csv", transactions);
}