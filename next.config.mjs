import {createVanillaExtractPlugin} from '@vanilla-extract/next-plugin';

/** @type {import('next').NextConfig} */
const nextConfig = {
  agentRules: false,
};

export default createVanillaExtractPlugin({unstable_turbopack: {mode: 'auto'}})(nextConfig);
