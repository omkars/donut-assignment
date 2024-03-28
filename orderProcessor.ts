import {DynamoDBClient} from '@aws-sdk/client-dynamodb'
import {
    DynamoDBDocumentClient,
    UpdateCommand,
    UpdateCommandInput,
    QueryCommand, QueryCommandOutput, QueryCommandInput
} from '@aws-sdk/lib-dynamodb'
import {NativeAttributeValue} from "@aws-sdk/util-dynamodb"
import middy from "@middy/core";
import {injectLambdaContext, Logger} from "@aws-lambda-powertools/logger";
import {PnlLogger} from "../utils/PnlLogger";
import {PnlMetrics} from "../utils/PnlMetrics";
import {SQSEvent, Context} from "aws-lambda";
import {MetricUnits} from "@aws-lambda-powertools/metrics";
import {response, isSameDay} from "../utils/utils";
import {OrderEvent, PnlOrder} from "./orderGenerator";
import {SQS} from "aws-sdk";
import {SendMessageRequest} from "aws-sdk/clients/sqs";
const sqs = new SQS();

const logger = new PnlLogger().logger(process.env.SERVICE_NAME);
const metrics = new PnlMetrics().metrics(process.env.NAMESPACE, process.env.SERVICE_NAME)
const client = new DynamoDBClient();
const docClient = DynamoDBDocumentClient.from(client);
const currentDateTime = new Date()
const THRESHOLD_TIME_BEFORE_DELIVERY = 24 * 60 * 60 * 1000 // 24 hrs before delivery in miliseconds
const sqsUrl = process.env.ORDERING_QUEUE_FIFO


/**
 * Lambda to process orders coming through Ordering queue.
 * @param event
 * @param context
 */
export const lambdaHandler = async(event: SQSEvent, context: Context) => {

    const batchItemFailures: any = []
    const record: OrderEvent = JSON.parse(event.Records[0].body);
    let statusCode: number = 500

    try {
        //check for same day order
        if(isSameDay(new Date(record.deliveryDate), currentDateTime)) {
            await processSameDayOrder(record)
        } else {
            await enqueueOrderFutureProcessing(record)
        }
        statusCode = 200

    }catch (error){
        logger.error(error)
        batchItemFailures.push({ ItemIdentifier: record.orderId })
        metrics.addMetric('batchItemFailuresForOrderProcessing', MetricUnits.Count, 1)
    }
    metrics.publishStoredMetrics();
    return response(statusCode)
}

const enqueueOrderFutureProcessing = async(record: OrderEvent) => {
    const timeDifference = new Date(record.deliveryDate).getTime() - currentDateTime.getTime()
    const thresholdTime  = timeDifference - THRESHOLD_TIME_BEFORE_DELIVERY

    const sqsParams: SendMessageRequest  = {
        MessageBody: JSON.stringify(record),
        QueueUrl: sqsUrl,
        MessageGroupId: `1`,
        DelaySeconds: Math.ceil(thresholdTime / 1000)
    }
    await sqs.sendMessage(sqsParams).promise();
}


const processSameDayOrder = async (record: OrderEvent) => {
    // First make an An API call to DL management to find the available locker ID and assign it to the order
    //Mimicing the process of fetching the locker
    const lockerId = Math.floor(Math.random() * 8)
    console.log('processing todays order...')
    const command = new UpdateCommand(updateCommandParam(record, lockerId))
    const response: Record<string, NativeAttributeValue> = await docClient.send(command)
}

/**
 * UpdateCommand Param to update the dynamoDb record with lockerId
 * @param record
 * @param lockerId
 */
const updateCommandParam = (record: OrderEvent, lockerId: number): UpdateCommandInput => ({
    TableName: 'PnlOrderingDataStore',
    Key: {
        orderId: record.orderId
    },
    UpdateExpression: "set orderStatus = :orderStatus, #updateTimestamp = :updateTimestamp, #lockerId = :lockerId ",
    ExpressionAttributeNames: {
        "#updateTimestamp": "updateTimestamp",
        "#lockerId": "lockerId"
    },
    ExpressionAttributeValues: {
        ":orderStatus": "orderAccepted",
        ":lockerId": lockerId,
        ":updateTimestamp": new Date().toISOString()
    },
    ConditionExpression: "attribute_not_exists(#updateTimestamp) AND attribute_not_exists(#lockerId)",
    ReturnValues: "ALL_NEW"
})

export const handler = middy(lambdaHandler).use(injectLambdaContext(logger, {logEvent:true, clearState: true}))

