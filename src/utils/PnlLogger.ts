import {Logger} from "@aws-lambda-powertools/logger";
import {PnlLogFormatter} from "./LogFormatter";

export class PnlLogger {
    public logger = (serviceName: string) => {
        return new Logger({
            logFormatter: new PnlLogFormatter(),
            logLevel: 'INFO',
            serviceName: serviceName,
            awsAccountId: process.env.AWS_ACCOUNT_ID,
        })
    }
}