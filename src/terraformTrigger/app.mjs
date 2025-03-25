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

export const handler = async (event) => {
  // 1. Pick up messages from the SeedBombProvisioningQueue (SQS).
  console.log("Received event:", event);
  const { messageId, body, attributes } = event.Records[0];
  console.log("Message ID:", messageId);
  console.log("Body:", body);
  console.log("Attributes:", attributes);

  // 2. Retrieve GitHub PAT secret from AWS Secrets Manager.
  let github_pat_payload;

  try {
    github_pat_payload = await client.send(
      new GetSecretValueCommand({
        SecretId: secret_name,
      })
    );
  } catch (error) {
    throw error;
  }
  console.log("GitHub PAT:", github_pat_payload);

  // Extract the GitHub PAT from the SecretString
  const github_pat = JSON.parse(
    github_pat_payload.SecretString
  ).GitHubCredentials;
  console.log("GitHub PAT:", github_pat);

  // // 3. Trigger the GitHub Action workflow to start Terraform provisioning.
  const response = await triggerGithubAction({
    owner: "Maxwellcoyle-dev",
    repo: "ferrathorn_provisioning_test",
    workflow_id: "terraform.yml",
    ref: "main",
    inputs: {
      customer_name: "ferrathorn-customer-010",
    },
    token: github_pat,
  });

  console.log("GitHub Action response:", response);

  return {
    statusCode: 200,
    body: JSON.stringify({ message: "GitHub Action triggered successfully" }),
  };
};

const triggerGithubAction = async ({
  owner,
  repo,
  workflow_id,
  ref,
  inputs = {},
  token,
}) => {
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
};
