import axios from "axios";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";
import { SQSClient, DeleteMessageCommand } from "@aws-sdk/client-sqs";

// Constants
const AWS_REGION = "us-east-1";
const SECRET_NAME = "prod/GitHubCredentials";
const IDEMPOTENCY_TABLE = "seedbomb-SeedBombIdempotencyTable-1UAB300Q5SXL7";
const PROVISIONING_QUEUE_URL =
  "https://sqs.us-east-1.amazonaws.com/058032684457/seedbomb-SeedBombProvisioningQueue-RAgu5BAlgjMj";

// AWS Clients
const secretsManagerClient = new SecretsManagerClient({
  region: AWS_REGION,
});
const dynamoDBClient = new DynamoDBClient({ region: AWS_REGION });
const sqsClient = new SQSClient({ region: AWS_REGION });

export const handler = async (event) => {
  console.log(event);
  const { messageId, body, receiptHandle } = event.Records[0];
  console.log("Message ID:", messageId);
  console.log("Body:", body);
  const customerName = body;

  // 1. Idempotency Check
  const isAlreadyProcessed = await checkIdempotency(messageId);
  if (isAlreadyProcessed) {
    console.log(`Message ${messageId} already processed. Skipping.`);
    await deleteMessage(receiptHandle);
    return;
  }

  // 2. Retrieve GitHub PAT from Secrets Manager
  let githubPAT;
  try {
    const secretData = await secretsManagerClient.send(
      new GetSecretValueCommand({ SecretId: SECRET_NAME })
    );
    githubPAT = JSON.parse(secretData.SecretString).GitHubCredentials;
    console.log("GitHub PAT retrieved.");
  } catch (error) {
    console.error("Failed to retrieve GitHub credentials:", error);
    throw error;
  }

  // 3. Trigger GitHub Action
  try {
    const triggerResult = await triggerGithubAction({
      owner: "Maxwellcoyle-dev",
      repo: "ferrathorn_provisioning_test",
      workflow_id: "terraform.yml",
      ref: "main",
      inputs: {
        customer_name: customerName,
      },
      token: githubPAT,
    });
    console.log("GitHub Action successfully triggered.");
    console.log(triggerResult);
  } catch (error) {
    console.error("Error triggering GitHub Action:", error);
    throw error;
  }

  // 4. Mark message as processed (idempotency)
  await markMessageAsProcessed(messageId);

  // 5. Cleanup: Delete message from SQS
  await deleteMessage(receiptHandle);
};

const checkIdempotency = async (messageId) => {
  const command = new GetItemCommand({
    TableName: IDEMPOTENCY_TABLE,
    Key: { messageId: { S: messageId } },
  });

  const result = await dynamoDBClient.send(command);
  return result.Item !== undefined;
};

const markMessageAsProcessed = async (messageId) => {
  const command = new PutItemCommand({
    TableName: IDEMPOTENCY_TABLE,
    Item: {
      messageId: { S: messageId },
      processedAt: { S: new Date().toISOString() },
    },
  });
  await dynamoDBClient.send(command);
  console.log(`Message ${messageId} marked as processed.`);
};

const deleteMessage = async (receiptHandle) => {
  const command = new DeleteMessageCommand({
    QueueUrl: PROVISIONING_QUEUE_URL,
    ReceiptHandle: receiptHandle,
  });

  await sqsClient.send(command);
  console.log(`Message deleted from SQS queue.`);
};

const triggerGithubAction = async ({
  owner,
  repo,
  workflow_id,
  ref,
  inputs,
  token,
}) => {
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow_id}/dispatches`;

  const response = await axios.post(
    url,
    { ref, inputs },
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  );

  if (response.status === 204) {
    console.log("Workflow dispatch event triggered successfully.");
  } else {
    console.warn(`Unexpected response status: ${response.status}`);
  }
};
