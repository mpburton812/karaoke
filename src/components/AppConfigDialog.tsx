import React from "react";
import {
  Box,
  Button,
  ButtonGroup,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Typography,
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
import DataPortability from "./DataPortability";
import EnrichmentAdmin from "./EnrichmentAdmin";
import GodMode from "./GodMode";
import SpotifyConnect from "./SpotifyConnect";
import SystemStatus from "./SystemStatus";

type ThemeMode = "light" | "dark" | "trans";

interface AppConfigDialogProps {
  open: boolean;
  onClose: () => void;
  currentUser: AuthUser;
  isAdmin: boolean;
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  onUserUpdated: (user: AuthUser, token: string) => void;
  onNukeData: () => void;
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
}) => {
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
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Account, appearance, integrations, and data tools.
          </Typography>

          <Box sx={{ mb: 4 }}>
            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: "bold", mb: 2 }}>
              ACCOUNT
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
            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: "bold", mb: 2 }}>
              APPEARANCE
            </Typography>
            <ButtonGroup variant="outlined" size="large">
              <Button
                startIcon={<LightModeIcon />}
                onClick={() => onThemeChange("light")}
                variant={themeMode === "light" ? "contained" : "outlined"}
              >
                LIGHT
              </Button>
              <Button
                startIcon={<DarkModeIcon />}
                onClick={() => onThemeChange("dark")}
                variant={themeMode === "dark" ? "contained" : "outlined"}
              >
                DARK
              </Button>
              <Button
                startIcon={<TransgenderIcon />}
                onClick={() => onThemeChange("trans")}
                variant={themeMode === "trans" ? "contained" : "outlined"}
                sx={
                  themeMode === "trans"
                    ? {
                        background: "linear-gradient(45deg, #5BCEFA 30%, #F5A9B8 90%)",
                        borderColor: "transparent",
                      }
                    : {}
                }
              >
                TRANS
              </Button>
            </ButtonGroup>
          </Box>

          <AdminAppReload />

          <SpotifyConnect currentUser={currentUser} />

          <Divider sx={{ my: 4 }} />
          <DataPortability currentUser={currentUser} />

          <Divider sx={{ my: 4 }} />
          <Changelog />

          {isAdmin && (
            <>
              <Divider sx={{ my: 4 }} />
              <Typography variant="h6" sx={{ fontWeight: "bold", mb: 2 }}>
                Administrator
              </Typography>
              <SystemStatus />
              <EnrichmentAdmin />
              <GodMode />
            </>
          )}

          <Divider sx={{ my: 6, borderColor: "error.main" }} />
          <Box
            sx={{
              p: 3,
              border: "1px solid",
              borderColor: "error.main",
              borderRadius: 2,
              bgcolor: "rgba(211, 47, 47, 0.05)",
            }}
          >
            <Typography variant="h6" color="error" gutterBottom>
              Danger Zone
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
              NUKE ALL CONFIGURATION
            </Button>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default AppConfigDialog;
