#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { DlProducerStack } from '../stack/dl-producer-stack';

const app = new cdk.App();

new DlProducerStack(app, 'PnlAssignmentStack', {
    env: {
        region: process.env.AWS_REGION,
        account: process.env.AWS_ACCOUNT_ID
    }
});
