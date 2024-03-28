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
import {response} from "../utils/PnlLambdaResponse";
import {OrderEvent} from "./orderGenerator";
import {removeDependency} from "aws-cdk-lib/core/lib/deps";

const logger = new PnlLogger().logger(process.env.SERVICE_NAME);
const metrics = new PnlMetrics().metrics(process.env.NAMESPACE, process.env.SERVICE_NAME)
const client = new DynamoDBClient();
const docClient = DynamoDBDocumentClient.from(client);

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

        console.log('>>>>>>>>>>>>>>>>>>>>>>>>>> INSIDE ', )

        // An API call to DL management to find the available locker ID and assign it to the order
        //Mimicing the process of fetching the locker
        const lockerId = Math.floor(Math.random() * 8)

        const queryCommand = new QueryCommand(queryCommandParam(record));
        const getAllTodaysOrder: Record<string, NativeAttributeValue> = await docClient.send(queryCommand)

        if(getAllTodaysOrder.Items.length > 0){
            console.log('processing todays orders...')
            const command = new UpdateCommand(updateCommandParam(record, lockerId))
            const response: Record<string, NativeAttributeValue> = await docClient.send(command)
        } else{
            console.log('No Orders to process today!!!!!!!!!!!!!')
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


const queryCommandParam = (record: OrderEvent): QueryCommandInput => ({
    TableName: 'PnlOrderingDataStore',
    KeyConditionExpression: "#orderId = :orderId",
    FilterExpression: "attribute_exists(deliveryDate) AND #deliveryDate = :todaysDate",
    ExpressionAttributeValues: {
        ":todaysDate": new Date().toISOString().split('T')[0],
        ":orderId": record.orderId
    },
    ExpressionAttributeNames: {
        '#orderId': 'orderId',
        '#deliveryDate': 'deliveryDate'
    }
})

export const handler = middy(lambdaHandler).use(injectLambdaContext(logger, {logEvent:true, clearState: true}))

