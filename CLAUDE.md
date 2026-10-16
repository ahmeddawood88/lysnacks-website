# CLAUDE.md — L&Y Snacks Website

This file is read by Claude Code at the start of every session. Keep it current.
Anything marked `TODO` still needs Ahmed's input — ask before inventing it.

## Project overview

Marketing website for **L&Y Snacks LLC** (Sacramento, CA), a consumer food brand that
distributes Middle Eastern pantry staples to Middle Eastern, Arab, and halal grocery
stores across California.

Goals of the site, in priority order:
1. Make the brand look established and trustworthy to **store owners / buyers** (wholesale).
2. Help **shoppers** find the products and the stores that carry them.
3. Collect inquiries through the contact form.

## Pages (v1 scope — do not add more without asking)

| Route        | Page         | Purpose |
|--------------|--------------|---------|
| `/`          | Homepage     | Hero, short brand story, featured products, "Where to buy" strip, wholesale call to action |
| `/products`  | Our Products | Product grid grouped by brand line (L&Y pantry, Ramla coffee) |
| `/about`     | About Us     | Brand story, sourcing/quality, mission |
| `/customers` | Our Customers | Stores that carry L&Y/Ramla, grouped by city, each with a map link |
| `/contact`   | Contact Us   | Contact form (wholesale + general), email, Instagram, service area |

Shared header (logo + nav) and footer (nav, Instagram, copyright) on every page.

## Brand facts (source of truth — do not contradict)

- Company: L&Y Snacks LLC, Sacramento, California
- **L&Y** is the brand for pantry staples: tahini, za'atar, pomegranate molasses,
  rose water, pickled vegetables, olives, and more.
- **Ramla** is L&Y's coffee sub-brand. Spelled exactly "Ramla" (never "Rambla").
  - Products: Turkish Coffee, Instant Saudi Coffee, Karak Chai, Arabic Coffee
  - Packed in Amman, Jordan
  - Product color family: Arabic Coffee = sadu red, Karak Chai = yellow,
    Turkish Coffee = maroon (matches the tin), Saudi Coffee = deep green
  - Signature line: "صباحكم رملة ☕"
- Instagram: @lny_snacks (https://instagram.com/lny_snacks)
- Stores carrying the products are in: El Cajon, Temecula, Murrieta, Corona,
  Moreno Valley, Riverside. Full store list lives in `src/data/customers.json`
  (TODO: store names and addresses from Ahmed).
- TODO: contact email, phone (optional), domain name, founding story for About page

Never invent facts (founding year, certifications such as halal/organic, awards,
nutrition info, prices, testimonials). Use a clearly marked placeholder instead.

## Design direction

- Warm, premium, rooted in Middle Eastern heritage — not generic "startup" style.
- Visual motifs: Islamic geometric / arabesque patterns used subtly (backgrounds,
  dividers), not as clutter.
- Palette follows the real labels: cream/sand base, **L&Y green `#2B4333`** as the
  primary brand color, **logo gold `#D89A1E`** for decoration, Ramla maroon `#6E2430`
  for Ramla/Turkish Coffee. All values live in `src/styles/tokens.css` (sampled from the
  logo and labels; confirm against print files if available).
  Gold fails contrast on cream: never use it for text on light backgrounds.
- Typography: **Fraunces** (headings), **Source Sans 3** (body), **IBM Plex Sans Arabic**
  (Arabic), self-hosted via `@fontsource`. Arabic text must render right-to-left
  (`lang="ar" dir="rtl"` on Arabic spans).
- Product photos are shown as cut-outs (transparent background) on cream/sand.
  Photos still on a black background are not shown; the card uses the branded
  placeholder instead.
- Real product photography is the hero of every page. Until photos exist, use
  neutral placeholders in `public/images/placeholder/` — never stock photos of
  other brands' products.
- Mobile-first. Most visitors will come from Instagram on a phone.

## Tech stack

- **Astro** (static output), plain CSS with CSS custom properties for design tokens
  (`src/styles/tokens.css`). No Tailwind unless Ahmed asks.
- No JavaScript framework unless a component truly needs interactivity.
- Product data lives in **one file**: `src/data/products.json` — pages render from it.
  Adding a product should never require editing page markup.
- Customer (store) data lives in `src/data/customers.json`: one entry per store with
  `name`, `city`, `address`, optional `phone`, optional `website`, and `carries`
  (`"L&Y"`, `"Ramla"`, or both). The `/customers` page groups stores by city
  (alphabetical) and links each address to Google Maps with a plain
  `https://www.google.com/maps/search/?api=1&query=...` URL — no Maps API key, no embed.
  Adding a store should only mean adding one entry to this file.
- Contact form: **Netlify Forms** (`data-netlify="true"`, honeypot field for spam).
- Hosting: **Netlify**, auto-deploys from the `main` branch on GitHub.
- Images: use Astro's `<Image />` component; WebP/AVIF; always set width/height and alt text.

## Product images

- Product photos go in `src/assets/products/` (not `public/`) so Astro can optimize them.
- File name = the product's `slug` in products.json, e.g. `ramla-arabic-coffee.jpg`.
  Extra angles use a suffix: `ramla-arabic-coffee-2.jpg`.
- Load them with `import.meta.glob('/src/assets/products/*.{jpg,jpeg,png,webp}')` and
  match by slug, so dropping a correctly named file in the folder is all it takes.
- If a product has no photo yet, show a branded placeholder (never a broken image).
- Alt text format: "<Brand> <Product name> package", e.g.
  "Ramla Arabic Coffee package".
- **Product sizes are not shown anywhere on the site** (Ahmed's decision, Oct 2026).
- Soft/Fine and Coarse Yellow Burgul share one bag photo (`image` field in products.json).
- Not on the site: Olive Oil and Rio House Salep.
- Originals may be large phone photos; Astro resizes them at build time. Do not
  commit files over ~5 MB — resize first if needed.
- Logo, favicon, and Open Graph image stay in `public/images/`.

## Project structure

```
src/
  components/   Header.astro, Footer.astro, ProductCard.astro, Hero.astro, ...
  layouts/      BaseLayout.astro (head, SEO meta, header, footer)
  pages/        index.astro, products.astro, customers.astro, about.astro,
                contact.astro, 404.astro
  data/         products.json, customers.json
  assets/
    products/   product photos, named by slug
  styles/       tokens.css, global.css
public/
  images/       logo, favicon, Open Graph image
```

## Quality bar (check before saying a task is done)

- `npm run build` succeeds with no errors or warnings.
- Every page: unique `<title>` and meta description, Open Graph tags, one `<h1>`.
- Accessibility: alt text on every image, visible focus states, color contrast AA,
  form fields have labels.
- Looks right at 375px, 768px, and 1280px widths.
- Lighthouse target: 90+ on Performance, Accessibility, Best Practices, SEO.
- No broken links; 404 page exists.

## Commands

- `npm run dev` — local preview at http://localhost:4321
- `npm run build` — production build into `dist/`
- `npm run preview` — preview the production build

## Git workflow

- Commit after each completed, working step with a clear message
  (e.g. "Add products page rendering from products.json").
- Work on `main` for v1; Netlify deploys every push to `main`.
- Never commit secrets, `.env` files, `node_modules/`, or `dist/`.
- Ask before force-pushing, deleting branches, or rewriting history.

## Working style

- Before building a page, describe the layout in a few bullets and wait for approval.
- Keep changes small and reviewable; one page or component per step.
- When something needs a decision from Ahmed (copy, photos, colors), stop and ask
  rather than guessing.
