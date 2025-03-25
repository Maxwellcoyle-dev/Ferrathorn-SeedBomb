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
  const { url, method, headers, data } = JSON.parse(event.body);
  console.log("URL:", url);
  console.log("Method:", method);
  console.log("Headers:", headers);
  console.log("Data:", data);

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
  // const response = await axios({ url, method, headers, data });

  return response.data;
};
