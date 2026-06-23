/**
 * Pricing and calculation logic ported from
 * neworleansrecordpress.com/content/themes/norp/assets/js/quote.js
 */

export const LEGACY_PROJECT_TYPES = [
  { value: "single", label: 'Single 12" (Standard Weight) - LP' },
  { value: "single_heavyweight", label: 'Single 12" (Heavy Weight) - LP' },
  { value: "double", label: 'Double 12" (Standard Weight) - 2xLP' },
  { value: "double_heavyweight", label: 'Double 12" (Heavy Weight) - 2xLP' },
  { value: "seveninch", label: 'Single 7" - EP' },
] as const

export type LegacyProjectType = (typeof LEGACY_PROJECT_TYPES)[number]["value"]

export type LegacyColorStyle =
  | "black"
  | "random"
  | "solid"
  | "translucent"
  | "marble"
  | "smoke"
  | "splatter"

export type LegacyVariation = {
  quantity: number
  colorStyle: LegacyColorStyle
}

export type LegacyQuoteInput = {
  masterFormat: "audioFiles" | "haveLacquer"
  projectType: LegacyProjectType
  variations: LegacyVariation[]
  testPressings: number
  centerLabels: "printed" | "blank" | "customerSupplied"
  innerSleeves:
    | "none"
    | "whitePaper"
    | "heavyWhitePaper"
    | "blackPaper"
    | "brownPaper"
    | "whitePoly"
    | "blackPoly"
    | "printed1Color"
    | "printedFullColor"
  inserts: "none" | "2panel" | "4panel"
  jackets: string
  outerSleeves: "none" | "standardNoFlap" | "standardWithFlap" | "crystalClear" | "shrinkwrap"
  upcEmbedded: boolean
  upcSticker: boolean
  assembly: "standard" | "none"
  jacketUpgrades: {
    uvGloss: boolean
    matte: boolean
    reverseBoard: boolean
    heavyJacket: boolean
  }
  downloadCards: boolean
  marketingStickerCircle: boolean
  marketingStickerRectangle: boolean
}

export type LegacyQuoteLineItems = {
  quantity: number
  lacquer: number
  electroplating: number
  setupFee: number
  testPressings: number
  pressing: number
  centerLabels: number
  innerSleeves: number
  inserts: number
  jackets: number
  outerSleeves: number
  extras: number
  assemblyFees: number
  total: number
  unitPrice: number
}

const PRICES = {
  lacquer: 479,
  electroplating: {
    single12: 418,
    single7: 303,
    additional12: 207.9,
    additional7: 154,
  },
  testPresses: 165,
  testPressesAdditional: 6.6,
  setupFee: 154,
  setupFeeColor: 110,
  assemblyActionFee: 0.132,
  pressing: {
    standardBlack: 2.2,
    standardSolid: 2.695,
    standardTrans: 2.695,
    standardMarble: 3.135,
    standardSmoke: 3.135,
    heavyweightBlack: 2.86,
    heavyweightSolid: 3.3,
    heavyweightTrans: 3.3,
    heavyweightMarble: 4.246,
    heavyweightSmoke: 4.246,
    heavyweightSplatter: 4.95,
    sevenInchBlack: 1.595,
    sevenInchSolid: 1.98,
    sevenInchTrans: 1.98,
    sevenInchMarble: 2.31,
    sevenInchSmoke: 2.31,
    sevenInchSplatter: 4.95,
  },
  centerLabels: {
    blank: 0.165,
    printed: {
      qty100: 248,
      qty250: 248,
      qty500: 275,
      qty1000: 385,
    },
    printed7: {
      qty100: 303,
      qty250: 303,
      qty500: 303,
      qty1000: 385,
    },
  },
  innerSleeves: {
    twelveInch: {
      whitePaper: 0.22,
      heavyWhitePaper: 0.385,
      whitePoly: 0.55,
      blackPaper: 0.44,
      blackPoly: 0.77,
      brownPaper: 0.275,
    },
    sevenInch: {
      whitePaper: 0.22,
      blackPaper: 0.55,
      brownPaper: 0.33,
    },
    printed1Color: {
      qty100: 297,
      qty250: 468,
      qty500: 704,
      qty1000: 572,
      qty2000: 847,
      qty5000: 1630,
      qty10000: 2950,
    },
    printedFullColor: {
      qty100: 297,
      qty250: 468,
      qty500: 704,
      qty1000: 1045,
      qty2000: 1400,
      qty5000: 2535,
      qty10000: 4785,
    },
  },
  inserts: {
    "2panel": {
      qty100: 165,
      qty250: 264,
      qty500: 363,
      qty1000: 649,
      qty2000: 1055,
      qty5000: 1380,
      qty10000: 2750,
      qty20000: 5515,
      qty30000: 7985,
    },
    "4panel": {
      qty100: 275,
      qty200: 385,
      qty250: 440,
      qty300: 495,
      qty500: 730,
      qty1000: 1045,
      qty2000: 1585,
      qty5000: 2180,
      qty10000: 4355,
      qty20000: 8710,
      qty30000: 13070,
    },
  },
  jackets: {
    blank: 1.925,
    fullColorSingle: {
      qty100: 380,
      qty200: 545,
      qty250: 660,
      qty300: 715,
      qty500: 765,
      qty1000: 990,
      qty2000: 1620,
      qty3000: 2260,
      qty5000: 3355,
      qty7500: 4860,
      qty10000: 6380,
    },
    fullColorSingle7: {
      qty100: 605,
      qty200: 605,
      qty250: 605,
      qty300: 660,
      qty500: 660,
      qty1000: 770,
      qty2000: 1430,
    },
    oneColorSingle: {
      qty100: 380,
      qty200: 545,
      qty250: 660,
      qty300: 715,
      qty500: 765,
      qty1000: 880,
      qty2000: 1240,
      qty3000: 1790,
      qty5000: 2835,
      qty7500: 3960,
      qty10000: 5500,
    },
    oneColorSingle7: {
      qty100: 363,
      qty200: 363,
      qty250: 363,
      qty300: 418,
      qty500: 418,
      qty1000: 495,
      qty2000: 935,
    },
    fullColorWide: {
      qty100: 545,
      qty200: 600,
      qty250: 825,
      qty300: 880,
      qty500: 935,
      qty1000: 1320,
      qty2000: 2280,
      qty3000: 3250,
      qty5000: 5005,
      qty7500: 7335,
      qty10000: 9680,
    },
    oneColorWide: {
      qty100: 545,
      qty200: 600,
      qty250: 825,
      qty300: 880,
      qty500: 935,
      qty1000: 1265,
      qty2000: 2035,
      qty3000: 2980,
      qty5000: 4815,
      qty7500: 7135,
      qty10000: 9415,
    },
    gatefold: {
      qty100: 2200,
      qty200: 2200,
      qty250: 2200,
      qty300: 2200,
      qty500: 2200,
      qty1000: 2750,
      qty2000: 3300,
      qty3000: 4730,
      qty5000: 7150,
      qty7500: 9900,
      qty10000: 12650,
    },
  },
  jacketUpgrades: {
    uvGloss: 55,
    matte: 55,
    reverseBoard: 165,
    heavySinglePocket: 330,
    heavyGatefold: 385,
  },
  outerSleeves: {
    standardNoFlap: 0.22,
    crystalClear: 0.264,
    shrinkwrap: 0.264,
  },
  upc: {
    embedded: 55,
    sticker: {
      qty500: 138,
      qty1000: 220,
      qty2000: 413,
      qty5000: 1240,
      qty10000: 2450,
      qty20000: 4840,
      qty30000: 7150,
    },
  },
  extras: {
    downloadCards: {
      qty100: 193,
      qty250: 248,
      qty500: 275,
      qty1000: 385,
      qty2000: 605,
      qty5000: 1320,
    },
    marketingSticker: {
      qty100: 110,
      qty250: 138,
      qty500: 165,
      qty1000: 193,
      qty2000: 330,
      qty5000: 550,
      qty10000: 990,
      qty20000: 1340,
      qty30000: 1650,
    },
  },
} as const

type TierTable = Record<string, number>

function tierPrice(table: TierTable, quantity: number, tiers: readonly [number, string][]) {
  for (const [limit, key] of tiers) {
    if (quantity <= limit && table[key] !== undefined) return table[key]
  }
  const available = tiers
    .map(([, key]) => table[key])
    .filter((value): value is number => typeof value === "number" && value > 0)
  return available.length ? available[available.length - 1] : 0
}

const DEFAULT_TIERS = [
  [100, "qty100"],
  [200, "qty200"],
  [250, "qty250"],
  [300, "qty300"],
  [500, "qty500"],
  [1000, "qty1000"],
  [2000, "qty2000"],
  [3000, "qty3000"],
  [5000, "qty5000"],
  [7500, "qty7500"],
  [10000, "qty10000"],
  [20000, "qty20000"],
  [30000, "qty30000"],
] as const

const INSERT_2PANEL_TIERS = [
  [100, "qty100"],
  [250, "qty250"],
  [500, "qty500"],
  [1000, "qty1000"],
  [2000, "qty2000"],
  [5000, "qty5000"],
  [10000, "qty10000"],
  [20000, "qty20000"],
  [30000, "qty30000"],
] as const

const UPC_STICKER_TIERS = [
  [500, "qty500"],
  [1000, "qty1000"],
  [2000, "qty2000"],
  [5000, "qty5000"],
  [10000, "qty10000"],
  [20000, "qty20000"],
  [30000, "qty30000"],
] as const

const EXTRAS_TIERS = [
  [100, "qty100"],
  [250, "qty250"],
  [500, "qty500"],
  [1000, "qty1000"],
  [2000, "qty2000"],
  [5000, "qty5000"],
  [10000, "qty10000"],
  [20000, "qty20000"],
  [30000, "qty30000"],
] as const

function isStandardProject(projectType: LegacyProjectType) {
  return projectType === "single" || projectType === "double"
}

function isHeavyProject(projectType: LegacyProjectType) {
  return projectType === "single_heavyweight" || projectType === "double_heavyweight"
}

function isDoubleProject(projectType: LegacyProjectType) {
  return projectType === "double" || projectType === "double_heavyweight"
}

function isSevenInchProject(projectType: LegacyProjectType) {
  return projectType === "seveninch"
}

function usesColorSetup(colorStyle: LegacyColorStyle) {
  return colorStyle !== "black" && colorStyle !== "random"
}

function pressingUnitPrice(projectType: LegacyProjectType, colorStyle: LegacyColorStyle) {
  const p = PRICES.pressing

  if (isSevenInchProject(projectType)) {
    if (colorStyle === "black" || colorStyle === "random") return p.sevenInchBlack
    if (colorStyle === "solid") return p.sevenInchSolid
    if (colorStyle === "translucent") return p.sevenInchTrans
    if (colorStyle === "marble") return p.sevenInchMarble
    if (colorStyle === "smoke") return p.sevenInchSmoke
    return p.sevenInchSplatter
  }

  if (isStandardProject(projectType)) {
    if (colorStyle === "black" || colorStyle === "random") return p.standardBlack
    if (colorStyle === "solid") return p.standardSolid
    if (colorStyle === "translucent") return p.standardTrans
    if (colorStyle === "marble") return p.standardMarble
    return p.standardSmoke
  }

  if (colorStyle === "black" || colorStyle === "random") return p.heavyweightBlack
  if (colorStyle === "solid") return p.heavyweightSolid
  if (colorStyle === "translucent") return p.heavyweightTrans
  if (colorStyle === "marble") return p.heavyweightMarble
  if (colorStyle === "smoke") return p.heavyweightSmoke
  return p.heavyweightSplatter
}

function variationSetup(projectType: LegacyProjectType, colorStyle: LegacyColorStyle, index: number, quantity: number) {
  if (quantity <= 0) return 0
  const colorSetup = usesColorSetup(colorStyle) ? PRICES.setupFeeColor : 0
  const baseSetup = index === 0 ? PRICES.setupFee : 0
  return baseSetup + colorSetup
}

function isGroupJacket(jackets: string) {
  return [
    "fullColorSingle",
    "1colorSingle",
    "fullColorWide",
    "1colorWide",
    "gatefold",
    "screenWhite1",
    "screenWhite2",
    "screenWhite3",
    "screenWhite4",
    "screenBlack1",
    "screenBlack2",
    "screenBlack3",
    "screenBlack4",
  ].includes(jackets)
}

function isGatefoldJacket(jackets: string) {
  return jackets === "gatefold"
}

export function splatterAllowed(projectType: LegacyProjectType) {
  return !isStandardProject(projectType)
}

export function jacketUpgradesAllowed(projectType: LegacyProjectType, quantity: number, jackets: string) {
  if (jackets === "none" || isSevenInchProject(projectType) || quantity < 101) return false
  return isGroupJacket(jackets)
}

export function heavyJacketUpgradeAllowed(quantity: number, jackets: string) {
  if (isGatefoldJacket(jackets)) return quantity >= 500
  return quantity >= 1000
}

export function calculateLegacyQuote(input: LegacyQuoteInput): LegacyQuoteLineItems {
  const { projectType } = input
  const activeVariations = input.variations.filter((variation) => variation.quantity > 0)
  const quantity = Math.max(
    1,
    activeVariations.reduce((sum, variation) => sum + variation.quantity, 0),
  )

  let lacquer = input.masterFormat === "audioFiles" ? PRICES.lacquer : 0
  const additionalStampers = quantity > 750 ? Math.ceil((quantity - 750) / 1000) : 0
  let electroplating = isSevenInchProject(projectType)
    ? PRICES.electroplating.single7 + additionalStampers * PRICES.electroplating.additional7
    : PRICES.electroplating.single12 + additionalStampers * PRICES.electroplating.additional12

  let testPressings =
    input.testPressings < 6
      ? PRICES.testPresses
      : PRICES.testPresses + PRICES.testPressesAdditional * (input.testPressings - 5)

  let setupFee = input.variations.reduce(
    (sum, variation, index) => sum + variationSetup(projectType, variation.colorStyle, index, variation.quantity),
    0,
  )

  let pressing = activeVariations.reduce((sum, variation) => {
    const unit = pressingUnitPrice(projectType, variation.colorStyle)
    return sum + variation.quantity * unit
  }, 0)

  let centerLabels = 0
  if (input.centerLabels === "blank") {
    centerLabels = quantity * PRICES.centerLabels.blank
  } else if (input.centerLabels === "printed") {
    centerLabels =
      quantity > 1000
        ? Number((((quantity * 0.3 + quantity) * 0.15) * 1.3).toFixed(2))
        : tierPrice(
            isSevenInchProject(projectType) ? PRICES.centerLabels.printed7 : PRICES.centerLabels.printed,
            quantity,
            [
              [100, "qty100"],
              [250, "qty250"],
              [500, "qty500"],
              [1000, "qty1000"],
            ],
          )
  }

  let innerSleeves = 0
  if (input.innerSleeves === "printed1Color") {
    innerSleeves = tierPrice(PRICES.innerSleeves.printed1Color, quantity, DEFAULT_TIERS)
  } else if (input.innerSleeves === "printedFullColor") {
    innerSleeves = tierPrice(PRICES.innerSleeves.printedFullColor, quantity, DEFAULT_TIERS)
  } else if (input.innerSleeves !== "none") {
    const table = isSevenInchProject(projectType)
      ? PRICES.innerSleeves.sevenInch
      : PRICES.innerSleeves.twelveInch
    innerSleeves = (table[input.innerSleeves as keyof typeof table] || 0) * quantity
  }

  const inserts =
    input.inserts === "none"
      ? 0
      : tierPrice(
          PRICES.inserts[input.inserts],
          quantity,
          input.inserts === "2panel" ? INSERT_2PANEL_TIERS : DEFAULT_TIERS,
        )

  let jackets = 0
  if (input.jackets === "blankWhite" || input.jackets === "blankBlack" || input.jackets === "blankChipboard") {
    jackets = PRICES.jackets.blank * quantity
  } else if (input.jackets === "fullColorSingle") {
    jackets = tierPrice(
      isSevenInchProject(projectType) ? PRICES.jackets.fullColorSingle7 : PRICES.jackets.fullColorSingle,
      quantity,
      DEFAULT_TIERS,
    )
  } else if (
    input.jackets === "1colorSingle" ||
    input.jackets.startsWith("screenWhite") ||
    input.jackets.startsWith("screenBlack")
  ) {
    jackets = tierPrice(
      isSevenInchProject(projectType) ? PRICES.jackets.oneColorSingle7 : PRICES.jackets.oneColorSingle,
      quantity,
      DEFAULT_TIERS,
    )
  } else if (input.jackets === "fullColorWide") {
    jackets = tierPrice(PRICES.jackets.fullColorWide, quantity, DEFAULT_TIERS)
  } else if (input.jackets === "1colorWide") {
    jackets = tierPrice(PRICES.jackets.oneColorWide, quantity, DEFAULT_TIERS)
  } else if (input.jackets === "gatefold") {
    jackets = tierPrice(PRICES.jackets.gatefold, quantity, DEFAULT_TIERS)
  }

  if (isGroupJacket(input.jackets) && quantity > 100 && !isSevenInchProject(projectType)) {
    const { jacketUpgrades } = input
    if (jacketUpgrades.uvGloss) jackets += Math.ceil(quantity / 500) * PRICES.jacketUpgrades.uvGloss
    if (jacketUpgrades.matte) jackets += Math.ceil(quantity / 500) * PRICES.jacketUpgrades.matte
    if (jacketUpgrades.reverseBoard) jackets += Math.ceil(quantity / 500) * PRICES.jacketUpgrades.reverseBoard
    if (jacketUpgrades.heavyJacket) {
      jackets +=
        Math.ceil(quantity / 1000) *
        (isGatefoldJacket(input.jackets)
          ? PRICES.jacketUpgrades.heavyGatefold
          : PRICES.jacketUpgrades.heavySinglePocket)
    }
  }

  const outerUnit =
    input.outerSleeves === "none"
      ? 0
      : input.outerSleeves === "standardNoFlap" || input.outerSleeves === "standardWithFlap"
        ? PRICES.outerSleeves.standardNoFlap
        : PRICES.outerSleeves[input.outerSleeves as "crystalClear" | "shrinkwrap"] || 0
  const outerSleeves = outerUnit * quantity

  let extras = 0
  if (input.upcEmbedded) extras += PRICES.upc.embedded
  if (input.upcSticker) extras += tierPrice(PRICES.upc.sticker, quantity, UPC_STICKER_TIERS)
  if (input.downloadCards) extras += tierPrice(PRICES.extras.downloadCards, quantity, EXTRAS_TIERS.slice(0, 6))
  if (input.marketingStickerCircle) extras += tierPrice(PRICES.extras.marketingSticker, quantity, EXTRAS_TIERS)
  if (input.marketingStickerRectangle) extras += tierPrice(PRICES.extras.marketingSticker, quantity, EXTRAS_TIERS)

  let assemblyCount = 0
  if (input.assembly === "standard") {
    if (outerSleeves > 0 && input.outerSleeves !== "shrinkwrap") assemblyCount += 1
    if (jackets > 0) assemblyCount += 1
    if (inserts > 0) assemblyCount += 1
    if (input.upcSticker) assemblyCount += 1
    if (input.downloadCards) assemblyCount += 1
    if (input.marketingStickerCircle) assemblyCount += 1
    if (input.marketingStickerRectangle) assemblyCount += 1
    if (isDoubleProject(projectType)) assemblyCount += 1
  }
  const assemblyFees = PRICES.assemblyActionFee * assemblyCount * quantity

  if (isDoubleProject(projectType)) {
    lacquer *= 2
    electroplating *= 2
    testPressings *= 2
    setupFee *= 2
    pressing *= 2
    centerLabels *= 2
    innerSleeves *= 2
  }

  const total =
    lacquer +
    electroplating +
    setupFee +
    testPressings +
    pressing +
    centerLabels +
    innerSleeves +
    inserts +
    jackets +
    outerSleeves +
    extras +
    assemblyFees

  return {
    quantity,
    lacquer,
    electroplating,
    setupFee,
    testPressings,
    pressing,
    centerLabels,
    innerSleeves,
    inserts,
    jackets,
    outerSleeves,
    extras,
    assemblyFees,
    total,
    unitPrice: total / quantity,
  }
}
