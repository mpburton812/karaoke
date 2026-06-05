import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  ButtonGroup,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Link,
  Switch,
  Typography,
  alpha,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import TransgenderIcon from "@mui/icons-material/Transgender";
import type { AuthUser } from "../api/auth";
import AdminAppReload from "./AdminAppReload";
import ChangePassword from "./ChangePassword";
import ChangeUsername from "./ChangeUsername";
import Changelog from "./Changelog";
import SongShareInbox from "./SongShareInbox";
import {
  fetchNotificationPreferences,
  updateNotificationPreferences,
} from "../api/songShares";
import { KARAOKE_SHARES_REFRESH_EVENT } from "../lib/karaokeEvents";
import DataPortability from "./DataPortability";
import EnrichmentAdmin from "./EnrichmentAdmin";
import SpotifyConnect from "./SpotifyConnect";
import SystemStatus from "./SystemStatus";
import { sectionTitleSx, transTokens, type ThemeMode } from "../theme";

interface AppConfigDialogProps {
  open: boolean;
  onClose: () => void;
  currentUser: AuthUser;
  isAdmin: boolean;
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  onUserUpdated: (user: AuthUser, token: string) => void;
  onNukeData: () => void;
  onOpenWelcome: () => void;
}

const AppConfigDialog: React.FC<AppConfigDialogProps> = ({
  open,
  onClose,
  currentUser,
  isAdmin,
  themeMode,
  onThemeChange,
  onUserUpdated,
  onNukeData,
  onOpenWelcome,
}) => {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [prefsLoading, setPrefsLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPrefsLoading(true);
    void fetchNotificationPreferences()
      .then((p) => setNotificationsEnabled(p.notificationsEnabled))
      .catch(console.error)
      .finally(() => setPrefsLoading(false));
  }, [open]);

  const handleNotificationsToggle = async (enabled: boolean) => {
    setNotificationsEnabled(enabled);
    try {
      await updateNotificationPreferences(enabled);
      window.dispatchEvent(new Event(KARAOKE_SHARES_REFRESH_EVENT));
    } catch (e) {
      console.error(e);
      setNotificationsEnabled(!enabled);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      scroll="paper"
      aria-labelledby="app-config-title"
    >
      <DialogTitle
        id="app-config-title"
        sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
        Settings
        <IconButton aria-label="Close settings" onClick={onClose} edge="end">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Account, appearance, integrations, and data tools.
          </Typography>

          <Link
            component="button"
            type="button"
            variant="body2"
            onClick={() => {
              onClose();
              onOpenWelcome();
            }}
            sx={{ mb: 3, display: "inline-block" }}
          >
            Welcome message
          </Link>

          <AdminAppReload />

          <Box sx={{ mb: 4, mt: 3 }}>
            <Typography variant="subtitle2" gutterBottom sx={{ ...sectionTitleSx, mb: 2 }}>
              Account
            </Typography>
            <ChangeUsername
              currentUsername={currentUser.username}
              onUserUpdated={onUserUpdated}
            />
            <Box sx={{ mt: 3 }}>
              <ChangePassword onUserUpdated={onUserUpdated} />
            </Box>
          </Box>

          <Box sx={{ mb: 4 }}>
            <Typography variant="subtitle2" gutterBottom sx={{ ...sectionTitleSx, mb: 2 }}>
              Appearance
            </Typography>
            <ButtonGroup variant="outlined" size="large">
              <Button
                startIcon={<LightModeIcon />}
                onClick={() => onThemeChange("light")}
                variant={themeMode === "light" ? "contained" : "outlined"}
              >
                Light
              </Button>
              <Button
                startIcon={<DarkModeIcon />}
                onClick={() => onThemeChange("dark")}
                variant={themeMode === "dark" ? "contained" : "outlined"}
              >
                Dark
              </Button>
              <Button
                startIcon={<TransgenderIcon />}
                onClick={() => onThemeChange("trans")}
                variant={themeMode === "trans" ? "contained" : "outlined"}
                sx={
                  themeMode === "trans"
                    ? {
                        background: transTokens.activeButtonGradient,
                        borderColor: "transparent",
                        color: "common.white",
                        "&:hover": {
                          background: transTokens.activeButtonGradient,
                          opacity: 0.92,
                        },
                      }
                    : {}
                }
              >
                Trans
              </Button>
            </ButtonGroup>
          </Box>

          <SpotifyConnect currentUser={currentUser} />

          <Divider sx={{ my: 4 }} />
          <Typography variant="subtitle2" gutterBottom sx={{ ...sectionTitleSx, mb: 2 }}>
            Song sharing
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={notificationsEnabled}
                disabled={prefsLoading}
                onChange={(e) => void handleNotificationsToggle(e.target.checked)}
              />
            }
            label="Show pop-up notifications when I open the app"
          />
          <SongShareInbox />

          <Divider sx={{ my: 4 }} />
          <DataPortability currentUser={currentUser} />

          <Divider sx={{ my: 4 }} />
          <Changelog />

          {isAdmin && (
            <>
              <Divider sx={{ my: 4 }} />
              <Typography variant="h6" sx={{ ...sectionTitleSx, mb: 2 }}>
                Administrator
              </Typography>
              <SystemStatus />
              <EnrichmentAdmin />
            </>
          )}

          <Divider sx={{ my: 6, borderColor: "error.main" }} />
          <Box
            sx={{
              p: 3,
              border: "1px solid",
              borderColor: "error.main",
              bgcolor: (theme) => alpha(theme.palette.error.main, 0.08),
            }}
          >
            <Typography variant="h6" color="error" gutterBottom>
              Danger zone
            </Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              Clearing your configuration will delete all personal data associated with your
              account.
            </Typography>
            <Button
              variant="outlined"
              color="error"
              onClick={onNukeData}
              sx={{ fontWeight: "bold" }}
            >
              Clear all my data
            </Button>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default AppConfigDialog;
