import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  auth: true,
  // Upgrade to a paid plan to enable AI Gateway for your project.
  // aiGateway: true,
  buckets: {
    uploads: { access: "private" },
  },
  functions: {
    api: {
      name: "api",
      source: "./api/index.ts",
      // accounts: SESSION_SECRET keys the code and link hashes (a long random string, never shared), RESEND_API_KEY
      // sends the sign-in mail, GOOGLE_CLIENT_ID is the audience a Google ID token must carry. DEV_LOG_CODES never goes here.
      env: {
        ADMIN_EMAILS: process.env.ADMIN_EMAILS!, IP_SALT: process.env.IP_SALT!, SESSION_SECRET: process.env.SESSION_SECRET!,
        RESEND_API_KEY: process.env.RESEND_API_KEY!, GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID!,
        // mail to hello@philosophew.lol: Resend's webhook secret (whsec_...) and the inbox it is forwarded to
        RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET!, FORWARD_TO: process.env.FORWARD_TO!,
      },
    },
  },
  branch: (branch) => {
    // Launch plan, pay per use: quotes are static files on the CDN and the Agora feed is cached at
    // the edge, so Postgres only sees writes (posts, phews, reports) and admin. It idles at 0.25 CU and
    // may burst to 2 CU on a launch-day spike (Palm approved the higher ceiling on 2026-09-29);
    // scale-to-zero after 5 idle minutes keeps quiet hours at $0.
    if (branch.isDefault) {
      return {
        postgres: { computeSettings: { autoscalingLimitMinCu: 0.25, autoscalingLimitMaxCu: 2, suspendTimeout: "5m" } },
      };
    }
    // Kept from `neon config init`: new non-default branches expire after 7 days.
    if (!branch.exists) return { ttl: "7d" };
    return {};
  },
});
