class RegexUtils {
  constructor() { }

  matchAll(line, regex) {
    // See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/matchAll
    // `found` has the matched text and one item for each capture group as the first item.
    const found = [...line.matchAll(new RegExp(regex, "g"))];
    return found.length ? found[0] : [];
  }

  date() {
    // date and month can have one or two digits
    // optional, non-capturing group for year
    return "[0-9]{1,2}/[0-9]{1,2}" + "(?:/[0-9]{4})?";
  }

  dollar() {
    // Parts:
    //   1. optional negative sign
    //   2. optional non-capturing group for dollar sign
    //   3. the dollar amount
    //   4. optional negative sign
    return `(-?(?:\\$ ?)?${this.#dollarCore()}-?)`;
  }

  #dollarCore() {
    // Three parts:
    //   1. optional non-capturing group for thousands (i.e., 100 in 100,000)
    //   2. optional number from 1-9 for hundreds place (i.e., 4 in 475)
    //   3. the rest of the dollar and cents, i.e., 4.32 or 97.45
    //
    // This is a bit wonky but it yielded the best results on the receipts
    // as item identifiers sometimes contain numbers which can make this
    // parsing tricky.
    return "(?:[1-9][0-9]{1,2},)?" + "[1-9]?" + "[0-9]{1,2}\\.[0-9]{2}";
  }

  anything() {
    return ".+";
  }

  nonGreedyAnything() {
    return `${ this.anything() }?`;
  }
}

module.exports = { RegexUtils };