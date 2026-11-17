'use client';

import { createAuthClient } from 'better-auth/react';
import { emailOTPClient } from 'better-auth/client/plugins';

/** Browser client for the organizer sign-in (email code or password) and account forms. */
export const authClient = createAuthClient({ plugins: [emailOTPClient()] });
