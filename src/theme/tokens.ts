/** Shared design tokens — karaoke (pink/cyan) and trans pride variants use the same scale. */

export const karaokeTokens = {
  pink: "#ff4d8d",
  pinkLight: "#ff7aad",
  pinkDark: "#d93672",
  cyan: "#5ce1ff",
  cyanLight: "#8aebff",
  cyanDark: "#2eb8d9",
  stageDeep: "#0f0a1a",
  stageMid: "#1a1228",
  surface: "#241b33",
  surfaceRaised: "#2e2340",
  borderSubtle: "rgba(255, 255, 255, 0.08)",
  textPrimary: "rgba(255, 255, 255, 0.92)",
  textSecondary: "rgba(200, 190, 220, 0.75)",
  glowCyan: "0 0 20px rgba(92, 225, 255, 0.35)",
  glowPink: "0 0 20px rgba(255, 77, 141, 0.35)",
  appBarGradient: "linear-gradient(90deg, #1a1228 0%, #2a1535 50%, #152a35 100%)",
  spotifyGreen: "#1DB954",
} as const;

export const transTokens = {
  blue: "#5BCEFA",
  pink: "#F5A9B8",
  white: "#FFFFFF",
  appBarGradient: "linear-gradient(90deg, #5BCEFA 0%, #F5A9B8 100%)",
  activeButtonGradient: "linear-gradient(45deg, #5BCEFA 30%, #F5A9B8 90%)",
} as const;

export const lightTokens = {
  background: "#faf7ff",
  paper: "#ffffff",
  pink: "#e91e8c",
  cyan: "#0891b2",
  textPrimary: "#1a1228",
  textSecondary: "#5c5470",
} as const;
