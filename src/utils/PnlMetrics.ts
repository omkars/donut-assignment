import {Metrics} from "@aws-lambda-powertools/metrics";

export class PnlMetrics {
    public metrics = (namespace: string, serviceName: string) => new Metrics({
        serviceName: serviceName,
        namespace: namespace
    })
}
