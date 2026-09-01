/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // pdf-parse usa require dinâmico e não pode ser empacotado pelo bundler
    serverComponentsExternalPackages: ['pdf-parse'],
  },
}

export default nextConfig
