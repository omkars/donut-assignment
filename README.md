# Donut Locker System

`Donut Locker System` is POC created to demonstrate the journey of donuts all the way from the Donut companies to customers
in their nearby lockers.

This is serverless design wherein below AWS services have been used.

* AWS SQS Queue FIFO :  to queue up all the donut orders until 0100 hrs and to maintain the ordering
* AWS Lambda : Compute service to handle order processing and other business logic
* DynamoDB : Central Ordering Data store
* Eventbridge Event Bus : as a intergration sevice pattern to allow publisher/consumers producing and consuming the events via eventbus
* Eventbridge Pipe : as point to point integration without needing to have custom code and lambda function
* Eventbridge Scheduler : to scehdule the lambda to start processing the orders from the queue at 0100
