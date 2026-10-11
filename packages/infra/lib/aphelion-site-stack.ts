import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import {
  AllowedMethods,
  Distribution,
  Function,
  FunctionCode,
  FunctionEventType,
  FunctionRuntime,
  PriceClass,
  ResponseHeadersPolicy,
  S3OriginAccessControl,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { ARecord, HostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { BlockPublicAccess, Bucket } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import type { Construct } from 'constructs';
import { canonicalRedirectFunctionCode } from './cloudfront-canonical-redirect.js';

export const HOSTED_ZONE_ID = 'Z00920882C0R9WXBKRWCB';
export const ZONE_NAME = 'aphelionrun.com';
export const APEX_HOST = 'aphelionrun.com';
export const WWW_HOST = 'www.aphelionrun.com';
export const SITE_URL = 'https://aphelionrun.com';

export const SITE_CSP =
  "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'none'; upgrade-insecure-requests";

export interface AphelionSiteStackProps extends StackProps {
  /** Static export directory. Tests pass a fixture; production passes packages/www/out. */
  siteAssetPath: string;
}

/**
 * Prod static site for aphelionrun.com. The hosted zone already exists.
 */
export class AphelionSiteStack extends Stack {
  constructor(scope: Construct, id: string, props: AphelionSiteStackProps) {
    super(scope, id, props);

    const zone = HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: HOSTED_ZONE_ID,
      zoneName: ZONE_NAME,
    });

    const certificate = new Certificate(this, 'SiteCertificate', {
      domainName: APEX_HOST,
      subjectAlternativeNames: [WWW_HOST],
      validation: CertificateValidation.fromDns(zone),
    });

    const siteBucket = new Bucket(this, 'SiteOrigin', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const originAccessControl = new S3OriginAccessControl(this, 'OriginAccessControl');
    const origin = S3BucketOrigin.withOriginAccessControl(siteBucket, { originAccessControl });

    const viewerRequest = new Function(this, 'CanonicalRedirect', {
      code: FunctionCode.fromInline(canonicalRedirectFunctionCode),
      runtime: FunctionRuntime.JS_2_0,
    });

    const headers = new ResponseHeadersPolicy(this, 'SiteHeaders', {
      securityHeadersBehavior: {
        strictTransportSecurity: {
          accessControlMaxAge: Duration.seconds(31536000),
          includeSubdomains: true,
          preload: false,
          override: true,
        },
        contentSecurityPolicy: { contentSecurityPolicy: SITE_CSP, override: true },
      },
    });

    const distribution = new Distribution(this, 'Site', {
      certificate,
      domainNames: [APEX_HOST, WWW_HOST],
      defaultRootObject: 'index.html',
      priceClass: PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin,
        responseHeadersPolicy: headers,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        compress: true,
        functionAssociations: [
          {
            function: viewerRequest,
            eventType: FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.seconds(0),
        },
      ],
    });

    new ARecord(this, 'ApexAlias', {
      zone,
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
    });
    new ARecord(this, 'WwwAlias', {
      zone,
      recordName: 'www',
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
    });

    new BucketDeployment(this, 'SiteAssets', {
      sources: [Source.asset(props.siteAssetPath)],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    new CfnOutput(this, 'BucketName', { value: siteBucket.bucketName });
    new CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
    new CfnOutput(this, 'DistributionDomainName', { value: distribution.distributionDomainName });
    new CfnOutput(this, 'SiteUrl', { value: SITE_URL });
    new CfnOutput(this, 'CertificateArn', { value: certificate.certificateArn });
  }
}
