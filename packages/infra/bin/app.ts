#!/usr/bin/env node
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { App } from 'aws-cdk-lib';
import { AphelionSiteStack } from '../lib/aphelion-site-stack.js';

const app = new App();
const monorepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const siteOut = path.join(monorepoRoot, 'packages/www/out');
const siteFixture = path.join(monorepoRoot, 'packages/infra/test/fixtures/site-out');
const siteAssetPath = existsSync(path.join(siteOut, 'index.html')) ? siteOut : siteFixture;

new AphelionSiteStack(app, 'AphelionSite-prod', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1',
  },
  siteAssetPath,
});
