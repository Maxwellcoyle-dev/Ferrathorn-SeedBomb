// terraformCompletionWebhook.js
import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";

// Constants
const AWS_REGION = "us-east-1";
const SOURCE = "ferrathorn.seedbomb.terraform";
const DETAIL_TYPE = "TerraformProvisioningCompleted";

// AWS Clients
const eventBridge = new EventBridgeClient({ region: AWS_REGION });

export const handler = async (event) => {
  console.log("Webhook received from GitHub:", event);

  // Parse webhook payload (GitHub webhook JSON body)
  const body = JSON.parse(event.body);

  // Extract relevant details from webhook payload
  const terraformStatus = body.action;

  // Construct EventBridge event
  const params = {
    Entries: [
      {
        Source: SOURCE,
        DetailType: DETAIL_TYPE,
        Detail: JSON.stringify({
          status: terraformStatus,
          customer_name: customerName,
          timestamp: new Date().toISOString(),
        }),
        EventBusName: "default",
      },
    ],
  };

  try {
    const result = await eventBridge.send(new PutEventsCommand(params));
    console.log("EventBridge response:", result);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Event sent to EventBridge successfully.",
      }),
    };
  } catch (error) {
    console.error("Error publishing event to EventBridge:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Failed to send event.", error }),
    };
  }
};
