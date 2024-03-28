const { unmarshall } = require("@aws-sdk/util-dynamodb");
import {DynamoDBClient} from '@aws-sdk/client-dynamodb'
import {DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand} from '@aws-sdk/lib-dynamodb'
import {NativeAttributeValue} from "@aws-sdk/util-dynamodb";
import middy from "@middy/core";
import {injectLambdaContext} from "@aws-lambda-powertools/logger";
import {PnlMetrics} from "../../utils/PnlMetrics";
import {PnlLogger} from "../../utils/PnlLogger";
import {response} from "../../utils/utils";

const logger = new PnlLogger().logger(process.env.SERVICE_NAME);
const metrics = new PnlMetrics().metrics(process.env.NAMESPACE, process.env.SERVICE_NAME)
const client = new DynamoDBClient();
const docClient = DynamoDBDocumentClient.from(client);
let statusCode: number = 500


/**
 * Consumer lambda which gets triggered on eventbridge rule to process the matched events
 * @param event
 * @param context
 */
export const lambdaHandler = async(event: any, context: any) => {
    const record = unmarshall(event.detail.dynamodb.NewImage);
    statusCode = 200
    return response(statusCode)
}

export const handler = middy(lambdaHandler).use(injectLambdaContext(logger, {logEvent:true, clearState: true}))