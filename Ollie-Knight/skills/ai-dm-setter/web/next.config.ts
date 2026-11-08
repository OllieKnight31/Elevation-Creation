import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every screen reads live inbox data, so nothing here should be prerendered or cached.
  cacheComponents: false,
  // The setup screen shows the database schema, which is read from disk at run time.
  outputFileTracingIncludes: { "/api/setup": ["./supabase/schema.sql"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
