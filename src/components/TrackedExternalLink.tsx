"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { trackEvent, type AnalyticsProperties } from "@/lib/analytics";

interface TrackedExternalLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  children: ReactNode;
  eventName: string;
  eventProperties?: AnalyticsProperties;
}

export function TrackedExternalLink({
  children,
  eventName,
  eventProperties = {},
  onClick,
  ...anchorProps
}: TrackedExternalLinkProps) {
  return (
    <a
      {...anchorProps}
      onClick={(event) => {
        trackEvent(eventName, eventProperties);
        onClick?.(event);
      }}
    >
      {children}
    </a>
  );
}
