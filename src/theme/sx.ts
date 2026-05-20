/** Reusable sx fragments that reference MUI palette tokens. */

export const spotifySx = {
  color: "success.main",
  borderColor: "success.main",
  "& .MuiChip-icon": { color: "success.main" },
} as const;

/** Section headings in settings and admin panels */
export const sectionTitleSx = {
  fontWeight: 600,
  color: "primary.main",
} as const;

export const panelTitleSx = {
  fontWeight: 600,
} as const;
