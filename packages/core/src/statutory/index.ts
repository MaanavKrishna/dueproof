export { statutoryCoverage } from "./coverage";
export {
  type DateRange,
  formKey,
  type GenerateOptions,
  generateStatutory,
  statutoryKey,
} from "./generate";
export { factsMatch, registrationFacts, ruleApplies } from "./match";
export {
  IN_EXTENSIONS,
  IN_PACK,
  inOrderWindowFor,
  inOrderWindows,
  type OrderWindowChoice,
} from "./packs/in";
export { fyCode, parsePeriod, periodsStartingBetween } from "./periods";
export {
  baseDueDate,
  findExtension,
  resolveStatutory,
  type StatutoryResolveOptions,
} from "./resolve";
export type {
  CoverageNote,
  DueRule,
  ExpectedForms,
  Extension,
  FyDate,
  MatchValue,
  NotCoveredMarker,
  ParsedPeriod,
  PeriodType,
  Registration,
  StatutoryItem,
  StatutoryPack,
  StatutoryRule,
  StatutorySource,
} from "./types";
export {
  type OrderWindowResult,
  type OrderWindowRule,
  orderWindowRule,
  resolveOrderWindow,
} from "./windows";
