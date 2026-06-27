import type { NextConfig } from "next";

// Destino server-side del proxy: el navegador siempre habla con el propio
// origen de Next (mismo origen → sin CORS y la cookie httpOnly viaja limpia).
const apiProxyTarget = process.env.API_PROXY_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyTarget}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
