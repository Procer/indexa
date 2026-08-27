/** @type {import('next').NextConfig} */
const nextConfig = {
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
