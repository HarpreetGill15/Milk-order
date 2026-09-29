# Milk Order

Dairy count and order helper. Count the cooler on the phone before 10am, then review and print the
order on the computer and scan it into the ordering system. No sign-in.

Stack: React + Vite + TypeScript, Tailwind, Firebase Firestore (shared data + offline counting),
SheetJS (Excel), pdfjs (PDF), JsBarcode (order sheet barcodes), Vercel hosting.

## Order schedule

| Order day (morning) | Delivery | Delivery covers |
|---|---|---|
| Tuesday  | Wednesday | Wed + Thu |
| Thursday | Friday    | Fri |
| Friday   | Saturday  | Sat + Sun |
| Friday   | Monday    | Mon + Tue |

## Order math (`src/lib/order-math.ts`)

```
stock at delivery = count − forecast(order day)          (count is before 10am)
order             = forecast(days covered) + safety stock − stock at delivery
                    → rounded UP to the item's crate size, shown in units
```

- **Forecast**: average units sold on that weekday over the latest 4 uploaded weeks. Days that
  weren't over yet when a report was uploaded (a mid-week report) are left out.
- **Safety stock**: units that should still be in the cooler when the next truck arrives. Set per
  item on the Items page or straight from the Safety column on the Order page. Defaults to 0.
- **Crate sizes** (order steps): 2L = 9, 1L = 16, creams = 16, 4L bags = 4 — detected from the item
  name and editable per item.
- **Friday's Monday order** has no count to work from: stock at Monday is projected as
  `stock at Sat + Saturday order − forecast(Sat + Sun)`. If the Saturday quantity is edited by hand,
  the Monday projection uses the edited number.

Uncounted items are treated as 0 on hand and flagged on the order screen.

## Screens

- **Count** (phone): one-item-at-a-time view with a progress bar, crates and units fields with −/+,
  and a No stock button; or a list view. Sort by walk order / size / brand, filter by brand
  (Lactantia, Béatrice) and size. Saves as you go.
- **Order** (computer): each delivery with counted / forecast / suggested / final quantity. Edits
  are saved; the reset icon returns a line to the suggestion.
- **Print**: order sheet grouped by size with a barcode and quantity per item. Choose whether the
  barcode is the UPC or the vendor code.
- **Sales**: upload the BDMS "Item Sales by Vendor 7 Days" report (PDF or Excel), or any file with
  item name, Sun…Sat and a total. PDFs are read by column position because BDMS leaves days with
  no sales blank. UPC and vendor code are picked up from each line; items are matched by UPC, then
  vendor code, then name. The first upload creates the item list. Rows whose days don't add up to
  Unit Sold are highlighted.
- **Items**: walk order, brand (Lactantia / Béatrice / Selection / Other), size, crate size,
  safety stock, UPC, vendor code, active.

## Setup

```
npm install
cp .env.example .env.local   # Firebase web config — optional for a single-device trial
npm run dev
npm test
```

Without Firebase config the app saves to the browser only (a banner says so), which is fine for
trying it out but won't sync the phone and the computer.

### Firebase (shared data)

1. Create a new project at https://console.firebase.google.com (separate from FreshTrack).
2. Build → Firestore Database → Create database (production mode).
3. Project settings → Your apps → add a Web app, copy the config into `.env.local` (and into the
   Vercel project's Environment Variables).
4. Deploy the rules: `npx firebase-tools deploy --only firestore:rules --project <project-id>`.

### Vercel

Import the repo in Vercel (framework: Vite), add the `VITE_FIREBASE_*` variables, deploy. On the
phone, open the site and "Add to Home Screen".
