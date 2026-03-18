# Azure Trusted Signing Setup Guide

To use Azure Trusted Signing in the GitHub Actions pipeline, you need to configure an Azure environment and extract several values as GitHub repository secrets. This guide walks you through the entire process.

## Prerequisites
- An active Azure Subscription.
- Sufficient permissions to create resources, app registrations, and assign roles in the Azure portal.

## Step 1: Create a Trusted Signing Account
1. Log in to the [Azure Portal](https://portal.azure.com/).
2. Search for **Trusted Signing** in the search bar and select it.
3. Click **Create**.
4. Choose your Subscription and Resource Group (or create a new one).
5. Enter an **Account Name** (e.g., `milady-signing-account`).
   - *Keep track of this value!* This is your **`AZURE_SIGN_ACCOUNT_NAME`**.
6. Select a Region (e.g., `East US`). The URI format for your endpoint will be based on the region. For `East US`, the endpoint is usually `https://eus.codesigning.azure.net/`.
   - *Keep track of this value!* This is your **`AZURE_SIGN_ENDPOINT`**. You can verify the exact endpoint URL in your Trusted Signing account's Overview page later.
7. Click **Review + Create**, then **Create**.

## Step 2: Set up Identity Validation and a Certificate Profile
1. Go to the newly created Trusted Signing Account resource.
2. Under the **Settings** menu on the left, click **Identity Validation**.
3. Create a new Identity Validation. You will need to provide your organizational details and pass Microsoft's vetting process.
4. Once your identity is validated, go to **Certificate Profiles** in the left menu.
5. Click **Create** to create a new profile (e.g., `milady-release-profile`), linked to your verified identity.
   - *Keep track of this name!* This is your **`AZURE_SIGN_PROFILE_NAME`**.

## Step 3: Create an App Registration for GitHub Actions
To allow GitHub Actions to communicate with your Azure account securely, you need an App Registration (Service Principal).

1. In the Azure Portal, search for and select **Microsoft Entra ID**.
2. Click **App registrations** in the left menu.
3. Click **New registration**.
4. Name the application (e.g., `GitHubActions-TrustedSigning`).
5. Choose "Accounts in this organizational directory only" for Supported account types.
6. Click **Register**.
7. Once registered, you will be taken to the Overview page of the new app.
   - Copy the **Application (client) ID**. This is your **`AZURE_CLIENT_ID`**.
   - Copy the **Directory (tenant) ID**. This is your **`AZURE_TENANT_ID`**.

## Step 4: Generate a Client Secret
1. While still in the App Registration, click **Certificates & secrets** in the left menu.
2. Click **New client secret**.
3. Add a description (e.g., `github-actions-secret`) and choose an expiration timeline.
4. Click **Add**.
5. **Immediately copy the "Value"** column of the new secret. It will be hidden if you leave the page.
   - This value is your **`AZURE_CLIENT_SECRET`**.

> **Alternative (More Secure):** You can also use OpenID Connect (OIDC) through **Federated credentials** instead of a Client Secret to avoid managing long-lived secrets.

## Step 5: Assign Permissions to the App Registration
The App Registration needs permission to actually sign files using your Certificate Profile.

1. Navigate back to your **Trusted Signing Account** resource (from Step 1).
2. Click **Access control (IAM)** in the left menu.
3. Click **Add** -> **Add role assignment**.
4. Search for the role **Trusted Signing Certificate Profile Signer** and select it. Click Next.
5. Choose **User, group, or service principal**.
6. Click **Select members** and search for the name of the App Registration you created in Step 3 (e.g., `GitHubActions-TrustedSigning`).
7. Select it, click **Review + assign**, and then assign the role.

## Step 6: Add the GitHub Secrets
Now that you have gathered all the necessary values, go to your GitHub repository:

1. Navigate to **Settings** > **Secrets and variables** > **Actions**.
2. Click **New repository secret** for each of the following:

| Secret Name | Where to find it |
|---|---|
| `AZURE_TENANT_ID` | Microsoft Entra ID -> App registrations -> Overview |
| `AZURE_CLIENT_ID` | Microsoft Entra ID -> App registrations -> Overview |
| `AZURE_CLIENT_SECRET` | Microsoft Entra ID -> App registrations -> Certificates & secrets |
| `AZURE_SIGN_ENDPOINT` | The region-specific URI (e.g., `https://eus.codesigning.azure.net/`) |
| `AZURE_SIGN_ACCOUNT_NAME` | The name of your Trusted Signing Account |
| `AZURE_SIGN_PROFILE_NAME` | The name of the Certificate Profile you created |

Once `AZURE_TENANT_ID` is populated, the `release-electrobun.yml` workflow will automatically switch to using Azure Trusted Signing for your releases!
