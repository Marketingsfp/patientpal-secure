import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadDM } from "@remotion/google-fonts/DMSans";

export const inter = loadInter("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] }).fontFamily;
export const dm = loadDM("normal", { weights: ["500", "700"], subsets: ["latin"] }).fontFamily;

export const C = {
  bg: "#0B1220",
  bg2: "#101a30",
  card: "#FFFFFF",
  ink: "#0B1220",
  sub: "#5b6b86",
  line: "#E6EAF2",
  primary: "#1D4ED8",
  primarySoft: "#DBE7FF",
  accent: "#10B981",
  accentSoft: "#D1FADF",
  warn: "#F59E0B",
  danger: "#EF4444",
  cream: "#F6F7FB",
};