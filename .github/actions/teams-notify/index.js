/**
 * .github/actions/teams-notify/index.js
 *
 * Custom GitHub Action — Microsoft Teams Notification
 *
 * Reads inputs from the INPUT_* environment variables that GitHub Actions
 * automatically injects for every declared input in action.yml.
 *
 * Uses the native fetch API.
 * No external npm dependencies are needed.
 */

"use strict";

// ─── 1. Read inputs from environment variables ────────────────────────────────
// GitHub Actions maps each input declared in action.yml to an env var named:
// INPUT_<INPUT_NAME_UPPERCASED>

const webhookUrl    = process.env.INPUT_WEBHOOK_URL    || "";
const repository    = process.env.INPUT_REPOSITORY     || "unknown/repo";
const branch        = process.env.INPUT_BRANCH         || "unknown";
const author        = process.env.INPUT_AUTHOR         || "unknown";
const commitShaFull = process.env.INPUT_COMMIT_SHA     || "";
const commitMessage = process.env.INPUT_COMMIT_MESSAGE || "(no message)";

// ─── 2. Derive a short SHA ────────────────────────────────────────────────────

const shortSha = commitShaFull.slice(0, 7) || "0000000";

// ─── 3. Validate required inputs ──────────────────────────────────────────────

if (!webhookUrl) {
  console.error("❌ Error: webhook_url input is empty or not set.");
  console.error("   Make sure TEAMS_WEBHOOK_URL is saved in:");
  console.error("   GitHub → Settings → Secrets and variables → Actions");
  process.exit(1);
}

// ─── 4. Build URLs ────────────────────────────────────────────────────────────

const repoUrl   = `https://github.com/${repository}`;
const branchUrl = `${repoUrl}/tree/${branch}`;
const commitUrl = `${repoUrl}/commit/${commitShaFull}`;

// ─── 5. Build the AdaptiveCard payload ───────────────────────────────────────
//
// Power Automate's "Post card in a chat or channel" action calls
// AdaptiveCard.FromJson() directly on the raw HTTP body.
//
// This means the ROOT of the JSON must be the AdaptiveCard itself:
//   { "$schema": "...", "type": "AdaptiveCard", "version": "...", ... }
//
// Do NOT use the Bot Framework / Graph API envelope:
//   { "type": "message", "attachments": [{ "content": { AdaptiveCard } }] }
// That format is for the Graph /messages API and causes the error:
//   "Property 'type' must be 'AdaptiveCard'"

const payload = {
  $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
  type: "AdaptiveCard",
  version: "1.4",

  body: [
    {
      type: "TextBlock",
      text: "🚀 New GitHub Push",
      weight: "Bolder",
      size: "Large",
      wrap: true
    },
    {
      type: "FactSet",
      facts: [
        { title: "📁 Repository", value: repository    },
        { title: "🌿 Branch",     value: branch        },
        { title: "👤 Author",     value: author        },
        { title: "🔖 Commit",     value: shortSha      },
        { title: "💬 Message",    value: commitMessage }
      ]
    }
  ],

  actions: [
    {
      type: "Action.OpenUrl",
      title: "View commit",
      url: commitUrl
    },
    {
      type: "Action.OpenUrl",
      title: "View repository",
      url: repoUrl
    },
    {
      type: "Action.OpenUrl",
      title: "View branch",
      url: branchUrl
    }
  ]
};

// ─── 6. Send the HTTP POST request ────────────────────────────────────────────

console.log("📨 Sending Teams notification...");
console.log(`   Repository : ${repository}`);
console.log(`   Branch     : ${branch}`);
console.log(`   Author     : ${author}`);
console.log(`   Commit     : ${shortSha}`);
console.log(`   Message    : ${commitMessage}`);

// IMPORTANT: webhookUrl is intentionally NOT printed.

(async () => {
  let response;

  try {
    response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (networkError) {
    console.error("❌ Network error while calling the Teams webhook:");
    console.error(`   ${networkError.message}`);
    process.exit(1);
  }

  // ─── 7. Handle the HTTP response ──────────────────────────────────────────

  if (response.ok) {
    console.log(`✅ Teams webhook accepted the notification (HTTP ${response.status}).`);
  } else {
    let body = "";
    try {
      body = await response.text();
    } catch (_) {
      body = "(could not read response body)";
    }
    console.error(`❌ Teams webhook returned an error (HTTP ${response.status}).`);
    console.error(`   Response body: ${body}`);
    process.exit(1);
  }

})();