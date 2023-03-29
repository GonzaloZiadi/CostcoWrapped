# Costco Wrapped
A script to parse your Costco receipts (PDFs) and create a CSV with all the items you bought.

See the [post on my blog](https://www.pathtosimple.com/is-costco-membership-worth-it) that inspired this.

If there's interest, I'll continue to work on this. The final goal would be to have a Costco version
of [Spotify Wrapped](https://en.wikipedia.org/wiki/Spotify_Wrapped).

## How to use
1. Download your [PDF receipts from Costco](https://www.pathtosimple.com/is-costco-membership-worth-it#user-content-fn-6).
1. Save them all in a folder called `costco-receipt-pdfs`.
1. Place the folder in the same directory as `index.js`.
1. Run `npm run start` or `node index.js`.
1. Take the ouputted CSV (`out/costco-receipts.csv`) and import it into Excel or Google Sheets and play around with it. See [my spreadsheet](https://docs.google.com/spreadsheets/d/1-fEhdeW133pcMtVP45fVvNoQeYeG_6Dw4gPUHJxiQ6E/edit?usp=sharing) if you're looking for inspiration.

## How it works
`index.js` is the entry point. See that file for an explanation of how it works.

There are helper classes within the `src` directory.

The most important of these is `CostcoReceiptParser`. This is the file that handles parsing
the Costco receipt PDF. It's fed each line of the PDF and returns all of the transactions as well as metadata such as the date, total items sold, tax, etc.

This file is heavily commented to explain how it works.

The rest of the helper classes are fairly small and contain comments as well.