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
  },
};

export default nextConfig;
