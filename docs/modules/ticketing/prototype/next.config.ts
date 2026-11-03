import type { NextConfig } from "next";

// Set to build the static copy for the PITX App site, e.g.
// STATIC_EXPORT_BASE_PATH=/PITX-App/modules/ticketing/demo npm run build
const exportBasePath = process.env.STATIC_EXPORT_BASE_PATH;

const nextConfig: NextConfig = {
  // Partial prerendering can't be used in a static export.
  cacheComponents: exportBasePath === undefined,
  partialPrefetching: exportBasePath === undefined,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  env: { NEXT_PUBLIC_BASE_PATH: exportBasePath ?? "" },
  ...(exportBasePath !== undefined && {
    output: "export",
    basePath: exportBasePath,
    trailingSlash: true,
    images: { unoptimized: true },
  }),
};

export default nextConfig;
