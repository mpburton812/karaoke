import type { Components, Theme } from "@mui/material/styles";
import { alpha } from "@mui/material/styles";
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
        root: ({ theme, ownerState }) => ({
          borderRadius: 12,
          textTransform: "none",
          fontWeight: 600,
          "&:focus-visible": {
            outline: `2px solid ${theme.palette.secondary.main}`,
            outlineOffset: 2,
          },
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
        root: ({ theme }) => ({
          borderRadius: 12,
          "&:focus-visible": {
            outline: `2px solid ${theme.palette.secondary.main}`,
            outlineOffset: 2,
          },
        }),
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
        root: {
          minHeight: 56,
          overflow: "visible !important",
        },
        scroller: {
          marginBottom: "0 !important",
        },
        list: {
          gap: 8,
          paddingTop: 20,
          paddingBottom: 18,
        },
        indicator: {
          display: "none",
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: ({ theme }) => ({
          textTransform: "none",
          fontWeight: 600,
          borderRadius: pill,
          minHeight: 40,
          px: 2.5,
          py: 1,
          boxSizing: "border-box",
          border: "1px solid transparent",
          transition: theme.transitions.create(
            ["background-color", "color", "box-shadow", "border-color"],
            { duration: theme.transitions.duration.short }
          ),
          "&:focus-visible": {
            outline: `2px solid ${theme.palette.secondary.main}`,
            outlineOffset: 2,
          },
          "&.Mui-selected": {
            color: theme.palette.primary.main,
            backgroundColor: alpha(theme.palette.primary.main, 0.2),
            position: "relative",
            zIndex: 1,
            ...(mode === "light"
              ? {
                  borderColor: alpha(theme.palette.primary.main, 0.35),
                  boxShadow: [
                    `inset 0 3px 14px ${alpha(theme.palette.primary.main, 0.35)}`,
                    `inset 0 -2px 10px ${alpha(theme.palette.primary.main, 0.15)}`,
                    `inset 0 0 18px ${alpha(theme.palette.primary.main, 0.22)}`,
                  ].join(", "),
                }
              : {
                  borderColor: alpha(theme.palette.primary.main, 0.45),
                  boxShadow: [
                    `inset 0 4px 18px ${alpha(theme.palette.primary.main, 0.75)}`,
                    `inset 0 -2px 12px ${alpha(theme.palette.primary.main, 0.35)}`,
                    `inset 0 0 24px ${alpha(theme.palette.primary.main, 0.5)}`,
                  ].join(", "),
                }),
          },
        }),
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 9999,
          overflow: "hidden",
        },
        bar: {
          borderRadius: 9999,
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
