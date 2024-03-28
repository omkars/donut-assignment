import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as PnlAssignment from '../stack/dl-producer-stack';

const app = new cdk.App();

test('Pnl Ordering SQS Queue is Fifo queue with 30 sec visibility timeout', () => {
  const stack = new PnlAssignment.DlProducerStack(app, 'PnlAssignmentStack');
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::SQS::Queue', {
    VisibilityTimeout: 30,
    FifoQueue: true
  });

});
