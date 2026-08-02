import React, { useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";
import { ackUserMotd, type UserMotd } from "../api/motd";

interface MotdDialogProps {
  open: boolean;
  motd: UserMotd | null;
  onClose: () => void;
}

const MotdDialog: React.FC<MotdDialogProps> = ({ open, motd, onClose }) => {
  const [acking, setAcking] = useState(false);

  const handleOk = async () => {
    if (!motd) {
      onClose();
      return;
    }
    setAcking(true);
    try {
      await ackUserMotd(motd.id);
    } catch (err) {
      console.error(err);
    } finally {
      setAcking(false);
      onClose();
    }
  };

  return (
    <Dialog
      open={open && Boolean(motd)}
      onClose={(_event, reason) => {
        if (reason === "backdropClick" || reason === "escapeKeyDown") return;
        void handleOk();
      }}
      fullWidth
      maxWidth="sm"
      scroll="paper"
      aria-labelledby="motd-dialog-title"
    >
      <DialogTitle id="motd-dialog-title" sx={{ fontWeight: 700 }}>
        Message from Admins:
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body1" component="p" sx={{ whiteSpace: "pre-wrap" }}>
          {motd?.body ?? ""}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button
          variant="contained"
          fullWidth
          onClick={() => void handleOk()}
          disabled={acking}
        >
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default MotdDialog;
