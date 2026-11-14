# Guide photos: how to add one

The guide shows an item's photo (`heroImage`) on its card and detail page, and uses it as the social
preview (`og:image`) and in the structured data. Since 2026-10-21 a third-party photo can only be
published together with its licence: the build (`scripts/validate-content.ts`, strict mode of
`src/lib/data.ts`) fails for a `heroImage` without a `heroImageCredit`, and the detail page prints the
credit under the photo, which CC BY and CC BY-SA require.

The earlier museum, police, fire-department, hospital and taxi pictures were removed because their
source and licence were not recorded (two showed a Google Street View watermark). These items therefore
show the illustrated tile until a photo with a recorded right is added:

- phones: `police`, `fire-department`, `kalamata-hospital`, `taxi`
- moments: `viktoria-karelia-museum`, `historical-folklore-museum`, `archaeological-museum-messinia`,
  `war-museum-kalamata`, `railway-park-kalamata`

The other moments never had a photo. `public/moments/*.jpg` (the `image` field) and
`public/phones/sos-hero.webp` are illustrations made for this site and need no credit.

## What may be used

| Source | Allowed | What to record |
| --- | --- | --- |
| Your own photo (you or a family member took it) | yes | author: your name, license: `Own photo` |
| Wikimedia Commons, **CC0** / **Public domain** | yes | author as shown, license as shown, the Commons file page as `sourceUrl` |
| Wikimedia Commons, **CC BY** / **CC BY-SA** (any version) | yes, the credit is printed under the photo | author, exact licence name, file page, `licenseUrl` |
| Photo of a museum or monument from its own website | only with a written permission from the owner of the picture | author, `Used with permission`, the e-mail or page that grants it |
| Google Maps / Street View, screenshots, search-engine images, Booking.com or other websites | **never** | |
| **NC** (non-commercial), **ND** (no derivatives), "editorial use only", "all rights reserved" | **never** (the site is a business listing and the photo is resized and cropped) | |

Check the licence on the file page itself, not in a search result. Take care with photos of
recognisable people, with exhibits in museums that forbid photography, and with 20th-century works of
art: the photographer's licence does not cover the artist's rights. When in doubt, leave the tile.

## Steps

1. Find or take the photo. Commons leads that came up in the review and that nobody has verified (the
   review environment could not open Commons): the files `Kalamata_Municipal_Railway_Park_2.jpg`,
   `Kalamata_Municipal_Railway_Park_5.jpg` and `Kalamata_railstation.JPG`, and the category
   `Military_museum_of_Kalamata`. Read the licence and the author on each file page before using one.
   For the police station, fire station, hospital and taxi a photo of your own is the simplest way.
2. Prepare it (sharp is already a dependency of this repository). This rotates by the EXIF orientation,
   scales to 1600 px wide and **drops all metadata** (GPS, camera, owner), which the image gate expects:

   ```sh
   node -e "require('sharp')('original.jpg').rotate().resize({width:1600,withoutEnlargement:true}).jpeg({quality:78,mozjpeg:true}).toFile('public/moments/<item-id>-hero.jpg')"
   ```

   Keep the file under 512 KB (`npm run check:image-assets` enforces it; the guide target is 120 KB).
   Use `public/moments/` for moments and `public/phones/` for phones, named `<item-id>-hero.jpg`.
3. Add three fields to the item in `src/data/items/moments.json` or `phones.json`:

   ```json
   "heroImage": "/moments/railway-park-kalamata-hero.jpg",
   "heroImagePosition": "50% 40%",
   "heroImageCredit": {
     "author": "Name as shown on the source page",
     "license": "CC BY-SA 4.0",
     "sourceUrl": "https://commons.wikimedia.org/wiki/File:<exact file name>",
     "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
   }
   ```

   `heroImagePosition` is an optional CSS `object-position` that keeps the subject in the crop. For
   your own photo use `"license": "Own photo"` and your page or name as `sourceUrl` (any https page
   that identifies you, for example the site itself); `licenseUrl` is optional.
4. Run `npm run build` (the content gate must pass), open the item in `/en` and `/el`, and check that
   the credit line appears under the photo and that the picture is sharp and shows the right place.
5. Keep a copy of the original and of the licence page (a PDF or a screenshot) outside the repository.
   If an author later asks for removal, deleting the file and the three fields is the whole fix.

Do not add a photo without the credit to get the build green: the gate exists so that no picture can
be shown without a recorded right.
