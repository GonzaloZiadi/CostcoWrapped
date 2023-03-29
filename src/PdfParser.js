const fs = require("fs");
const pdfParse = require("pdf-parse");

class PdfParser {
  constructor() { }

  parse(pdf) {
    const pdfData = fs.readFileSync(pdf);
    return pdfParse(pdfData);
  }
}

module.exports = { PdfParser };