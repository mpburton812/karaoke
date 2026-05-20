import type { PaletteOptions } from "@mui/material/styles";
import type { ThemeMode } from "./types";
import { karaokeTokens, lightTokens, transTokens } from "./tokens";

export function getPalette(mode: ThemeMode): PaletteOptions {
  if (mode === "light") {
    return {
      mode: "light",
      primary: { main: lightTokens.pink, light: karaokeTokens.pinkLight, dark: karaokeTokens.pinkDark },
      secondary: { main: lightTokens.cyan, light: karaokeTokens.cyanLight, dark: karaokeTokens.cyanDark },
      background: { default: lightTokens.background, paper: lightTokens.paper },
      text: { primary: lightTokens.textPrimary, secondary: lightTokens.textSecondary },
      divider: "rgba(26, 18, 40, 0.12)",
      success: { main: karaokeTokens.spotifyGreen },
    };
  }

  if (mode === "trans") {
    return {
      mode: "dark",
      primary: { main: transTokens.blue, light: "#8fd4fc", dark: "#3a9fc4" },
      secondary: { main: transTokens.pink, light: "#f8c4d0", dark: "#d88a9a" },
      background: {
        default: karaokeTokens.stageDeep,
        paper: karaokeTokens.surface,
      },
      text: {
        primary: transTokens.white,
        secondary: "rgba(255, 255, 255, 0.72)",
      },
      divider: karaokeTokens.borderSubtle,
      success: { main: karaokeTokens.spotifyGreen },
    };
  }

  return {
    mode: "dark",
    primary: { main: karaokeTokens.pink, light: karaokeTokens.pinkLight, dark: karaokeTokens.pinkDark },
    secondary: { main: karaokeTokens.cyan, light: karaokeTokens.cyanLight, dark: karaokeTokens.cyanDark },
    background: {
      default: karaokeTokens.stageDeep,
      paper: karaokeTokens.surface,
    },
    text: {
      primary: karaokeTokens.textPrimary,
      secondary: karaokeTokens.textSecondary,
    },
    divider: karaokeTokens.borderSubtle,
    success: { main: karaokeTokens.spotifyGreen },
  };
}
