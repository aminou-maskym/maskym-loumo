// theme/theme.ts (ou styles/theme.ts)
import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    primary: { main: "#1976d2" },
    secondary: { main: "#9c27b0" },
  },
  typography: { fontFamily: ["Roboto", "sans-serif"].join(",") },
});

export default theme;
