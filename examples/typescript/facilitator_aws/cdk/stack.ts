import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class FacilitatorAwsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create a secret for the private key
    const privateKeySecret = new secretsmanager.Secret(this, 'PrivateKeySecret', {
      secretName: 'x402-facilitator-private-key',
      description: 'Private key for x402 facilitator',
    });

    // Create the Lambda function
    const facilitatorLambda = new lambda.Function(this, 'FacilitatorLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../dist')),
      environment: {
        // We store the secret ARN, not the actual value
        PRIVATE_KEY_SECRET_ARN: privateKeySecret.secretArn,
        NODE_OPTIONS: '--enable-source-maps',
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });

    // Grant the Lambda function permission to read the secret
    privateKeySecret.grantRead(facilitatorLambda);

    // Create an API Gateway REST API
    const api = new apigateway.RestApi(this, 'FacilitatorApi', {
      restApiName: 'X402 Facilitator API',
      description: 'API for x402 facilitator',
      deployOptions: {
        stageName: 'prod',
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    // Create a Lambda integration
    const lambdaIntegration = new apigateway.LambdaIntegration(facilitatorLambda);

    // Add routes to the API
    const verifyResource = api.root.addResource('verify');
    verifyResource.addMethod('GET', lambdaIntegration);
    verifyResource.addMethod('POST', lambdaIntegration);

    const settleResource = api.root.addResource('settle');
    settleResource.addMethod('GET', lambdaIntegration);
    settleResource.addMethod('POST', lambdaIntegration);

    const supportedResource = api.root.addResource('supported');
    supportedResource.addMethod('GET', lambdaIntegration);

    // Output the API URL
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'URL of the API Gateway endpoint',
    });

    // Output the Secret ARN
    new cdk.CfnOutput(this, 'SecretArn', {
      value: privateKeySecret.secretArn,
      description: 'ARN of the private key secret',
    });
  }
}
