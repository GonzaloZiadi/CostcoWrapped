class NumberUtils {
  constructor() { }

  numberToDollar(num) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(num);
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