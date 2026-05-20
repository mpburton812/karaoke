import { Box, Typography } from "@mui/material";
import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

const EmptyState: React.FC<EmptyStateProps> = ({ title, description, icon, action }) => (
  <Box
    sx={{
      py: 5,
      px: 3,
      textAlign: "center",
      border: "1px dashed",
      borderColor: "divider",
      borderRadius: 3,
      bgcolor: "action.hover",
    }}
  >
    {icon && (
      <Box
        sx={{
          mb: 1.5,
          color: "primary.main",
          opacity: 0.9,
          "& svg": { fontSize: 48 },
        }}
      >
        {icon}
      </Box>
    )}
    <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
      {title}
    </Typography>
    {description && (
      <Typography
        color="text.secondary"
        sx={{ maxWidth: 400, mx: "auto", mb: action ? 2 : 0 }}
      >
        {description}
      </Typography>
    )}
    {action}
  </Box>
);

export default EmptyState;
