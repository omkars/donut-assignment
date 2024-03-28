import {Stack, StackProps} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as events from 'aws-cdk-lib/aws-events'
import { EventBus} from 'aws-cdk-lib/aws-events-targets';

/**
 * This is ultimately a consumer stack ( for example Donut companies such as DunkinDonuts who can create a rule on DL source
 * event bus and add a target which is its own eventbus to receive the events.
 */
export class DlProducerStack extends Stack {

    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        const sourceBus = events.EventBus.fromEventBusAttributes(this, 'SourceBus', {
            eventBusName: "arn:aws:events:eu-west-1:358231045507:event-bus/PnlDonutLocketEventBus",
            eventBusArn: "arn:aws:events:eu-west-1:358231045507:event-bus/PnlDonutLocketEventBus",
            eventBusPolicy: '',
        });

        const targetBus = events.EventBus.fromEventBusAttributes(this, 'TargetBus', {
            eventBusName: "arn:aws:events:eu-west-1:325960627818:event-bus/my-event-bus",
            eventBusArn: "arn:aws:events:eu-west-1:325960627818:event-bus/my-event-bus",
            eventBusPolicy: '',
        });


        /**
         * This is cross account event RULE creation
         */
        const crossAccountRule = new events.Rule(this, 'CrossAccountSourceRule666', {
            eventPattern: {"source": ["dl-system"]},
            eventBus: sourceBus,
            targets: [new EventBus(targetBus)]
        });

    }
}
