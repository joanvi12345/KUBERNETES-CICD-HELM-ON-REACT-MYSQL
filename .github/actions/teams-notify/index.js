/**
 * .github/actions/teams-notify/index.js
 *
 * Custom GitHub Action — Microsoft Teams Notification
 *
 * Reads inputs from the INPUT_* environment variables that GitHub Actions
 * automatically injects for every declared input in action.yml.
 *
 * Uses the native fetch API (available since Node 18 / node20 runner).
 * No external npm dependencies are needed.
 */

"use strict";

// ─── 1. Read inputs from environment variables ────────────────────────────────
// GitHub Actions maps each input declared in action.yml to an env var named:
//   INPUT_<INPUT_NAME_UPPERCASED>
// Hyphens in input names are replaced by underscores.

const webhookUrl    = process.env.INPUT_WEBHOOK_URL    || "";
const repository    = process.env.INPUT_REPOSITORY     || "unknown/repo";
const branch        = process.env.INPUT_BRANCH         || "unknown";
const author        = process.env.INPUT_AUTHOR         || "unknown";
const commitShaFull = process.env.INPUT_COMMIT_SHA     || "";
const commitMessage = process.env.INPUT_COMMIT_MESSAGE || "(no message)";

// ─── 2. Derive a short SHA (first 7 characters) ───────────────────────────────
const shortSha = commitShaFull.slice(0, 7) || "0000000";

// ─── 3. Validate required inputs ──────────────────────────────────────────────
if (!webhookUrl) {
  // Never print the URL — just signal it is missing.
  console.error("❌ Error: webhook_url input is empty or not set.");
  console.error("   Make sure TEAMS_WEBHOOK_URL is saved in:");
  console.error("   GitHub → Settings → Secrets and variables → Actions");
  process.exit(1);
}

// ─── 4. Build the JSON payload ────────────────────────────────────────────────
// Power Automate (Teams) HTTP-trigger flows accept any valid JSON body.
// The structure below is a simple, human-readable notification card.
// If you use the legacy Office 365 Connector format instead, replace the
// payload with @type / @context / themeColor / sections fields.
//
// Power Automate "When an HTTP request is received" → "Post adaptive card" flow
// can consume this flat JSON directly.

const repoUrl   = `https://github.com/${repository}`;
const branchUrl = `${repoUrl}/tree/${branch}`;
const commitUrl = `${repoUrl}/commit/${commitShaFull}`;

const payload = {
  // Plain-text summary used by some connectors as the notification preview.
  summary: `🚀 New push to ${repository} on branch ${branch}`,

  // Main card title shown in the Teams message.
  title: `📦 Push Notification — ${repository}`,

  // Key-value details rendered as a fact list in adaptive card flows.
  facts: [
    { name: "📁 Repository",    value: repository },
    { name: "🌿 Branch",        value: branch },
    { name: "👤 Author",        value: author },
    { name: "🔖 Commit",        value: shortSha },
    { name: "💬 Message",       value: commitMessage },
  ],

  // Raw URLs — useful when the Power Automate flow renders clickable links.
  links: {
    repository: repoUrl,
    branch:     branchUrl,
    commit:     commitUrl,
  },

  // ISO timestamp of when the notification was generated.
  timestamp: new Date().toISOString(),
};

// ─── 5. Send the HTTP POST request ────────────────────────────────────────────
console.log("📨 Sending Teams notification...");
console.log(`   Repository : ${repository}`);
console.log(`   Branch     : ${branch}`);
console.log(`   Author     : ${author}`);
console.log(`   Commit     : ${shortSha}`);
console.log(`   Message    : ${commitMessage}`);
// NOTE: webhookUrl is intentionally NOT logged here.

(async () => {
  let response;

  try {
    response = await fetch(webhookUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });
  } catch (networkError) {
    // Network-level failure (DNS, timeout, TLS, etc.)
    console.error("❌ Network error while calling the Teams webhook:");
    console.error(`   ${networkError.message}`);
    process.exit(1);
  }

  // ─── 6. Handle the HTTP response ────────────────────────────────────────────
  if (response.ok) {
    // Power Automate returns 202 Accepted on success.
    // Legacy Office 365 connectors return 200 OK with body "1".
    console.log(`✅ Teams notification sent successfully (HTTP ${response.status}).`);
  } else {
    // Read the response body for a helpful error message (safe — not the URL).
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
