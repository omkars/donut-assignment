import {CfnResource, Duration, RemovalPolicy, Stack, StackProps} from 'aws-cdk-lib';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import {Construct} from 'constructs';
import * as tsLambda from 'aws-cdk-lib/aws-lambda-nodejs'
import * as jsLambda from 'aws-cdk-lib/aws-lambda'
import * as dynamo from 'aws-cdk-lib/aws-dynamodb';
import {StreamViewType} from 'aws-cdk-lib/aws-dynamodb';
import {CfnPipe} from 'aws-cdk-lib/aws-pipes';
import * as events from 'aws-cdk-lib/aws-events'
import * as iam from 'aws-cdk-lib/aws-iam'
import path from 'path';
import {LambdaFunction, EventBus} from 'aws-cdk-lib/aws-events-targets';
import {Policy, PolicyDocument, Role, ServicePrincipal} from "aws-cdk-lib/aws-iam";

/**
 *  ** DL = Donut Locker
 * DL producer stack represents all aws components needed to support the order creation, order processing and order storing features.
 * We would actually use constructs to arrange these resources and use them in the stack for better abstraction and reusability
 */
export class DlProducerStack extends Stack {

  public readonly pnlFifoOrderingQueue: sqs.Queue

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // ************** Order Queue **************
    this.pnlFifoOrderingQueue = new sqs.Queue(this, 'PnlOrderingQueue', {
      queueName: 'PnlOrderingQueue.fifo',
      fifo: true,
      visibilityTimeout: Duration.seconds(30)
    });

    // ************** Order Generator Lambda **************
    const pnlOrderGeneratorLambda = new tsLambda.NodejsFunction(this,  'PnlOrderGeneratorLambda', {
      runtime: jsLambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../src/lambda/orderGenerator.ts'),
      handler: 'handler',
      environment: {
        'NAMESPACE': 'PnlOrderingSystem',
        'SERVICE_NAME': 'OrderGeneratorService',
        'ORDERING_QUEUE_FIFO': this.pnlFifoOrderingQueue.queueUrl,
      }
    })
    this.pnlFifoOrderingQueue.grantSendMessages(pnlOrderGeneratorLambda);

    // ************** Order Processor Lambda **************
    const pnlOrderProcessorLambda = new tsLambda.NodejsFunction(this,  'PnlOrderProcessorLambda', {
      runtime: jsLambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../src/lambda/orderProcessor.ts'),
      handler: 'handler'
    })

    // ************** Order Consumer Lambda **************
    const orderConsumerLambda = new tsLambda.NodejsFunction(this,  'PnlOrderConsumerLambda', {
      runtime: jsLambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../src/lambda/consumers/orderConsumer.ts'),
      handler: 'handler'
    })
    this.pnlFifoOrderingQueue.grantConsumeMessages(pnlOrderProcessorLambda)


    // ************** Order Data Store DynamoDB **************
    const pnlOrderingDataStore = new dynamo.TableV2(this, 'PnlDataStore', {
      partitionKey: {name: 'orderId', type: dynamo.AttributeType.NUMBER },
      encryption: dynamo.TableEncryptionV2.awsManagedKey(),
      removalPolicy: RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
      billing: dynamo.Billing.onDemand(),
      tableName: 'PnlOrderingDataStore',
      dynamoStream: StreamViewType.NEW_AND_OLD_IMAGES
    })

    pnlOrderingDataStore.grantReadWriteData(pnlOrderGeneratorLambda)
    pnlOrderingDataStore.grantReadWriteData(pnlOrderProcessorLambda)


    // ************** Event Source SQS-Lambda **************
    const eventSource = new jsLambda.EventSourceMapping(this, 'sqsEventSource', {
      batchSize: 1,
      eventSourceArn: this.pnlFifoOrderingQueue.queueArn,
      target: pnlOrderProcessorLambda
    })

    // ************** Pnl Custom Eventbridge Eventbus **************
    const pnlEventBus = new events.EventBus(this, 'PnlDonutLockerEventBus', {
      eventBusName: 'PnlDonutLocketEventBus'
    })

    // ************** Resource Policy For Pnl Custom Eventbridge Eventbus **************
    const policyStatement_Consumer_DunkinDonuts = new iam.PolicyStatement({
      actions: [
        "events:PutRule",
        "events:PutTargets",
        "events:DeleteRule",
        "events:RemoveTargets",
        "events:DisableRule",
        "events:EnableRule",
        "events:TagResource",
        "events:UntagResource",
        "events:DescribeRule"
      ],
      effect: iam.Effect.ALLOW,
      principals: [
        new iam.ArnPrincipal("arn:aws:iam::325960627818:root"), // Consumer Account
        new iam.ArnPrincipal("arn:aws:iam::358231045507:root") // Source (Same) Account
      ],
      resources: [
          "arn:aws:events:eu-west-1:358231045507:rule/PnlDonutLocketEventBus/*"
      ],
      sid: 'AllowAccountToManageRulesTheyCreated'
    });

    pnlEventBus.addToResourcePolicy(policyStatement_Consumer_DunkinDonuts);


    // ************** Eventbridge Pipe Role **************
    const pipeRole = new iam.Role(this, 'pipeRole', {
      assumedBy: new iam.ServicePrincipal('pipes.amazonaws.com')
    })


    const inputTransformerProperty: events.CfnRule.InputTransformerProperty = {
      inputTemplate: 'pnlInputTemplate',
      inputPathsMap: {
      "pipeName": "aws.pipes.pipe-name",
        "source": "<$.source>",
        "account": "<$.account>",
        "orderId": "<$.detail.dynamodb.NewImage.orderId.N>",
        "orderStatus": "<$.detail.dynamodb.NewImage.orderStatus.S>",
        "orderSource": "<$.detail.dynamodb.NewImage.source.S>",
        "order": "<$.detail.dynamodb.NewImage.order.S>",
        "timestamp": "<$.detail.dynamodb.NewImage.timestamp.S>"
      },
    };

    // ************** Eventbridge Pipe **************
    const pipe =  new CfnPipe(this, 'PnlPipe', {
      source: pnlOrderingDataStore.tableStreamArn!,
      target: pnlEventBus.eventBusArn,
      targetParameters: {
        eventBridgeEventBusParameters: {
          source: 'dl-system',
        },
       //inputTemplate: JSON.stringify(inputTransformerProperty.inputPathsMap)
      },
      roleArn: pipeRole.roleArn!,
      sourceParameters: {
        dynamoDbStreamParameters: {
          startingPosition: 'LATEST',
          batchSize: 1
        },
        filterCriteria: {
          filters: [
            {
              pattern: '{"eventName": ["INSERT", "MODIFY"]}'
            }
          ]
        }
      }
        }
    )

    pnlOrderingDataStore.grantStreamRead(pipeRole)
    pnlEventBus.grantPutEventsTo(pipeRole)

    // ************** Consumer Rule # Create a rule to send events to consumer Account's Event Bus **************
    const eventConsumer1Rule = new events.Rule(this, 'Pnl-consumer-DonutPatrol-rule', {
      description: 'Order Accepted Event',
      ruleName: 'Pnl-event-consumer-DonutPatrol-rule',
      eventBus: pnlEventBus,
      eventPattern: {
        "source": ["dl-system"],
        "detail": {
          "dynamodb": {
            "NewImage": {
              "source": {
                "S": [{
                  "prefix": "DonutPatrol"
                }]
              },
              "orderStatus": {
                "S": [{
                  "prefix": "orderAccepted"
                }]
              }
            }
          }
        }
      }
    });

    eventConsumer1Rule.addTarget(new LambdaFunction(orderConsumerLambda))

    // ************** Eventbridge Scheduler Role **************
    const pnlOrderProcessingScheduleRole = new Role(this, 'schedulerRole', {
      assumedBy: new ServicePrincipal('scheduler.amazonaws.com'),
    });

    pnlOrderProcessingScheduleRole?.attachInlinePolicy(new iam.Policy(this, 'orderProcessingSchedule-policy', {
      statements: [new iam.PolicyStatement({
        actions: ['lambda:InvokeFunction'],
        resources: [pnlOrderProcessorLambda.functionArn],
      })]
    }))

    // ************** Eventbridge Scheduler **************
    const pnlOrderProcessingSchedule = new CfnResource(this, 'PnlOrderProcessingSchedule', {
      type: 'AWS::Scheduler::Schedule',
      properties: {
        Name: 'PnlOrderProcessingSchedule',
        Description: 'Runs a schedule every day at 0100 hrs',
        FlexibleTimeWindow: { Mode: 'OFF' },
        ScheduleExpression: 'cron(00 01 * * ? *)',
        ScheduleExpressionTimezone: 'Europe/Amsterdam',
        Target: {
          Arn: pnlOrderProcessorLambda.functionArn,
          RoleArn: pnlOrderProcessingScheduleRole.roleArn,
        },
      },
    });
  }
}
