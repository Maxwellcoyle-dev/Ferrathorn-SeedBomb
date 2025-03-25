// 1. Pick up messages from the SeedBombProvisioningQueue (SQS).
// 2. Retrieve GitHub PAT secret from AWS Secrets Manager.
// 3. Trigger the GitHub Action workflow to start Terraform provisioning.

import axios from "axios";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

const secret_name = "prod/GitHubCredentials";

const client = new SecretsManagerClient({
  region: "us-east-1",
});

async function triggerGithubAction({
  owner,
  repo,
  workflow_id, // either workflow file name (e.g., 'deploy.yml') or workflow ID
  ref, // branch or tag name to run the workflow on
  inputs = {}, // workflow inputs, if any
  token, // GitHub Personal Access Token with appropriate permissions
}) {
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow_id}/dispatches`;

  try {
    const response = await axios.post(
      url,
      {
        ref,
        inputs,
      },
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
      console.log(`Unexpected response status: ${response.status}`);
    }
  } catch (error) {
    console.error(
      "Error triggering GitHub Action:",
      error.response ? error.response.data : error.message
    );
  }
}

export const handler = async (event) => {
  // 1. Pick up messages from the SeedBombProvisioningQueue (SQS).
  console.log("Received event:", event);
  const { messageId, body, attributes } = event.Records[0];
  console.log("Message ID:", messageId);
  console.log("Body:", body);
  console.log("Attributes:", attributes);

  // 2. Retrieve GitHub PAT secret from AWS Secrets Manager.
  let github_pat;

  try {
    github_pat = await client.send(
      new GetSecretValueCommand({
        SecretId: secret_name,
      })
    );
  } catch (error) {
    throw error;
  }
  console.log("GitHub PAT:", github_pat);

  // // 3. Trigger the GitHub Action workflow to start Terraform provisioning.
  triggerGithubAction({
    owner: "Maxwellcoyle-dev",
    repo: "ferrathorn_provisioning_test",
    workflow_id: "terraform.yml",
    ref: "main",
    inputs: {
      customer_name: "ferrathorn-customer-010",
    },
    token: github_pat,
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ message: "GitHub Action triggered successfully" }),
  };
};
