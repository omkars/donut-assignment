import {SQS} from 'aws-sdk';
import middy from '@middy/core';
import {injectLambdaContext} from '@aws-lambda-powertools/logger';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb'
import {DynamoDBDocumentClient, GetCommand, PutCommand} from '@aws-sdk/lib-dynamodb'
import {NativeAttributeValue} from '@aws-sdk/util-dynamodb';
import {PnlLogger} from '../utils/PnlLogger'
import {PnlMetrics} from '../utils/PnlMetrics'
import {MetricUnits} from "@aws-lambda-powertools/metrics";
import {Context} from "aws-lambda";
import {response} from "../utils/PnlLambdaResponse";

const logger = new PnlLogger().logger(process.env.SERVICE_NAME);
const metrics = new PnlMetrics().metrics(process.env.NAMESPACE, process.env.SERVICE_NAME)
const sqsUrl = process.env.ORDERING_QUEUE_FIFO
const client = new DynamoDBClient();
const docClient = DynamoDBDocumentClient.from(client);
const sqs = new SQS();


/**
 * Lambda handler mimicing the Donuts order creating from different donut companies.
 * @param event
 * @param context
 */

export const lambdaHandler = async(event: any, context: Context) => {

    // Static list of Donut companies as sources
    const sources = ['DunkinDonuts', 'DonutPatrol']

    // This is to mimic the orders. In reality the orders will be received from API gateway.
    const numberOfOrders = 10;

    // Generating random orderId for the order creation of type PnlOrder
    let orderId = Math.floor(Math.random() * 10000)

    const records = [];
    let statusCode: number = 500
    const currentDate = new Date()

    try {
        for (let i = 0; i < numberOfOrders; i++) {
            const order: PnlOrder = {
                orderId: orderId,
                order: `donut- ${Math.floor(Math.random() * 10)}`,
                timestamp: new Date().toISOString(),
                source: sources[Math.floor(Math.random() + 0.5)],
                customerEmail: 'mark@abc.com',
                customerName: 'Mark Smith',
                deliveryDate: new Date(currentDate.setDate(currentDate.getDate() + 0)).toISOString().split('T')[0],
                orderStatus: 'OrderSubmitted'
            }
            records.push(pushMessage(order))
            setTimeout(() => {
            }, Math.floor(Math.random() * 7) + 5000)

            const command = new PutCommand(putCommandParam(order))
            const response: Record<string, NativeAttributeValue> = await docClient.send(command)
            orderId++;
        }
        await Promise.all(records);
        statusCode = 200;

    } catch (error) {
        logger.error(error)
        metrics.addMetric('orderGenerationFailures', MetricUnits.Count, 1)
    }
    metrics.publishStoredMetrics();
    return response(statusCode);
}

/**
 * PutCommand Parameter to create DynamoDb object
 * @param order
 */
const putCommandParam = (order: PnlOrder) => ({
    TableName: 'PnlOrderingDataStore',
    Item: {
        orderId: order.orderId,
        timestamp: order.timestamp,
        order: order.order,
        source: order.source,
        orderStatus: order.orderStatus,
        customerEmail: order.customerEmail,
        customerName: order.customerName,
        deliveryDate: order.deliveryDate,
    }
})

/**
 * Add an order to ordering queue FIFO.
 * @param order
 */
const pushMessage = async(order: PnlOrder) => {
    const dynamoParams = {
        MessageBody: JSON.stringify(order),
        QueueUrl: sqsUrl,
        MessageDeduplicationId: order.orderId.toString(),
        MessageGroupId: `1`
    }
    logger.info('Params', <any>{params: dynamoParams})
    await sqs.sendMessage(dynamoParams).promise();
    return;
}

export type PnlOrder = OrderEvent & {
    orderStatus?: string,
    updatedTimestamp?: string
}

export type OrderEvent = {
    orderId: number,
    order: {},
    timestamp: string,
    source: string,
    deliveryDate: string,
    lockerId?: number
    customerName: string,
    customerEmail: string
}

export const handler = middy(lambdaHandler).use(injectLambdaContext(logger, {logEvent:true, clearState: true}))
