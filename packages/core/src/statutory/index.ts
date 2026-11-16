export { type DateRange, type GenerateOptions, generateStatutory } from "./generate";
export { factsMatch, registrationFacts, ruleApplies } from "./match";
export { IN_PACK, inOrderWindows } from "./packs/in";
export { fyCode, parsePeriod, periodsStartingBetween } from "./periods";
export {
  baseDueDate,
  findExtension,
  resolveStatutory,
  type StatutoryResolveOptions,
} from "./resolve";
export type {
  DueRule,
  FyDate,
  MatchValue,
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
