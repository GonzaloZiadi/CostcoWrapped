class RegexUtils {
  constructor() { }

  matchAll(line, regex) {
    // See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/matchAll
    // `found` has the matched text as the first item, and then one item for each capture group of the matched text.
    const found = [...line.matchAll(new RegExp(regex, "g"))];
    return found.length ? found[0] : [];
  }

  date() {
    // date and month can have one or two digits
    // optional, non-capturing group for year
    return "[0-9]{1,2}/[0-9]{1,2}" + "(?:/[0-9]{4})?";
  }

  dollar() {
    // optional, non-capturing group for dollar sign
    return "-?" + "(?:\\$ ?)?" + this.#dollarCore();
  }

  #dollarCore() {
    // 
    return "(?:[1-9][0-9]{1,2},)?[1-9]?[0-9]{1,2}\\.[0-9]{2}";
  }

  anything() {
    return ".+";
  }

  nonGreedyAnything() {
    return `${ this.anything() }?`;
  }
}

module.exports = { RegexUtils };