class NumberUtils {
  constructor() { }

  // See https://stackoverflow.com/a/27083270
  roundToTenth(num) {
    return Math.round(num * 100) / 100;
  }

  dollarToNumber(num, isNegative = false) {
    const amount = this.#parseDollar(num);
    return isNegative ? -amount : amount;
  }

  #parseDollar(amount) {
    const formattedAmount = amount
      .trim()
      .replace("$", "")
      // TODO: Is this second trim needed?
      .trim()
      .replace(",", "");
    return Number(formattedAmount);
  }
}

module.exports = { NumberUtils };