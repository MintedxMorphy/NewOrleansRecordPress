"use client"

import { useState, useMemo } from "react"
import { Calculator, ChevronDown, Info, Save, Send } from "lucide-react"

// Legacy NORP production quote pricing ported from neworleansrecordpress.com.
const PRICING = {
  lacquer: 479,
  electroplating: {
    single12: 418,
    single7: 303,
    additional12: 207.90,
    additional7: 154,
  },
  testPresses: 165,
  testPressesAdditional: 6.60,
  setupFee: 154,
  setupFeeColor: 110,
  assemblyActionFee: 0.132,
  pressing: {
    heavyweight: {
      black: 2.86,
      random: 2.86,
      solid: 3.30,
      translucent: 3.30,
      marble: 4.246,
      smoke: 4.246,
      splatter: 4.95,
    },
    sevenInch: {
      black: 1.595,
      random: 1.595,
      solid: 1.98,
      translucent: 1.98,
      marble: 2.31,
      smoke: 2.31,
      splatter: 4.95,
    },
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
    none: 0,
    standardNoFlap: 0.22,
    standardWithFlap: 0.264,
    crystalClear: 0.264,
  },
  shrinkwrap: 0.264,
  upcBarcodes: {
    none: 0,
    providing: 0,
    embedded: 55,
    sticker: {
      qty100: 138,
      qty250: 138,
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
}

type SelectProps = {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  tooltip?: string
}

function Select({ label, value, onChange, options, tooltip }: SelectProps) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm font-medium text-foreground">
        {label}
        {tooltip && (
          <span className="group relative">
            <Info size={14} className="text-muted-foreground cursor-help" />
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-foreground text-background text-xs w-48 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              {tooltip}
            </span>
          </span>
        )}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none bg-secondary text-foreground px-4 py-3 pr-10 border border-border focus:border-primary focus:outline-none transition-colors cursor-pointer"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      </div>
    </div>
  )
}

function NumberInput({ 
  label, 
  value, 
  onChange, 
  min = 0,
  step = 1,
  tooltip 
}: { 
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  step?: number
  tooltip?: string
}) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm font-medium text-foreground">
        {label}
        {tooltip && (
          <span className="group relative">
            <Info size={14} className="text-muted-foreground cursor-help" />
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-foreground text-background text-xs w-48 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              {tooltip}
            </span>
          </span>
        )}
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Math.max(min, parseInt(e.target.value) || 0))}
        min={min}
        step={step}
        className="w-full bg-secondary text-foreground px-4 py-3 border border-border focus:border-primary focus:outline-none transition-colors"
      />
    </div>
  )
}

function Checkbox({ 
  label, 
  checked, 
  onChange 
}: { 
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer group">
      <div className={`w-5 h-5 border-2 flex items-center justify-center transition-colors ${checked ? 'bg-primary border-primary' : 'border-border group-hover:border-primary'}`}>
        {checked && (
          <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="square" strokeLinejoin="miter" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <span className="text-sm text-foreground">{label}</span>
    </label>
  )
}

function optionLabel(options: { value: string; label: string }[], value: string) {
  return options.find(option => option.value === value)?.label || value
}

type PriceTable = Record<string, number>

function tierPrice(table: PriceTable, quantity: number) {
  const tiers = [
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

  for (const [limit, key] of tiers) {
    if (quantity <= limit && table[key] !== undefined) return table[key]
  }

  const available = tiers
    .map(([, key]) => table[key])
    .filter((value): value is number => typeof value === "number" && value > 0)

  return available.length ? available[available.length - 1] : 0
}

function usesColorSetup(colorStyle: string) {
  return !["black", "random"].includes(colorStyle)
}

function isDoubleProject(projectType: string) {
  return projectType === "double-12-heavy"
}

function isSevenInchProject(projectType: string) {
  return projectType === "7-standard"
}

export function QuoteCalculator() {
  const masterFormatOptions = [
    { value: "audioFiles", label: "I'm submitting audio files" },
    { value: "haveLacquer", label: "I have a lacquer" },
  ]
  const projectTypeOptions = [
    { value: "12-heavy", label: '12" LP - Heavy (180g)' },
    { value: "double-12-heavy", label: '2x12" 2xLP - Heavy (180g)' },
    { value: "7-standard", label: '7" EP - Standard' },
  ]
  const vinylColorOptions = [
    { value: "black", label: "Black (Standard)" },
    { value: "random", label: "Random Color (Free!)" },
    { value: "solid", label: "Solid Color (+$0.25/unit)" },
    { value: "translucent", label: "Translucent (+$0.35/unit)" },
    { value: "marble", label: "Marble (+$0.50/unit)" },
    { value: "smoke", label: "Smoke (+$0.45/unit)" },
    { value: "splatter", label: "Splatter (+$0.75/unit)" },
  ]
  const centerLabelOptions = [
    { value: "printed", label: "Printed Labels" },
    { value: "blank", label: "Blank Labels" },
    { value: "customerSupplied", label: "Customer Supplied" },
  ]
  const innerSleeveOptions = [
    { value: "none", label: "None" },
    { value: "whitePaper", label: "White Paper" },
    { value: "heavyWhitePaper", label: "Heavy Duty White Paper" },
    { value: "blackPaper", label: "Black Paper" },
    { value: "brownPaper", label: "Brown Paper" },
    { value: "whitePoly", label: "White Poly-Lined" },
    { value: "blackPoly", label: "Black Poly-Lined" },
    { value: "printed1Color", label: "Printed - 1 Color" },
    { value: "printedFullColor", label: "Printed - Full Color" },
  ]
  const insertOptions = [
    { value: "none", label: "None" },
    { value: "2panel", label: '12" x 12" - 2 Panel' },
    { value: "4panel", label: '24" x 12" - 4 Panel' },
  ]
  const jacketOptions = [
    { value: "none", label: "None" },
    { value: "fullColorSingle", label: "Full Color - Single Pocket" },
    { value: "1colorSingle", label: "1 Color - Single Pocket" },
    { value: "fullColorWide", label: "Full Color - Wide Spine (2xLP)" },
    { value: "1colorWide", label: "1 Color - Wide Spine (2xLP)" },
    { value: "gatefold", label: "Full Color - Gatefold" },
    { value: "screenPrinted1", label: "Screen-Printed - 1 Color" },
    { value: "screenPrinted2", label: "Screen-Printed - 2 Color" },
    { value: "screenPrinted3", label: "Screen-Printed - 3 Color" },
    { value: "screenPrinted4", label: "Screen-Printed - 4 Color" },
    { value: "blankWhite", label: "Blank - White" },
    { value: "blankBlack", label: "Blank - Black" },
    { value: "blankChipboard", label: "Blank - Chipboard" },
  ]
  const outerSleeveOptions = [
    { value: "none", label: "None" },
    { value: "standardNoFlap", label: "Standard - No Flap" },
    { value: "standardWithFlap", label: "Standard - With Flap" },
    { value: "crystalClear", label: "Crystal Clear - Resealable" },
  ]
  const upcBarcodeOptions = [
    { value: "none", label: "None / Don't Need" },
    { value: "providing", label: "I'm Providing Barcode" },
    { value: "embedded", label: "Need Barcode - Embedded in Art" },
    { value: "sticker", label: "Need Barcode - Sticker" },
  ]
  const assemblyOptions = [
    { value: "standard", label: "NORP Assembles" },
    { value: "none", label: "I'll Assemble Myself" },
  ]

  // Form state
  const [masterFormat, setMasterFormat] = useState("audioFiles")
  const [projectType, setProjectType] = useState("12-heavy")
  const [quantity, setQuantity] = useState(300)
  const [colorStyle, setColorStyle] = useState("black")
  const [testPressings, setTestPressings] = useState(5)
  const [centerLabels, setCenterLabels] = useState("printed")
  const [innerSleeves, setInnerSleeves] = useState("whitePaper")
  const [inserts, setInserts] = useState("none")
  const [jackets, setJackets] = useState("fullColorSingle")
  const [outerSleeves, setOuterSleeves] = useState("standardWithFlap")
  const [shrinkwrap, setShrinkwrap] = useState(true)
  const [upcBarcodes, setUpcBarcodes] = useState("none")
  const [assembly, setAssembly] = useState("standard")
  
  // Jacket upgrades
  const [uvGloss, setUvGloss] = useState(false)
  const [matte, setMatte] = useState(false)
  const [reverseBoard, setReverseBoard] = useState(false)
  const [heavyJacket, setHeavyJacket] = useState(false)
  
  // Extras
  const [downloadCards, setDownloadCards] = useState(false)
  const [marketingSticker2, setMarketingSticker2] = useState(false)
  const [marketingSticker25x3, setMarketingSticker25x3] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [submittingAction, setSubmittingAction] = useState<"save_quote" | "start_order" | null>(null)
  const [submitMessage, setSubmitMessage] = useState("")

  // Calculate totals
  const estimate = useMemo(() => {
    const qty = Math.max(100, quantity)
    const isDouble = isDoubleProject(projectType)
    const isSevenInch = isSevenInchProject(projectType)
    const doubleMultiplier = isDouble ? 2 : 1

    const lacquerCost = (masterFormat === "audioFiles" ? PRICING.lacquer : 0) * doubleMultiplier
    const additionalStampers = qty > 750 ? Math.ceil((qty - 750) / 1000) : 0
    const electroplatingBase = isSevenInch
      ? PRICING.electroplating.single7 + additionalStampers * PRICING.electroplating.additional7
      : PRICING.electroplating.single12 + additionalStampers * PRICING.electroplating.additional12
    const electroplatingCost = electroplatingBase * doubleMultiplier
    const baseTestPressingCost = testPressings < 6
      ? PRICING.testPresses
      : PRICING.testPresses + PRICING.testPressesAdditional * (testPressings - 5)
    const testPressingCost = baseTestPressingCost * doubleMultiplier
    const setupCost = (PRICING.setupFee + (usesColorSetup(colorStyle) ? PRICING.setupFeeColor : 0)) * doubleMultiplier

    const pressingTable = isSevenInch ? PRICING.pressing.sevenInch : PRICING.pressing.heavyweight
    const pressingBase = pressingTable[colorStyle as keyof typeof pressingTable] ?? pressingTable.black
    const pressingTotal = qty * pressingBase * doubleMultiplier

    let labelTotal = 0
    if (centerLabels === "blank") {
      labelTotal = qty * PRICING.centerLabels.blank
    } else if (centerLabels === "printed") {
      labelTotal = qty > 1000
        ? qty * 1.3 * 0.15 * 1.3
        : tierPrice(isSevenInch ? PRICING.centerLabels.printed7 : PRICING.centerLabels.printed, qty)
    }
    labelTotal *= doubleMultiplier

    let innerTotal = 0
    if (innerSleeves === "printed1Color") {
      innerTotal = tierPrice(PRICING.innerSleeves.printed1Color, qty)
    } else if (innerSleeves === "printedFullColor") {
      innerTotal = tierPrice(PRICING.innerSleeves.printedFullColor, qty)
    } else if (innerSleeves !== "none") {
      const sleeveTable = isSevenInch ? PRICING.innerSleeves.sevenInch : PRICING.innerSleeves.twelveInch
      innerTotal = (sleeveTable[innerSleeves as keyof typeof sleeveTable] || 0) * qty
    }
    innerTotal *= doubleMultiplier

    const insertTotal = inserts === "none" ? 0 : tierPrice(PRICING.inserts[inserts as keyof typeof PRICING.inserts], qty)

    let jacketBaseTotal = 0
    let isGroupJacket = false
    if (["blankWhite", "blankBlack", "blankChipboard"].includes(jackets)) {
      jacketBaseTotal = PRICING.jackets.blank * qty
    } else if (jackets === "fullColorSingle") {
      isGroupJacket = true
      jacketBaseTotal = tierPrice(isSevenInch ? PRICING.jackets.fullColorSingle7 : PRICING.jackets.fullColorSingle, qty)
    } else if (jackets === "1colorSingle" || jackets.startsWith("screenPrinted")) {
      isGroupJacket = true
      jacketBaseTotal = tierPrice(isSevenInch ? PRICING.jackets.oneColorSingle7 : PRICING.jackets.oneColorSingle, qty)
    } else if (jackets === "fullColorWide") {
      isGroupJacket = true
      jacketBaseTotal = tierPrice(PRICING.jackets.fullColorWide, qty)
    } else if (jackets === "1colorWide") {
      isGroupJacket = true
      jacketBaseTotal = tierPrice(PRICING.jackets.oneColorWide, qty)
    } else if (jackets === "gatefold") {
      isGroupJacket = true
      jacketBaseTotal = tierPrice(PRICING.jackets.gatefold, qty)
    }

    let jacketUpgradeCost = 0
    if (isGroupJacket && qty > 100 && !isSevenInch) {
      if (uvGloss) jacketUpgradeCost += Math.ceil(qty / 500) * PRICING.jacketUpgrades.uvGloss
      if (matte) jacketUpgradeCost += Math.ceil(qty / 500) * PRICING.jacketUpgrades.matte
      if (reverseBoard) jacketUpgradeCost += Math.ceil(qty / 500) * PRICING.jacketUpgrades.reverseBoard
      if (heavyJacket) {
        jacketUpgradeCost += Math.ceil(qty / 1000) * (
          jackets === "gatefold"
            ? PRICING.jacketUpgrades.heavyGatefold
            : PRICING.jacketUpgrades.heavySinglePocket
        )
      }
    }
    const jacketTotal = jacketBaseTotal + jacketUpgradeCost

    const outerSleevesTotal = (PRICING.outerSleeves[outerSleeves as keyof typeof PRICING.outerSleeves] || 0) * qty
    const shrinkwrapTotal = shrinkwrap ? PRICING.shrinkwrap * qty : 0
    const outerTotal = outerSleevesTotal + shrinkwrapTotal

    const upcCost = upcBarcodes === "embedded"
      ? PRICING.upcBarcodes.embedded
      : upcBarcodes === "sticker"
        ? tierPrice(PRICING.upcBarcodes.sticker, qty)
        : 0

    const downloadCardsTotal = downloadCards ? tierPrice(PRICING.extras.downloadCards, qty) : 0
    const marketingSticker2Total = marketingSticker2 ? tierPrice(PRICING.extras.marketingSticker, qty) : 0
    const marketingSticker25x3Total = marketingSticker25x3 ? tierPrice(PRICING.extras.marketingSticker, qty) : 0
    const extrasTotal = downloadCardsTotal + marketingSticker2Total + marketingSticker25x3Total

    let assemblyCount = 0
    if (assembly === "standard") {
      if (outerSleevesTotal > 0) assemblyCount += 1
      if (jacketTotal > 0) assemblyCount += 1
      if (insertTotal > 0) assemblyCount += 1
      if (upcBarcodes === "sticker") assemblyCount += 1
      if (downloadCards) assemblyCount += 1
      if (marketingSticker2) assemblyCount += 1
      if (marketingSticker25x3) assemblyCount += 1
      if (isDouble) assemblyCount += 1
    }
    const assemblyCost = PRICING.assemblyActionFee * assemblyCount * qty

    const fixedCosts = lacquerCost + electroplatingCost + setupCost + testPressingCost + upcCost
    const variableTotal = pressingTotal + labelTotal + innerTotal + insertTotal + jacketTotal + outerTotal + assemblyCost + extrasTotal
    const grandTotal = fixedCosts + variableTotal
    const unitPrice = grandTotal / qty

    return {
      quantity: qty,
      fixedCosts: {
        lacquer: lacquerCost,
        electroplating: electroplatingCost,
        setup: setupCost,
        testPressings: testPressingCost,
        upc: upcCost,
        total: fixedCosts,
      },
      perUnit: {
        pressing: pressingBase,
        color: 0,
        labels: labelTotal / qty,
        innerSleeves: innerTotal / qty,
        inserts: insertTotal / qty,
        jackets: jacketTotal / qty,
        outerSleeves: outerTotal / qty,
        shrinkwrap: shrinkwrapTotal / qty,
        assembly: assemblyCost / qty,
        extras: extrasTotal / qty,
        total: variableTotal / qty,
      },
      pressingTotal,
      jacketUpgradeCost,
      grandTotal,
      unitPrice,
    }
  }, [
    masterFormat, projectType, quantity, colorStyle, testPressings,
    centerLabels, innerSleeves, inserts, jackets, outerSleeves,
    shrinkwrap, upcBarcodes, assembly,
    uvGloss, matte, reverseBoard, heavyJacket,
    downloadCards, marketingSticker2, marketingSticker25x3
  ])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount)
  }

  const submitQuote = async (action: "save_quote" | "start_order") => {
    if (!name.trim() || !email.trim()) {
      setSubmitMessage("Name and email are required.")
      return
    }

    setSubmittingAction(action)
    setSubmitMessage("")

    const jacketUpgrades = {
      uvGloss,
      matte,
      reverseBoard,
      heavyJacket,
    }
    const jacketUpgradesLabel = [
      uvGloss && "UV Gloss Coating",
      matte && "Matte Coating",
      reverseBoard && "Reverse Board",
      heavyJacket && "24pt Heavy Jacket",
    ].filter(Boolean).join(", ")
    const extrasLabel = [
      downloadCards && "Download Cards",
      marketingSticker2 && 'Marketing Sticker - 2" Circle',
      marketingSticker25x3 && 'Marketing Sticker - 2.5" x 3"',
    ].filter(Boolean).join(", ")

    try {
      const response = await fetch("/api/quote/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          projectType,
          projectTypeLabel: optionLabel(projectTypeOptions, projectType),
          quantity: estimate.quantity,
          vinylColor: colorStyle,
          vinylColorLabel: optionLabel(vinylColorOptions, colorStyle),
          testPressings,
          masterFormat,
          masterFormatLabel: optionLabel(masterFormatOptions, masterFormat),
          centerLabels,
          centerLabelsLabel: optionLabel(centerLabelOptions, centerLabels),
          innerSleeves,
          innerSleevesLabel: optionLabel(innerSleeveOptions, innerSleeves),
          inserts,
          insertsLabel: optionLabel(insertOptions, inserts),
          jackets,
          jacketsLabel: optionLabel(jacketOptions, jackets),
          jacketUpgrades,
          jacketUpgradesLabel: jacketUpgradesLabel || "None",
          outerSleeves,
          outerSleevesLabel: optionLabel(outerSleeveOptions, outerSleeves),
          shrinkwrap,
          upcBarcodes,
          upcBarcodesLabel: optionLabel(upcBarcodeOptions, upcBarcodes),
          assembly,
          assemblyLabel: optionLabel(assemblyOptions, assembly),
          extrasLabel: extrasLabel || "None",
          estimate: {
            ...estimate,
            lacquerCost: estimate.fixedCosts.lacquer,
            electroplatingCost: estimate.fixedCosts.electroplating,
            setupCost: estimate.fixedCosts.setup,
            testPressingCost: estimate.fixedCosts.testPressings,
            pressingCost: estimate.pressingTotal,
            labelCost: estimate.perUnit.labels * estimate.quantity,
            innerCost: estimate.perUnit.innerSleeves * estimate.quantity,
            insertCost: estimate.perUnit.inserts * estimate.quantity,
            jacketCost: estimate.perUnit.jackets * estimate.quantity,
            jacketUpgradeCost: estimate.jacketUpgradeCost,
            outerCost: estimate.perUnit.outerSleeves * estimate.quantity,
            assemblyCost: estimate.perUnit.assembly * estimate.quantity,
          },
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || "Quote submission failed")
      setSubmitMessage(action === "start_order" ? "Order started. We got it." : "Quote saved and emailed.")
    } catch (error) {
      setSubmitMessage(error instanceof Error ? error.message : "Quote submission failed")
    } finally {
      setSubmittingAction(null)
    }
  }

  return (
    <section id="quote" className="py-24 md:py-32 bg-background">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-primary font-mono text-sm uppercase tracking-[0.3em] mb-4">
            Instant Pricing
          </p>
          <h2 className="text-4xl md:text-5xl font-bold uppercase tracking-tight mb-6">
            Quote Calculator
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Configure your vinyl pressing project and get an instant estimate. 
            Minimum order quantity is 100 units.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Form Section */}
          <div className="lg:col-span-2 space-y-8">
            {/* Lacquer & Mastering */}
            <div className="bg-card border border-border p-6 md:p-8">
              <h3 className="text-lg font-bold uppercase tracking-wider mb-6 flex items-center gap-3">
                <span className="w-8 h-8 bg-primary text-primary-foreground flex items-center justify-center text-sm font-mono">1</span>
                Mastering
              </h3>
              <Select
                label="Master Format"
                value={masterFormat}
                onChange={setMasterFormat}
                tooltip="If you have your own lacquer, we can skip cutting."
                options={masterFormatOptions}
              />
            </div>

            {/* Pressing Options */}
            <div className="bg-card border border-border p-6 md:p-8">
              <h3 className="text-lg font-bold uppercase tracking-wider mb-6 flex items-center gap-3">
                <span className="w-8 h-8 bg-primary text-primary-foreground flex items-center justify-center text-sm font-mono">2</span>
                Pressing
              </h3>
              <div className="grid sm:grid-cols-2 gap-6">
                <Select
                  label="Project Type"
                  value={projectType}
                  onChange={setProjectType}
                  options={projectTypeOptions}
                />
                <NumberInput
                  label="Quantity"
                  value={quantity}
                  onChange={setQuantity}
                  min={100}
                  step={50}
                  tooltip="Minimum order is 100 units"
                />
                <Select
                  label="Vinyl Color"
                  value={colorStyle}
                  onChange={setColorStyle}
                  options={vinylColorOptions}
                />
                <NumberInput
                  label="Test Pressings"
                  value={testPressings}
                  onChange={setTestPressings}
                  min={0}
                  tooltip="Recommended: 5 test pressings to approve before full run"
                />
              </div>
            </div>

            {/* Packaging */}
            <div className="bg-card border border-border p-6 md:p-8">
              <h3 className="text-lg font-bold uppercase tracking-wider mb-6 flex items-center gap-3">
                <span className="w-8 h-8 bg-primary text-primary-foreground flex items-center justify-center text-sm font-mono">3</span>
                Packaging
              </h3>
              <div className="grid sm:grid-cols-2 gap-6 mb-6">
                <Select
                  label="Center Labels"
                  value={centerLabels}
                  onChange={setCenterLabels}
                  options={centerLabelOptions}
                />
                <Select
                  label="Inner Sleeves"
                  value={innerSleeves}
                  onChange={setInnerSleeves}
                  options={innerSleeveOptions}
                />
                <Select
                  label="Inserts"
                  value={inserts}
                  onChange={setInserts}
                  options={insertOptions}
                />
                <Select
                  label="Jackets"
                  value={jackets}
                  onChange={setJackets}
                  options={jacketOptions}
                />
              </div>
              
              {jackets !== "none" && (
                <div className="border-t border-border pt-6 mb-6">
                  <p className="text-sm font-medium text-foreground mb-4">Jacket Upgrades</p>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Checkbox label="UV Gloss Coating" checked={uvGloss} onChange={setUvGloss} />
                    <Checkbox label="Matte Coating" checked={matte} onChange={setMatte} />
                    <Checkbox label="Reverse Board" checked={reverseBoard} onChange={setReverseBoard} />
                    <Checkbox label="24pt Heavy Jacket" checked={heavyJacket} onChange={setHeavyJacket} />
                  </div>
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-6">
                <Select
                  label="Outer Sleeves"
                  value={outerSleeves}
                  onChange={setOuterSleeves}
                  options={outerSleeveOptions}
                />
                <div className="space-y-4">
                  <Checkbox label="Shrinkwrap" checked={shrinkwrap} onChange={setShrinkwrap} />
                </div>
              </div>
            </div>

            {/* Extras & Assembly */}
            <div className="bg-card border border-border p-6 md:p-8">
              <h3 className="text-lg font-bold uppercase tracking-wider mb-6 flex items-center gap-3">
                <span className="w-8 h-8 bg-primary text-primary-foreground flex items-center justify-center text-sm font-mono">4</span>
                Extras & Assembly
              </h3>
              <div className="grid sm:grid-cols-2 gap-6 mb-6">
                <Select
                  label="UPC Barcodes"
                  value={upcBarcodes}
                  onChange={setUpcBarcodes}
                  options={upcBarcodeOptions}
                />
                <Select
                  label="Assembly"
                  value={assembly}
                  onChange={setAssembly}
                  options={assemblyOptions}
                />
              </div>
              <div className="border-t border-border pt-6">
                <p className="text-sm font-medium text-foreground mb-4">Additional Extras</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Checkbox label="Download Cards" checked={downloadCards} onChange={setDownloadCards} />
                  <Checkbox label='Marketing Sticker - 2" Circle' checked={marketingSticker2} onChange={setMarketingSticker2} />
                  <Checkbox label='Marketing Sticker - 2.5" x 3"' checked={marketingSticker25x3} onChange={setMarketingSticker25x3} />
                </div>
              </div>
            </div>
          </div>

          {/* Estimate Summary - Sticky */}
          <div className="lg:col-span-1">
            <div className="bg-card border border-border p-6 md:p-8 lg:sticky lg:top-24">
              <div className="flex items-center gap-3 mb-6">
                <Calculator size={24} className="text-primary" />
                <h3 className="text-lg font-bold uppercase tracking-wider">Project Estimate</h3>
              </div>

              <div className="space-y-4 mb-6">
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-muted-foreground">Quantity</span>
                  <span className="font-mono font-bold">{estimate.quantity.toLocaleString()}</span>
                </div>
                
                <div className="py-2">
                  <p className="text-sm text-muted-foreground mb-2">Fixed Costs</p>
                  <div className="space-y-1 text-sm">
                    {estimate.fixedCosts.lacquer > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Lacquer Cutting</span>
                        <span className="font-mono">{formatCurrency(estimate.fixedCosts.lacquer)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Electroplating</span>
                      <span className="font-mono">{formatCurrency(estimate.fixedCosts.electroplating)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Setup Fee</span>
                      <span className="font-mono">{formatCurrency(estimate.fixedCosts.setup)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Test Pressings</span>
                      <span className="font-mono">{formatCurrency(estimate.fixedCosts.testPressings)}</span>
                    </div>
                    {estimate.fixedCosts.upc > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">UPC Barcode</span>
                        <span className="font-mono">{formatCurrency(estimate.fixedCosts.upc)}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-between items-center py-2 border-t border-border">
                  <span className="text-muted-foreground">Per Unit Cost</span>
                  <span className="font-mono">{formatCurrency(estimate.perUnit.total)}</span>
                </div>
                
                <div className="flex justify-between items-center py-2 border-t border-border">
                  <span className="text-muted-foreground">Pressing Total</span>
                  <span className="font-mono">{formatCurrency(estimate.pressingTotal)}</span>
                </div>
              </div>

              <div className="bg-secondary p-4 mb-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground">Unit Price</span>
                  <span className="font-mono text-lg">{formatCurrency(estimate.unitPrice)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-bold uppercase">Total Estimate</span>
                  <span className="font-mono text-2xl text-primary font-bold">{formatCurrency(estimate.grandTotal)}</span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground mb-6">
                * This is an estimate only. Final pricing may vary based on project specifics. 
                Contact us for a detailed quote.
              </p>

              <div className="space-y-3 mb-6">
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Name"
                  className="w-full bg-secondary text-foreground px-4 py-3 border border-border focus:border-primary focus:outline-none transition-colors"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Email"
                  className="w-full bg-secondary text-foreground px-4 py-3 border border-border focus:border-primary focus:outline-none transition-colors"
                />
                <input
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="Phone"
                  className="w-full bg-secondary text-foreground px-4 py-3 border border-border focus:border-primary focus:outline-none transition-colors"
                />
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => submitQuote("start_order")}
                  disabled={submittingAction !== null}
                  className="w-full px-6 py-3 bg-primary text-primary-foreground font-bold uppercase tracking-wider text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Send size={16} />
                  {submittingAction === "start_order" ? "Starting..." : "Start Order"}
                </button>
                <button
                  onClick={() => submitQuote("save_quote")}
                  disabled={submittingAction !== null}
                  className="w-full px-6 py-3 border border-foreground text-foreground font-bold uppercase tracking-wider text-sm hover:bg-foreground hover:text-background transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Save size={16} />
                  {submittingAction === "save_quote" ? "Saving..." : "Save Quote"}
                </button>
                {submitMessage && (
                  <p className="text-xs text-muted-foreground text-center">{submitMessage}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
