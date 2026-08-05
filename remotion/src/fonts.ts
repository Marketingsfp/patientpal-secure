import { loadFont as loadSora } from "@remotion/google-fonts/Sora";
import { loadFont as loadManrope } from "@remotion/google-fonts/Manrope";
export const display = loadSora("normal", { weights: ["600", "700"], subsets: ["latin"] }).fontFamily;
export const body = loadManrope("normal", { weights: ["400", "600", "700"], subsets: ["latin"] }).fontFamily;
