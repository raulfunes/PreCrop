import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // /api/geojson lee data/lote.geojson del disco. En un deploy serverless ese archivo
  // no entra solo en el bundle de la función: hay que trazarlo explícitamente.
  outputFileTracingIncludes: {
    "/api/geojson": ["./data/lote.geojson"],
  },
};

export default nextConfig;
