/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Keep pdfkit as a Node external so it can read its built-in font metric files (AFM).
    serverComponentsExternalPackages: ["pdfkit"],
  },
  webpack: (config, { dev }) => {
    // Windows can intermittently corrupt Next/webpack persistent cache -> missing chunk modules (e.g. ./276.js).
    // Disabling webpack filesystem cache in dev prevents those crashes.
    if (dev) {
      config.cache = false;
    }
    return config;
  },
};

module.exports = nextConfig;

