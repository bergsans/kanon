import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 and onnxruntime-node are native modules — the bundler must not
  // try to pack them, or the build dies on the .node binaries.
  serverExternalPackages: [
    "better-sqlite3",
    "sqlite-vec",
    "@huggingface/transformers",
    "onnxruntime-node",
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // No inline framing anywhere in the app, so there's no reason a
          // browser should ever put a Canon page inside someone else's frame.
          { key: "X-Frame-Options", value: "DENY" },
          // The API routes return typed JSON/NDJSON; a browser guessing at
          // content types from bytes has nothing correct to find here.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // The permalink (/s/<slug>) is the one URL meant to be shared —
          // the referrer it leaks on an outbound click should carry no more
          // than the origin.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
