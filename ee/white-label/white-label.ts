/**
 * White-label reports (08 §1 Business): while the licence includes it,
 * reports carry only the organisation's logo and name, with no "Prepared with
 * Dueproof" mark. When the licence lapses the mark comes back; nothing else
 * changes.
 */
import { featureActive, type LicenceStatus, type WhiteLabelExtension } from "@dueproof/plugins";

export const whiteLabel: WhiteLabelExtension = {
  enabled: (status: LicenceStatus) => featureActive(status, "white-label"),
};
