const RegexUtils = require("./RegexUtils").RegexUtils;
const CurrencyFormatter = require("./CurrencyFormatter").CurrencyFormatter;

class CostcoReceiptParser {
  constructor() {
    this.regexUtils = new RegexUtils();
    this.currencyFormatter = new CurrencyFormatter();

    this.multilineMode = false;
    this.multilineModeCurrentItemName = undefined;
    this.multilineModeCurrentItemIdentifier = undefined;

    this.storeLines = [];
    this.hasRemainingTransactions = true;
    this.date = undefined;
    this.subtotalAmount = 0;
    this.tax = 0;
    this.totalItemsSoldOnReceipt = 0;
    this.totalItemsSoldCalculated = 0;

    this.itemNameByItemIdentifier = {};
    this.itemIdentifierByItemName = {};
    this.itemIdentifierByDiscountIdentifier = {};
  }

  parseLine(line) {
    // The first 3 lines of the receipt are the store identifier, street address, and city/state/zip
    if(this.storeLines.length < 3) {
      this.storeLines.push(line);
      return;
    }

    // When there are no remaining transactions, grab metadata such as the receipt data and 
    // total items sold.
    if (!this.hasRemainingTransactions) {
      this.#getReceiptMetadata(line);
      return;
    }

    const subtotal = this.#find(line, "SUBTOTAL");
    if (subtotal) {
      this.subtotalAmount = this.#formatAmount(subtotal);
      return;
    }

    const tax = this.#find(line, "TAX");
    if (tax) {
      this.tax = this.#formatAmount(tax);
      return {
        itemIdentifier: "TAX",
        itemName: "TAX",
        amount: this.tax
      };
    }
  
    const total = this.#find(line, "****TOTAL");
    if (total) {
      this.hasRemainingTransactions = false;
      return;
    }

    const multilineTransaction = this.#parseMultilineTransaction(line);
    if (multilineTransaction) {
      return multilineTransaction;
    }
  
    return this.#parseTransaction(line);
  }

  setMultilineMode(val) {
    this.multilineMode = val;
  }
  
  isInMultilineMode() {
    return this.multilineMode;
  }

  itemsSoldCheck() {
    const checkPasses = this.totalItemsSoldCalculated === this.totalItemsSoldOnReceipt;
    if (!checkPasses) {
      console.log(`Items sold check failed for ${ this.getDate() }. Calculated ${ this.totalItemsSoldCalculated } does not equal receipt ${ this.totalItemsSoldOnReceipt }.`);
    }
    return checkPasses;
  }

  getTotalSpent() {
    return this.subtotalAmount + this.tax;
  }

  getDate() {
    return this.date;
  }

  getStore() {
    const splitOnComma = this.storeLines[2].split(",");
    return {
      store: this.storeLines[0],
      street: this.storeLines[1],
      city: splitOnComma[0],
      zipCode: splitOnComma[1].slice(-5),
      state: splitOnComma[1].slice(0, 2),
    };
  }

  #getReceiptMetadata(line) {
    const dateRegex = `(${ this.regexUtils.date() }) ${ this.regexUtils.anything() }`;
    const foundDate = this.regexUtils.matchAll(line, dateRegex);
    if (foundDate.length) {
      this.date = foundDate[1];
      return;
    }

    const totalItemsSold = this.#find(line, "TOTAL NUMBER OF ITEMS SOLD =");
    if (totalItemsSold) {
      this.totalItemsSoldOnReceipt = Number(totalItemsSold);
      return;
    }
  }

  #parseMultilineTransaction(line) {
    // Line starts with a number and doesn't have a dot. This means it's the
    // first line of a multiline entry.
    const firstCharIsNumber = !isNaN(line.charAt(0));
    if (firstCharIsNumber && !line.includes(".")) {
      this.multilineMode = true;

      const itemIdentifier = line.replace(/[A-Z]/g, '');
      this.multilineModeCurrentItemIdentifier = itemIdentifier;

      const itemName = `${ line.replace(/[0-9]/g, '') } `;
      this.multilineModeCurrentItemName = itemName;

      // Remove all letters for the item identifier, all numbers for the item name.
      return {
        itemIdentifier: itemIdentifier,
        itemName: itemName,
      };
    }

    const lineHasNumber = /\d/.test(line);
    // We're in a multiline entry and the line has no number. This means it's part of the
    // item's name.
    if (this.multilineMode && !lineHasNumber) {
      this.multilineModeCurrentItemName += line;
      return {
        itemName: line,
      };
    }

    // We're in a multiline entry and the line starts with a number. This means this line is
    // the price paid for the item.
    if (this.multilineMode && firstCharIsNumber) {
      const dollarRegex = `(${ this.regexUtils.dollar() }-?)${ this.regexUtils.anything() }`;
      const foundAmount = this.regexUtils.matchAll(line, dollarRegex);

      if (foundAmount.length) {
        const amount = this.#formatAmount(foundAmount[1]);
        const { itemName, itemIdentifier } = this.#determineItemNameAndIdentifier(
          amount, this.multilineModeCurrentItemName, this.multilineModeCurrentItemIdentifier
        );

        return {
          itemName: itemName,
          itemIdentifier: itemIdentifier,
          amount: amount
        };
      }
    }
  }
  
  #parseTransaction(line) {
    const transactionRegex = `([0-9]+)(${ this.regexUtils.nonGreedyAnything() })(${ this.regexUtils.dollar() }-?)`;
    const foundTransaction = this.regexUtils.matchAll(line, transactionRegex);
  
    if (foundTransaction.length) {
      const amount = this.#formatAmount(foundTransaction[3]);
      const { itemName, itemIdentifier } = this.#determineItemNameAndIdentifier(
        amount, foundTransaction[2], foundTransaction[1]
      );

      return {
        itemIdentifier: itemIdentifier,
        itemName: itemName,
        amount: amount
      }
    }
  
    return undefined;
  }

  #determineItemNameAndIdentifier(amount, itemName, itemIdentifier) {
    // This is a normal bought item.
    if (amount > 0) {
      this.itemNameByItemIdentifier[itemIdentifier] = itemName;
      this.itemIdentifierByItemName[itemName] = itemIdentifier;
      this.totalItemsSoldCalculated++;

      return {
        itemName: itemName,
        itemIdentifier: itemIdentifier
      };
    }

    // Amount is less than zero. We're dealing with a discount or a return.

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
      this.itemIdentifierByDiscountIdentifier[itemIdentifier] = itemIdentifierForItemName;
      return {
        itemName: itemName,
        itemIdentifier: `D-${ itemIdentifierForItemName }`
      };
    }

    // This is a discount going by another name than the bought product.
    // Let's find the bought item identifier for this discount item identifier.
    // Then let's use the bought item identifier to get the item's correct name.
    //
    // Example:
    //   1204135 ORG FIRM TO 6.49 (bought item)
    //   294721 ORG FIRM TO 2.00- (discount for bought item; different identifier but same name)
    //   294721 /0 2.00- (discount for bought item under a different name)
    //
    //   Use ORG FIRM TO as the name and D-1204135 as the item identifier
    const itemIdentifierForDiscount = this.itemIdentifierByDiscountIdentifier[itemIdentifier];
    if (itemIdentifierForDiscount) {
      return {
        itemName: this.itemNameByItemIdentifier[itemIdentifierForDiscount],
        itemIdentifier: `D-${ itemIdentifierForDiscount }`
      };
    }

    // This is a return so reduce the amount sold by one.
    this.totalItemsSoldCalculated--;
    return {
      itemName: itemName,
      itemIdentifier: `R-${ itemIdentifier }`
    };
  }
  
  #formatAmount(amount) {
    // check if last char is a `-`, this means it's negative (refund)
    if (amount.slice(-1) === "-") {
      return this.currencyFormatter.toNumber(amount.slice(0, -1), true);
    } else {
      return this.currencyFormatter.toNumber(amount);
    }
  }
  
  #find(line, str) {
    const indexOfSubtotal = line.indexOf(str);
    if (indexOfSubtotal > -1) {
      return line.substring(indexOfSubtotal + str.length);
    }
    return undefined;
  }
}

module.exports = { CostcoReceiptParser };