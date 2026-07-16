#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';

import { BackendStack } from '../lib/backend-stack';
import { DeploymentStack } from '../lib/deployment-stack';

const app = new cdk.App();

const deploymentStack = new DeploymentStack(app, 'GachiSallimDeploymentStack');

new BackendStack(app, 'GachiSallimBackendStack', {
  artifactBucket: deploymentStack.artifactBucket,
});
