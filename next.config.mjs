/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      "@remotion/bundler",
      "@remotion/renderer",
      "esbuild",
      "ffmpeg-static",
      "@travisvn/edge-tts",
      "@heyputer/puter.js",
      "ws",
    ],
    // Ensure the ffmpeg binary is packaged into Vercel serverless functions.
    outputFileTracingIncludes: {
      "/api/**/*": ["./node_modules/ffmpeg-static/**/*"],
      "/*": ["./node_modules/ffmpeg-static/**/*"],
    },
  },
};

export default nextConfig;
