import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { AphelionSiteStack, HOSTED_ZONE_ID, SITE_CSP } from '../lib/aphelion-site-stack.js';
import { runViewerRequest } from '../lib/cloudfront-canonical-redirect.js';

const TEST_ACCOUNT = '111111111111';
const TEST_REGION = 'us-east-1';

function synthSite() {
  const app = new App({
    context: { 'aws:cdk:bundling-stacks': [] },
  });
  const stack = new AphelionSiteStack(app, 'AphelionSite-prod', {
    env: { account: TEST_ACCOUNT, region: TEST_REGION },
    siteAssetPath: path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/site-out'),
  });
  return { stack, template: Template.fromStack(stack) };
}

type Resource = { Type: string; Properties?: Record<string, unknown> };

test('synthesizes AphelionSite-prod in us-east-1', () => {
  const { stack, template } = synthSite();
  assert.equal(stack.stackName, 'AphelionSite-prod');
  assert.equal(stack.region, TEST_REGION);
  assert.equal(stack.account, TEST_ACCOUNT);
  template.resourceCountIs('AWS::CertificateManager::Certificate', 1);
  template.resourceCountIs('AWS::CloudFront::Distribution', 1);
  template.resourceCountIs('AWS::S3::Bucket', 1);
});

test('ACM certificate covers apex and www', () => {
  const { template } = synthSite();
  template.hasResourceProperties('AWS::CertificateManager::Certificate', {
    DomainName: 'aphelionrun.com',
    SubjectAlternativeNames: ['www.aphelionrun.com'],
    ValidationMethod: 'DNS',
  });
});

test('Route53 alias A records for apex and www use the hosted zone', () => {
  const { template } = synthSite();
  const records = Object.values(template.findResources('AWS::Route53::RecordSet')) as Resource[];
  const aliases = records.filter((record) => {
    const props = record.Properties ?? {};
    return props.Type === 'A' && props.AliasTarget != null;
  });
  assert.equal(aliases.length, 2);
  const names = aliases.map((record) => String(record.Properties?.Name)).sort();
  assert.deepEqual(names, ['aphelionrun.com.', 'www.aphelionrun.com.']);
  for (const record of aliases) {
    assert.equal(record.Properties?.HostedZoneId, HOSTED_ZONE_ID);
  }
});

test('the site revalidates so a refresh cannot keep the previous cabin', () => {
  const { template } = synthSite();
  const deployments = template.findResources('Custom::CDKBucketDeployment');
  const encoded = JSON.stringify(deployments);
  assert.match(encoded, /max-age=0/);
  assert.match(encoded, /must-revalidate/);
});

test('security headers do not open a third-party connect origin', () => {
  const { template } = synthSite();
  const policies = template.findResources('AWS::CloudFront::ResponseHeadersPolicy');
  const encoded = JSON.stringify(policies);
  assert.match(encoded, /connect-src 'self'/);
  assert.equal(encoded.includes('cognito'), false);
  assert.match(encoded, new RegExp(SITE_CSP.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('www redirects to the apex and extensionless paths become index documents', () => {
  const redirect = runViewerRequest({
    request: {
      uri: '/rules',
      headers: { host: { value: 'www.aphelionrun.com' } },
      querystring: { x: { value: '1' } },
    },
  }) as { statusCode?: number; headers?: { location?: { value?: string } } };
  assert.equal(redirect.statusCode, 301);
  assert.equal(redirect.headers?.location?.value, 'https://aphelionrun.com/rules?x=1');

  const rules = runViewerRequest({
    request: { uri: '/rules', headers: { host: { value: 'aphelionrun.com' } } },
  }) as { request?: { uri?: string }; uri?: string };
  const uri = rules.uri ?? rules.request?.uri;
  assert.equal(uri, '/rules/index.html');
});
