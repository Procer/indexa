/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.fravega.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "cetrogar.vteximg.com.br",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "musimundo.vteximg.com.br",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "http2.mlstatic.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
