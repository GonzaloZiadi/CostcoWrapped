const fs = require("fs");
const path = require("path");
const { PdfParser } = require("./PdfParser");
const { CostcoReceiptParser } = require("./CostcoReceiptParser");
const _ = require("lodash");

const AMOUNT = "amount";
const PDFS_DIRECTORY = "./costco-receipt-pdfs";

// How it works
// 1. Read all PDFs in `./costco-receipt-pdfs`
// 2. Parse each PDF
// 3. Write all transactions to a CSV

const pdfs = fs.readdirSync(PDFS_DIRECTORY, { withFileTypes: true })
    .filter(file => file.isFile()) // exclude directories
    .filter(file => path.extname(file.name) === `.pdf`)
    .map(file => `${ PDFS_DIRECTORY }/${ file.name }`);

const pdfParser = new PdfParser();
for (const pdf of pdfs) {
  let transactions = [];
  let totalSpent = 0;

  pdfParser.parse(pdf).then(data => {
    const costcoReceiptParser = new CostcoReceiptParser();
    const updateTransactionsAndTotalSpent = (transaction) => {
      transactions.push(transaction);
      totalSpent += transaction[AMOUNT];
    }
    
    for (const line of data.text.split("\n")) {
      parseLine(line, costcoReceiptParser, updateTransactionsAndTotalSpent);
    }

    transactions = addDateToTransactions(transactions, costcoReceiptParser.getDate());
    
    // Correctness checks
    totalSpentCheck(pdf, totalSpent, costcoReceiptParser.getTotalSpent());
    costcoReceiptParser.itemsSoldCheck()

    // Calculate other stats (I calculated these through Google Sheets)
    // total spent, number of items bought, number of costco's shopped at (see `costcoReceiptParser.getStore())`)
  });
}

function parseLine(line, costcoReceiptParser, updateFn) {
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

function addDateToTransactions(transactions, date) {
  return transactions.map(obj => ({ ...obj, date: date }))
}

function totalSpentCheck(pdf, totalSpentCalculated, totalSpentReceipt) {
  const calculated = roundToTenth(totalSpentCalculated);
  const receipt = roundToTenth(totalSpentReceipt);
  if (calculated === receipt) {
    return true;
  }

  console.log(`Total spent check failed for ${ pdf }. Calculated (${ calculated }) doesn't equal receipt value (${ receipt }).`);
  return false;
}

// See https://stackoverflow.com/a/27083270
function roundToTenth(num) {
  return Math.round(num * 100) / 100;
}