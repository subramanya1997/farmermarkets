/**
 * Better Auth for market organizer accounts. The main way in is a one-time
 * code sent by email (no password; the first code creates the account and
 * proves the address). Email + password still works for accounts that set
 * one, with a verified email required and password reset by email. Sessions live in Postgres (Neon)
 * next to the rest of the organizer tables.
 *
 * `transaction: false` because `src/db/index.ts` uses the neon-http driver,
 * which has no interactive transactions.
 */
import 'server-only';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { emailOTP } from 'better-auth/plugins';
import { getDb, dbSchema } from '@/db';
import { existingAccountEmail, resetPasswordEmail, sendOrganizerEmail, signInCodeEmail, verificationEmail } from './organizerEmails';
import { SITE_URL } from './site';

function createAuth() {
  return betterAuth({
    appName: 'Farmer Markets',
    // Production sets BETTER_AUTH_URL; a preview deployment uses its own URL.
    baseURL:
      process.env.BETTER_AUTH_URL ||
      (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : SITE_URL),
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: [
      SITE_URL,
      'https://farmermarkets.app',
      'https://www.farmermarkets.app',
      ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
      ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ],
    database: drizzleAdapter(getDb(), {
      provider: 'pg',
      transaction: false,
      schema: {
        user: dbSchema.user,
        session: dbSchema.session,
        account: dbSchema.account,
        verification: dbSchema.verification,
        rateLimit: dbSchema.rateLimit,
      },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, url }) => {
        await sendOrganizerEmail(user.email, resetPasswordEmail(url));
      },
      // Sign-up never reveals that an address has an account; the owner of
      // the address gets told by email instead.
      onExistingUserSignUp: async ({ user }) => {
        await sendOrganizerEmail(user.email, existingAccountEmail());
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, url }) => {
        await sendOrganizerEmail(user.email, verificationEmail(url));
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 30,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 60 * 10, max: 3 },
        '/request-password-reset': { window: 60 * 10, max: 3 },
        '/send-verification-email': { window: 60 * 10, max: 3 },
        '/email-otp/send-verification-otp': { window: 60 * 10, max: 5 },
        '/sign-in/email-otp': { window: 60, max: 5 },
      },
    },
    advanced: {
      useSecureCookies: process.env.NODE_ENV === 'production',
    },
    plugins: [
      // Sign in with a 6 digit code. A new address gets an account, already
      // verified because the code proved it; an unverified password account
      // for the address loses its unproven password on first code sign-in.
      emailOTP({
        otpLength: 6,
        expiresIn: 10 * 60,
        allowedAttempts: 5,
        storeOTP: 'hashed',
        sendVerificationOTP: async ({ email, otp, type }) => {
          if (type !== 'sign-in') return;
          await sendOrganizerEmail(email, signInCodeEmail(otp));
        },
      }),
      // Last, so it sets cookies for every endpoint above.
      nextCookies(),
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;

let cached: Auth | undefined;

/**
 * Created on first use, like `getDb()`: `next build` evaluates route modules
 * on machines without `DATABASE_URL`, and that must not fail the build.
 */
export function getAuth(): Auth {
  cached ??= createAuth();
  return cached;
}
