/** @type {import('next').NextConfig} */
const nextConfig = {
	output: "export",
	reactStrictMode: false,
	agentRules: false,
	images: { unoptimized: true },
	trailingSlash: true,
	transpilePackages: ["@aphelion/app"],
};

module.exports = nextConfig;
