# Milk Order

Dairy count and order helper. Count the cooler on the phone before 10am, then review and print the
order on the computer and scan it into the ordering system. No sign-in.

Stack: React + Vite + TypeScript, Tailwind, Firebase Firestore (shared data + offline counting),
SheetJS (Excel), pdfjs (PDF), JsBarcode (order sheet barcodes), Vercel hosting.

## Order schedule

Regular deliveries, each ordered the morning before (Monday's on Friday):

| Order day (morning) | Delivery |
|---|---|
| Tuesday  | Wednesday |
| Thursday | Friday    |
| Friday   | Saturday and Monday |

Each delivery has to last until the next one arrives. On the **Calendar** page you can remove a
delivery, add one on another day, or change which day it's ordered (e.g. Thanksgiving week: no
Saturday delivery, a Sunday delivery ordered Friday). Regular deliveries on a closed holiday drop
off automatically.

## Order math (`src/lib/order-math.ts`, `src/lib/forecast.ts`)

```
stock at delivery = count − forecast(order day … day before delivery)   (count is before 10am)
order             = forecast(days until the next delivery) + safety stock − stock at delivery
                    → rounded UP to the item's crate size, shown in units
```

- **Normal-day forecast**: the same weekday from the nearest 8 uploaded weeks (within 16 weeks),
  nearer weeks weighted more. With 5+ weeks the highest and lowest are dropped. Holiday/event
  days, days the morning count showed no stock, and days not over when a report was pulled are
  left out.
- **Holidays** (`src/lib/holidays.ts`): Ontario holidays with dates worked out each year. Closed
  days (Retail Business Holidays Act by default; switchable per holiday) forecast 0. The days around
  each holiday get a % boost for milk and for cream. Boosts start as guesses; when past holiday
  weeks (with a few normal weeks around them) are uploaded, the boost actually seen is learned and
  used instead. A value typed on the Calendar page overrides both. Special events (promos etc.)
  can be added with their own boosts or as closed days.
- **Safety stock**: units that should still be in the cooler when the next truck arrives. Set per
  item on the Items page or straight from the Safety column on the Order page. Defaults to 0.
- **Two deliveries ordered the same day** (Friday's Saturday + Monday): the later one's stock is
  projected from the earlier one (stock then + what's being ordered − forecast in between). If the
  earlier quantity is edited by hand, the projection uses the edited number.

Uncounted items are treated as 0 on hand and flagged on the order screen.

## Screens

- **Count** (phone): one-item-at-a-time view with a progress bar, crates and units fields with −/+,
  and a No stock button; or a list view. Sort by walk order / size / brand, filter by brand
  (Lactantia, Béatrice) and size. Saves as you go.
- **Order** (computer): each delivery with counted / forecast / suggested / final quantity. Edits
  are saved; the reset icon returns a line to the suggestion.
- **Print**: order sheet grouped by size with a barcode and quantity per item. Choose whether the
  barcode is the UPC or the vendor code.
- **Calendar**: delivery days for the next 3 weeks (add / remove / change order day), Ontario
  holidays (open/closed, milk and cream boosts and where each number came from), special events.
- **Sales**: upload BDMS "Item Sales by Vendor 7 Days" reports (PDF or Excel, many weeks at once), or any file with
  item name, Sun…Sat and a total. PDFs are read by column position because BDMS leaves days with
  no sales blank. UPC and vendor code are picked up from each line; items are matched by UPC, then
  vendor code, then name. The first upload creates the item list. Rows whose days don't add up to
  Unit Sold are highlighted.
- **Items**: walk order, brand (Lactantia / Béatrice / Selection / Other), size, crate size,
  safety stock, UPC, vendor code, active.

## Reading reports from photos (`api/read-report.ts`)

While the app can't be opened on the store computer, the Sales page can read the BDMS screens from
photos: the 7-day sales report and the Order Sheet by Vendor. Photos are taken with the camera
inside the app (they aren't saved to the phone's gallery) or chosen from the phone. Each photo is
shrunk to 2576 px on the long side and sent to a Vercel function that asks Claude
(`claude-opus-5-5`, structured JSON output) to transcribe the rows, putting each number under its
day column because BDMS leaves zero days blank. Sales rows go into the usual preview, where they can
be checked and saved. Order Sheet items can be added to the item list; yogurt, milkshakes and
discontinued lines are unticked by default.

Vercel environment variables:

- `ANTHROPIC_API_KEY`: required for photo reading (from console.anthropic.com).
- `PHOTO_PIN`: optional, but recommended. With it set, the app asks for this PIN once per device
  before reading photos, so someone else with the link can't spend API credit.

## Scan mode (phone)

Order page → **Scan on phone** shows one order line at a time: the item's barcode (UPC or vendor
code) across the full width of the screen and the quantity in large type, optionally also as a
barcode. The screen stays on while it's open. Use Back/Next to step through the lines.

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
