"use client";

import { useEffect } from "react";
import { setPromptContext } from "@/lib/visitSignals";

/** Tells visitor prompts which city page is on screen. Renders nothing. */
export function CityPromptContext({ name, stateName }: { name: string; stateName?: string }) {
  useEffect(() => {
    setPromptContext({ kind: "city", path: window.location.pathname, name, stateName });
  }, [name, stateName]);
  return null;
}
