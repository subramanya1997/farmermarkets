import { Fraunces } from "next/font/google";

/**
 * The blog's display serif, used for headlines only. Body copy stays in the
 * site-wide Inter so the blog still reads as part of the directory.
 */
export const displaySerif = Fraunces({
  subsets: ["latin"],
  axes: ["opsz", "SOFT"],
  display: "swap",
});
