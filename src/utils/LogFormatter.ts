import { LogFormatter } from '@aws-lambda-powertools/logger';
import {
    LogAttributes,
    UnformattedAttributes,
} from '@aws-lambda-powertools/logger/lib/types';

type PnlLog = LogAttributes;

enum logLevelIcon {
    DEBUG = '🐛',
    INFO = 'ℹ️',
    WARN = '⚠️',
    ERROR = '🚨',
    CRITICAL = '🔥',
}

export class PnlLogFormatter extends LogFormatter {

    public formatAttributes(attributes: UnformattedAttributes): PnlLog {
        const uppercaseLogLevel = attributes.logLevel
            .toString()
            .toUpperCase() as keyof typeof logLevelIcon;
        return {
            service: attributes.serviceName,
            environment: attributes.environment,
            awsRegion: attributes.awsRegion,
            correlationIds: {
                awsRequestId: attributes.lambdaContext?.awsRequestId,
                xRayTraceId: attributes.xRayTraceId,
            },
            lambdaFunction: {
                name: attributes.lambdaContext?.functionName,
                arn: attributes.lambdaContext?.invokedFunctionArn,
                memoryLimitInMB: attributes.lambdaContext?.memoryLimitInMB,
                version: attributes.lambdaContext?.functionVersion,
                coldStart: attributes.lambdaContext?.coldStart,
            },
            logLevel: attributes.logLevel,
            timestamp: this.formatTimestamp(attributes.timestamp),
            logger: {
                sampleRateValue: attributes.sampleRateValue,
            },
            message: `${logLevelIcon[uppercaseLogLevel]} ${uppercaseLogLevel}: ${attributes.message}`,

        };
    }
}