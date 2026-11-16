import { fixed, scheme, type TokenGroup } from "../format";

/**
 * Colour tokens shared by every brand direction.
 * Values are the only raw colours in the codebase; everything else uses
 * the CSS variables generated from them.
 */

/** 13-step neutral scale, light end first. Cool, slightly blue-grey: reads as paper and ink. */
export const neutral: TokenGroup = {
  "0": fixed("#FFFFFF"),
  "1": fixed("#F9FAFB"),
  "2": fixed("#F3F4F6"),
  "3": fixed("#EAECEF"),
  "4": fixed("#DFE2E6"),
  "5": fixed("#CDD1D7"),
  "6": fixed("#B1B7BF"),
  "7": fixed("#8D949E"),
  "8": fixed("#6B727D"),
  "9": fixed("#555B66"),
  "10": fixed("#3E444D"),
  "11": fixed("#272B32"),
  "12": fixed("#15181D"),
};

/** The same scale for dark surfaces, darkest first. */
export const neutralDark: TokenGroup = {
  "0": fixed("#0B0D10"),
  "1": fixed("#111317"),
  "2": fixed("#16191E"),
  "3": fixed("#1C2026"),
  "4": fixed("#23272E"),
  "5": fixed("#2C3139"),
  "6": fixed("#3A404A"),
  "7": fixed("#4F5661"),
  "8": fixed("#6B727D"),
  "9": fixed("#8E959F"),
  "10": fixed("#B3B9C1"),
  "11": fixed("#D6DAE0"),
  "12": fixed("#F3F4F6"),
};

export const semantic: TokenGroup = {
  bg: {
    /** App background behind grouped content (Apple: grouped background). */
    canvas: scheme("{neutral.2}", "{neutralDark.1}", { light: "#FFFFFF", dark: "#000000" }),
    /** Cards, grouped list cells, inputs, tables. */
    surface: scheme("{neutral.0}", "{neutralDark.3}", { dark: "{neutralDark.1}" }),
    /** Popovers, menus, dialogs: one step above surface. */
    elevated: scheme("{neutral.0}", "{neutralDark.4}", { dark: "{neutralDark.2}" }),
    /** Wells, code, segmented-control track. */
    sunken: scheme("{neutral.3}", "{neutralDark.0}", { light: "{neutral.3}", dark: "#000000" }),
    hover: scheme("rgb(21 24 29 / 0.05)", "rgb(255 255 255 / 0.06)"),
    pressed: scheme("rgb(21 24 29 / 0.09)", "rgb(255 255 255 / 0.11)"),
    inverse: scheme("{neutral.12}", "{neutralDark.12}"),
    /** Scrim behind modal dialogs and sheets. */
    scrim: scheme("rgb(11 13 16 / 0.32)", "rgb(0 0 0 / 0.56)", {
      light: "rgb(11 13 16 / 0.6)",
      dark: "rgb(0 0 0 / 0.8)",
    }),
    /** The document page. White in every theme: notices are read as printed. */
    page: fixed("#FFFFFF"),
  },
  fg: {
    /** Four label levels, as in Apple's HIG. */
    primary: scheme("{neutral.12}", "{neutralDark.12}", { light: "#000000", dark: "#FFFFFF" }),
    secondary: scheme("{neutral.9}", "{neutralDark.10}", {
      light: "{neutral.11}",
      dark: "{neutralDark.11}",
    }),
    tertiary: scheme("#646B76", "{neutralDark.9}", {
      light: "{neutral.10}",
      dark: "{neutralDark.11}",
    }),
    /** Disabled text and decorative glyphs only: meets 3:1, not 4.5:1. */
    quaternary: scheme("#878E98", "#737A85", { light: "{neutral.9}", dark: "{neutralDark.10}" }),
    inverse: scheme("{neutral.0}", "{neutralDark.0}"),
    /** Text on the white document page, in every theme. */
    page: fixed("{neutral.12}"),
  },
  separator: {
    /** Hairlines between rows and sections (decorative). */
    default: scheme("{neutral.4}", "{neutralDark.5}", {
      light: "{neutral.7}",
      dark: "{neutralDark.8}",
    }),
    subtle: scheme("{neutral.3}", "{neutralDark.4}", {
      light: "{neutral.6}",
      dark: "{neutralDark.7}",
    }),
    /** Boundaries of controls (inputs, checkboxes): 3:1 against the surface. */
    control: scheme("#838A94", "#737A85", { light: "{neutral.10}", dark: "{neutralDark.11}" }),
  },
  due: {
    overdue: {
      fg: scheme("#B42318", "#FF9187"),
      bg: scheme("#FDECEA", "#3B1613"),
      border: scheme("#F4BDB7", "#6B2620", { light: "#B42318", dark: "#FF9187" }),
    },
    today: {
      fg: scheme("#AE3D06", "#FFA36E"),
      bg: scheme("#FEEFE4", "#3A1C0C"),
      border: scheme("#F7C6A6", "#6A3517", { light: "#AE3D06", dark: "#FFA36E" }),
    },
    week: {
      fg: scheme("#0B6672", "#6FD3E0"),
      bg: scheme("#E3F3F5", "#0E2D33"),
      border: scheme("#A9DCE3", "#1C5560", { light: "#0B6672", dark: "#6FD3E0" }),
    },
    later: {
      fg: scheme("{neutral.9}", "{neutralDark.10}"),
      bg: scheme("{neutral.3}", "{neutralDark.4}"),
      border: scheme("{neutral.5}", "{neutralDark.6}", {
        light: "{neutral.9}",
        dark: "{neutralDark.10}",
      }),
    },
    done: {
      fg: scheme("#17703A", "#7FD99B"),
      bg: scheme("#E6F4EA", "#11301B"),
      border: scheme("#B4DEC1", "#23573A", { light: "#17703A", dark: "#7FD99B" }),
    },
  },
  feedback: {
    danger: {
      fg: scheme("#B42318", "#FF9187"),
      bg: scheme("#FDECEA", "#3B1613"),
      border: scheme("#F4BDB7", "#6B2620", { light: "#B42318", dark: "#FF9187" }),
      solid: scheme("#B42318", "#C93325"),
      solidHover: scheme("#9A1D14", "#B82A1D"),
      onSolid: fixed("#FFFFFF"),
    },
    warning: {
      fg: scheme("#8A4F00", "#F5B95B"),
      bg: scheme("#FEF4E0", "#36260A"),
      border: scheme("#F2D199", "#66480F", { light: "#8A4F00", dark: "#F5B95B" }),
      solid: scheme("#8A4F00", "#8A4F00"),
      solidHover: scheme("#734200", "#9A5A00"),
      onSolid: fixed("#FFFFFF"),
    },
    success: {
      fg: scheme("#17703A", "#7FD99B"),
      bg: scheme("#E6F4EA", "#11301B"),
      border: scheme("#B4DEC1", "#23573A", { light: "#17703A", dark: "#7FD99B" }),
      solid: scheme("#17703A", "#1B7A40"),
      solidHover: scheme("#125C2F", "#22874A"),
      onSolid: fixed("#FFFFFF"),
    },
    info: {
      fg: scheme("#1D5DB4", "#8CBBFF"),
      bg: scheme("#E7F0FC", "#0F2440"),
      border: scheme("#B5CEF1", "#234A7A", { light: "#1D5DB4", dark: "#8CBBFF" }),
      solid: scheme("#1D5DB4", "#2463BE"),
      solidHover: scheme("#184E98", "#2D70CF"),
      onSolid: fixed("#FFFFFF"),
    },
  },
  /** Data visualisation: Okabe–Ito based categorical set, colour-blind safe. */
  data: {
    "1": scheme("#0072B2", "#4AA8E8"),
    "2": scheme("#E69F00", "#F0B030"),
    "3": scheme("#009E73", "#2BC79A"),
    "4": scheme("#CC79A7", "#E39AC4"),
    "5": scheme("#56B4E9", "#7CC8F2"),
    "6": scheme("#D55E00", "#F07A30"),
    "7": scheme("#C9B800", "#F5EA70"),
    "8": scheme("#4D4D4D", "#B0B0B0"),
    seq: {
      "1": scheme("#E7F0FC", "#0F2440"),
      "2": scheme("#B5CEF1", "#1B3B66"),
      "3": scheme("#6E9FE0", "#2D5FA3"),
      "4": scheme("#2F6DC4", "#5B8FDA"),
      "5": scheme("#163F7A", "#9BC2F5"),
    },
    div: {
      neg2: scheme("#B42318", "#FF9187"),
      neg1: scheme("#EF9A90", "#9A3A30"),
      mid: scheme("{neutral.4}", "{neutralDark.6}"),
      pos1: scheme("#8DB6EA", "#2D5FA3"),
      pos2: scheme("#1D5DB4", "#8CBBFF"),
    },
  },
  material: {
    /** Translucent backgrounds for sidebar, toolbar, sheets, popovers. Solid in high contrast. */
    thin: scheme("rgb(255 255 255 / 0.62)", "rgb(28 32 38 / 0.56)", {
      light: "#FFFFFF",
      dark: "{neutralDark.2}",
    }),
    regular: scheme("rgb(255 255 255 / 0.74)", "rgb(28 32 38 / 0.72)", {
      light: "#FFFFFF",
      dark: "{neutralDark.2}",
    }),
    thick: scheme("rgb(255 255 255 / 0.88)", "rgb(28 32 38 / 0.86)", {
      light: "#FFFFFF",
      dark: "{neutralDark.2}",
    }),
    /** Window chrome: sidebar and toolbar over the canvas. */
    chrome: scheme("rgb(243 244 246 / 0.78)", "rgb(17 19 23 / 0.78)", {
      light: "{neutral.2}",
      dark: "#000000",
    }),
    /** The solid fallback where backdrop blur is unavailable. */
    solid: scheme("{neutral.1}", "{neutralDark.2}"),
  },
  shadowColor: {
    key: scheme("rgb(16 24 40 / 0.08)", "rgb(0 0 0 / 0.5)"),
    ambient: scheme("rgb(16 24 40 / 0.06)", "rgb(0 0 0 / 0.36)"),
    /** A hairline ring that defines edges in dark mode, where shadows disappear. */
    ring: scheme("rgb(16 24 40 / 0.06)", "rgb(255 255 255 / 0.08)", {
      light: "{neutral.10}",
      dark: "{neutralDark.10}",
    }),
  },
};

export type BrandName = "ink-saffron" | "graphite-electric" | "forest-paper";

/**
 * Brand directions (02 §4). Each sets the signature (accent) colour, focus
 * ring and proof colour. Proof is reserved for evidence: page highlights and
 * proof badges, nothing else.
 */
export const brands: Record<BrandName, TokenGroup> = {
  "ink-saffron": {
    accent: {
      solid: scheme("#1F3A8A", "#4766DA"),
      hover: scheme("#1A3176", "#4A69DD"),
      pressed: scheme("#152862", "#3D5BD0"),
      onSolid: fixed("#FFFFFF"),
      text: scheme("#1F3A8A", "#A3B8FF"),
      subtle: scheme("#E6ECFA", "#1B2645"),
      subtleFg: scheme("#1A3176", "#C2D0FF"),
    },
    focus: { ring: scheme("#2F55D4", "#8FA8FF", { light: "#1A3176", dark: "#C2D0FF" }) },
    proof: {
      /** The highlight on the page. Solid, so page text keeps its contrast. */
      highlight: fixed("#FCDD9A"),
      /** The same, for multiply-blending over page images. */
      highlightAlpha: fixed("rgb(245 165 36 / 0.38)"),
      /** Outline of a highlight box; 3:1 against the white page. */
      stroke: fixed("#B87300"),
      bg: scheme("#FEF3DA", "#3A2A0B"),
      fg: scheme("#7F4D00", "#F9C76A"),
      border: scheme("#F5C66B", "#6E4E12", { light: "#7F4D00", dark: "#F9C76A" }),
    },
  },
  "graphite-electric": {
    accent: {
      solid: scheme("#4F46E5", "#5F5AEE"),
      hover: scheme("#4338CA", "#6762F0"),
      pressed: scheme("#3730A3", "#5550E8"),
      onSolid: fixed("#FFFFFF"),
      text: scheme("#4338CA", "#AFACFF"),
      subtle: scheme("#EEEEFF", "#1F1D47"),
      subtleFg: scheme("#3730A3", "#CFCDFF"),
    },
    focus: { ring: scheme("#4F46E5", "#AFACFF", { light: "#3730A3", dark: "#CFCDFF" }) },
    proof: {
      highlight: fixed("#E2F77E"),
      highlightAlpha: fixed("rgb(190 242 40 / 0.42)"),
      stroke: fixed("#5F8A00"),
      bg: scheme("#F1FBD2", "#24300C"),
      fg: scheme("#3D5E0E", "#C5EE7A"),
      border: scheme("#C7EB7E", "#4A6418", { light: "#3D5E0E", dark: "#C5EE7A" }),
    },
  },
  "forest-paper": {
    /** Paper: a warm canvas in light mode. */
    bg: { canvas: scheme("#F5F3EE", "{neutralDark.1}", { light: "#FFFFFF", dark: "#000000" }) },
    accent: {
      solid: scheme("#0F5132", "#23804F"),
      hover: scheme("#0C4429", "#25834F"),
      pressed: scheme("#093520", "#227A4E"),
      onSolid: fixed("#FFFFFF"),
      text: scheme("#0F5132", "#7BD3A5"),
      subtle: scheme("#E3F1E8", "#12301F"),
      subtleFg: scheme("#0C4429", "#A6E3C2"),
    },
    focus: { ring: scheme("#187A4C", "#7BD3A5", { light: "#0C4429", dark: "#A6E3C2" }) },
    proof: {
      highlight: fixed("#FFE98A"),
      highlightAlpha: fixed("rgb(255 214 10 / 0.42)"),
      stroke: fixed("#9A7400"),
      bg: scheme("#FFF6D1", "#33290A"),
      fg: scheme("#6F5200", "#F3D36B"),
      border: scheme("#F0D46A", "#5E4B10", { light: "#6F5200", dark: "#F3D36B" }),
    },
  },
};

export const defaultBrand: BrandName = "ink-saffron";
