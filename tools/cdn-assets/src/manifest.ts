// Single source of truth for every static asset Pawjai serves from Bunny.
//
// Each entry says where the bytes come from (`from` = legacy CDN path,
// `file` = a file in this monorepo, or `placeholder`), where they go (`to`,
// under the storage zone), how they are sized (`size`), and which exported
// constants point at them (`keys`). `codegen.ts` turns `keys` into the
// generated constants files in pawjai-fe, pawjai-public and
// pawjai-react-native, so call sites keep their existing names.
//
// Redrawn art for an existing asset: drop a file at
// `source/<to without extension>.<png|webp|jpg|svg>` and rerun build + upload.
// Because browsers cache static/ for ~296 days, prefer a new filename for a
// visible redraw (change `to`, run codegen, deploy) over overwriting a path.
// Art for a placeholder: remove `placeholder`, give it a `from`/`file` or a
// source/ file at its real static/records path, then codegen + the be
// icon migration move every reference to the new URL.

export const CDN_BASE_URL = "https://pawjai.b-cdn.net";
export const CDN_HOST = "pawjai.b-cdn.net";

export type SizeClass =
  | "icon" // record + UI icons shown at <=96pt
  | "iconLg" // icons/illustrations that may render larger (cards, chat avatar)
  | "avatar" // default pet avatars
  | "art" // illustrations
  | "cover" // blog covers
  | "small" // already small marketing art; re-encode only
  | "svgRaster" // raster-in-SVG wrappers, rendered to WebP at 3x
  | "banner" // tall mobile banners
  | "bannerWide" // wide desktop banners
  | "logo"
  | "copy"; // byte-for-byte (true SVG, webm)

export interface Asset {
  to: string;
  size: SizeClass;
  from?: string;
  file?: string;
  placeholder?: true;
  keys?: string[];
  /** Extra storage paths that get the same output bytes (legacy 404 fixes). */
  alsoAt?: string[];
}

/** Keys that resolve to another key's URL instead of their own file. */
export const ALIASES: Record<string, string> = {
  "PET_ICONS.other": "PET_ICONS.dog",
  "BLOG_IMAGES.defaultCover": "BLOG_IMAGES.sickDog",
};

const L = "WebAssets/Lookups";
const IC = "WebAssets/Common/icons";

// Record icons are keyed by catalog concept (pawjai-be src/db/concepts) and,
// where the art differs by species, by species too. RECORD_ICONS keys match
// `<type>.<concept>[.<species>]` so the DB icon_url migration can map rows.
function record(
  type: "activity" | "symptom" | "medication" | "vet-visit",
  name: string,
  opts: { from?: string; keys: string[] } | { placeholder: true; keys: string[] },
): Asset {
  // Placeholders live under static/placeholders/ so real art arrives at a
  // NEW url: browsers cache these for ~296 days, so overwriting the same
  // path would leave devices on the placeholder long after the art ships.
  const dir = "placeholder" in opts ? "static/placeholders/records" : "static/records";
  return {
    to: `${dir}/${type}/${name}.webp`,
    size: "icon",
    ...("from" in opts && opts.from ? { from: opts.from } : {}),
    ...("placeholder" in opts ? { placeholder: true as const } : {}),
    keys: opts.keys,
  };
}

const ph = (keys: string[]) => ({ placeholder: true as const, keys });

export const ASSETS: Asset[] = [
  // brand
  { to: "static/brand/logo-text.webp", size: "logo", from: "WebAssets/branding/pawjai-logo-text.webp", keys: ["LOGOS.text"] },
  { to: "static/brand/logo-horizontal.webp", size: "logo", from: "WebAssets/branding/pawjai-logo-horizon.webp", keys: ["LOGOS.horizon"] },
  { to: "static/brand/logo-mark.webp", size: "logo", from: "WebAssets/branding/pawjai-logo-no-text.webp", keys: ["LOGOS.noText"] },
  { to: "static/brand/logo-amber.svg", size: "copy", from: "WebAssets/branding/pawjai-logo-amber.svg", keys: ["LOGOS.amber"] },
  { to: "static/brand/wordmark.svg", size: "copy", from: "WebAssets/branding/pawjai-wordmark.svg", keys: ["LOGOS.wordmark"] },
  { to: "static/brand/app-store-badge.webp", size: "small", from: "WebAssets/Landing/appstore-download.png", keys: ["ICONS.home.appleDownload"] },
  { to: "static/brand/social/youtube.svg", size: "copy", from: "WebAssets/Common/social/youtube.svg", keys: ["SOCIAL_ICONS.youtube"] },

  // pets
  ...(["mint", "sky", "lavender", "butter", "aqua", "lilac", "periwinkle", "sage"] as const).map(
    (c): Asset => ({
      to: `static/pets/default-avatars/paw-${c}.webp`,
      size: "avatar",
      from: `WebAssets/pet-avatar/default-paw-${c}.webp`,
      keys: [`DEFAULT_PET_AVATARS.${c}`],
    }),
  ),
  { to: "static/pets/species/dog.webp", size: "icon", from: "WebAssets/Pet-icons/brown-dog-icon.webp", keys: ["PET_ICONS.dog"] },
  { to: "static/pets/species/cat.webp", size: "icon", from: "WebAssets/Pet-icons/gray-cat-icon.webp", keys: ["PET_ICONS.cat"] },

  // record types (top level)
  { to: "static/records/types/activity.webp", size: "icon", from: `${L}/Main/activity.webp`, keys: ["LOOKUP_ICONS.main.activity"] },
  { to: "static/records/types/symptom.webp", size: "icon", from: `${L}/Main/symptom.webp`, keys: ["LOOKUP_ICONS.main.symptom"] },
  { to: "static/records/types/medication.webp", size: "icon", from: `${L}/Main/medication.webp`, keys: ["LOOKUP_ICONS.main.medication"] },
  { to: "static/records/types/vet-visit.webp", size: "icon", from: `${L}/Main/vet-visit.webp`, keys: ["LOOKUP_ICONS.main.vetVisit"] },

  // activity
  record("activity", "walk", { from: `${L}/Activity/dog-walk.webp`, keys: ["LOOKUP_ICONS.activity.dogWalk", "RECORD_ICONS.activity.walk"] }),
  record("activity", "feeding", { from: `${L}/Activity/food.webp`, keys: ["LOOKUP_ICONS.activity.food", "RECORD_ICONS.activity.feeding"] }),
  record("activity", "bowel-movement", { from: `${L}/Activity/poop.webp`, keys: ["LOOKUP_ICONS.activity.poop", "RECORD_ICONS.activity.bowel_movement"] }),
  record("activity", "urination", { from: `${L}/Activity/pee.webp`, keys: ["LOOKUP_ICONS.activity.pee", "RECORD_ICONS.activity.urination"] }),
  record("activity", "training", { from: `${L}/Activity/dog-train.webp`, keys: ["LOOKUP_ICONS.activity.dogTrain", "RECORD_ICONS.activity.training"] }),
  record("activity", "enrichment", { from: `${L}/Activity/enrichment.webp`, keys: ["LOOKUP_ICONS.activity.enrichment", "RECORD_ICONS.activity.enrichment"] }),
  record("activity", "socialization", { from: `${L}/Activity/socialize.webp`, keys: ["LOOKUP_ICONS.activity.socialize", "RECORD_ICONS.activity.socialization"] }),
  record("activity", "play", { from: `${L}/Activity/cat-play.webp`, keys: ["LOOKUP_ICONS.activity.catPlay", "RECORD_ICONS.activity.play"] }),
  record("activity", "play-dog", { from: `${L}/Activity/dog-play.webp`, keys: ["RECORD_ICONS.activity.play.dog"] }),
  record("activity", "grooming", { from: `${L}/Activity/grooming.webp`, keys: ["LOOKUP_ICONS.activity.grooming", "RECORD_ICONS.activity.grooming"] }),
  record("activity", "rest", { from: `${L}/Activity/dog-sleep.webp`, keys: ["RECORD_ICONS.activity.rest"] }),
  record("activity", "rest-cat", { from: `${L}/Activity/cat-sleep.webp`, keys: ["RECORD_ICONS.activity.rest.cat"] }),
  record("activity", "drinking", ph(["RECORD_ICONS.activity.drinking"])),
  record("activity", "scratching", { from: `${L}/Activity/cat-scratch.webp`, keys: ["RECORD_ICONS.activity.scratching"] }),
  record("activity", "bathing", ph(["RECORD_ICONS.activity.bathing"])),
  record("activity", "outing", ph(["RECORD_ICONS.activity.outing"])),
  record("activity", "other", ph(["RECORD_ICONS.activity.other"])),

  // symptom (species-specific art where it exists)
  record("symptom", "vomiting-dog", { from: `${L}/Symptom/dog-vomit.webp`, keys: ["LOOKUP_ICONS.symptom.dogVomit", "RECORD_ICONS.symptom.vomiting.dog"] }),
  record("symptom", "vomiting-cat", { from: `${L}/Symptom/cat-vomit.webp`, keys: ["LOOKUP_ICONS.symptom.catVomit", "RECORD_ICONS.symptom.vomiting.cat"] }),
  record("symptom", "diarrhea", { from: `${L}/Symptom/diahrrea.webp`, keys: ["LOOKUP_ICONS.symptom.diahrrea", "RECORD_ICONS.symptom.diarrhea"] }),
  record("symptom", "loss-of-appetite-dog", { from: `${L}/Symptom/dog-no-eat.webp`, keys: ["LOOKUP_ICONS.symptom.dogNoEat", "RECORD_ICONS.symptom.loss_of_appetite.dog"] }),
  record("symptom", "loss-of-appetite-cat", { from: `${L}/Symptom/cat-no-eat.webp`, keys: ["LOOKUP_ICONS.symptom.catNoEat", "RECORD_ICONS.symptom.loss_of_appetite.cat"] }),
  record("symptom", "coughing-sneezing-dog", { from: `${L}/Symptom/dog-sneeze.webp`, keys: ["LOOKUP_ICONS.symptom.dogSneeze", "RECORD_ICONS.symptom.coughing_sneezing.dog"] }),
  record("symptom", "coughing-cat", { from: `${L}/Symptom/cat-cough.webp`, keys: ["LOOKUP_ICONS.symptom.catCough", "RECORD_ICONS.symptom.coughing.cat"] }),
  record("symptom", "coughing-dog", { from: `${L}/Symptom/dog-cough.webp`, keys: ["RECORD_ICONS.symptom.coughing.dog"] }),
  record("symptom", "lethargy-dog", { from: `${L}/Symptom/dog-lethargy.webp`, keys: ["LOOKUP_ICONS.symptom.dogLethargy", "RECORD_ICONS.symptom.lethargy.dog"] }),
  record("symptom", "lethargy-cat", { from: `${L}/Symptom/cat-lethargy.webp`, keys: ["LOOKUP_ICONS.symptom.catLethargy", "RECORD_ICONS.symptom.lethargy.cat"] }),
  record("symptom", "excessive-scratching-dog", { from: `${L}/Symptom/dog-scratch.webp`, keys: ["LOOKUP_ICONS.symptom.dogScratch", "RECORD_ICONS.symptom.excessive_scratching_grooming.dog"] }),
  record("symptom", "excessive-scratching-cat", { from: `${L}/Symptom/cat-scratch.webp`, keys: ["LOOKUP_ICONS.symptom.catScratch", "RECORD_ICONS.symptom.excessive_scratching_grooming.cat"] }),
  record("symptom", "breathing-change", ph(["RECORD_ICONS.symptom.breathing_change"])),
  record("symptom", "skin-coat-issue", ph(["RECORD_ICONS.symptom.skin_coat_issue"])),
  record("symptom", "parasites-found", ph(["RECORD_ICONS.symptom.parasites_found"])),
  record("symptom", "limping", ph(["RECORD_ICONS.symptom.limping"])),
  record("symptom", "eye-issue", ph(["RECORD_ICONS.symptom.eye_issue"])),
  record("symptom", "ear-issue", ph(["RECORD_ICONS.symptom.ear_issue"])),
  record("symptom", "urinary-issue", ph(["RECORD_ICONS.symptom.urinary_issue"])),
  record("symptom", "lump-swelling", ph(["RECORD_ICONS.symptom.lump_swelling"])),
  record("symptom", "seizure", ph(["RECORD_ICONS.symptom.seizure"])),
  record("symptom", "other", ph(["RECORD_ICONS.symptom.other"])),

  // vet visit
  record("vet-visit", "vaccination", { from: `${L}/Vet-visit/vaccination.webp`, keys: ["LOOKUP_ICONS.vetVisit.vaccination", "RECORD_ICONS.vet_visit.vaccination"] }),
  record("vet-visit", "illness-injury", { from: `${L}/Vet-visit/injured.webp`, keys: ["LOOKUP_ICONS.vetVisit.injured", "RECORD_ICONS.vet_visit.illness_injury"] }),
  record("vet-visit", "follow-up", { from: `${L}/Vet-visit/follow-up.webp`, keys: ["LOOKUP_ICONS.vetVisit.followUp", "RECORD_ICONS.vet_visit.follow_up"] }),
  record("vet-visit", "diagnostic-tests", { from: `${L}/Vet-visit/diagosis.webp`, keys: ["LOOKUP_ICONS.vetVisit.diagnosis", "RECORD_ICONS.vet_visit.diagnostic_tests"] }),
  record("vet-visit", "surgery", { from: `${L}/Vet-visit/surgery.webp`, keys: ["LOOKUP_ICONS.vetVisit.surgery", "RECORD_ICONS.vet_visit.surgery"] }),
  record("vet-visit", "routine-checkup", { from: `${L}/Vet-visit/routine-checkup.webp`, keys: ["LOOKUP_ICONS.vetVisit.routineCheckup", "RECORD_ICONS.vet_visit.routine_checkup"] }),
  record("vet-visit", "dental", ph(["RECORD_ICONS.vet_visit.dental"])),
  record("vet-visit", "sterilization", ph(["RECORD_ICONS.vet_visit.sterilization"])),
  record("vet-visit", "other", ph(["RECORD_ICONS.vet_visit.other"])),

  // medication
  record("medication", "general", { from: `${L}/Medication/general-med.webp`, keys: ["LOOKUP_ICONS.medication.generalMed", "RECORD_ICONS.medication.general"] }),
  record("medication", "parasite-control", { from: `${L}/Medication/parasite-med.webp`, keys: ["LOOKUP_ICONS.medication.parasiteMed", "RECORD_ICONS.medication.parasite_control"] }),
  record("medication", "chronic-condition", { from: `${L}/Medication/chronic-med.webp`, keys: ["LOOKUP_ICONS.medication.chronicMed", "RECORD_ICONS.medication.chronic_condition"] }),
  {
    // The art was always at vitamin.webp; code and DB pointed at vitamins.webp
    // (404 until 2026-10-03). Write the art to that legacy path too.
    ...record("medication", "supplements-vitamins", { from: `${L}/Medication/vitamin.webp`, keys: ["LOOKUP_ICONS.medication.vitamins", "RECORD_ICONS.medication.supplements_vitamins"] }),
    alsoAt: [`${L}/Medication/vitamins.webp`],
  },
  record("medication", "home-treatment", ph(["RECORD_ICONS.medication.home_treatment"])),
  record("medication", "other", ph(["RECORD_ICONS.medication.other"])),

  // UI icons (<=96pt)
  ...(
    [
      ["clock", "clock", "ICONS.home.clock"],
      ["heart", "heart", "ICONS.home.heart"],
      ["paws", "paws", "ICONS.home.paws"],
      ["note", "note", "ICONS.home.note"],
      ["family", "family", "ICONS.home.family"],
      ["suitcase", "suitcase", "ICONS.home.suitcase"],
      ["handshake", "handshake", "ICONS.home.handshake"],
      ["hospital", "hospital", "ICONS.home.hospital"],
      ["lightbulb", "lightbulb", "ICONS.home.lightbulb"],
      ["weight", "weight", "ICONS.home.weight"],
      ["vet-2", "vet", "ICONS.home.vet"],
      ["helping-hand-2", "helping-hand", "ICONS.home.helpingHand"],
      ["leaf", "leaf", "ICONS.healthInsights.leaf"],
      ["hospital2", "hospital-cross", "ICONS.healthInsights.hospital2"],
      ["exclaim", "exclaim", "ICONS.healthInsights.exclaim"],
      ["heart-lock", "heart-lock", "ICONS.healthInsights.heartLock"],
      ["lock", "lock", "ICONS.healthInsights.lock"],
      ["magnify", "magnify", "ICONS.healthInsights.magnify"],
      ["male", "male", "ICONS.addPet.male"],
      ["female", "female", "ICONS.addPet.female"],
      ["unknown", "unknown", "ICONS.addPet.unknown"],
      ["check", "check", "ICONS.addPet.check"],
      ["cross", "cross", "ICONS.addPet.cross"],
    ] as const
  ).map(([legacy, name, key]): Asset => ({ to: `static/ui/icons/${name}.webp`, size: "icon", from: `${IC}/${legacy}.webp`, keys: [key] })),

  // larger cards / illustrations
  ...(
    [
      ["dog-profile-2", "icons/dog-profile", "ICONS.addPet.dogProfile"],
      ["cat-profile-2", "icons/cat-profile", "ICONS.addPet.catProfile"],
      ["cute-brain", "illustrations/cute-brain", "ICONS.home.cuteBrain"],
      ["thinker-dog", "illustrations/thinker-dog", "ICONS.home.thinkerDog"],
      ["employees-dogs", "illustrations/employees-dogs", "ICONS.home.employeesDogs"],
      ["roll-safe-husky", "illustrations/roll-safe-husky", "ICONS.home.rollSafeHusky"],
      ["thinking-cat", "illustrations/thinking-cat", "ICONS.loading.thinking"],
      ["cat-phone", "illustrations/cat-phone", "ICONS.contact.catPhone"],
      ["dog-phone", "illustrations/dog-phone", "ICONS.contact.dogPhone"],
      ["letter", "illustrations/letter", "ICONS.contact.letter"],
      ["cat-mail", "illustrations/cat-mail", "ICONS.contact.catMail"],
      ["monopoly-cat", "illustrations/monopoly-cat", "ICONS.contact.monopolyCat"],
      ["cat-support", "illustrations/cat-support", "ICONS.support.catSupport"],
      ["crying-pets", "illustrations/crying-pets", "ICONS.settings.cryingPets"],
    ] as const
  ).map(([legacy, name, key]): Asset => ({ to: `static/ui/${name}.webp`, size: "iconLg", from: `${IC}/${legacy}.webp`, keys: [key] })),
  { to: "static/ui/illustrations/not-found.webp", size: "art", from: "WebAssets/Common/not-found.webp", keys: ["COMMON.notFound"] },
  { to: "static/ui/illustrations/memorial-bg.webp", size: "art", file: "pawjai-fe/public/memorial-bg.png", keys: ["BACKGROUNDS.memorial"] },
  { to: "static/ui/animations/success-check.webm", size: "copy", from: "WebAssets/Common/animations/success-check.webm", keys: ["ICONS.animations.checkmark"] },

  // marketing
  ...(["pepe-heart", "pepe-laptop", "pepe-shocked"] as const).map(
    (n): Asset => ({
      to: `static/marketing/stickers/${n}.webp`,
      size: "small",
      from: `WebAssets/Landing/Stickers/${n}.webp`,
      keys: [`STICKERS.${n.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())}`],
    }),
  ),
  ...(
    [
      ["Pooh1", "pooh-1", "pooh1"],
      ["Pooh2", "pooh-2", "pooh2"],
      ["Pepe1", "pepe-1", "pepe1"],
      ["Pepe2", "pepe-2", "pepe2"],
      ["Fat%20dog%201", "fat-dog-1", "fatDog1"],
      ["Fat%20dog%202", "fat-dog-2", "fatDog2"],
      ["Fat%20cat%201", "fat-cat-1", "fatCat1"],
      ["Palo", "palo", "palo"],
      ["Vasco", "vasco", "vasco"],
      ["Numnim", "numnim", "numnim"],
      ["Pepe", "pepe", "pepe"],
    ] as const
  ).map(([legacy, name, key]): Asset => ({
    to: `static/marketing/about/${name}.webp`,
    size: "small",
    from: `WebAssets/Landing/About%20Page/${legacy}.png`,
    keys: [`ICONS.about.${key}`],
  })),
  { to: "static/marketing/home/pepe-create-profile-1.webp", size: "svgRaster", from: "WebAssets/Landing/Homepage/Pepe%20create%20profile%201.svg", keys: ["HOMEPAGE_IMAGES.pepeCreateProfile1"] },
  { to: "static/marketing/home/pepe-create-profile-2.webp", size: "svgRaster", from: "WebAssets/Landing/Homepage/Pepe%20create%20profile%202.svg", keys: ["HOMEPAGE_IMAGES.pepeCreateProfile2"] },
  { to: "static/marketing/home/pepe-create-profile-3.webp", size: "small", from: "WebAssets/Landing/Homepage/Pepe%20create%20profile%203.png", keys: ["HOMEPAGE_IMAGES.pepeCreateProfile3"] },
  { to: "static/marketing/home/pepe-review.webp", size: "svgRaster", from: "WebAssets/Landing/Homepage/Pepe%20Review.svg", keys: ["HOMEPAGE_IMAGES.pepeReview"] },
  { to: "static/marketing/blog/sick-dog.webp", size: "cover", from: "WebAssets/Blog/sickdog.webp", keys: ["BLOG_IMAGES.sickDog"] },
  { to: "static/marketing/blog/sick-cat.webp", size: "cover", from: "WebAssets/Blog/sickcat.webp", keys: ["BLOG_IMAGES.sickCat"] },
  { to: "static/marketing/blog/chonk-dog.webp", size: "cover", from: "WebAssets/Blog/chonk%20dog.webp", keys: ["BLOG_IMAGES.chonkDog"] },

  // ads
  { to: "static/ads/upgrade/banner-th.webp", size: "banner", from: "WebAssets/ads-banner/upgrade/banner-th.png", keys: ["AD_IMAGES.upgrade.bannerTh"] },
  { to: "static/ads/upgrade/banner-en.webp", size: "banner", from: "WebAssets/ads-banner/upgrade/banner-en.png", keys: ["AD_IMAGES.upgrade.bannerEn"] },
  { to: "static/ads/upgrade/desktop-banner-th.webp", size: "bannerWide", from: "WebAssets/ads-banner/upgrade/desktop-banner-th.png", keys: ["AD_IMAGES.upgrade.desktopBannerTh"] },
  { to: "static/ads/upgrade/desktop-banner-en.webp", size: "bannerWide", from: "WebAssets/ads-banner/upgrade/desktop-banner-en.png", keys: ["AD_IMAGES.upgrade.desktopBannerEn"] },
  { to: "static/ads/partners/petkit/fountain-mobile.webp", size: "small", from: "ads/petkit/fountain-mobile-2.png", keys: ["AD_IMAGES.petkit.fountainMobile"] },
  { to: "static/ads/partners/petkit/fountain-desktop.webp", size: "small", from: "ads/petkit/fountain-desktop.png", keys: ["AD_IMAGES.petkit.fountainDesktop"] },
  { to: "static/ads/partners/petkit/fountain-300x250.webp", size: "small", from: "ads/petkit/fountain-300-250.png", keys: ["AD_IMAGES.petkit.fountain300x250"] },
  { to: "static/ads/partners/feliway/feliway.webp", size: "art", file: "pawjai-fe/public/ads/feliway-ads.png", keys: ["AD_IMAGES.partners.feliway"] },
  { to: "static/ads/partners/kong/kong-classic.webp", size: "iconLg", file: "pawjai-fe/public/ads/kong-ads-2.png", keys: ["AD_IMAGES.partners.kongClassic"] },
  { to: "static/ads/partners/gentle-paw/dental-chew.webp", size: "iconLg", file: "pawjai-fe/public/ads/gentle-paw-dental-chew.png", keys: ["AD_IMAGES.partners.gentlePawDentalChew"] },
];
