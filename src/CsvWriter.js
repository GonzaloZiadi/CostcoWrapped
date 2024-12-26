const createCsvWriter = require("csv-writer").createObjectCsvWriter;

class CsvWriter {
  constructor({ outputDir, headers: headers, append = true } = {}) {
    this.outputDir = outputDir;
    this.headers = headers;
    this.append = append;
  }

  write(fileName, transactions) {
    const path = `${ this.outputDir }/${ fileName }`;
    createCsvWriter({
      path: path,
      header: this.headers,
      append: this.append
    })
      .writeRecords(transactions)
      .then(() => {
        console.debug(`${ path } written successfully.`);
      });
  }
}

module.exports = { CsvWriter };