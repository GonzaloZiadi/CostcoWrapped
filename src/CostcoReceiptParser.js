const { RegexUtils } = require("./RegexUtils");
const { NumberUtils } = require("./NumberUtils");

class CostcoReceiptParser {
  constructor() {
    this.regexUtils = new RegexUtils();
    this.numberUtils = new NumberUtils();

    this.multilineMode = false;
    this.multilineModeCurrentItemName = undefined;
    this.multilineModeCurrentItemIdentifier = undefined;

    this.storeLines = [];
    this.memberIdentifier = [];
    this.receiptIdentifier = undefined;
    this.hasRemainingTransactions = true;
    this.date = undefined;
    this.cardLastFour = undefined;

    this.totalCalculated = 0;
    this.total = 0;
    this.tax = 0;

    this.numItemsSoldReceipt = 0;
    this.numItemsSoldCalculated = 0;

    this.itemNameByItemIdentifier = {};
    this.taxCodeByItemIdentifier = {};
    this.itemIdentifierByItemName = {};
    this.itemIdentifierByDiscountIdentifier = {};
  }

  parseLine(line) {
    // The first 3 lines of the receipt are the store identifier, street address, and city/state/zip
    if(this.storeLines.length < 3) {
      this.storeLines.push(line);
      return;
    }

    if (!this.receiptIdentifier && this.storeLines.length === 3) {
      this.receiptIdentifier = line;
      return;
    }

    if (this.#parseMemberIdentifier(line)) {
      return;
    }

    // When there are no remaining transactions, grab metadata such as the receipt date and 
    // total items sold.
    if (!this.hasRemainingTransactions) {
      this.#parseReceiptMetadata(line);
      return;
    }

    if (this.#find(line, "SUBTOTAL")) {
      return;
    }

    const tax = this.#find(line, "TAX");
    if (tax) {
      this.tax = this.#formatAmount(tax);
      return {
        itemIdentifier: "TAX",
        itemName: "TAX",
        amount: this.tax,
        isTaxable: false
      };
    }
  
    const total = this.#find(line, "****TOTAL");
    if (total) {
      this.total = this.#formatAmount(total);
      this.hasRemainingTransactions = false;
      return;
    }

    // A transaction might span multiple lines.
    //
    // Example:
    //   900091KS
    //   CABERNET
    //   7.99- A
    const multilineTransaction = this.#parseMultilineTransaction(line);
    if (multilineTransaction) {
      return multilineTransaction;
    }
  
    // A typical transaction spans only one line.
    //
    // Example:
    //   1204135 ORG FIRM TO 6.49
    return this.#parseTransaction(line);
  }

  getNumItemsSoldCalculated() {
    return this.numItemsSoldCalculated;
  }

  getNumItemsSoldReceipt() {
    return this.numItemsSoldReceipt;
  }

  getTotalCalculated() {
    return this.totalCalculated + this.tax;
  }

  getTotal() {
    return this.total;
  }

  getDate() {
    return this.date;
  }

  getCardLastFour() {
    return this.cardLastFour;
  }

  getStore() {
    // this.storeLines might look like:
    //   ['AUSTIN #681', '10401 RESEARCH BLVD', 'AUSTIN,TX78759']
    const splitCityStateZipOnComma = this.storeLines[2].split(",");

    return {
      store: this.storeLines[0],
      street: this.storeLines[1],
      city: splitCityStateZipOnComma[0],
      zipCode: splitCityStateZipOnComma[1].slice(-5),
      state: splitCityStateZipOnComma[1].slice(0, 2),
    };
  }

  // The member number might be on one or two lines. Each page
  // of the receipt starts with the member number.
  //
  // Example:
  //   Member 121549142109
  //   Member
  //   121549142109
  #parseMemberIdentifier(line) {
    if (line.includes("Member")) {
      this.memberIdentifier.push(line);

      // Check if the member number is on the same line
      const hasNumber = /[0-9]/.test(line);
      if (hasNumber) {
        this.memberIdentifier.push(line.replace(/Member/, ""));
      }

      return true;
    }

    // Check if the member identifier length is odd meaning we've
    // just added the 'Member' string and are missing the number
    if (this.memberIdentifier.length % 2 === 1) {
      this.memberIdentifier.push(line);
      return true;
    }
  }

  #parseReceiptMetadata(line) {
    const dateRegex = `(${ this.regexUtils.date() }) ${ this.regexUtils.anything() }`;
    const foundDate = this.regexUtils.matchAll(line, dateRegex);
    if (foundDate.length) {
      this.date = foundDate[1];
      return;
    }

    const totalItemsSold = this.#find(line, "TOTAL NUMBER OF ITEMS SOLD =");
    if (totalItemsSold) {
      this.numItemsSoldReceipt = Number(totalItemsSold);
      return;
    }

    // EXAMPLES:
    //   - XXXXXXXXXXXXX8926CHIP read
    //   - XXXXXXXXXXXXX1043
    if (this.#find(line, "XXXXXXXXXXXXX")) {
      // Remove all letters; leave only the card numbers
      this.cardLastFour = line.replace(/[A-Za-z]/g, "");
      return;
    }
  }

  #parseMultilineTransaction(line) {
    // Line doesn't have a dollar amount.
    // This means it's the first line of a multiline entry.
    const hasDollarAmount = /\.[0-9]{2}/.test(line);
    if (!this.multilineMode && !hasDollarAmount) {
      this.multilineMode = true;
      this.multilineModeCurrentItemIdentifier = line;
      this.multilineModeCurrentItemName = "";

      console.debug(` parseMultilineTransaction; not multiline mode, no dollar amount, so first line of a multiline entry. [${line}, Item ID: ${this.multilineModeCurrentItemIdentifier}, ItemName: ${this.multilineModeCurrentItemName}]`);

      return;
    }

    // We're in multiline mode and the line doesn't have a dollar amount.
    // This means it's part of the item's name.
    if (this.multilineMode && !hasDollarAmount) {
      this.multilineModeCurrentItemName += `${ line } `;

      console.debug(` parseMultilineTransaction; multiline mode, no dollar amount, part of item's name. [${line}, ItemName: ${this.multilineModeCurrentItemName}]`);

      return;
    }

    // We're in multiline mode and the line has a dollar amount.
    // This means it's the price paid for the item.
    if (this.multilineMode && hasDollarAmount) {
      console.debug(` parseMultilineTransaction; price paid for the item. [${line}]`);

      const foundAmount = this.regexUtils.matchAll(line, this.regexUtils.dollar());
      if (foundAmount.length) {
        this.multilineMode = false;

        const amount = this.#formatAmount(foundAmount[1]);
        this.totalCalculated += amount;

        const { itemName, itemIdentifier, isTaxable } = this.#determineItemNameAndIdentifier(
          amount, this.multilineModeCurrentItemName, this.multilineModeCurrentItemIdentifier
        );

        return { itemName, itemIdentifier, amount, isTaxable };
      }
    }
  }
  
  #parseTransaction(line) {
    const transaction = this.#transactionReplacements(line);

    // A line can look like 329256/77713142.00
    // 329256 is the item identifier 7771314 is another identifier, 2.00 is the price
    // We try to find a matching identifier (i.e., 7771314) based on previous lines
    if (transaction.includes("/")) {
      for (const itemIdentifier of Object.keys(this.itemNameByItemIdentifier)) {
        // "329256/77713142.00".split("/") => [329256, 77713142.00]
        // 77713142.00, split on 7771314 => ["", 2.00]
        const splitOnItemIdentifier = transaction.split("/")[1].split(itemIdentifier);
        if (splitOnItemIdentifier[0] === "") {
          console.debug(` parseTransaction; includes slash, match found. [${itemIdentifier}, ${this.itemNameByItemIdentifier[itemIdentifier]}, ${splitOnItemIdentifier[1]}]`);

          const amount = this.#formatAmount(splitOnItemIdentifier[1]);
          this.totalCalculated += amount;

          return {
            itemIdentifier: `D-${ itemIdentifier }`,
            itemName: this.itemNameByItemIdentifier[itemIdentifier],
            amount,
            isTaxable: this.#isTaxable(itemIdentifier)
          };
        }
      }
    }

    // A typical line looks like: 1204135 ORG FIRM TO 6.49
    // We capture the numbers at the start (item identifier), everything that follows (item name),
    // and the dollar amount at the end.
    const transactionRegex = `([A-Z]?[0-9]+)(${ this.regexUtils.nonGreedyAnything() })${ this.regexUtils.dollar() }`;
    const foundTransaction = this.regexUtils.matchAll(transaction, transactionRegex);
    if (foundTransaction.length) {
      console.debug(` parseTransaction; match found. [${foundTransaction[2]}, ${foundTransaction[1]}, ${foundTransaction[3]}]`);

      const amount = this.#formatAmount(foundTransaction[3]);
      this.totalCalculated += amount;

      const { itemName, itemIdentifier, isTaxable } = this.#determineItemNameAndIdentifier(
        amount, foundTransaction[2], foundTransaction[1]
      );

      return { itemIdentifier, itemName, amount, isTaxable };
    }
  }

  #determineItemNameAndIdentifier(amount, originalItemName, originalItemIdentifier) {
    const itemName = originalItemName.trim();

    // Remove all letters from the item identifier as there might be a letter
    // at the start, e.g., E or F, that mean the item is food or FSA-eligible
    const itemIdentifier = originalItemIdentifier.replace(/[A-Z]/g, "");

    // This is a typical bought item.
    //
    // Example:
    //   1204135 ORG FIRM TO 6.49 (bought item - price is positive)
    if (amount > 0) {
      this.numItemsSoldCalculated++;

      // Maintain these mappings to be able to properly identify
      // discounts, returns, and tax status.
      this.itemNameByItemIdentifier[itemIdentifier] = itemName;
      this.taxCodeByItemIdentifier[itemIdentifier] = originalItemIdentifier;
      this.itemIdentifierByItemName[itemName] = itemIdentifier;

      return {
        itemName,
        itemIdentifier,
        isTaxable: this.#isTaxable(originalItemIdentifier)
      };
    }

    // If we're here, the price paid for an item is less than zero.
    // We're dealing with a discount or a return.
    // --------

    // We've seen this item before. This is a discount.
    // Leave the name as is, grab the item identifier for the non-discount version of
    // this item, and prepend it with `D-`.
    //
    // Example:
    //   1204135 ORG FIRM TO 6.49 (bought item)
    //   294721 ORG FIRM TO 2.00- (discount for bought item; different identifier but same name)
    //
    //   Instead of tagging this item with 294721, tag it with D-1204135
    const itemNames = Object.keys(this.itemIdentifierByItemName);
    if (itemNames.includes(itemName)) {
      const itemIdentifierForItemName = this.itemIdentifierByItemName[itemName];
      const taxCode = this.taxCodeByItemIdentifier[itemIdentifierForItemName];

      // A discount might not use the same name as the bought item.
      // Maintain a mapping from the discount identifier to the bought item identifier.
      //
      // Example:
      //   1204135 ORG FIRM TO 6.49 (bought item)
      //   294721 ORG FIRM TO 2.00- (discount for bought item; different identifier but same name)
      //   294721 /0 2.00- (discount for bought item under a different name)
      //
      //   Add a mapping from 294721 to 1204135.
      this.itemIdentifierByDiscountIdentifier[itemIdentifier] = itemIdentifierForItemName;

      return {
        itemName,
        itemIdentifier: `D-${ itemIdentifierForItemName }`,
        isTaxable: this.#isTaxable(taxCode)
      };
    }

    // This is a discount going by another name than the bought product.
    // First, we find the bought item identifier for this discount item identifier.
    // Then, we use the bought item identifier to get the item's correct name.
    //
    // Example:
    //   1204135 ORG FIRM TO 6.49 (bought item)
    //   294721 ORG FIRM TO 2.00- (discount for bought item; different identifier but same name)
    //   294721 /0 2.00- (discount for bought item under a different name)
    //
    //   Use ORG FIRM TO as the name and D-1204135 as the item identifier
    const itemIdentifierForDiscount = this.itemIdentifierByDiscountIdentifier[itemIdentifier];
    if (itemIdentifierForDiscount) {
      const taxCode = this.taxCodeByItemIdentifier[itemIdentifierForDiscount];

      return {
        itemName: this.itemNameByItemIdentifier[itemIdentifierForDiscount],
        itemIdentifier: `D-${ itemIdentifierForDiscount }`,
        isTaxable: this.#isTaxable(taxCode)
      };
    }

    // This is a return so reduce the number of items sold by one.
    console.debug(" determineItemNameAndIdentifier; returned item");
    this.itemNameByItemIdentifier[itemIdentifier] = itemName;
    this.numItemsSoldCalculated--;

    return {
      itemName,
      itemIdentifier: `R-${ itemIdentifier }`,
      isTaxable: this.#isTaxable(originalItemIdentifier)
    };
  }

  // E means tax-exempt for food; F means tax-exempt as it's FSA-eligible
  #isTaxable(itemIdentifier) {
    const taxCode = itemIdentifier.charAt(0);
    return !["E", "F"].includes(taxCode);
  }

  // Some item names have numbers which can merge with the item's
  // price and mess up the total. We add a space after known problematic
  // item names to prevent this issue.
  #transactionReplacements(line) {
    const itemNamesWithNumbers = ["KS WATER 40", "CHNT 10-3/8", "DIAPERS SZ 1", "DIAPERS SZ 2", "DIAPERS SZ 3", "DIAPERS SZ 4", "DIAPERS SZ 5", "DIAPERS SZ 6", "KS DIAPER S1", "KS DIAPER S2", "KS DIAPER S3", "KS DIAPER S4", "KS DIAPER S5", "KS DIAPER S6", "MICHBLADE16", "MICHBLADE26"];
    for (const itemName of itemNamesWithNumbers) {
      if (line.includes(itemName)) {
        return line.replace(itemName, `${ itemName } `);
      }
    }

    return line;
  }
  
  #formatAmount(amount) {
    // check if last char is a `-`, this means it's negative (refund)
    if (amount.slice(-1) === "-") {
      return this.numberUtils.dollarToNumber(amount.slice(0, -1), true);
    }

    return this.numberUtils.dollarToNumber(amount);
  }
  
  #find(line, str) {
    const index = line.indexOf(str);
    if (index > -1) {
      return line.substring(index + str.length);
    }

    return undefined;
  }
}

module.exports = { CostcoReceiptParser };