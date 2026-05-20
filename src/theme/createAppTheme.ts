import { createTheme } from "@mui/material/styles";
import { buildComponentOverrides } from "./components";
import { getPalette } from "./palettes";
import type { ThemeMode } from "./types";

const typography = {
  fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  h6: { fontWeight: 700 },
  subtitle2: { fontWeight: 600, letterSpacing: "0.02em" },
};

export function createAppTheme(mode: ThemeMode) {
  return createTheme({
    palette: getPalette(mode),
    shape: { borderRadius: 16 },
    typography,
    components: buildComponentOverrides(mode),
  });
}
