const createCsvWriter = require("csv-writer").createObjectCsvWriter;

class CsvWriter {
  constructor({ outputDir, headers: headers, append = true, logSuccess = true } = {}) {
    this.outputDir = outputDir;
    this.headers = headers;
    this.append = append;
    this.logSuccess = logSuccess;
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
        if (this.logSuccess) {
          console.log(`${ path } written successfully.`)
        }
      });
  }
}

module.exports = { CsvWriter };