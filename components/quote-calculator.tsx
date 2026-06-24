"use client"

import { useMemo, useState } from "react"
import { Calculator, ChevronDown, Info, Save, Send } from "lucide-react"
import {
  calculateLegacyQuote,
  heavyJacketUpgradeAllowed,
  jacketUpgradesAllowed,
  LEGACY_PROJECT_TYPES,
  splatterAllowed,
  type LegacyColorStyle,
  type LegacyProjectType,
  type LegacyQuoteInput,
  type LegacyVariation,
} from "@/lib/legacy-quote"

type Option = { value: string; label: string }

function Select({
  label,
  value,
  onChange,
  options,
  tooltip,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Option[]
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
      <div className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full appearance-none bg-secondary text-foreground px-4 py-3 pr-10 border border-border focus:border-primary focus:outline-none transition-colors cursor-pointer"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
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
  tooltip,
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
        onChange={(event) => onChange(Math.max(min, parseInt(event.target.value, 10) || 0))}
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
  onChange,
  disabled = false,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className={`flex items-center gap-3 ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer group"}`}>
      <div
        className={`w-5 h-5 border-2 flex items-center justify-center transition-colors ${
          checked ? "bg-primary border-primary" : "border-border group-hover:border-primary"
        }`}
      >
        {checked && (
          <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="square" strokeLinejoin="miter" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="text-sm text-foreground">{label}</span>
    </label>
  )
}

function optionLabel(options: Option[], value: string) {
  return options.find((option) => option.value === value)?.label || value
}

function colorOptions(projectType: LegacyProjectType): Option[] {
  const options: Option[] = [
    { value: "black", label: "Black" },
    { value: "random", label: "Random Color Special" },
    { value: "solid", label: "Solid" },
    { value: "translucent", label: "Translucent" },
    { value: "marble", label: "Marble" },
    { value: "smoke", label: "Smoke" },
  ]
  if (splatterAllowed(projectType)) {
    options.push({ value: "splatter", label: "Splatter" })
  }
  return options
}

const CENTER_LABEL_OPTIONS: Option[] = [
  { value: "printed", label: "Printed" },
  { value: "blank", label: "Blank" },
  { value: "customerSupplied", label: "Customer Supplied" },
]

const INNER_SLEEVE_OPTIONS: Option[] = [
  { value: "whitePaper", label: "White Paper" },
  { value: "heavyWhitePaper", label: "Heavy Duty White Paper" },
  { value: "blackPaper", label: "Black Paper" },
  { value: "brownPaper", label: "Brown Paper" },
  { value: "whitePoly", label: "White Poly-Lined" },
  { value: "blackPoly", label: "Black Poly-Lined" },
  { value: "printed1Color", label: "Printed - 1-Color" },
  { value: "printedFullColor", label: "Printed - Full Color" },
]

const INSERT_OPTIONS: Option[] = [
  { value: "none", label: "None" },
  { value: "2panel", label: "12 x 12 - 2-Panel" },
  { value: "4panel", label: "24 x 12 - 4-Panel" },
]

const JACKET_OPTIONS: Option[] = [
  { value: "none", label: "None" },
  { value: "fullColorSingle", label: "Printed - Full Color - Single Pocket (Standard)" },
  { value: "1colorSingle", label: "Printed - 1-Color - Single Pocket (Standard)" },
  { value: "fullColorWide", label: "Printed - Full Color - Single Pocket (Wide Spine for 2xLP)" },
  { value: "1colorWide", label: "Printed - 1-Color - Single Pocket (Wide Spine for 2xLP)" },
  { value: "gatefold", label: "Printed - Full Color - Gatefold (Standard)" },
  { value: "screenWhite1", label: "Screen-Printed - White or Chipboard 1-Color - Single Pocket" },
  { value: "screenWhite2", label: "Screen-Printed - White or Chipboard 2-Color - Single Pocket" },
  { value: "screenWhite3", label: "Screen-Printed - White or Chipboard 3-Color - Single Pocket" },
  { value: "screenWhite4", label: "Screen-Printed - White or Chipboard 4-Color - Single Pocket" },
  { value: "screenBlack1", label: "Screen-Printed - Black 1-Color - Single Pocket" },
  { value: "screenBlack2", label: "Screen-Printed - Black 2-Color - Single Pocket" },
  { value: "screenBlack3", label: "Screen-Printed - Black 3-Color - Single Pocket" },
  { value: "screenBlack4", label: "Screen-Printed - Black 4-Color - Single Pocket" },
  { value: "blankWhite", label: "Blank - White - Single Pocket" },
  { value: "blankBlack", label: "Blank - Black - Single Pocket" },
  { value: "blankChipboard", label: "Blank - Chipboard - Single Pocket" },
]

const OUTER_SLEEVE_OPTIONS: Option[] = [
  { value: "none", label: "None" },
  { value: "standardNoFlap", label: "Standard - No Flap (Polyethylene)" },
  { value: "standardWithFlap", label: "Standard - With Flap (Polyethylene)" },
  { value: "crystalClear", label: "Crystal Clear - Resealable Flap (Polypropylene)" },
  { value: "shrinkwrap", label: "Shrinkwrap" },
]

const ASSEMBLY_OPTIONS: Option[] = [
  { value: "standard", label: "Standard - NORP Assembles" },
  { value: "none", label: "None - I'll Assemble Myself" },
]

export function QuoteCalculator() {
  const [masterFormat, setMasterFormat] = useState<LegacyQuoteInput["masterFormat"]>("audioFiles")
  const [projectType, setProjectType] = useState<LegacyProjectType>("single_heavyweight")
  const [variations, setVariations] = useState<LegacyVariation[]>([
    { quantity: 1000, colorStyle: "black" },
    { quantity: 0, colorStyle: "black" },
    { quantity: 0, colorStyle: "black" },
  ])
  const [testPressings, setTestPressings] = useState(5)
  const [centerLabels, setCenterLabels] = useState<LegacyQuoteInput["centerLabels"]>("printed")
  const [innerSleeves, setInnerSleeves] = useState<LegacyQuoteInput["innerSleeves"]>("whitePaper")
  const [inserts, setInserts] = useState<LegacyQuoteInput["inserts"]>("none")
  const [jackets, setJackets] = useState("fullColorSingle")
  const [outerSleeves, setOuterSleeves] = useState<LegacyQuoteInput["outerSleeves"]>("shrinkwrap")
  const [assembly, setAssembly] = useState<LegacyQuoteInput["assembly"]>("standard")
  const [uvGloss, setUvGloss] = useState(false)
  const [matte, setMatte] = useState(false)
  const [reverseBoard, setReverseBoard] = useState(false)
  const [heavyJacket, setHeavyJacket] = useState(false)
  const [upcEmbedded, setUpcEmbedded] = useState(false)
  const [upcSticker, setUpcSticker] = useState(false)
  const [downloadCards, setDownloadCards] = useState(false)
  const [marketingStickerCircle, setMarketingStickerCircle] = useState(false)
  const [marketingStickerRectangle, setMarketingStickerRectangle] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [submittingAction, setSubmittingAction] = useState<"save_quote" | "start_order" | null>(null)
  const [submitMessage, setSubmitMessage] = useState("")

  const vinylColorOptions = useMemo(() => colorOptions(projectType), [projectType])
  const totalQuantity = useMemo(
    () => Math.max(1, variations.filter((variation) => variation.quantity > 0).reduce((sum, variation) => sum + variation.quantity, 0)),
    [variations],
  )
  const isSevenInch = projectType === "seveninch"
  const innerSleeveOptions = useMemo(
    () =>
      isSevenInch
        ? INNER_SLEEVE_OPTIONS.filter((option) => ["whitePaper", "blackPaper", "brownPaper"].includes(option.value))
        : INNER_SLEEVE_OPTIONS,
    [isSevenInch],
  )
  const insertOptions = useMemo(
    () => (isSevenInch ? INSERT_OPTIONS.filter((option) => option.value === "none") : INSERT_OPTIONS),
    [isSevenInch],
  )
  const jacketOptions = useMemo(
    () =>
      isSevenInch
        ? JACKET_OPTIONS.filter((option) =>
            ["none", "fullColorSingle", "1colorSingle", "blankWhite", "blankBlack", "blankChipboard"].includes(option.value),
          )
        : JACKET_OPTIONS,
    [isSevenInch],
  )
  const showJacketUpgrades = jacketUpgradesAllowed(projectType, totalQuantity, jackets)
  const showHeavyJacketUpgrade = showJacketUpgrades && heavyJacketUpgradeAllowed(totalQuantity, jackets)

  const quoteInput = useMemo<LegacyQuoteInput>(
    () => ({
      masterFormat,
      projectType,
      variations,
      testPressings,
      centerLabels,
      innerSleeves,
      inserts,
      jackets,
      outerSleeves,
      upcEmbedded,
      upcSticker,
      assembly,
      jacketUpgrades: { uvGloss, matte, reverseBoard, heavyJacket },
      downloadCards,
      marketingStickerCircle,
      marketingStickerRectangle,
    }),
    [
      masterFormat,
      projectType,
      variations,
      testPressings,
      centerLabels,
      innerSleeves,
      inserts,
      jackets,
      outerSleeves,
      upcEmbedded,
      upcSticker,
      assembly,
      uvGloss,
      matte,
      reverseBoard,
      heavyJacket,
      downloadCards,
      marketingStickerCircle,
      marketingStickerRectangle,
    ],
  )

  const estimate = useMemo(() => calculateLegacyQuote(quoteInput), [quoteInput])

  const updateVariation = (index: number, patch: Partial<LegacyVariation>) => {
    setVariations((current) =>
      current.map((variation, variationIndex) =>
        variationIndex === index ? { ...variation, ...patch } : variation,
      ),
    )
  }

  const handleProjectTypeChange = (value: string) => {
    const nextType = value as LegacyProjectType
    setProjectType(nextType)
    if (!splatterAllowed(nextType)) {
      setVariations((current) =>
        current.map((variation) =>
          variation.colorStyle === "splatter" ? { ...variation, colorStyle: "black" } : variation,
        ),
      )
    }
    if (nextType === "seveninch") {
      if (!["whitePaper", "blackPaper", "brownPaper"].includes(innerSleeves)) setInnerSleeves("whitePaper")
      if (inserts !== "none") setInserts("none")
      if (
        !["none", "fullColorSingle", "1colorSingle", "blankWhite", "blankBlack", "blankChipboard"].includes(jackets)
      ) {
        setJackets("fullColorSingle")
      }
      setUvGloss(false)
      setMatte(false)
      setReverseBoard(false)
      setHeavyJacket(false)
    }
  }

  const applyPreset = (preset: "standard" | "double" | "whitelabel") => {
    setMasterFormat("audioFiles")
    setTestPressings(5)
    setUpcEmbedded(false)
    setUpcSticker(false)
    setDownloadCards(false)
    setMarketingStickerCircle(false)
    setMarketingStickerRectangle(false)
    setUvGloss(false)
    setMatte(false)
    setReverseBoard(false)
    setHeavyJacket(false)

    if (preset === "standard") {
      setProjectType("single_heavyweight")
      setVariations([
        { quantity: 1000, colorStyle: "black" },
        { quantity: 0, colorStyle: "black" },
        { quantity: 0, colorStyle: "black" },
      ])
      setCenterLabels("printed")
      setInnerSleeves("whitePaper")
      setInserts("2panel")
      setJackets("fullColorSingle")
      setOuterSleeves("shrinkwrap")
      setAssembly("standard")
      return
    }

    if (preset === "double") {
      setProjectType("double_heavyweight")
      setVariations([
        { quantity: 1000, colorStyle: "solid" },
        { quantity: 0, colorStyle: "black" },
        { quantity: 0, colorStyle: "black" },
      ])
      setCenterLabels("printed")
      setInnerSleeves("whitePaper")
      setInserts("none")
      setJackets("gatefold")
      setOuterSleeves("shrinkwrap")
      setAssembly("standard")
      return
    }

    setProjectType("single_heavyweight")
    setVariations([
      { quantity: 300, colorStyle: "black" },
      { quantity: 0, colorStyle: "black" },
      { quantity: 0, colorStyle: "black" },
    ])
    setCenterLabels("blank")
    setInnerSleeves("whitePaper")
    setInserts("none")
    setJackets("none")
    setOuterSleeves("none")
    setAssembly("none")
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount)

  const lineItems = [
    { label: "Lacquer", amount: estimate.lacquer },
    { label: "Electroplating", amount: estimate.electroplating },
    { label: "Setup Fee", amount: estimate.setupFee },
    { label: "Test Pressings", amount: estimate.testPressings },
    { label: "Pressing", amount: estimate.pressing },
    { label: "Center Labels", amount: estimate.centerLabels },
    { label: "Inner Sleeves", amount: estimate.innerSleeves },
    { label: "Inserts", amount: estimate.inserts },
    { label: "Jackets", amount: estimate.jackets },
    { label: "Outer Sleeves", amount: estimate.outerSleeves },
    { label: "Extras", amount: estimate.extras },
    { label: "Assembly Fees", amount: estimate.assemblyFees },
  ]

  const submitQuote = async (action: "save_quote" | "start_order") => {
    if (!name.trim() || !email.trim()) {
      setSubmitMessage("Name and email are required.")
      return
    }

    setSubmittingAction(action)
    setSubmitMessage("")

    const jacketUpgradesLabel = [
      uvGloss && "UV Gloss Coating",
      matte && "Matte Coating",
      reverseBoard && "Reverse Board",
      heavyJacket && "24pt. Heavy Jacket",
    ]
      .filter(Boolean)
      .join(", ")

    const extrasLabel = [
      upcEmbedded && "UPC Barcode - Embedded",
      upcSticker && "UPC Barcode - Stickers",
      downloadCards && "Download Cards",
      marketingStickerCircle && 'Marketing Sticker - 2" Circle',
      marketingStickerRectangle && 'Marketing Sticker - 2.5" x 3" Rectangle',
    ]
      .filter(Boolean)
      .join(", ")

    const variationsLabel = variations
      .filter((variation) => variation.quantity > 0)
      .map(
        (variation, index) =>
          `Variation ${index + 1}: ${variation.quantity.toLocaleString()} ${optionLabel(vinylColorOptions, variation.colorStyle)}`,
      )
      .join("; ")

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
          projectTypeLabel: optionLabel([...LEGACY_PROJECT_TYPES], projectType),
          quantity: estimate.quantity,
          variations: variations.filter((variation) => variation.quantity > 0),
          variationsLabel,
          vinylColor: variations[0]?.colorStyle || "",
          vinylColorLabel: variationsLabel || "None",
          testPressings,
          masterFormat,
          masterFormatLabel: optionLabel(
            [
              { value: "audioFiles", label: "I'm submitting audio files" },
              { value: "haveLacquer", label: "I have a lacquer" },
            ],
            masterFormat,
          ),
          centerLabels,
          centerLabelsLabel: optionLabel(CENTER_LABEL_OPTIONS, centerLabels),
          innerSleeves,
          innerSleevesLabel: optionLabel(INNER_SLEEVE_OPTIONS, innerSleeves),
          inserts,
          insertsLabel: optionLabel(INSERT_OPTIONS, inserts),
          jackets,
          jacketsLabel: optionLabel(JACKET_OPTIONS, jackets),
          jacketUpgrades: { uvGloss, matte, reverseBoard, heavyJacket },
          jacketUpgradesLabel: jacketUpgradesLabel || "None",
          outerSleeves,
          outerSleevesLabel: optionLabel(OUTER_SLEEVE_OPTIONS, outerSleeves),
          shrinkwrap: outerSleeves === "shrinkwrap",
          upcBarcodes: upcEmbedded ? "embedded" : upcSticker ? "sticker" : "none",
          upcBarcodesLabel: extrasLabel.includes("UPC") ? extrasLabel : "None / Don't Need",
          assembly,
          assemblyLabel: optionLabel(ASSEMBLY_OPTIONS, assembly),
          extrasLabel: extrasLabel || "None",
          estimate: {
            quantity: estimate.quantity,
            grandTotal: estimate.total,
            unitPrice: estimate.unitPrice,
            lacquerCost: estimate.lacquer,
            electroplatingCost: estimate.electroplating,
            setupCost: estimate.setupFee,
            testPressingCost: estimate.testPressings,
            pressingCost: estimate.pressing,
            labelCost: estimate.centerLabels,
            innerCost: estimate.innerSleeves,
            insertCost: estimate.inserts,
            jacketCost: estimate.jackets,
            outerCost: estimate.outerSleeves,
            assemblyCost: estimate.assemblyFees,
            fixedCosts: {
              lacquer: estimate.lacquer,
              electroplating: estimate.electroplating,
              setup: estimate.setupFee,
              testPressings: estimate.testPressings,
              upc: estimate.extras,
              total: estimate.lacquer + estimate.electroplating + estimate.setupFee + estimate.testPressings,
            },
            perUnit: {
              total: estimate.unitPrice,
            },
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
          <p className="text-primary font-mono text-sm uppercase tracking-[0.3em] mb-4">Instant Pricing</p>
          <h2 className="text-4xl md:text-5xl font-bold uppercase tracking-tight mb-6">Quote Calculator</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Choose your pressing options and view an instant quote in real-time. Minimum order quantity is 100 units.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-card border border-border p-6 md:p-8">
              <h3 className="text-lg font-bold uppercase tracking-wider mb-6 flex items-center gap-3">
                <span className="w-8 h-8 bg-primary text-primary-foreground flex items-center justify-center text-sm font-mono">1</span>
                Lacquer
              </h3>
              <Select
                label="Master Format"
                value={masterFormat}
                onChange={(value) => setMasterFormat(value as LegacyQuoteInput["masterFormat"])}
                tooltip="If you have your own lacquer, we can skip cutting."
                options={[
                  { value: "audioFiles", label: "I'm submitting audio files" },
                  { value: "haveLacquer", label: "I have a lacquer" },
                ]}
              />
            </div>

            <div className="bg-card border border-border p-6 md:p-8">
              <h3 className="text-lg font-bold uppercase tracking-wider mb-6 flex items-center gap-3">
                <span className="w-8 h-8 bg-primary text-primary-foreground flex items-center justify-center text-sm font-mono">2</span>
                Pressing
              </h3>

              <div className="grid gap-3 mb-6 md:grid-cols-3">
                <button
                  type="button"
                  onClick={() => applyPreset("standard")}
                  className="border border-border bg-secondary/70 p-4 text-left text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                >
                  <span className="block font-bold text-foreground">Standard Package</span>
                  1000x 12&quot; Black or Random Color 180g, printed labels, insert, jacket, shrinkwrap
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("double")}
                  className="border border-border bg-secondary/70 p-4 text-left text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                >
                  <span className="block font-bold text-foreground">Color Double LP</span>
                  1000x 2x12&quot; Solid or Translucent 180g, gatefold, shrinkwrap
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("whitelabel")}
                  className="border border-border bg-secondary/70 p-4 text-left text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                >
                  <span className="block font-bold text-foreground">DIY White Label</span>
                  300x 12&quot; Black or Random Color 180g, blank labels, white paper sleeves
                </button>
              </div>

              <div className="grid sm:grid-cols-2 gap-6 mb-6">
                <Select
                  label="Project Type"
                  value={projectType}
                  onChange={handleProjectTypeChange}
                  options={[...LEGACY_PROJECT_TYPES]}
                />
                <NumberInput
                  label="Test Pressing Quantity"
                  value={testPressings}
                  onChange={setTestPressings}
                  min={0}
                  tooltip="Recommended: 5 test pressings to approve before full run"
                />
              </div>

              <div className="space-y-4">
                {variations.map((variation, index) => (
                  <div key={index} className="grid gap-4 border border-border bg-secondary/30 p-4 sm:grid-cols-2">
                    <NumberInput
                      label={`Quantity${index === 0 ? "" : ` (Variation ${index + 1})`}`}
                      value={variation.quantity}
                      onChange={(quantity) => updateVariation(index, { quantity })}
                      min={index === 0 ? 1 : 0}
                      step={50}
                      tooltip={index === 0 ? "First variation is required." : "Set to 0 to ignore this variation."}
                    />
                    <Select
                      label={`Color Style${index === 0 ? "" : ` (Variation ${index + 1})`}`}
                      value={variation.colorStyle}
                      onChange={(colorStyle) =>
                        updateVariation(index, { colorStyle: colorStyle as LegacyColorStyle })
                      }
                      options={vinylColorOptions}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card border border-border p-6 md:p-8">
              <h3 className="text-lg font-bold uppercase tracking-wider mb-6 flex items-center gap-3">
                <span className="w-8 h-8 bg-primary text-primary-foreground flex items-center justify-center text-sm font-mono">3</span>
                Packaging
              </h3>
              <div className="grid sm:grid-cols-2 gap-6 mb-6">
                <Select
                  label="Center Labels"
                  value={centerLabels}
                  onChange={(value) => setCenterLabels(value as LegacyQuoteInput["centerLabels"])}
                  options={CENTER_LABEL_OPTIONS}
                />
                <Select
                  label="Inner Sleeves"
                  value={innerSleeves}
                  onChange={(value) => setInnerSleeves(value as LegacyQuoteInput["innerSleeves"])}
                  options={innerSleeveOptions}
                />
                <Select
                  label="Inserts"
                  value={inserts}
                  onChange={(value) => setInserts(value as LegacyQuoteInput["inserts"])}
                  options={insertOptions}
                />
                <Select label="Jackets" value={jackets} onChange={setJackets} options={jacketOptions} />
              </div>

              {showJacketUpgrades && (
                <div className="border-t border-border pt-6 mb-6">
                  <p className="text-sm font-medium text-foreground mb-4">Jacket Upgrades (Check any that apply)</p>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Checkbox
                      label="UV Gloss Coating"
                      checked={uvGloss}
                      onChange={(checked) => {
                        setUvGloss(checked)
                        if (checked) setMatte(false)
                      }}
                    />
                    <Checkbox
                      label="Matte Coating"
                      checked={matte}
                      onChange={(checked) => {
                        setMatte(checked)
                        if (checked) setUvGloss(false)
                      }}
                    />
                    <Checkbox label="Reverse Board" checked={reverseBoard} onChange={setReverseBoard} />
                    <Checkbox
                      label="24pt. Heavy Jacket"
                      checked={heavyJacket}
                      onChange={setHeavyJacket}
                      disabled={!showHeavyJacketUpgrade}
                    />
                  </div>
                </div>
              )}

              <Select
                label="Outer Sleeves"
                value={outerSleeves}
                onChange={(value) => setOuterSleeves(value as LegacyQuoteInput["outerSleeves"])}
                options={OUTER_SLEEVE_OPTIONS}
              />
            </div>

            <div className="bg-card border border-border p-6 md:p-8">
              <h3 className="text-lg font-bold uppercase tracking-wider mb-6 flex items-center gap-3">
                <span className="w-8 h-8 bg-primary text-primary-foreground flex items-center justify-center text-sm font-mono">4</span>
                Extras & Assembly
              </h3>
              <Select
                label="Assembly Fees"
                value={assembly}
                onChange={(value) => setAssembly(value as LegacyQuoteInput["assembly"])}
                options={ASSEMBLY_OPTIONS}
              />
              <div className="border-t border-border pt-6 mt-6">
                <p className="text-sm font-medium text-foreground mb-4">Extras (Check any that apply)</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Checkbox
                    label="UPC Barcode - Embedded"
                    checked={upcEmbedded}
                    onChange={(checked) => {
                      setUpcEmbedded(checked)
                      if (checked) setUpcSticker(false)
                    }}
                  />
                  <Checkbox
                    label="UPC Barcode - Stickers"
                    checked={upcSticker}
                    onChange={(checked) => {
                      setUpcSticker(checked)
                      if (checked) setUpcEmbedded(false)
                    }}
                  />
                  <Checkbox label="Download Cards" checked={downloadCards} onChange={setDownloadCards} />
                  <Checkbox
                    label='Marketing Sticker - 2" Circle'
                    checked={marketingStickerCircle}
                    onChange={setMarketingStickerCircle}
                  />
                  <Checkbox
                    label='Marketing Sticker - 2.5" x 3" Rectangle'
                    checked={marketingStickerRectangle}
                    onChange={setMarketingStickerRectangle}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="bg-card border border-border p-6 md:p-8 lg:sticky lg:top-24">
              <div className="flex items-center gap-3 mb-6">
                <Calculator size={24} className="text-primary" />
                <h3 className="text-lg font-bold uppercase tracking-wider">Project Estimate</h3>
              </div>

              <div className="space-y-1 mb-6 text-sm">
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-muted-foreground uppercase tracking-wider text-xs">Quantity</span>
                  <span className="font-mono font-bold">{estimate.quantity.toLocaleString()}</span>
                </div>
                {lineItems.map((item) =>
                  item.amount > 0 ? (
                    <div key={item.label} className="flex justify-between gap-4 py-1.5">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="font-mono">{formatCurrency(item.amount)}</span>
                    </div>
                  ) : null,
                )}
              </div>

              <div className="bg-secondary p-4 mb-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground uppercase tracking-wider">Unit Price</span>
                  <span className="font-mono text-lg">{formatCurrency(estimate.unitPrice)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-bold uppercase">Total</span>
                  <span className="font-mono text-2xl text-primary font-bold">{formatCurrency(estimate.total)}</span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground mb-6">
                This is an estimate only. Final pricing may vary based on project specifics.
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
                {submitMessage && <p className="text-xs text-muted-foreground text-center">{submitMessage}</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
