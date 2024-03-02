import { AttributeValue, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchGetCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import Joi from "joi";
import { APIGatewayEvent, EventBridgeEvent } from "aws-lambda";
import { getPKs } from "./util";

const client = new DynamoDBClient({ region: "eu-central-1" });
const docClient = DynamoDBDocumentClient.from(client);

const postDataBodySchema = Joi.object({
    data: Joi.object().pattern(Joi.string(), Joi.number()).required()
}).unknown(true);

type DataPoint = {
    timestamp: number;
    data: { [key: string]: number };
};

const aggregateDataEventSchema = Joi.object({
    period: Joi.string().valid("MONTH", "YEAR", "WEEK").required(),
    seconds: Joi.number().required()
}).unknown(true);

const getValuesEventSchema = Joi.object({
    period: Joi.string().valid("MONTH", "YEAR", "WEEK", "DAY").required(),
    from: Joi.date().iso().required(),
    to: Joi.date().iso().required()
}).unknown(true);

type AggregatedData = { [key: string]: number };

function aggregateDataPoints(dataPoints: DataPoint[]): AggregatedData {
    const aggregatedData: AggregatedData = {};

    // Iterate over each data point
    dataPoints.forEach((dataPoint) => {
        const keys = Object.keys(dataPoint.data);
        // Iterate over each key in the data object of the current data point
        keys.forEach((key) => {
            if (!aggregatedData[key]) {
                // If the key does not exist in the aggregatedData, initialize it
                aggregatedData[key] = 0;
            }
            // Add the value of the current data point's key to the corresponding key in aggregatedData
            aggregatedData[key] += dataPoint.data[key];
        });
    });

    return aggregatedData;
}

function aggregateDataPointsToAverage(dataPoints: DataPoint[]): AggregatedData {
    const aggregatedData: AggregatedData = {};
    const countData: { [key: string]: number } = {}; // To store the count of each key

    // Iterate over each data point
    dataPoints.forEach((dataPoint) => {
        const keys = Object.keys(dataPoint.data);
        // Iterate over each key in the data object of the current data point
        keys.forEach((key) => {
            if (!aggregatedData[key]) {
                // If the key does not exist in the aggregatedData, initialize it
                aggregatedData[key] = 0;
                countData[key] = 0; // Initialize count for the key
            }
            // Add the value of the current data point's key to the corresponding key in aggregatedData
            aggregatedData[key] += dataPoint.data[key];
            // Increment the count for the key
            countData[key] += 1;
        });
    });

    // Calculate the average for each key
    Object.keys(aggregatedData).forEach((key) => {
        aggregatedData[key] = aggregatedData[key] / countData[key];
    });

    return aggregatedData;
}

function getDatesBetween(startDate: Date, endDate: Date): string[] {
    const dateArray: string[] = [];
    let currentDate = new Date(startDate);

    // Ensure the start date is less than the end date
    while (currentDate <= endDate) {
        // Format the date as "yyyy#mm#dd"
        const formattedDate = `${currentDate.getFullYear()}#${String(currentDate.getMonth() + 1)}#${String(currentDate.getDate())}`;
        dateArray.push(formattedDate);
        // Move to the next day
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return dateArray;
}

async function getData(event: APIGatewayEvent) {
    const { error } = getValuesEventSchema.validate(event.queryStringParameters);
    if (error) {
        return {
            statusCode: 400,
            body: JSON.stringify(error),
            headers: {
                "Content-Type": "application/json"
            }
        }
    }
    const { period, from, to } = event.queryStringParameters!;
    const pks = getPKs(period as any, from!, to!);
    console.log(pks);
}

function getDynamoDbItem(timestampMs: number, data: any) {
    const year = new Date(timestampMs).getFullYear();
    const month = new Date(timestampMs).getMonth() + 1;
    const timestampSeconds = Math.floor(timestampMs / 1000);
    const day = new Date(timestampMs).getDate();

    return {
        "PK": `${year}#${month}#${day}`,
        "SK": timestampSeconds,
        "DATA": data
    }
}

async function aggregateData(event: any) {

    console.log(event);

    const { period, seconds } = event;

    const { error } = aggregateDataEventSchema.validate({ period, seconds});

    if (error) {
        throw new Error(error.message);
    }

    const now = Date.now();
    const from = now - seconds * 1000;
    const daysBetween = getDatesBetween(new Date(from), new Date(now));

    const results = await Promise.all(
        daysBetween.map(dayString => {
            return docClient.send(new QueryCommand({
                TableName: process.env.TABLE_NAME,
                KeyConditionExpression: "PK = :pk AND SK BETWEEN :from AND :to",
                ExpressionAttributeValues: {
                    ":pk": dayString,
                    ":from": Math.floor(from / 1000),
                    ":to": Math.floor(now / 1000)
                }
            }))
        })
    );

    console.log(results);

    const allItems = results.flatMap(res => res.Items);

    console.log(allItems);

    const dataPoints: DataPoint[] = allItems.map((item: any) => {
        return {
            timestamp: item.SK,
            data: item.DATA
        }
    });

    console.log(dataPoints);

    const aggregatedData = aggregateDataPointsToAverage(dataPoints);

    if (Object.keys(aggregatedData).length === 0) {
        return;
    }

    console.log(aggregatedData);

    const currentWeek = getWeekNumber(now);
    const currentYear = new Date(now).getFullYear();
    const currentMonth = new Date(now).getMonth() + 1;

    let PK;

    switch (period) {
        case "WEEK":
            PK = `AGG#WEEK#${currentYear}#${currentWeek}`;
            break;
        case "MONTH":
            PK = `AGG#MONTH#${currentYear}#${currentMonth}`;
            break;
        case "YEAR":
            PK = `AGG#YEAR#${currentYear}`;
            break;
    }

    await docClient.send(new PutCommand({
        TableName: process.env.TABLE_NAME,
        Item: {
            PK,
            SK: Math.floor(from / 1000),
            DATA: aggregatedData
        }
    }));

}

async function postData(event: any) {

    const body = JSON.parse(event.body);

    const { error } = postDataBodySchema.validate(body);

    const timestampMs = Date.now();

    if (error) {
        return {
            statusCode: 400,
            body: JSON.stringify(error),
            headers: {
                "Content-Type": "application/json"
            }
        }
    }

    await docClient.send(new PutCommand({
        TableName: process.env.TABLE_NAME,
        Item: getDynamoDbItem(timestampMs, body.data)
    }));

    return {
        statusCode: 200,
        body: JSON.stringify({
            timestamp: Math.floor(timestampMs / 1000),
            data: body.data
        }),
        headers: {
            "Content-Type": "application/json"
        }
    }

}

function getWeekNumber(timestampMs: number): number {
    const currentDate = new Date(timestampMs);
    const startDate = new Date(currentDate.getFullYear(), 0, 1);
    const days = Math.floor((currentDate.valueOf() - startDate.valueOf()) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((days + startDate.getDay() + 1) / 7);
    return weekNumber;
}



export { postData, aggregateData, getData };