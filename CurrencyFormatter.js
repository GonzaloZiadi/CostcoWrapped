class CurrencyFormatter {
  constructor() { }

  toNumber(num, isNegative = false) {
    const amount = this.#dollarToNumber(num);
    return isNegative ? -amount : amount;
  }

  #dollarToNumber(amount) {
    const formattedAmount = amount
      .trim()
      .replace("$", "")
      // TODO: Is this second trim needed?
      .trim()
      .replace(",", "");
    return Number(formattedAmount);
  }
}

module.exports = { CurrencyFormatter };