import React, { useState } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Alert,
  CircularProgress,
} from "@mui/material";
import PersonIcon from "@mui/icons-material/Person";
import { changeUsername, persistSession, type AuthUser } from "../api/auth";

interface ChangeUsernameProps {
  currentUsername: string;
  onUserUpdated?: (user: AuthUser, token: string) => void;
}

const ChangeUsername: React.FC<ChangeUsernameProps> = ({
  currentUsername,
  onUserUpdated,
}) => {
  const [newUsername, setNewUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  const handleSubmit = async () => {
    setMessage(null);
    const trimmed = newUsername.trim();
    if (!trimmed || !currentPassword) {
      setMessage({ text: "New username and current password are required.", type: "error" });
      return;
    }
    if (trimmed.toLowerCase() === currentUsername.toLowerCase()) {
      setMessage({ text: "Choose a different username.", type: "error" });
      return;
    }

    setLoading(true);
    try {
      const { user, token } = await changeUsername(currentPassword, trimmed);
      persistSession(user, token);
      onUserUpdated?.(user, token);
      setNewUsername("");
      setCurrentPassword("");
      setMessage({ text: "Username updated successfully.", type: "success" });
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : "Failed to change username.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 3, maxWidth: 420, mx: "auto", textAlign: "left" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2, justifyContent: "center" }}>
        <PersonIcon color="primary" />
        <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>
          Change Username
        </Typography>
      </Box>

      {message && (
        <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <TextField
          fullWidth
          label="Current username"
          value={currentUsername}
          disabled
        />
        <TextField
          fullWidth
          label="New username"
          value={newUsername}
          onChange={(e) => setNewUsername(e.target.value)}
          disabled={loading}
          autoComplete="username"
        />
        <TextField
          fullWidth
          type="password"
          label="Current password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          disabled={loading}
          autoComplete="current-password"
          helperText="Required to confirm this change"
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSubmit();
          }}
        />
        <Button variant="contained" onClick={() => void handleSubmit()} disabled={loading} fullWidth>
          {loading ? <CircularProgress size={24} /> : "UPDATE USERNAME"}
        </Button>
      </Box>
    </Paper>
  );
};

export default ChangeUsername;
