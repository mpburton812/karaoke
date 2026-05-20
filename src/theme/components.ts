import type { Components, Theme } from "@mui/material/styles";
import type { ThemeMode } from "./types";
import { karaokeTokens, lightTokens, transTokens } from "./tokens";

function bodyBackground(mode: ThemeMode): string {
  if (mode === "light") {
    return lightBackground();
  }
  return `linear-gradient(180deg, ${karaokeTokens.stageDeep} 0%, ${karaokeTokens.stageMid} 100%)`;
}

function lightBackground(): string {
  return "#faf7ff";
}

function appBarBackground(mode: ThemeMode): string {
  if (mode === "trans") return transTokens.appBarGradient;
  if (mode === "dark") return karaokeTokens.appBarGradient;
  return "rgba(255, 255, 255, 0.92)";
}

export function buildComponentOverrides(mode: ThemeMode): Components<Omit<Theme, "components">> {
  const radius = 16;
  const pill = 9999;

  return {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background: bodyBackground(mode),
          backgroundAttachment: "fixed",
        },
        "#root": {
          minHeight: "100svh",
          width: "100%",
          maxWidth: "none",
          margin: 0,
          textAlign: "initial",
          border: "none",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: radius,
          backgroundImage: "none",
        },
        outlined: {
          borderColor: mode === "light" ? "rgba(26, 18, 40, 0.12)" : karaokeTokens.borderSubtle,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: radius,
          boxShadow:
            mode === "light"
              ? "0 8px 24px rgba(26, 18, 40, 0.08)"
              : "0 8px 32px rgba(0, 0, 0, 0.35)",
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 24,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: ({ ownerState }) => ({
          borderRadius: 12,
          textTransform: "none",
          fontWeight: 600,
          ...(ownerState.variant === "contained" &&
            ownerState.color === "primary" &&
            mode !== "light" && {
              boxShadow: karaokeTokens.glowPink,
            }),
        }),
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: pill,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: 12,
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: appBarBackground(mode),
          backdropFilter: mode === "light" ? "blur(8px)" : undefined,
          color: mode === "light" ? lightTokens.textPrimary : "#fff",
          borderBottom: `1px solid ${mode === "light" ? "rgba(26, 18, 40, 0.12)" : karaokeTokens.borderSubtle}`,
          boxShadow: "none",
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 3,
          borderRadius: 3,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 600,
          borderRadius: pill,
          minHeight: 40,
          "&.Mui-selected": {
            color: "primary.main",
          },
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
    MuiSnackbar: {
      styleOverrides: {
        root: {
          "& .MuiPaper-root": {
            borderRadius: 12,
          },
        },
      },
    },
  };
}
