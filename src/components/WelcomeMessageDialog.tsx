import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  Typography,
} from "@mui/material";
import {
  WELCOME_EMAIL,
  WELCOME_PARAGRAPHS,
  setWelcomeDismissed,
} from "../lib/welcomeMessage";

interface WelcomeMessageDialogProps {
  open: boolean;
  userId: number;
  onClose: () => void;
}

const WelcomeMessageDialog: React.FC<WelcomeMessageDialogProps> = ({
  open,
  userId,
  onClose,
}) => {
  const handleDismiss = () => {
    setWelcomeDismissed(userId);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      scroll="paper"
      aria-labelledby="welcome-message-title"
    >
      <DialogTitle id="welcome-message-title" sx={{ fontWeight: 700 }}>
        Welcome to Karaoke Companion!
      </DialogTitle>
      <DialogContent dividers>
        {WELCOME_PARAGRAPHS.map((paragraph, index) => (
          <Typography
            key={index}
            variant="body1"
            paragraph
            sx={{ whiteSpace: "pre-wrap" }}
          >
            {paragraph}
          </Typography>
        ))}
        <Typography variant="body1" paragraph sx={{ whiteSpace: "pre-wrap" }}>
          This is a &quot;passion project&quot; app and is not professionally
          maintained. If you have questions, find bugs, or want to suggest new
          features, email me at{" "}
          <Link href={`mailto:${WELCOME_EMAIL}`}>{WELCOME_EMAIL}</Link>!
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="contained" fullWidth onClick={handleDismiss}>
          Dismiss
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default WelcomeMessageDialog;
