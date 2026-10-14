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
each day from the count: stock = max(0, stock + what arrives that day − forecast that day)
at each delivery:       order = forecast(days until the next delivery) + safety stock
                                − stock − distro on that truck
                                → rounded UP to the item's crate size, shown in units
```

The count is before 10am and deliveries arrive during the day. "What arrives" covers deliveries
ordered on an earlier day that land before this order's delivery: Friday's own delivery
(ordered Thursday) arrives after the Friday count, before Saturday. For those it uses the quantity
marked as ordered, else a hand edit, else that order's own suggestion. Distros count too.

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

### Promos (`src/lib/promos.ts`)

Flyer weeks run **Thursday to Wednesday**. On the **Promos** page, tick the items in a week's flyer.
Their forecast on those days is raised by the promo lift: a number you type for that item, else what
that item sold on its past promos, else the average across all past promos, else a starting
guess of +50%. Lifts are learned from flyer weeks that are ticked here *and* have sales uploaded.
Promo days are kept out of normal-day averages, like holidays.

**Distros**: promo stock the warehouse sends for an ad without an order, a set amount on each
delivery (usually starting with the Wednesday delivery, then Friday and Saturday). On the Promos
page, each promo item has a box per delivery from the Wednesday before the ad through the ad week;
each amount is taken off the suggested order for that delivery.

### Learning from previous orders (`src/lib/trend.ts`)

**Mark as ordered** (Order page, or at the end of scan mode) freezes what was actually ordered.
Between two counts, what left the cooler is `earlier count + deliveries in between − later count`
(the morning count comes before that day's delivery). Compared with the forecast for those days,
that shows whether an item is selling faster or slower than the sales history says, and it
counts spoilage too, since that stock also has to be re-ordered. Over the last 6 such stretches (each
up to 4 days long, with every delivery in between marked as ordered), the ratio is capped to
0.6–1.6 and pulled toward 1 when there are few stretches; the item's forecasts are multiplied by it.

Each order row also shows what was ordered last time for a delivery on the same weekday.

## Screens

- **Count** (phone): one-item-at-a-time view with a progress bar, crates and units fields with −/+,
  and a No stock button; or a list view. Sort by walk order / size / brand, filter by brand
  (Lactantia, Béatrice) and size. Saves as you go.
- **Order** (computer): each delivery with counted / forecast / suggested / final quantity. Edits
  are saved; the reset icon returns a line to the suggestion.
- **Print**: order sheet grouped by size with a barcode and quantity per item. Choose whether the
  barcode is the UPC or the vendor code.
- **Promos**: pick a flyer week, tick the items on promo, optionally set a lift per item.
- **Calendar**: delivery days for the next 3 weeks (add / remove / change order day), Ontario
  holidays (open/closed, milk and cream boosts and where each number came from), special events.
- **Sales**: upload BDMS "Item Sales by Vendor 7 Days" reports (PDF or Excel, many weeks at once), or any file with
  item name, Sun…Sat and a total. PDFs are read by column position because BDMS leaves days with
  no sales blank. UPC and vendor code are picked up from each line; items are matched by UPC, then
  vendor code, then name. The first upload creates the item list. Rows whose days don't add up to
  Unit Sold are highlighted.
- **Items**: walk order, brand (Lactantia / Béatrice / Selection / Other), size, crate size,
  safety stock, UPC, vendor code, active.

## Reading reports from photos

While the app can't be opened on the store computer, the Sales page can read the BDMS screens from
photos: the 7-day sales report and the Order Sheet by Vendor. Two ways:

**Claude app (free with a Claude plan, `src/lib/pasted-report.ts`).** Tap *Copy instructions*,
start a new chat in the Claude app, attach the photos, paste the instructions and send. Claude
replies with the rows as JSON; copy the reply, paste it back into Milk Order and tap *Use this
data*. The whole reply can be pasted — the app finds the data in it. From there it's the same
preview (rows that don't add up are highlighted) and the same Order Sheet item list as below.

**Automatic (`api/read-report.ts`, needs an API key, billed per photo).** Photos are taken with the camera
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
